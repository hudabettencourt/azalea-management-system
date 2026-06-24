"use client";

// /shopee/keuangan — Saldo + Escrow + Pencairan.

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import { useTheme, LIGHT, DARK } from "@/context/ThemeContext";
import { rupiah, tanggalFmt } from "@/lib/format";
import { parseWalletBalance } from "@/lib/shopee/wallet-balance-parse";

// Wrapper null-safe untuk nilai yang bisa null/undefined dari API Shopee
const rupiahN = (n: number | null | undefined) => {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return rupiah(Math.round(n));
};

type Toko = { id: number; nama: string; connected: boolean };

type SaldoRow = {
  toko_id: number; toko: string; ok: boolean;
  tersedia: number | null; pending: number | null;
  tersedia_source?: string;
  pending_source?: "income_overview" | "db_uang_dijalan" | "none";
  raw?: any; error?: string;
};

type TxRow = {
  toko_id: number; toko: string; transaction_id: string;
  type: string; status: string; amount: number;
  create_time: number; raw: any;
};

type EscrowOrder = {
  id: number; no_pesanan: string; tanggal_pesanan: string;
  total_pembayaran: number; nama_pembeli: string | null;
  toko_id: number; toko_nama: string; nama_produk: string;
};

type EscrowBreakdown = {
  order_sn: string; buyer: string | null;
  produk_total: number | null; ongkir: number | null;
  fee_admin: number | null; fee_layanan: number | null;
  net: number | null; raw: any;
};

const unixToWIB = (unix: number) => {
  if (!unix) return "-";
  return new Date(unix * 1000).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });
};

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

function sumNullable(rows: SaldoRow[], key: "tersedia" | "pending"): number | null {
  const vals = rows.map((r) => r[key]).filter((v): v is number => v !== null && v !== undefined);
  return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
}

type SortDir = "asc" | "desc";

function toggleSort(field: string, current: string, dir: SortDir): { field: string; dir: SortDir } {
  if (current === field) return { field, dir: dir === "asc" ? "desc" : "asc" };
  return { field, dir: "desc" };
}

function cmpVal(a: string | number | null | undefined, b: string | number | null | undefined, dir: SortDir): number {
  const va = a ?? (typeof a === "number" ? 0 : "");
  const vb = b ?? (typeof b === "number" ? 0 : "");
  if (typeof va === "number" && typeof vb === "number") return dir === "asc" ? va - vb : vb - va;
  return dir === "asc" ? String(va).localeCompare(String(vb), "id") : String(vb).localeCompare(String(va), "id");
}

function SortTh({
  label, field, sortField, sortDir, onSort, C, align = "left",
}: {
  label: string; field: string; sortField: string; sortDir: SortDir;
  onSort: (f: string) => void; C: any; align?: "left" | "right" | "center";
}) {
  const active = sortField === field;
  return (
    <button type="button" onClick={() => onSort(field)} style={{
      background: "none", border: "none", color: active ? C.accent : C.muted,
      fontSize: 10, fontWeight: 700, textAlign: align, cursor: "pointer", padding: 0,
      letterSpacing: 1, fontFamily: C.fontMono, textTransform: "uppercase", width: "100%",
    }}>
      {label}{active ? (sortDir === "asc" ? " ↑" : " ↓") : " ↕"}
    </button>
  );
}

function parseEscrow(raw: any, fallbackSn: string): EscrowBreakdown {
  const resp = raw?.response ?? raw ?? {};
  const income = resp?.income ?? resp?.order_income ?? resp;
  return {
    order_sn: pickString(resp, ["order_sn"]) || fallbackSn,
    buyer: pickString(resp, ["buyer_user_name", "buyer_username", "buyer"]),
    produk_total: pickNumber(income, ["original_price", "merchandise_subtotal", "merchant_subtotal", "subtotal", "seller_subtotal"]),
    ongkir: pickNumber(income, ["actual_shipping_fee", "shipping_fee", "estimated_shipping_fee", "buyer_paid_shipping_fee"]),
    fee_admin: pickNumber(income, ["commission_fee", "platform_commission_fee", "commission"]),
    fee_layanan: pickNumber(income, ["service_fee", "platform_service_fee", "transaction_fee"]),
    net: pickNumber(income, ["escrow_amount", "escrow_amount_after_adjustment", "seller_income"]),
    raw: resp,
  };
}

