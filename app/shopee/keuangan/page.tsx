"use client";

// /shopee/keuangan — Saldo + Escrow + Pencairan.
// Tugas 6: three tabs.
// - Saldo: get_wallet_balance per toko
// - Escrow: get_escrow_detail per COMPLETED order_sn
// - Pencairan: get_wallet_transactions, with "Catat ke Kas" (dedup via
//   [SHOPEE_TXN:{id}] in kas.keterangan)

import { useCallback, useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { supabase } from "@/lib/supabase";
import { useTheme, LIGHT, DARK } from "@/context/ThemeContext";

type Toko = { id: number; nama: string; connected: boolean };

type SaldoRow = {
  toko_id: number;
  toko: string;
  ok: boolean;
  tersedia: number | null;
  pending: number | null;
  raw?: any;
  error?: string;
};

type TxRow = {
  toko_id: number;
  toko: string;
  transaction_id: string;
  type: string;
  status: string;
  amount: number;
  create_time: number;
  raw: any;
};

type EscrowOrder = {
  id: number;
  no_pesanan: string;
  tanggal_pesanan: string;
  total_pembayaran: number;
  nama_pembeli: string | null;
  toko_id: number;
  toko_nama: string;
  nama_produk: string;
};

type EscrowBreakdown = {
  order_sn: string;
  buyer: string | null;
  produk_total: number | null;
  ongkir: number | null;
  fee_admin: number | null;
  fee_layanan: number | null;
  net: number | null;
  raw: any;
};

const rupiah = (n: number | null | undefined) => {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`;
};

const tanggalFmt = (s: string) => {
  if (!s) return "-";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
};

const unixToWIB = (unix: number) => {
  if (!unix) return "-";
  return new Date(unix * 1000).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });
};

// Best-effort field picker — Shopee's wallet/escrow responses use different
// names across API versions. Walks common keys and returns the first match.
function pickNumber(obj: any, keys: string[]): number | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    if (typeof v === "string" && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

function pickString(obj: any, keys: string[]): string | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

function parseBalance(raw: any): { tersedia: number | null; pending: number | null } {
  const resp = raw?.response ?? raw;
  return {
    tersedia: pickNumber(resp, ["seller_balance", "withdrawable_amount", "wallet_balance", "available_balance"]),
    pending: pickNumber(resp, ["escrow_amount", "pending_amount", "frozen_amount", "settlement_amount"]),
  };
}

function parseEscrow(raw: any, fallbackSn: string): EscrowBreakdown {
  const resp = raw?.response ?? raw ?? {};
  const income = resp?.income ?? resp?.order_income ?? resp;
  return {
    order_sn: pickString(resp, ["order_sn"]) || fallbackSn,
    buyer: pickString(resp, ["buyer_user_name", "buyer_username", "buyer"]),
    produk_total: pickNumber(income, [
      "original_price", "merchandise_subtotal", "merchant_subtotal", "subtotal", "seller_subtotal",
    ]),
    ongkir: pickNumber(income, [
      "actual_shipping_fee", "shipping_fee", "estimated_shipping_fee", "buyer_paid_shipping_fee",
    ]),
    fee_admin: pickNumber(income, [
      "commission_fee", "platform_commission_fee", "commission",
    ]),
    fee_layanan: pickNumber(income, [
      "service_fee", "platform_service_fee", "transaction_fee",
    ]),
    net: pickNumber(income, ["escrow_amount", "escrow_amount_after_adjustment", "seller_income"]),
    raw: resp,
  };
}

function parseTransactions(toko: { id: number; nama: string }, raw: any): TxRow[] {
  const resp = raw?.response ?? raw ?? {};
  const list = resp?.transaction_list ?? resp?.transactions ?? [];
  if (!Array.isArray(list)) return [];
  return list.map((t: any) => ({
    toko_id: toko.id,
    toko: toko.nama,
    transaction_id: String(t.transaction_id ?? t.id ?? t.payout_id ?? ""),
    type: String(t.transaction_type ?? t.type ?? "—"),
    status: String(t.status ?? t.transaction_status ?? "—"),
    amount: Number(t.amount ?? t.transaction_amount ?? 0),
    create_time: Number(t.create_time ?? t.transaction_create_time ?? 0),
    raw: t,
  }));
}

// ── Saldo tab ────────────────────────────────────────────────────────────
function SaldoTab({ C }: { C: any }) {
  const [rows, setRows] = useState<SaldoRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSaldo = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/shopee/get-wallet-balance");
      const data = await res.json();
      const mapped: SaldoRow[] = (data.results || []).map((r: any) => {
        const parsed = r.ok ? parseBalance(r.raw) : { tersedia: null, pending: null };
        return {
          toko_id: r.toko_id,
          toko: r.toko,
          ok: r.ok,
          tersedia: parsed.tersedia,
          pending: parsed.pending,
          raw: r.raw,
          error: r.error || (r.raw?.error ? r.raw.message || r.raw.error : undefined),
        };
      });
      setRows(mapped);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSaldo(); }, [fetchSaldo]);

  const totalTersedia = rows.reduce((a, r) => a + (r.tersedia || 0), 0);
  const totalPending = rows.reduce((a, r) => a + (r.pending || 0), 0);

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <SumCard label="Total Tersedia" value={rupiah(totalTersedia)} color={C.green} C={C} />
        <SumCard label="Total Pending" value={rupiah(totalPending)} color={C.yellow} C={C} />
        <button onClick={fetchSaldo} disabled={loading} style={{
          marginLeft: "auto", padding: "8px 16px",
          background: "transparent", border: `1.5px solid ${C.border}`,
          color: C.muted, borderRadius: 8, cursor: "pointer",
          fontSize: 13, fontWeight: 700, opacity: loading ? 0.5 : 1,
        }}>{loading ? "⏳" : "↻"} Refresh</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
        {loading && rows.length === 0 && <div style={{ color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>Memuat...</div>}
        {!loading && rows.length === 0 && <div style={{ color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>Belum ada toko aktif terhubung.</div>}
        {rows.map(r => (
          <div key={r.toko_id} style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 14, padding: "16px 18px", boxShadow: C.shadow,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: C.fontSans }}>{r.toko}</div>
              {!r.ok && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: C.redDim, color: C.red, fontFamily: C.fontMono, fontWeight: 700 }}>error</span>}
            </div>
            {r.ok ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                <div>
                  <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono }}>Tersedia</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: C.green, fontFamily: C.fontMono }}>{rupiah(r.tersedia)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono }}>Pending</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: C.yellow, fontFamily: C.fontMono }}>{rupiah(r.pending)}</div>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 10, fontSize: 12, color: C.red, fontFamily: C.fontMono }}>
                {r.error || "Gagal ambil saldo"}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Escrow tab ───────────────────────────────────────────────────────────
function EscrowTab({ C }: { C: any }) {
  const [orders, setOrders] = useState<EscrowOrder[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selected, setSelected] = useState<EscrowOrder | null>(null);
  const [detail, setDetail] = useState<EscrowBreakdown | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoadingList(true);
      const [orderRes, penjualanRes, tokoRes] = await Promise.all([
        supabase.from("detail_penjualan_online")
          .select("id, no_pesanan, tanggal_pesanan, total_pembayaran, nama_pembeli, penjualan_online_id, stok_barang(nama_produk)")
          .eq("status_shopee", "COMPLETED")
          .order("tanggal_pesanan", { ascending: false })
          .limit(100),
        supabase.from("penjualan_online").select("id, toko_id"),
        supabase.from("toko_online").select("id, nama"),
      ]);

      const penjualanMap = new Map<number, number>((penjualanRes.data || []).map((p: any) => [p.id, p.toko_id]));
      const tokoMap = new Map<number, string>((tokoRes.data || []).map((t: any) => [t.id, t.nama]));

      const mapped: EscrowOrder[] = (orderRes.data || []).map((r: any) => {
        const toko_id = penjualanMap.get(r.penjualan_online_id) || 0;
        return {
          id: r.id,
          no_pesanan: r.no_pesanan,
          tanggal_pesanan: r.tanggal_pesanan,
          total_pembayaran: r.total_pembayaran,
          nama_pembeli: r.nama_pembeli,
          toko_id,
          toko_nama: tokoMap.get(toko_id) || "-",
          nama_produk: (r.stok_barang as any)?.nama_produk || r.sku,
        };
      });
      setOrders(mapped);
      setLoadingList(false);
    })();
  }, []);

  const loadDetail = useCallback(async (o: EscrowOrder) => {
    setSelected(o);
    setDetail(null);
    setErr(null);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/shopee/get-escrow-detail?toko_id=${o.toko_id}&order_sn=${encodeURIComponent(o.no_pesanan)}`);
      const data = await res.json();
      if (!data.success) {
        setErr(data.error || data.raw?.message || data.raw?.error || "Gagal ambil escrow");
      } else {
        setDetail(parseEscrow(data.raw, o.no_pesanan));
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 360px) 1fr", gap: 16, alignItems: "flex-start" }}>
      {/* Order list */}
      <div style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 14, overflow: "hidden", boxShadow: C.shadow,
        maxHeight: 600, overflowY: "auto",
      }}>
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 11, fontWeight: 700, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, textTransform: "uppercase" as const }}>
          Pesanan COMPLETED ({orders.length})
        </div>
        {loadingList ? (
          <div style={{ padding: 20, fontSize: 13, color: C.muted, fontFamily: C.fontMono }}>Memuat...</div>
        ) : orders.length === 0 ? (
          <div style={{ padding: 20, fontSize: 13, color: C.muted, fontFamily: C.fontMono }}>Tidak ada pesanan COMPLETED</div>
        ) : orders.map(o => {
          const active = selected?.id === o.id;
          return (
            <button key={o.id} onClick={() => loadDetail(o)} style={{
              display: "block", width: "100%", textAlign: "left",
              padding: "10px 14px", border: "none", cursor: "pointer",
              background: active ? `${C.accent}15` : "transparent",
              borderBottom: `1px solid ${C.border}`,
              borderLeft: active ? `3px solid ${C.accent}` : `3px solid transparent`,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: C.fontSans, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {o.nama_produk}
              </div>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, marginTop: 2 }}>
                {o.no_pesanan} · {o.toko_nama}
              </div>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, marginTop: 1 }}>
                {tanggalFmt(o.tanggal_pesanan)} · {rupiah(o.total_pembayaran)}
              </div>
            </button>
          );
        })}
      </div>

      {/* Detail panel */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, boxShadow: C.shadow, minHeight: 200 }}>
        {!selected && (
          <div style={{ color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>
            Pilih pesanan dari daftar untuk melihat rincian escrow.
          </div>
        )}
        {selected && loadingDetail && (
          <div style={{ color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>Memuat escrow detail...</div>
        )}
        {selected && err && (
          <div style={{ padding: 12, background: C.redDim, color: C.red, borderRadius: 10, fontSize: 12 }}>{err}</div>
        )}
        {selected && detail && (
          <>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>Pesanan</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text, fontFamily: C.fontSans, marginTop: 2 }}>
              {selected.nama_produk}
            </div>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, marginTop: 2 }}>
              {detail.order_sn} · {selected.toko_nama} · {detail.buyer || "—"}
            </div>

            <div style={{ marginTop: 18, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
              <BreakdownRow label="Harga Produk" value={rupiah(detail.produk_total)} C={C} />
              <BreakdownRow label="Ongkir Ditanggung Pembeli" value={rupiah(detail.ongkir)} C={C} />
              <BreakdownRow label="Fee Admin" value={rupiah(detail.fee_admin)} C={C} negative />
              <BreakdownRow label="Fee Layanan" value={rupiah(detail.fee_layanan)} C={C} negative />
              <div style={{ height: 1, background: C.border, margin: "10px 0" }} />
              <BreakdownRow label="Total Bersih (Escrow)" value={rupiah(detail.net)} C={C} bold />
            </div>

            <details style={{ marginTop: 16 }}>
              <summary style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, cursor: "pointer" }}>Lihat raw response</summary>
              <pre style={{
                background: C.bgPage, padding: 10, borderRadius: 8, fontSize: 10,
                color: C.textMid, fontFamily: C.fontMono, overflow: "auto", maxHeight: 240, marginTop: 8,
              }}>{JSON.stringify(detail.raw, null, 2)}</pre>
            </details>
          </>
        )}
      </div>
    </div>
  );
}

