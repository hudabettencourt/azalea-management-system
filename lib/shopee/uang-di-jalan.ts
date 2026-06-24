// Data "Uang di Jalan" — pesanan SHIPPED/TO_CONFIRM_RECEIVE minus yang sudah cair (rekap Masuk).

import type { SupabaseClient } from "@supabase/supabase-js";

export type UangDiJalanRow = {
  no_pesanan: string;
  nama_produk: string;
  sku: string;
  qty: number;
  total_pembayaran: number;
  status_shopee: string;
  tanggal_pesanan: string;
  jasa_kirim: string | null;
  nama_pembeli: string | null;
  toko_id: number;
  nama_toko: string;
};

export type RingkasanTokoRow = {
  toko_id: number;
  nama_toko: string;
  jumlah_pesanan: number;
  total_nilai: number;
  shipped: number;
  to_confirm: number;
};

export type UangDiJalanResult = {
  rows: UangDiJalanRow[];
  ringkasan: RingkasanTokoRow[];
  tokoList: { id: number; nama: string }[];
  stats: {
    total_before_filter: number;
    excluded_masuk: number;
    masuk_in_rekap: number;
  };
};

const PAGE = 1000;

export function normOrderSn(raw: string | null | undefined): string {
  return (raw || "").trim().toUpperCase();
}

async function fetchAllMasukOrderSns(supabase: SupabaseClient): Promise<Set<string>> {
  const set = new Set<string>();
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("rekap_saldo_detail")
      .select("no_pesanan")
      .eq("status_saldo", "Masuk")
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`rekap_saldo_detail: ${error.message}`);
    for (const r of data || []) {
      const n = normOrderSn(r.no_pesanan);
      if (n) set.add(n);
    }
    if (!data || data.length < PAGE) break;
  }
  return set;
}

async function fetchPendingDetails(supabase: SupabaseClient) {
  const rows: any[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("detail_penjualan_online")
      .select("no_pesanan, sku, qty, total_pembayaran, status_shopee, tanggal_pesanan, jasa_kirim, nama_pembeli, penjualan_online_id, stok_barang(nama_produk)")
      .in("status_shopee", ["SHIPPED", "TO_CONFIRM_RECEIVE"])
      .order("tanggal_pesanan", { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`detail_penjualan_online: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

export async function fetchUangDiJalanData(supabase: SupabaseClient): Promise<UangDiJalanResult> {
  const [{ data: tokoData }, { data: penjualanData }, sudahMasukSet, detailData] = await Promise.all([
    supabase
      .from("toko_online")
      .select("id, nama")
      .eq("platform", "Shopee")
      .eq("aktif", true)
      .not("shopee_access_token", "is", null)
      .order("id"),
    supabase.from("penjualan_online").select("id, toko_id"),
    fetchAllMasukOrderSns(supabase),
    fetchPendingDetails(supabase),
  ]);

  const tokoMap = new Map((tokoData || []).map((t: any) => [t.id, t.nama]));
  const penjualanMap = new Map((penjualanData || []).map((p: any) => [p.id, p.toko_id]));

  let excluded = 0;
  const mapped: UangDiJalanRow[] = [];

  for (const d of detailData) {
    if (sudahMasukSet.has(normOrderSn(d.no_pesanan))) {
      excluded++;
      continue;
    }
    const tokoId = penjualanMap.get(d.penjualan_online_id) || 0;
    const sb = d.stok_barang;
    const namaProduk = Array.isArray(sb) ? sb[0]?.nama_produk : sb?.nama_produk;
    mapped.push({
      no_pesanan: d.no_pesanan,
      nama_produk: namaProduk || d.sku,
      sku: d.sku,
      qty: d.qty,
      total_pembayaran: d.total_pembayaran,
      status_shopee: d.status_shopee,
      tanggal_pesanan: d.tanggal_pesanan,
      jasa_kirim: d.jasa_kirim,
      nama_pembeli: d.nama_pembeli,
      toko_id: tokoId,
      nama_toko: (tokoMap.get(tokoId) as string) || "-",
    });
  }

  const ringkasanMap = new Map<number, RingkasanTokoRow>();
  for (const p of mapped) {
    if (!ringkasanMap.has(p.toko_id)) {
      ringkasanMap.set(p.toko_id, {
        toko_id: p.toko_id,
        nama_toko: p.nama_toko,
        jumlah_pesanan: 0,
        total_nilai: 0,
        shipped: 0,
        to_confirm: 0,
      });
    }
    const r = ringkasanMap.get(p.toko_id)!;
    r.jumlah_pesanan++;
    r.total_nilai += p.total_pembayaran;
    if (p.status_shopee === "SHIPPED") r.shipped++;
    if (p.status_shopee === "TO_CONFIRM_RECEIVE") r.to_confirm++;
  }

  return {
    rows: mapped,
    ringkasan: Array.from(ringkasanMap.values()).sort((a, b) => b.total_nilai - a.total_nilai),
    tokoList: (tokoData || []).map((t: { id: number; nama: string }) => ({ id: t.id, nama: t.nama })),
    stats: {
      total_before_filter: detailData.length,
      excluded_masuk: excluded,
      masuk_in_rekap: sudahMasukSet.size,
    },
  };
}