function parseTransactions(toko: { id: number; nama: string }, raw: any): TxRow[] {
  const resp = raw?.response ?? raw ?? {};
  const list = resp?.transaction_list ?? resp?.transactions ?? [];
  if (!Array.isArray(list)) return [];
  return list.map((t: any) => ({
    toko_id: toko.id, toko: toko.nama,
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
  const [loadingWallet, setLoadingWallet] = useState(false);

  const prefetchDbPending = useCallback(async () => {
    const [{ data: tokoList }, { data: details }, { data: penjualan }] = await Promise.all([
      supabase.from("toko_online").select("id, nama").eq("platform", "Shopee").eq("aktif", true).not("shopee_access_token", "is", null),
      supabase.from("detail_penjualan_online").select("total_pembayaran, penjualan_online_id").in("status_shopee", ["SHIPPED", "TO_CONFIRM_RECEIVE"]),
      supabase.from("penjualan_online").select("id, toko_id"),
    ]);
    const penjualanMap = new Map((penjualan || []).map((p: any) => [p.id, p.toko_id]));
    const pendingByToko = new Map<number, number>();
    for (const d of details || []) {
      const tokoId = penjualanMap.get(d.penjualan_online_id);
      if (!tokoId) continue;
      pendingByToko.set(tokoId, (pendingByToko.get(tokoId) || 0) + Number(d.total_pembayaran || 0));
    }
    setRows((tokoList || []).map((t: any) => ({
      toko_id: t.id,
      toko: t.nama,
      ok: true,
      tersedia: null,
      pending: pendingByToko.get(t.id) ?? null,
      pending_source: pendingByToko.has(t.id) ? "db_uang_dijalan" as const : "none",
    })));
  }, []);

  const fetchSaldo = useCallback(async (refresh = false) => {
    setLoadingWallet(true);
    try {
      const url = refresh ? "/api/shopee/get-wallet-balance?refresh=1" : "/api/shopee/get-wallet-balance";
      const res = await fetch(url);
      const data = await res.json();
      const mapped: SaldoRow[] = (data.results || []).map((r: any) => {
        const parsed = r.tersedia !== undefined
          ? { tersedia: r.tersedia, pending: r.pending, tersedia_source: r.tersedia_source, pending_source: r.pending_source }
          : (r.ok ? parseWalletBalance(r.raw) : { tersedia: null, pending: null, tersedia_source: "none", pending_source: "none" });
        return {
          toko_id: r.toko_id, toko: r.toko, ok: r.ok,
          tersedia: parsed.tersedia, pending: parsed.pending,
          tersedia_source: parsed.tersedia_source, pending_source: parsed.pending_source,
          raw: r.raw,
          error: r.error || (r.ok ? undefined : "Gagal memuat saldo dari Shopee API"),
        };
      });
      setRows(mapped);
    } finally { setLoadingWallet(false); }
  }, []);

  useEffect(() => {
    prefetchDbPending();
    fetchSaldo();
  }, [prefetchDbPending, fetchSaldo]);

  const totalTersedia = sumNullable(rows, "tersedia");
  const totalPending = sumNullable(rows, "pending");

  return (
    <div>
      <div style={{ padding: "12px 16px", background: C.yellowDim, border: `1px solid ${C.yellow}40`, borderRadius: 12, marginBottom: 16, fontSize: 12, color: C.textMid, fontFamily: C.fontSans, lineHeight: 1.5 }}>
        <b>Saldo Wallet</b> = uang di dompet penjual <b>saat ini</b> yang bisa dicairkan (<code style={{ fontFamily: C.fontMono, fontSize: 11 }}>get_wallet_transaction_list</code> → <code style={{ fontFamily: C.fontMono, fontSize: 11 }}>current_balance</code>).
        Bukan total penghasilan released sejak buka toko.
        <b> Pending</b> = pesanan belum cair (<code style={{ fontFamily: C.fontMono, fontSize: 11 }}>get_income_overview</code>, fallback estimasi <b>Uang di Jalan</b> dari DB jika API kosong).
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <SumCard label="Total Saldo Wallet" value={rupiahN(totalTersedia)} color={C.green} C={C} />
        <SumCard label="Total Pending" value={rupiahN(totalPending)} color={C.yellow} C={C} />
        <button onClick={() => fetchSaldo(true)} disabled={loadingWallet} style={{ marginLeft: "auto", padding: "8px 16px", background: "transparent", border: `1.5px solid ${C.border}`, color: C.muted, borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, opacity: loadingWallet ? 0.5 : 1 }}>{loadingWallet ? "⏳" : "↻"} Refresh</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
        {rows.length === 0 && <div style={{ color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>Belum ada toko aktif terhubung.</div>}
        {rows.map(r => (
          <div key={r.toko_id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", boxShadow: C.shadow }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: C.fontSans }}>{r.toko}</div>
              {!r.ok && !loadingWallet && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: C.redDim, color: C.red, fontFamily: C.fontMono, fontWeight: 700 }}>error</span>}
              {loadingWallet && r.tersedia === null && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: C.accentGlow, color: C.accent, fontFamily: C.fontMono, fontWeight: 700 }}>wallet…</span>}
            </div>
            {r.ok ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                <div>
                  <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono }}>Saldo Wallet</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: loadingWallet && r.tersedia === null ? C.muted : C.green, fontFamily: C.fontMono }}>
                    {loadingWallet && r.tersedia === null ? "…" : rupiahN(r.tersedia)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono }}>Pending</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: C.yellow, fontFamily: C.fontMono }}>{rupiahN(r.pending)}</div>
                  {r.pending_source === "db_uang_dijalan" && (
                    <div style={{ fontSize: 9, color: C.muted, fontFamily: C.fontMono, marginTop: 2 }}>estimasi uang di jalan</div>
                  )}
                </div>
                {r.tersedia === null && r.pending === null && (
                  <div style={{ gridColumn: "1 / -1", fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>
                    Saldo wallet kosong — pastikan <code>get_wallet_transaction_list</code> di-whitelist.
                  </div>
                )}
                {r.tersedia_source !== "wallet_current_balance" && r.pending !== null && (
                  <div style={{ gridColumn: "1 / -1", fontSize: 11, color: C.yellow, fontFamily: C.fontMono }}>
                    Saldo wallet tidak tersedia — whitelist <code>get_wallet_transaction_list</code>. Angka besar sebelumnya berasal dari total released (salah).
                  </div>
                )}
              </div>
            ) : (
              <div style={{ marginTop: 10, fontSize: 12, color: C.red, fontFamily: C.fontMono }}>{r.error || "Gagal ambil saldo"}</div>
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
  const [filterToko, setFilterToko] = useState<string>("semua");
  const [sortField, setSortField] = useState("tanggal_pesanan");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    (async () => {
      setLoadingList(true);
      const [orderRes, penjualanRes, tokoRes] = await Promise.all([
        supabase.from("detail_penjualan_online").select("id, no_pesanan, tanggal_pesanan, total_pembayaran, nama_pembeli, penjualan_online_id, stok_barang(nama_produk)").eq("status_shopee", "COMPLETED").order("tanggal_pesanan", { ascending: false }).limit(200),
        supabase.from("penjualan_online").select("id, toko_id"),
        supabase.from("toko_online").select("id, nama"),
      ]);
      const penjualanMap = new Map<number, number>((penjualanRes.data || []).map((p: any) => [p.id, p.toko_id]));
      const tokoMap = new Map<number, string>((tokoRes.data || []).map((t: any) => [t.id, t.nama]));
      const mapped: EscrowOrder[] = (orderRes.data || []).map((r: any) => {
        const toko_id = penjualanMap.get(r.penjualan_online_id) || 0;
        return { id: r.id, no_pesanan: r.no_pesanan, tanggal_pesanan: r.tanggal_pesanan, total_pembayaran: r.total_pembayaran, nama_pembeli: r.nama_pembeli, toko_id, toko_nama: tokoMap.get(toko_id) || "-", nama_produk: (r.stok_barang as any)?.nama_produk || r.sku };
      });
      setOrders(mapped);
      setLoadingList(false);
    })();
  }, []);

  const tokoOpts = useMemo(() => {
    const m = new Map<number, string>();
    for (const o of orders) if (o.toko_id) m.set(o.toko_id, o.toko_nama);
    return Array.from(m.entries()).map(([id, nama]) => ({ id, nama })).sort((a, b) => a.nama.localeCompare(b.nama, "id"));
  }, [orders]);

  const handleSort = (field: string) => {
    const next = toggleSort(field, sortField, sortDir);
    setSortField(next.field);
    setSortDir(next.dir);
  };

  const ordersView = useMemo(() => {
    let list = filterToko === "semua" ? orders : orders.filter((o) => String(o.toko_id) === filterToko);
    list = [...list].sort((a, b) => {
      switch (sortField) {
        case "toko_nama": return cmpVal(a.toko_nama, b.toko_nama, sortDir);
        case "no_pesanan": return cmpVal(a.no_pesanan, b.no_pesanan, sortDir);
        case "nama_produk": return cmpVal(a.nama_produk, b.nama_produk, sortDir);
        case "nama_pembeli": return cmpVal(a.nama_pembeli, b.nama_pembeli, sortDir);
        case "total_pembayaran": return cmpVal(a.total_pembayaran, b.total_pembayaran, sortDir);
        case "tanggal_pesanan":
        default: return cmpVal(a.tanggal_pesanan, b.tanggal_pesanan, sortDir);
      }
    });
    return list;
  }, [orders, filterToko, sortField, sortDir]);

  const loadDetail = useCallback(async (o: EscrowOrder) => {
    setSelected(o); setDetail(null); setErr(null); setLoadingDetail(true);
    try {
      const res = await fetch(`/api/shopee/get-escrow-detail?toko_id=${o.toko_id}&order_sn=${encodeURIComponent(o.no_pesanan)}`);
      const data = await res.json();
      if (!data.success) setErr(data.error || data.raw?.message || data.raw?.error || "Gagal ambil escrow");
      else setDetail(parseEscrow(data.raw, o.no_pesanan));
    } catch (e: any) { setErr(e.message); }
    finally { setLoadingDetail(false); }
  }, []);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
        <select value={filterToko} onChange={(e) => setFilterToko(e.target.value)} style={{ padding: "8px 12px", background: "transparent", border: `1.5px solid ${C.border}`, borderRadius: 8, color: C.text, fontFamily: C.fontSans, fontSize: 13, outline: "none", cursor: "pointer" }}>
          <option value="semua">Semua Toko</option>
          {tokoOpts.map((t) => <option key={t.id} value={t.id}>{t.nama}</option>)}
        </select>
        <span style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>{ordersView.length} pesanan COMPLETED</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1fr) minmax(280px, 360px)", gap: 16, alignItems: "flex-start" }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", boxShadow: C.shadow, maxHeight: 620, overflowY: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 100px 90px", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, background: C.card, zIndex: 1 }}>
          <SortTh label="Toko" field="toko_nama" sortField={sortField} sortDir={sortDir} onSort={handleSort} C={C} />
          <SortTh label="Produk / No. Pesanan" field="nama_produk" sortField={sortField} sortDir={sortDir} onSort={handleSort} C={C} />
          <SortTh label="Tanggal" field="tanggal_pesanan" sortField={sortField} sortDir={sortDir} onSort={handleSort} C={C} />
          <SortTh label="Nominal" field="total_pembayaran" sortField={sortField} sortDir={sortDir} onSort={handleSort} C={C} align="right" />
        </div>
        {loadingList ? <div style={{ padding: 20, fontSize: 13, color: C.muted, fontFamily: C.fontMono }}>Memuat...</div>
          : ordersView.length === 0 ? <div style={{ padding: 20, fontSize: 13, color: C.muted, fontFamily: C.fontMono }}>Tidak ada pesanan COMPLETED</div>
          : ordersView.map((o) => {
            const active = selected?.id === o.id;
            return (
              <button key={o.id} type="button" onClick={() => loadDetail(o)} style={{ display: "grid", gridTemplateColumns: "90px 1fr 100px 90px", gap: 8, width: "100%", textAlign: "left", padding: "10px 14px", border: "none", cursor: "pointer", background: active ? `${C.accent}15` : "transparent", borderBottom: `1px solid ${C.border}`, borderLeft: active ? `3px solid ${C.accent}` : `3px solid transparent`, alignItems: "center" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textMid, fontFamily: C.fontMono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.toko_nama}</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: C.fontSans, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.nama_produk}</div>
                  <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, marginTop: 2 }}>{o.no_pesanan}{o.nama_pembeli ? ` · ${o.nama_pembeli}` : ""}</div>
                </div>
                <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono }}>{tanggalFmt(o.tanggal_pesanan)}</div>
                <div style={{ fontSize: 11, fontWeight: 800, color: C.text, fontFamily: C.fontMono, textAlign: "right" }}>{rupiahN(o.total_pembayaran)}</div>
              </button>
            );
          })}
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, boxShadow: C.shadow, minHeight: 200 }}>
        {!selected && <div style={{ color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>Pilih pesanan dari daftar untuk melihat rincian escrow.</div>}
        {selected && loadingDetail && <div style={{ color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>Memuat escrow detail...</div>}
        {selected && err && <div style={{ padding: 12, background: C.redDim, color: C.red, borderRadius: 10, fontSize: 12 }}>{err}</div>}
        {selected && detail && (
          <>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>Pesanan</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text, fontFamily: C.fontSans, marginTop: 2 }}>{selected.nama_produk}</div>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, marginTop: 2 }}>{detail.order_sn} · {selected.toko_nama} · {detail.buyer || "—"}</div>
            <div style={{ marginTop: 18, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
              <BreakdownRow label="Harga Produk" value={rupiahN(detail.produk_total)} C={C} />
              <BreakdownRow label="Ongkir Ditanggung Pembeli" value={rupiahN(detail.ongkir)} C={C} />
              <BreakdownRow label="Fee Admin" value={rupiahN(detail.fee_admin)} C={C} negative />
              <BreakdownRow label="Fee Layanan" value={rupiahN(detail.fee_layanan)} C={C} negative />
              <div style={{ height: 1, background: C.border, margin: "10px 0" }} />
              <BreakdownRow label="Total Bersih (Escrow)" value={rupiahN(detail.net)} C={C} bold />
            </div>
            <details style={{ marginTop: 16 }}>
              <summary style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, cursor: "pointer" }}>Lihat raw response</summary>
              <pre style={{ background: C.bgPage, padding: 10, borderRadius: 8, fontSize: 10, color: C.textMid, fontFamily: C.fontMono, overflow: "auto", maxHeight: 240, marginTop: 8 }}>{JSON.stringify(detail.raw, null, 2)}</pre>
            </details>
          </>
        )}
      </div>
      </div>
    </div>
  );
}

