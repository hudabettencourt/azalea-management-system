// app/api/shopee/sync-finance/route.ts
// Sync pencairan (withdrawal) dari Shopee Wallet ke pencairan_online + kas.
// Dedup via shopee_transaction_id. Mirror flow manual: kurangi piutang
// penjualan_online (FIFO) sebesar nominal yang cair.
import { NextRequest, NextResponse } from "next/server";
import { shopeeApi, refreshAccessToken } from "@/lib/shopee/helper";
import { mapPool } from "@/lib/shopee/api-cache";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const WINDOW_DAYS = 14; // Shopee max range 15 hari, ambil 14 aman.

type WalletTxn = {
  transaction_id: string | number;
  transaction_type: string;
  status?: string;
  amount: number;
  create_time: number;
  reason?: string;
};

async function getValidToken(toko: any) {
  const expireAt = new Date(toko.shopee_token_expire_at).getTime();
  if (expireAt - Date.now() < 3600 * 1000) {
    const refreshed = await refreshAccessToken(toko.shopee_refresh_token, toko.shopee_shop_id);
    if (!refreshed.error && refreshed.access_token) {
      const newExpire = new Date(Date.now() + refreshed.expire_in * 1000).toISOString();
      await supabase.from("toko_online").update({
        shopee_access_token: refreshed.access_token,
        shopee_refresh_token: refreshed.refresh_token,
        shopee_token_expire_at: newExpire,
      }).eq("id", toko.id);
      return refreshed.access_token as string;
    }
  }
  return toko.shopee_access_token;
}

async function fetchWalletTxns(shopId: number, accessToken: string, maxPages: number): Promise<WalletTxn[]> {
  const out: WalletTxn[] = [];
  const timeTo = Math.floor(Date.now() / 1000);
  const timeFrom = timeTo - WINDOW_DAYS * 24 * 3600;
  for (let page = 0; page < maxPages; page++) {
    const res = await shopeeApi("/api/v2/payment/get_wallet_transaction_list", shopId, accessToken, {
      page_no: page,
      page_size: 100,
      create_time_from: timeFrom,
      create_time_to: timeTo,
    });
    if (res.error) throw new Error(`get_wallet_transaction_list: ${res.message || res.error}`);
    const list: WalletTxn[] = res.response?.transaction_list || [];
    for (const t of list) out.push(t);
    if (!res.response?.more) break;
    if (list.length === 0) break;
  }
  return out;
}

function isWithdrawal(t: WalletTxn): boolean {
  const type = (t.transaction_type || "").toUpperCase();
  if (!type.includes("WITHDRAW")) return false;
  if (type.includes("CANCEL") || type.includes("FAIL")) return false;
  const status = (t.status || "").toUpperCase();
  const okStatus = ["COMPLETED", "SUCCESS", "SUCCEED", "DONE", ""];
  if (status && !okStatus.includes(status) && !type.includes("COMPLETED")) return false;
  return true;
}

async function syncTokoFinance(toko: any, maxPages: number) {
  const accessToken = await getValidToken(toko);
  const txns = await fetchWalletTxns(toko.shopee_shop_id, accessToken, maxPages);
  const withdrawals = txns.filter(isWithdrawal);
  if (withdrawals.length === 0) {
    return { toko: toko.nama, status: "ok", new: 0, total_scanned: txns.length };
  }

  const ids = withdrawals.map(t => String(t.transaction_id));
  const { data: existing } = await supabase
    .from("pencairan_online")
    .select("shopee_transaction_id")
    .in("shopee_transaction_id", ids);
  const existingSet = new Set((existing || []).map((r: any) => r.shopee_transaction_id));

  let inserted = 0;
  for (const t of withdrawals) {
    const txnId = String(t.transaction_id);
    if (existingSet.has(txnId)) continue;

    const nominalCair = Math.abs(Math.round(t.amount));
    if (nominalCair <= 0) continue;

    // Snapshot piutang aktif (untuk nominal_piutang & FIFO ditarik)
    const { data: penjualanAktif } = await supabase
      .from("penjualan_online")
      .select("id, total_nominal, total_ditarik")
      .eq("toko_id", toko.id)
      .neq("status", "Lunas")
      .order("created_at", { ascending: true });
    const piutangSnapshot = (penjualanAktif || []).reduce(
      (a: number, p: any) => a + Math.max(0, (p.total_nominal || 0) - (p.total_ditarik || 0)),
      0,
    );
    const selisih = piutangSnapshot - nominalCair;

    const { error: errPenc } = await supabase.from("pencairan_online").insert([{
      toko_id: toko.id,
      nominal_cair: nominalCair,
      nominal_piutang: piutangSnapshot,
      selisih,
      shopee_transaction_id: txnId,
    }]);
    if (errPenc) {
      // race condition / unique conflict → skip diam-diam
      continue;
    }

    // FIFO kurangi piutang
    let sisaCair = nominalCair;
    for (const pj of (penjualanAktif || [])) {
      if (sisaCair <= 0) break;
      const sisa = (pj.total_nominal || 0) - (pj.total_ditarik || 0);
      if (sisa <= 0) continue;
      const ditarik = Math.min(sisaCair, sisa);
      const newDitarik = (pj.total_ditarik || 0) + ditarik;
      await supabase.from("penjualan_online").update({
        total_ditarik: newDitarik,
        status: newDitarik >= (pj.total_nominal || 0) ? "Lunas" : "Sebagian",
      }).eq("id", pj.id);
      sisaCair -= ditarik;
    }

    // Catat ke kas (WIB)
    const tanggalWIB = new Date(t.create_time * 1000)
      .toLocaleDateString("sv", { timeZone: "Asia/Jakarta" });
    await supabase.from("kas").insert([{
      tipe: "Masuk",
      kategori: "Pendapatan Marketplace",
      keterangan: `Pencairan Shopee ${toko.nama} [SHOPEE_TXN:${txnId}]`,
      nominal: nominalCair,
      tanggal: tanggalWIB,
    }]);

    inserted++;
  }

  return { toko: toko.nama, status: "ok", new: inserted, total_scanned: txns.length };
}

export async function GET(req: NextRequest) {
  return runSyncFinance(req);
}

export async function POST(req: NextRequest) {
  return runSyncFinance(req);
}

async function runSyncFinance(req: NextRequest) {
  try {
    const full = new URL(req.url).searchParams.get("full") === "1";
    const maxPages = full ? 50 : 3;
    const { data: tokoList, error } = await supabase.from("toko_online")
      .select("*")
      .eq("platform", "Shopee")
      .eq("aktif", true)
      .not("shopee_access_token", "is", null);
    if (error || !tokoList?.length) {
      return NextResponse.json({ error: "Tidak ada toko Shopee aktif" }, { status: 404 });
    }

    const results = await mapPool(tokoList, 2, async (toko) => {
      try {
        return await syncTokoFinance(toko, maxPages);
      } catch (err: any) {
        return { toko: toko.nama, status: "error", message: err.message };
      }
    });
    return NextResponse.json({ success: true, results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