function BreakdownRow({ label, value, C, negative, bold }: { label: string; value: string; C: any; negative?: boolean; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0" }}>
      <span style={{ fontSize: bold ? 13 : 12, color: bold ? C.text : C.textMid, fontWeight: bold ? 800 : 500 }}>{label}</span>
      <span style={{
        fontSize: bold ? 16 : 13, fontWeight: bold ? 800 : 700,
        color: bold ? C.green : negative ? C.red : C.text,
        fontFamily: C.fontMono,
      }}>{negative && value !== "—" ? `− ${value.replace("Rp ", "Rp ")}` : value}</span>
    </div>
  );
}

// ── Pencairan tab ────────────────────────────────────────────────────────
function PencairanTab({ C }: { C: any }) {
  const [rows, setRows] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterToko, setFilterToko] = useState<string>("semua");
  const [tokoOpts, setTokoOpts] = useState<{ id: number; nama: string }[]>([]);
  const [recordedIds, setRecordedIds] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/shopee/get-wallet-transactions");
      const data = await res.json();
      const all: TxRow[] = [];
      const opts: { id: number; nama: string }[] = [];
      for (const r of data.results || []) {
        opts.push({ id: r.toko_id, nama: r.toko });
        if (!r.ok) continue;
        all.push(...parseTransactions({ id: r.toko_id, nama: r.toko }, r.raw));
      }
      all.sort((a, b) => b.create_time - a.create_time);
      setRows(all);
      setTokoOpts(opts);

      // Check which transactions are already recorded in kas
      if (all.length > 0) {
        const { data: kasRows } = await supabase
          .from("kas")
          .select("keterangan")
          .ilike("keterangan", "%[SHOPEE_TXN:%");
        const known = new Set<string>();
        for (const k of (kasRows || []) as any[]) {
          const m = String(k.keterangan || "").match(/\[SHOPEE_TXN:([^\]]+)\]/);
          if (m) known.add(m[1]);
        }
        setRecordedIds(known);
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = filterToko === "semua"
    ? rows
    : rows.filter(r => String(r.toko_id) === filterToko);

  const catatKeKas = async (tx: TxRow) => {
    if (recordedIds.has(tx.transaction_id)) {
      showToast("Sudah pernah dicatat", "error");
      return;
    }
    setSavingId(tx.transaction_id);
    try {
      const tanggal = tx.create_time
        ? new Date(tx.create_time * 1000).toLocaleDateString("sv", { timeZone: "Asia/Jakarta" })
        : new Date().toLocaleDateString("sv", { timeZone: "Asia/Jakarta" });
      const isMasuk = tx.amount >= 0;
      const keterangan = `Pencairan Shopee · ${tx.toko} · ${tx.type} [SHOPEE_TXN:${tx.transaction_id}]`;

      const { error } = await supabase.from("kas").insert([{
        tipe: isMasuk ? "Masuk" : "Keluar",
        kategori: "Pendapatan Marketplace",
        keterangan,
        nominal: Math.abs(tx.amount),
        tanggal,
      }]);
      if (error) throw new Error(error.message);
      setRecordedIds(prev => new Set(prev).add(tx.transaction_id));
      showToast(`✓ Tercatat ${rupiah(Math.abs(tx.amount))}`);
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div>
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999, padding: "12px 18px",
          background: toast.type === "success" ? C.green : C.red, color: "#fff",
          borderRadius: 10, fontSize: 13, fontWeight: 700, boxShadow: C.shadowMd,
        }}>{toast.msg}</div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
        <select value={filterToko} onChange={e => setFilterToko(e.target.value)} style={{
          padding: "8px 12px",
          background: "transparent",
          border: `1.5px solid ${C.border}`, borderRadius: 8,
          color: C.text, fontFamily: C.fontSans, fontSize: 13, outline: "none",
          cursor: "pointer",
        }}>
          <option value="semua">Semua Toko</option>
          {tokoOpts.map(t => <option key={t.id} value={t.id}>{t.nama}</option>)}
        </select>
        <div style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>
          {filtered.length} transaksi
        </div>
        <button onClick={fetchData} disabled={loading} style={{
          marginLeft: "auto", padding: "8px 16px",
          background: "transparent", border: `1.5px solid ${C.border}`,
          color: C.muted, borderRadius: 8, cursor: "pointer",
          fontSize: 13, fontWeight: 700, opacity: loading ? 0.5 : 1,
        }}>{loading ? "⏳" : "↻"} Refresh</button>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", boxShadow: C.shadow }}>
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 140px 120px 130px 130px 140px",
          padding: "10px 16px", background: "transparent",
          borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 700, color: C.muted,
          fontFamily: C.fontMono, letterSpacing: 1, textTransform: "uppercase" as const, gap: 12,
        }}>
          <span>Toko / Tipe</span>
          <span>Transaction ID</span>
          <span>Status</span>
          <span>Tanggal</span>
          <span style={{ textAlign: "right" }}>Nominal</span>
          <span style={{ textAlign: "right" }}>Aksi</span>
        </div>

        {loading && rows.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>Memuat...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>Tidak ada transaksi</div>
        ) : filtered.map(tx => {
          const recorded = recordedIds.has(tx.transaction_id);
          return (
            <div key={`${tx.toko_id}-${tx.transaction_id}`} style={{
              display: "grid", gridTemplateColumns: "1fr 140px 120px 130px 130px 140px",
              padding: "10px 16px", borderBottom: `1px solid ${C.border}`,
              alignItems: "center", gap: 12, fontSize: 12,
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: C.fontSans }}>{tx.toko}</div>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{tx.type}</div>
              </div>
              <div style={{ fontSize: 11, color: C.textMid, fontFamily: C.fontMono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.transaction_id}</div>
              <div style={{ fontSize: 11, color: C.textMid, fontFamily: C.fontMono }}>{tx.status}</div>
              <div style={{ fontSize: 11, color: C.textMid, fontFamily: C.fontMono }}>{unixToWIB(tx.create_time)}</div>
              <div style={{ textAlign: "right", fontWeight: 800, color: tx.amount >= 0 ? C.green : C.red, fontFamily: C.fontMono }}>
                {tx.amount >= 0 ? "+ " : "− "}{rupiah(Math.abs(tx.amount))}
              </div>
              <div style={{ textAlign: "right" }}>
                {recorded ? (
                  <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, background: C.greenDim, color: C.green, fontWeight: 700, fontFamily: C.fontMono }}>✓ Tercatat</span>
                ) : (
                  <button onClick={() => catatKeKas(tx)} disabled={savingId === tx.transaction_id} style={{
                    padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                    background: `${C.accent}20`, color: C.accent, fontFamily: C.fontSans,
                    border: `1px solid ${C.accent}`, cursor: savingId === tx.transaction_id ? "wait" : "pointer",
                    opacity: savingId === tx.transaction_id ? 0.6 : 1,
                  }}>{savingId === tx.transaction_id ? "Menyimpan..." : "Catat ke Kas"}</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Reusable summary card ─────────────────────────────────────────────────
function SumCard({ label, value, color, C }: { label: string; value: string; color: string; C: any }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: "14px 18px", minWidth: 200, boxShadow: C.shadow,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, fontFamily: C.fontMono, letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color, fontFamily: C.fontMono, marginTop: 4 }}>{value}</div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────
type Tab = "saldo" | "escrow" | "pencairan";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "saldo",     label: "Saldo",     icon: "💰" },
  { key: "escrow",    label: "Escrow",    icon: "🧾" },
  { key: "pencairan", label: "Pencairan", icon: "💸" },
];

export default function ShopeeKeuanganPage() {
  const { isDark } = useTheme();
  const C = isDark ? DARK : LIGHT;
  const [tab, setTab] = useState<Tab>("saldo");
  const [tokoConnectedCount, setTokoConnectedCount] = useState<number | null>(null);

  useEffect(() => {
    supabase.from("toko_online")
      .select("id", { count: "exact", head: true })
      .eq("platform", "Shopee")
      .eq("aktif", true)
      .not("shopee_access_token", "is", null)
      .then(({ count }) => setTokoConnectedCount(count ?? 0));
  }, []);

  return (
    <Sidebar pageTitle="Shopee · Keuangan" pageSubtitle="Escrow, saldo, pencairan">
      <div style={{ padding: "24px 28px" }}>
        {/* Auto-API banner */}
        {tokoConnectedCount !== null && tokoConnectedCount > 0 && (
          <div style={{
            padding: "10px 14px", background: C.yellowDim, color: C.yellow,
            borderRadius: 10, fontSize: 12, marginBottom: 18, fontFamily: C.fontSans,
          }}>
            ℹ <b>{tokoConnectedCount}</b> toko terhubung — data fee otomatis dari Shopee API.
            Modul lama (<a href="/fee-platform" style={{ color: C.yellow, textDecoration: "underline" }}>Fee Platform</a> /
            {" "}<a href="/rekap-saldo" style={{ color: C.yellow, textDecoration: "underline" }}>Rekap Saldo</a>) tetap tersedia untuk input manual.
          </div>
        )}

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 6, marginBottom: 18, borderBottom: `1px solid ${C.border}` }}>
          {TABS.map(t => {
            const active = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                padding: "10px 18px", border: "none", background: "transparent",
                color: active ? C.accent : C.muted, fontWeight: active ? 800 : 600,
                fontSize: 13, fontFamily: C.fontSans, cursor: "pointer",
                borderBottom: active ? `2px solid ${C.accent}` : "2px solid transparent",
                marginBottom: -1,
              }}>
                <span style={{ marginRight: 6 }}>{t.icon}</span>{t.label}
              </button>
            );
          })}
        </div>

        {tab === "saldo" && <SaldoTab C={C} />}
        {tab === "escrow" && <EscrowTab C={C} />}
        {tab === "pencairan" && <PencairanTab C={C} />}
      </div>
    </Sidebar>
  );
}