function BreakdownRow({ label, value, C, negative, bold }: { label: string; value: string; C: any; negative?: boolean; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0" }}>
      <span style={{ fontSize: bold ? 13 : 12, color: bold ? C.text : C.textMid, fontWeight: bold ? 800 : 500 }}>{label}</span>
      <span style={{ fontSize: bold ? 16 : 13, fontWeight: bold ? 800 : 700, color: bold ? C.green : negative ? C.red : C.text, fontFamily: C.fontMono }}>
        {negative && value !== "—" ? `− ${value.replace("Rp ", "Rp ")}` : value}
      </span>
    </div>
  );
}

// ── Pencairan tab ────────────────────────────────────────────────────────
type PencairanRow = {
  id: number;
  toko_id: number;
  nominal_cair: number;
  nominal_piutang: number;
  selisih: number;
  shopee_transaction_id: string | null;
  created_at: string;
  toko_online?: { nama: string } | null;
};

function PencairanTab({ C }: { C: any }) {
  const [laporan, setLaporan] = useState<PencairanRow[]>([]);
  const [rows, setRows] = useState<TxRow[]>([]);
  const [loadingLaporan, setLoadingLaporan] = useState(true);
  const [loadingWallet, setLoadingWallet] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [filterToko, setFilterToko] = useState<string>("semua");
  const [tokoOpts, setTokoOpts] = useState<{ id: number; nama: string }[]>([]);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [lapSortField, setLapSortField] = useState("created_at");
  const [lapSortDir, setLapSortDir] = useState<SortDir>("desc");
  const [txSortField, setTxSortField] = useState("create_time");
  const [txSortDir, setTxSortDir] = useState<SortDir>("desc");

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const syncedIds = useMemo(
    () => new Set(laporan.map(l => l.shopee_transaction_id).filter(Boolean) as string[]),
    [laporan],
  );

  const fetchLaporan = useCallback(async () => {
    const { data, error } = await supabase
      .from("pencairan_online")
      .select("id, toko_id, nominal_cair, nominal_piutang, selisih, shopee_transaction_id, created_at, toko_online(nama)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    setLaporan((data || []).map((r: any) => ({
      ...r,
      toko_online: Array.isArray(r.toko_online) ? r.toko_online[0] : r.toko_online,
    })) as PencairanRow[]);
  }, []);

  const fetchWallet = useCallback(async (refresh = false) => {
    setLoadingWallet(true);
    try {
      const url = refresh ? "/api/shopee/get-wallet-transactions?refresh=1" : "/api/shopee/get-wallet-transactions";
      const res = await fetch(url);
      const data = await res.json();
      const all: TxRow[] = [];
      for (const r of data.results || []) {
        if (!r.ok) continue;
        all.push(...parseTransactions({ id: r.toko_id, nama: r.toko }, r.raw));
      }
      all.sort((a, b) => b.create_time - a.create_time);
      setRows(all);
    } finally { setLoadingWallet(false); }
  }, []);

  const fetchTokoOpts = useCallback(async () => {
    const { data } = await supabase
      .from("toko_online")
      .select("id, nama")
      .eq("platform", "Shopee")
      .eq("aktif", true)
      .not("shopee_access_token", "is", null)
      .order("nama");
    setTokoOpts((data || []).map((t: { id: number; nama: string }) => ({ id: t.id, nama: t.nama })));
  }, []);

  const syncPencairan = useCallback(async (silent = false, full = false) => {
    if (!silent) setSyncing(true);
    try {
      const url = full ? "/api/shopee/sync-finance?full=1" : "/api/shopee/sync-finance";
      const res = await fetch(url, { method: "POST" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Sync gagal");
      const totalNew = (data.results || []).reduce((a: number, r: any) => a + (r.new || 0), 0);
      const errors = (data.results || []).filter((r: any) => r.status === "error");
      await fetchLaporan();
      if (!silent) {
        if (errors.length) showToast(`Sync selesai, ${errors.length} toko error`, "error");
        else if (totalNew > 0) showToast(`✓ ${totalNew} pencairan baru → kas + laporan`);
        else showToast("✓ Sudah up to date — tidak ada pencairan baru");
      }
      return totalNew;
    } catch (err: any) {
      if (!silent) showToast(err.message || "Gagal sync pencairan", "error");
      throw err;
    } finally {
      if (!silent) setSyncing(false);
    }
  }, [fetchLaporan]);

  useEffect(() => {
    let cancelled = false;
    fetchTokoOpts();
    (async () => {
      setLoadingLaporan(true);
      try {
        await fetchLaporan();
      } catch (err: any) {
        if (!cancelled) showToast(err.message || "Gagal memuat laporan", "error");
      } finally {
        if (!cancelled) setLoadingLaporan(false);
      }
    })();
    fetchWallet().catch((err: any) => {
      if (!cancelled) showToast(err.message || "Gagal memuat transaksi wallet", "error");
    });
    syncPencairan(true, false)
      .then(() => { if (!cancelled) fetchLaporan(); })
      .catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshAll = async () => {
    setLoadingLaporan(true);
    setLoadingWallet(true);
    try {
      await Promise.all([fetchLaporan(), fetchWallet(true)]);
    } catch (err: any) {
      showToast(err.message || "Gagal memuat data", "error");
    } finally {
      setLoadingLaporan(false);
    }
  };

  const filteredLaporan = useMemo(() => {
    let list = filterToko === "semua" ? laporan : laporan.filter((r) => String(r.toko_id) === filterToko);
    list = [...list].sort((a, b) => {
      switch (lapSortField) {
        case "toko": return cmpVal(a.toko_online?.nama || "", b.toko_online?.nama || "", lapSortDir);
        case "nominal_cair": return cmpVal(a.nominal_cair, b.nominal_cair, lapSortDir);
        case "nominal_piutang": return cmpVal(a.nominal_piutang, b.nominal_piutang, lapSortDir);
        case "selisih": return cmpVal(a.selisih, b.selisih, lapSortDir);
        case "shopee_transaction_id": return cmpVal(a.shopee_transaction_id, b.shopee_transaction_id, lapSortDir);
        case "created_at":
        default: return cmpVal(a.created_at, b.created_at, lapSortDir);
      }
    });
    return list;
  }, [laporan, filterToko, lapSortField, lapSortDir]);

  const filteredWallet = useMemo(() => {
    let list = filterToko === "semua" ? rows : rows.filter((r) => String(r.toko_id) === filterToko);
    list = [...list].sort((a, b) => {
      switch (txSortField) {
        case "toko": return cmpVal(a.toko, b.toko, txSortDir);
        case "type": return cmpVal(a.type, b.type, txSortDir);
        case "transaction_id": return cmpVal(a.transaction_id, b.transaction_id, txSortDir);
        case "status": return cmpVal(a.status, b.status, txSortDir);
        case "amount": return cmpVal(a.amount, b.amount, txSortDir);
        case "create_time":
        default: return cmpVal(a.create_time, b.create_time, txSortDir);
      }
    });
    return list;
  }, [rows, filterToko, txSortField, txSortDir]);

  const totalCair = filteredLaporan.reduce((a, r) => a + (r.nominal_cair || 0), 0);

  const handleLapSort = (field: string) => {
    const next = toggleSort(field, lapSortField, lapSortDir);
    setLapSortField(next.field);
    setLapSortDir(next.dir);
  };
  const handleTxSort = (field: string) => {
    const next = toggleSort(field, txSortField, txSortDir);
    setTxSortField(next.field);
    setTxSortDir(next.dir);
  };

  const handleSyncClick = async () => {
    try {
      await syncPencairan(false, true);
      await Promise.all([fetchLaporan(), fetchWallet(true)]);
    } catch { /* toast sudah ditampilkan */ }
  };

  return (
    <div>
      {toast && <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, padding: "12px 18px", background: toast.type === "success" ? C.green : C.red, color: "#fff", borderRadius: 10, fontSize: 13, fontWeight: 700, boxShadow: C.shadowMd }}>{toast.msg}</div>}

      <div style={{ padding: "12px 16px", background: C.accentGlow, border: `1px solid ${C.accent}40`, borderRadius: 12, marginBottom: 16, fontSize: 12, color: C.textMid, fontFamily: C.fontSans, lineHeight: 1.5 }}>
        Setiap Anda <b>mencairkan saldo</b> di Shopee Seller Center, klik <b>Sync Pencairan</b> (atau buka tab ini — auto-sync).
        Sistem otomatis catat ke <b>kas</b>, update <b>piutang online</b>, dan simpan <b>laporan</b> di bawah.
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <select value={filterToko} onChange={e => setFilterToko(e.target.value)} style={{ padding: "8px 12px", background: "transparent", border: `1.5px solid ${C.border}`, borderRadius: 8, color: C.text, fontFamily: C.fontSans, fontSize: 13, outline: "none", cursor: "pointer" }}>
          <option value="semua">Semua Toko</option>
          {tokoOpts.map(t => <option key={t.id} value={t.id}>{t.nama}</option>)}
        </select>
        <div style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>
          {filteredLaporan.length} pencairan · total {rupiahN(totalCair)}
        </div>
        <button onClick={refreshAll} disabled={loadingLaporan || loadingWallet || syncing} style={{ marginLeft: "auto", padding: "8px 14px", background: "transparent", border: `1.5px solid ${C.border}`, color: C.muted, borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, opacity: loadingLaporan || loadingWallet ? 0.5 : 1 }}>
          {loadingLaporan || loadingWallet ? "⏳" : "↻"} Refresh
        </button>
        <button onClick={handleSyncClick} disabled={syncing} style={{ padding: "8px 16px", background: `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`, border: "none", color: "#fff", borderRadius: 8, cursor: syncing ? "wait" : "pointer", fontSize: 13, fontWeight: 700, opacity: syncing ? 0.7 : 1 }}>
          {syncing ? "⏳ Syncing..." : "💸 Sync Pencairan"}
        </button>
      </div>

      {/* Laporan pencairan tercatat */}
      <div style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 10, fontFamily: C.fontSans }}>📋 Laporan Pencairan (masuk kas)</div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", boxShadow: C.shadow, marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px 100px 100px 140px", padding: "10px 16px", borderBottom: `1px solid ${C.border}`, gap: 10 }}>
          <SortTh label="Toko" field="toko" sortField={lapSortField} sortDir={lapSortDir} onSort={handleLapSort} C={C} />
          <SortTh label="Cair" field="nominal_cair" sortField={lapSortField} sortDir={lapSortDir} onSort={handleLapSort} C={C} align="right" />
          <SortTh label="Piutang" field="nominal_piutang" sortField={lapSortField} sortDir={lapSortDir} onSort={handleLapSort} C={C} align="right" />
          <SortTh label="Selisih" field="selisih" sortField={lapSortField} sortDir={lapSortDir} onSort={handleLapSort} C={C} align="right" />
          <SortTh label="Tanggal" field="created_at" sortField={lapSortField} sortDir={lapSortDir} onSort={handleLapSort} C={C} />
          <SortTh label="Txn ID" field="shopee_transaction_id" sortField={lapSortField} sortDir={lapSortDir} onSort={handleLapSort} C={C} />
        </div>
        {loadingLaporan && laporan.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>Memuat...</div>
        ) : filteredLaporan.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>
            Belum ada pencairan tercatat. Cairkan saldo di Seller Center lalu klik Sync Pencairan.
          </div>
        ) : filteredLaporan.map(r => (
          <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px 100px 100px 140px", padding: "10px 16px", borderBottom: `1px solid ${C.border}`, alignItems: "center", gap: 10, fontSize: 12 }}>
            <div style={{ fontWeight: 700, color: C.text }}>{r.toko_online?.nama || `Toko #${r.toko_id}`}</div>
            <div style={{ textAlign: "right", fontWeight: 800, color: C.green, fontFamily: C.fontMono }}>{rupiahN(r.nominal_cair)}</div>
            <div style={{ textAlign: "right", color: C.textMid, fontFamily: C.fontMono }}>{rupiahN(r.nominal_piutang)}</div>
            <div style={{ textAlign: "right", color: r.selisih !== 0 ? C.yellow : C.muted, fontFamily: C.fontMono }}>{rupiahN(r.selisih)}</div>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{tanggalFmt(r.created_at)}</div>
            <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.shopee_transaction_id || ""}>{r.shopee_transaction_id || "—"}</div>
          </div>
        ))}
      </div>

      {/* Transaksi wallet Shopee (referensi) */}
      <div style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 10, fontFamily: C.fontSans }}>🔍 Transaksi Wallet Shopee</div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", boxShadow: C.shadow }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 120px 130px 130px 100px", padding: "10px 16px", borderBottom: `1px solid ${C.border}`, gap: 12 }}>
          <SortTh label="Toko / Tipe" field="toko" sortField={txSortField} sortDir={txSortDir} onSort={handleTxSort} C={C} />
          <SortTh label="Transaction ID" field="transaction_id" sortField={txSortField} sortDir={txSortDir} onSort={handleTxSort} C={C} />
          <SortTh label="Status" field="status" sortField={txSortField} sortDir={txSortDir} onSort={handleTxSort} C={C} />
          <SortTh label="Tanggal" field="create_time" sortField={txSortField} sortDir={txSortDir} onSort={handleTxSort} C={C} />
          <SortTh label="Nominal" field="amount" sortField={txSortField} sortDir={txSortDir} onSort={handleTxSort} C={C} align="right" />
          <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, textTransform: "uppercase", textAlign: "center" }}>Azalea</span>
        </div>
        {loadingWallet && rows.length === 0 ? <div style={{ padding: 30, textAlign: "center", color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>Memuat transaksi wallet dari Shopee…</div>
          : filteredWallet.length === 0 ? <div style={{ padding: 30, textAlign: "center", color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>Tidak ada transaksi wallet</div>
          : filteredWallet.map(tx => {
            const synced = syncedIds.has(tx.transaction_id);
            const isWithdraw = (tx.type || "").toUpperCase().includes("WITHDRAW");
            return (
              <div key={`${tx.toko_id}-${tx.transaction_id}`} style={{ display: "grid", gridTemplateColumns: "1fr 140px 120px 130px 130px 100px", padding: "10px 16px", borderBottom: `1px solid ${C.border}`, alignItems: "center", gap: 12, fontSize: 12, opacity: isWithdraw ? 1 : 0.65 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: C.fontSans }}>{tx.toko}</div>
                  <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{tx.type}</div>
                </div>
                <div style={{ fontSize: 11, color: C.textMid, fontFamily: C.fontMono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.transaction_id}</div>
                <div style={{ fontSize: 11, color: C.textMid, fontFamily: C.fontMono }}>{tx.status}</div>
                <div style={{ fontSize: 11, color: C.textMid, fontFamily: C.fontMono }}>{unixToWIB(tx.create_time)}</div>
                <div style={{ textAlign: "right", fontWeight: 800, color: tx.amount >= 0 ? C.green : C.red, fontFamily: C.fontMono }}>
                  {tx.amount >= 0 ? "+ " : "− "}{rupiahN(Math.abs(tx.amount))}
                </div>
                <div style={{ textAlign: "center" }}>
                  {synced ? (
                    <span style={{ fontSize: 10, padding: "4px 8px", borderRadius: 20, background: C.greenDim, color: C.green, fontWeight: 700, fontFamily: C.fontMono }}>✓ Kas</span>
                  ) : isWithdraw ? (
                    <span style={{ fontSize: 10, padding: "4px 8px", borderRadius: 20, background: C.yellowDim, color: C.yellow, fontWeight: 700, fontFamily: C.fontMono }}>Belum</span>
                  ) : (
                    <span style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono }}>—</span>
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

function SumCard({ label, value, color, C }: { label: string; value: string; color: string; C: any }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 18px", minWidth: 200, boxShadow: C.shadow }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, fontFamily: C.fontMono, letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color, fontFamily: C.fontMono, marginTop: 4 }}>{value}</div>
    </div>
  );
}

type Tab = "saldo" | "escrow" | "pencairan";
const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "saldo", label: "Saldo", icon: "💰" },
  { key: "escrow", label: "Escrow", icon: "🧾" },
  { key: "pencairan", label: "Pencairan", icon: "💸" },
];

function tabFromSearchParams(sp: { get: (k: string) => string | null }): Tab {
  const t = sp.get("tab");
  if (t === "saldo" || t === "escrow" || t === "pencairan") return t;
  return "saldo";
}

export default function ShopeeKeuanganPage() {
  return (
    <Suspense fallback={null}>
      <ShopeeKeuanganPageInner />
    </Suspense>
  );
}

function ShopeeKeuanganPageInner() {
  const { isDark } = useTheme();
  const C = isDark ? DARK : LIGHT;
  const searchParams = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(() => tabFromSearchParams(searchParams));
  const [tokoConnectedCount, setTokoConnectedCount] = useState<number | null>(null);

  useEffect(() => {
    setTab(tabFromSearchParams(searchParams));
  }, [searchParams]);

  const goTab = (next: Tab) => {
    setTab(next);
    if (next === "saldo") router.replace("/shopee/keuangan");
    else router.replace(`/shopee/keuangan?tab=${next}`);
  };

  useEffect(() => {
    supabase.from("toko_online").select("id", { count: "exact", head: true }).eq("platform", "Shopee").eq("aktif", true).not("shopee_access_token", "is", null).then(({ count }) => setTokoConnectedCount(count ?? 0));
  }, []);

  return (
    <AppShell>
      <div style={{ padding: "24px 28px" }}>
        {tokoConnectedCount !== null && tokoConnectedCount > 0 && (
          <div style={{ padding: "10px 14px", background: C.yellowDim, color: C.yellow, borderRadius: 10, fontSize: 12, marginBottom: 18, fontFamily: C.fontSans }}>
            ℹ <b>{tokoConnectedCount}</b> toko terhubung — data fee otomatis dari Shopee API.
            Modul lama (<a href="/fee-platform" style={{ color: C.yellow, textDecoration: "underline" }}>Fee Platform</a> / <a href="/rekap-saldo" style={{ color: C.yellow, textDecoration: "underline" }}>Rekap Saldo</a>) tetap tersedia untuk input manual.
          </div>
        )}
        <div style={{ display: "flex", gap: 6, marginBottom: 18, borderBottom: `1px solid ${C.border}` }}>
          {TABS.map(t => {
            const active = tab === t.key;
            return (
              <button key={t.key} onClick={() => goTab(t.key)} style={{ padding: "10px 18px", border: "none", background: "transparent", color: active ? C.accent : C.muted, fontWeight: active ? 800 : 600, fontSize: 13, fontFamily: C.fontSans, cursor: "pointer", borderBottom: active ? `2px solid ${C.accent}` : "2px solid transparent", marginBottom: -1 }}>
                <span style={{ marginRight: 6 }}>{t.icon}</span>{t.label}
              </button>
            );
          })}
        </div>
        {tab === "saldo" && <SaldoTab C={C} />}
        {tab === "escrow" && <EscrowTab C={C} />}
        {tab === "pencairan" && <PencairanTab C={C} />}
      </div>
    </AppShell>
  );
}
