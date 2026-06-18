"use client";

// /shopee/pesanan — Order management + Logistics.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import { useTheme, LIGHT, DARK } from "@/context/ThemeContext";
import { rupiah, tanggalFmt } from "@/lib/format";

type Order = {
  id: number; no_pesanan: string; tanggal_pesanan: string;
  no_resi: string | null; sku: string; qty: number;
  harga_satuan: number; total_pembayaran: number;
  status_shopee: string | null; nama_pembeli: string | null;
  jasa_kirim: string | null; nama_produk: string;
  nama_toko: string; toko_id: number;
};

type Toko = { id: number; nama: string };

const STATUS_TABS = [
  { key: "semua",         label: "Semua" },
  { key: "UNPAID",        label: "Belum Bayar" },
  { key: "READY_TO_SHIP", label: "Perlu Dikirim" },
  { key: "PROCESSED",     label: "Diproses" },
  { key: "LABEL_PRINTED", label: "Label Ditempel" },
  { key: "SHIPPED",       label: "Dikirim" },
  { key: "COMPLETED",     label: "Selesai" },
  { key: "CANCELLED",     label: "Dibatalkan" },
  { key: "IN_CANCEL",     label: "Batal Proses" },
];

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  UNPAID:         { bg: "rgba(251,191,36,0.15)",  color: "#fbbf24" },
  READY_TO_SHIP:  { bg: "rgba(251,146,60,0.15)",  color: "#fb923c" },
  PROCESSED:      { bg: "rgba(96,165,250,0.15)",  color: "#60a5fa" },
  LABEL_PRINTED:  { bg: "rgba(168,85,247,0.15)",  color: "#a855f7" },
  SHIPPED:        { bg: "rgba(45,212,191,0.15)",  color: "#2dd4bf" },
  COMPLETED:      { bg: "rgba(74,222,128,0.15)",  color: "#4ade80" },
  CANCELLED:      { bg: "rgba(248,113,113,0.15)", color: "#f87171" },
  IN_CANCEL:      { bg: "rgba(248,113,113,0.10)", color: "#f87171" },
};

const SHIPPABLE_STATUSES = new Set(["READY_TO_SHIP", "PROCESSED"]);

const SEARCH_FIELDS = [
  { key: "no_pesanan",   label: "No. Pesanan" },
  { key: "no_resi",      label: "No. Resi" },
  { key: "nama_pembeli", label: "Nama Pembeli" },
];

const PAGE_SIZE = 50;
const SHIP_DEADLINE_MS = 2 * 24 * 3600 * 1000;

function formatBatasWaktu(tanggalPesanan: string): { text: string; danger: boolean; expired: boolean } {
  if (!tanggalPesanan) return { text: "—", danger: false, expired: false };
  const t0 = new Date(tanggalPesanan).getTime();
  if (Number.isNaN(t0)) return { text: "—", danger: false, expired: false };
  const deadline = t0 + SHIP_DEADLINE_MS;
  const remaining = deadline - Date.now();
  if (remaining < 0) return { text: "Lewat batas", danger: true, expired: true };
  const hours = Math.floor(remaining / 3600000);
  if (hours < 24) return { text: `${hours}j tersisa`, danger: true, expired: false };
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return { text: `${days}h ${remH}j`, danger: false, expired: false };
}

function openBase64Pdf(b64: string, filename: string) {
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (!w) { const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) { console.error("openBase64Pdf failed:", err); alert("Gagal membuka PDF. Cek console untuk detail."); }
}

function extractPdfBase64(raw: any): string | null {
  if (!raw) return null;
  const candidates = [raw?.response?.result, raw?.response?.shipping_document_info?.[0]?.shipping_document, raw?.response?.shipping_document, raw?.response?.data];
  for (const c of candidates) { if (typeof c === "string" && c.length > 100) return c; }
  return null;
}

function PillFilterRow({ label, options, selected, onSelect, C }: {
  label: string; options: { key: string; label: string; count?: number }[];
  selected: string; onSelect: (v: string) => void; C: any;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, fontFamily: C.fontMono, minWidth: 80 }}>{label}</span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {options.map(opt => {
          const active = selected === opt.key;
          return (
            <button key={opt.key} onClick={() => onSelect(opt.key)} style={{ padding: "4px 12px", background: active ? `${C.accent}20` : "transparent", border: `1.5px solid ${active ? C.accent : C.border}`, borderRadius: 20, color: active ? C.accent : C.muted, cursor: "pointer", fontSize: 12, fontWeight: active ? 700 : 500, fontFamily: C.fontSans, transition: "all 0.15s" }}>
              {opt.label}
              {opt.count !== undefined && <span style={{ marginLeft: 6, opacity: 0.7, fontFamily: C.fontMono, fontSize: 11 }}>({opt.count})</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type ShipTarget = { toko_id: number; toko_nama: string; order_sn: string };
type ShipParamPickupSlot = { pickup_time_id?: string; time_text?: string; date?: number | string };
type ShipParamBranch = { branch_id?: number; region?: string; address?: string };

function ShipModal({ open, onClose, targets, onShipped, C }: {
  open: boolean; onClose: () => void; targets: ShipTarget[]; onShipped: () => void; C: any;
}) {
  const [loadingParams, setLoadingParams] = useState(false);
  const [paramsErr, setParamsErr] = useState<string | null>(null);
  const [paramsRaw, setParamsRaw] = useState<any>(null);
  const [method, setMethod] = useState<"pickup" | "dropoff">("pickup");
  const [pickupSlot, setPickupSlot] = useState<string>("");
  const [branchId, setBranchId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const isBulk = targets.length > 1;

  useEffect(() => {
    if (!open || targets.length === 0) return;
    let cancelled = false;
    setLoadingParams(true); setParamsErr(null); setParamsRaw(null); setPickupSlot(""); setBranchId("");
    (async () => {
      try {
        const t = targets[0];
        const res = await fetch(`/api/shopee/get-shipping-parameter?toko_id=${t.toko_id}&order_sn=${encodeURIComponent(t.order_sn)}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.error || data.raw?.error) setParamsErr(data.error || data.raw?.message || data.raw?.error);
        else setParamsRaw(data.raw?.response ?? data.raw);
      } catch (err: any) { if (!cancelled) setParamsErr(err.message); }
      finally { if (!cancelled) setLoadingParams(false); }
    })();
    return () => { cancelled = true; };
  }, [open, targets]);

  const pickupSlots: ShipParamPickupSlot[] = useMemo(() => {
    if (!paramsRaw) return [];
    const addrList = paramsRaw?.pickup?.address_list || paramsRaw?.info_needed?.pickup?.address_list || [];
    const slots: ShipParamPickupSlot[] = [];
    for (const addr of addrList) { const tList = addr?.time_slot_list || []; for (const s of tList) slots.push(s); }
    return slots;
  }, [paramsRaw]);

  const branches: ShipParamBranch[] = useMemo(() => {
    if (!paramsRaw) return [];
    return paramsRaw?.dropoff?.branch_list || paramsRaw?.info_needed?.dropoff?.branch_list || [];
  }, [paramsRaw]);

  const submit = async () => {
    setSubmitting(true); setSubmitErr(null);
    try {
      const tokoId = targets[0].toko_id;
      const order_sn_list = targets.map(t => t.order_sn);
      const body: any = { toko_id: tokoId, order_sn_list, method };
      if (method === "pickup" && pickupSlot) body.pickup_time_id = pickupSlot;
      if (method === "dropoff" && branchId) body.branch_id = Number(branchId);
      const res = await fetch("/api/shopee/ship-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!data.success) { setSubmitErr(data.error || "Gagal mengatur pengiriman"); return; }
      onShipped(); onClose();
    } catch (err: any) { setSubmitErr(err.message); }
    finally { setSubmitting(false); }
  };

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, maxWidth: 520, width: "100%", padding: "20px 24px", boxShadow: C.shadowMd, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.text, fontFamily: C.fontSans }}>{isBulk ? `Atur Pengiriman (${targets.length} pesanan)` : "Atur Pengiriman"}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, marginBottom: 14 }}>
          {isBulk ? `${targets[0].toko_nama} · ${targets.map(t => t.order_sn).slice(0, 3).join(", ")}${targets.length > 3 ? "…" : ""}` : `${targets[0]?.toko_nama || ""} · ${targets[0]?.order_sn || ""}`}
        </div>
        {loadingParams && <div style={{ color: C.muted, fontFamily: C.fontMono, fontSize: 13, padding: "20px 0" }}>Memuat parameter pengiriman...</div>}
        {paramsErr && <div style={{ padding: 12, background: C.redDim, color: C.red, borderRadius: 10, fontSize: 12, marginBottom: 14 }}>⚠ {paramsErr}</div>}
        {!loadingParams && !paramsErr && paramsRaw && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {(["pickup", "dropoff"] as const).map(m => (
                <button key={m} onClick={() => setMethod(m)} style={{ flex: 1, padding: "10px 14px", borderRadius: 10, background: method === m ? `${C.accent}20` : "transparent", border: `1.5px solid ${method === m ? C.accent : C.border}`, color: method === m ? C.accent : C.muted, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: C.fontSans, textTransform: "capitalize" }}>
                  {m === "pickup" ? "🚚 Pickup" : "🏬 Drop Off"}
                </button>
              ))}
            </div>
            {method === "pickup" && (
              <div>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, marginBottom: 6 }}>Time slot</div>
                {pickupSlots.length === 0 ? <div style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono, padding: 8 }}>Tidak ada time slot tersedia.</div>
                  : <div style={{ maxHeight: 220, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 10 }}>
                    {pickupSlots.map((s, i) => {
                      const id = s.pickup_time_id || `slot-${i}`;
                      const active = pickupSlot === id;
                      const dateLabel = typeof s.date === "number" ? new Date(s.date * 1000).toLocaleDateString("id-ID", { day: "2-digit", month: "short" }) : s.date || "";
                      return <button key={id} onClick={() => setPickupSlot(id)} style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", border: "none", background: active ? `${C.accent}20` : "transparent", color: active ? C.accent : C.text, fontWeight: active ? 700 : 500, borderBottom: `1px solid ${C.border}`, cursor: "pointer", fontSize: 12, fontFamily: C.fontSans }}>{dateLabel} · {s.time_text || "(no label)"}</button>;
                    })}
                  </div>}
              </div>
            )}
            {method === "dropoff" && (
              <div>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, marginBottom: 6 }}>Cabang Drop Off</div>
                {branches.length === 0 ? <div style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono, padding: 8 }}>Tidak ada cabang dropoff tersedia. Lanjut tanpa branch_id juga bisa.</div>
                  : <div style={{ maxHeight: 220, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 10 }}>
                    {branches.map((b, i) => {
                      const id = String(b.branch_id ?? `branch-${i}`);
                      const active = branchId === id;
                      return <button key={id} onClick={() => setBranchId(id)} style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", border: "none", background: active ? `${C.accent}20` : "transparent", color: active ? C.accent : C.text, fontWeight: active ? 700 : 500, borderBottom: `1px solid ${C.border}`, cursor: "pointer", fontSize: 12, fontFamily: C.fontSans }}><div>{b.region || "(no region)"}</div><div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, marginTop: 2 }}>{b.address || ""}</div></button>;
                    })}
                  </div>}
              </div>
            )}
            {submitErr && <div style={{ marginTop: 12, padding: 10, background: C.redDim, color: C.red, borderRadius: 8, fontSize: 12 }}>{submitErr}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <button onClick={onClose} disabled={submitting} style={{ padding: "10px 18px", background: "transparent", border: `1.5px solid ${C.border}`, color: C.muted, borderRadius: 10, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>Batal</button>
              <button onClick={submit} disabled={submitting} style={{ padding: "10px 18px", background: `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`, border: "none", color: "#fff", borderRadius: 10, cursor: submitting ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 13, opacity: submitting ? 0.7 : 1 }}>
                {submitting ? "Mengirim..." : "Konfirmasi"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function OrdersPage() {
  const { isDark } = useTheme();
  const C = isDark ? DARK : LIGHT;

  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [tokoList, setTokoList] = useState<Toko[]>([]);
  const [jasaKirimList, setJasaKirimList] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState("semua");
  const [filterToko, setFilterToko] = useState("semua");
  const [filterJasaKirim, setFilterJasaKirim] = useState("semua");
  const [searchField, setSearchField] = useState("no_pesanan");
  const [searchVal, setSearchVal] = useState("");
  const [page, setPage] = useState(1);
  const [syncing, setSyncing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [shipModalTargets, setShipModalTargets] = useState<ShipTarget[]>([]);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [tokoRes, ordersRes, penjualanRes] = await Promise.all([
        supabase.from("toko_online").select("id, nama").eq("platform", "Shopee").eq("aktif", true).not("shopee_access_token", "is", null).order("id"),
        supabase.from("detail_penjualan_online").select("id, no_pesanan, tanggal_pesanan, no_resi, sku, qty, harga_satuan, total_pembayaran, status_shopee, nama_pembeli, jasa_kirim, penjualan_online_id, stok_barang(nama_produk)").order("tanggal_pesanan", { ascending: false }).limit(2000),
        supabase.from("penjualan_online").select("id, toko_id"),
      ]);
      const tokoData: Toko[] = tokoRes.data || [];
      setTokoList(tokoData);
      const tokoMap = new Map<number, string>(tokoData.map(t => [t.id, t.nama]));
      const penjualanMap = new Map<number, number>((penjualanRes.data || []).map((p: any) => [p.id, p.toko_id]));
      const mapped: Order[] = (ordersRes.data || []).map((r: any) => {
        const tokoId = penjualanMap.get(r.penjualan_online_id) || 0;
        return { id: r.id, no_pesanan: r.no_pesanan, tanggal_pesanan: r.tanggal_pesanan, no_resi: r.no_resi, sku: r.sku, qty: r.qty, harga_satuan: r.harga_satuan, total_pembayaran: r.total_pembayaran, status_shopee: r.status_shopee, nama_pembeli: r.nama_pembeli, jasa_kirim: r.jasa_kirim, nama_produk: (r.stok_barang as any)?.nama_produk || r.sku, nama_toko: tokoMap.get(tokoId) || "-", toko_id: tokoId };
      });
      setAllOrders(mapped);
      const jk = [...new Set(mapped.map(o => o.jasa_kirim).filter(Boolean) as string[])].sort();
      setJasaKirimList(jk);
    } catch (err: any) { showToast("Gagal load data: " + err.message, "error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { setPage(1); setSelected(new Set()); }, [filterStatus, filterToko, filterJasaKirim, searchVal]);

  const passSearch = (o: Order): boolean => {
    if (!searchVal.trim()) return true;
    const val = searchVal.toLowerCase();
    if (searchField === "no_pesanan") return !!o.no_pesanan?.toLowerCase().includes(val);
    if (searchField === "no_resi") return !!o.no_resi?.toLowerCase().includes(val);
    if (searchField === "nama_pembeli") return !!o.nama_pembeli?.toLowerCase().includes(val);
    return true;
  };

  const searched = useMemo(() => allOrders.filter(passSearch), [allOrders, searchField, searchVal]);

  const filterExcept = useCallback((skip: "toko" | "jasa" | "status" | "none") => {
    return searched.filter(o => {
      if (skip !== "toko"   && filterToko !== "semua"      && String(o.toko_id) !== filterToko) return false;
      if (skip !== "jasa"   && filterJasaKirim !== "semua" && o.jasa_kirim !== filterJasaKirim) return false;
      if (skip !== "status" && filterStatus !== "semua"    && o.status_shopee !== filterStatus) return false;
      return true;
    });
  }, [searched, filterToko, filterJasaKirim, filterStatus]);

  const tokoCounts = useMemo(() => { const data = filterExcept("toko"); const map = new Map<string, number>(); map.set("semua", data.length); for (const o of data) map.set(String(o.toko_id), (map.get(String(o.toko_id)) || 0) + 1); return map; }, [filterExcept]);
  const jasaCounts = useMemo(() => { const data = filterExcept("jasa"); const map = new Map<string, number>(); map.set("semua", data.length); for (const o of data) { const k = o.jasa_kirim || ""; if (!k) continue; map.set(k, (map.get(k) || 0) + 1); } return map; }, [filterExcept]);
  const statusCounts = useMemo(() => { const data = filterExcept("status"); const map = new Map<string, number>(); map.set("semua", data.length); for (const o of data) { const k = o.status_shopee || ""; if (!k) continue; map.set(k, (map.get(k) || 0) + 1); } return map; }, [filterExcept]);
  const filtered = useMemo(() => filterExcept("none"), [filterExcept]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const allOnPageSelected = paginated.length > 0 && paginated.every(o => selected.has(o.id));

  const toggleAllOnPage = () => {
    setSelected(prev => {
      const next = new Set(prev);
      if (allOnPageSelected) { for (const o of paginated) next.delete(o.id); }
      else { for (const o of paginated) next.add(o.id); }
      return next;
    });
  };

  const selectedOrders = useMemo(() => filtered.filter(o => selected.has(o.id)), [filtered, selected]);
  const selectedShippable = selectedOrders.filter(o => SHIPPABLE_STATUSES.has(o.status_shopee || ""));

  const handleSyncAll = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/shopee/sync-orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = await res.json();
      if (data.success) { const total = data.results?.reduce((a: number, r: any) => a + (r.new || 0), 0) || 0; showToast(`✓ ${total} pesanan baru disync`); fetchAll(); }
      else showToast("Gagal sync: " + data.error, "error");
    } catch (err: any) { showToast("Gagal sync: " + err.message, "error"); }
    finally { setSyncing(false); }
  };

  const handleShipSingle = (o: Order) => setShipModalTargets([{ toko_id: o.toko_id, toko_nama: o.nama_toko, order_sn: o.no_pesanan }]);

  const handleShipBulk = () => {
    if (selectedShippable.length === 0) { showToast("Pilih pesanan dengan status Perlu Dikirim / Diproses", "error"); return; }
    const tokoIds = new Set(selectedShippable.map(o => o.toko_id));
    if (tokoIds.size > 1) { showToast("Pilih pesanan dari 1 toko saja untuk Atur Pengiriman Massal", "error"); return; }
    setShipModalTargets(selectedShippable.map(o => ({ toko_id: o.toko_id, toko_nama: o.nama_toko, order_sn: o.no_pesanan })));
  };

  const printOneToko = async (tokoId: number, orders: Order[]) => {
    const res = await fetch("/api/shopee/get-airway-bill", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toko_id: tokoId, order_sn_list: orders.map(o => o.no_pesanan) }) });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || data.raw?.message || data.raw?.error || "get-airway-bill gagal");
    const b64 = extractPdfBase64(data.raw);
    if (!b64) { console.error("[print-label] response did not contain base64 PDF:", data.raw); throw new Error("PDF tidak ditemukan di response"); }
    openBase64Pdf(b64, `label-${orders[0].nama_toko}-${Date.now()}.pdf`);
  };

  const handlePrintSingle = async (o: Order) => {
    setPrinting(true);
    try { await printOneToko(o.toko_id, [o]); }
    catch (err: any) { showToast("Gagal print: " + err.message, "error"); }
    finally { setPrinting(false); }
  };

  const handlePrintBulk = async () => {
    const target = selectedShippable;
    if (target.length === 0) { showToast("Pilih pesanan dengan status Perlu Dikirim / Diproses", "error"); return; }
    setPrinting(true);
    try {
      const byToko = new Map<number, Order[]>();
      for (const o of target) { const arr = byToko.get(o.toko_id) || []; arr.push(o); byToko.set(o.toko_id, arr); }
      for (const [tokoId, orders] of byToko) await printOneToko(tokoId, orders);
      showToast(`✓ ${target.length} label dicetak`);
    } catch (err: any) { showToast("Gagal print: " + err.message, "error"); }
    finally { setPrinting(false); }
  };

  const onShipped = () => { showToast("✓ Pengiriman berhasil diatur"); setShipModalTargets([]); fetchAll(); };

  const inputStyle: React.CSSProperties = { padding: "8px 12px", background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)", border: `1.5px solid ${C.border}`, borderRadius: 8, color: C.text, fontFamily: C.fontSans, fontSize: 13, outline: "none" };

  const tokoOptions = [{ key: "semua", label: "Semua", count: tokoCounts.get("semua") || 0 }, ...tokoList.map(t => ({ key: String(t.id), label: t.nama, count: tokoCounts.get(String(t.id)) || 0 }))];
  const jasaOptions = [{ key: "semua", label: "Semua", count: jasaCounts.get("semua") || 0 }, ...jasaKirimList.map(j => ({ key: j, label: j, count: jasaCounts.get(j) || 0 }))];
  const statusOptions = STATUS_TABS.map(s => ({ ...s, count: statusCounts.get(s.key) || 0 }));

  return (
    <AppShell>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .order-row:hover{background:${isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)"}!important}
        @media print{.no-print{display:none!important}}
      `}</style>

      {toast && <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, padding: "12px 20px", borderRadius: 10, background: toast.type === "success" ? C.green : C.red, color: "#fff", fontSize: 13, fontWeight: 700, boxShadow: C.shadowMd, animation: "fadeUp 0.2s ease" }}>{toast.msg}</div>}

      <ShipModal open={shipModalTargets.length > 0} onClose={() => setShipModalTargets([])} targets={shipModalTargets} onShipped={onShipped} C={C} />

      <div style={{ padding: "24px 28px", animation: "fadeUp 0.3s ease" }}>
        <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>Pesanan Shopee</h1>
            <p style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono, margin: "4px 0 0" }}>
              {tokoList.length} toko · {filtered.length.toLocaleString("id-ID")} pesanan
              {selected.size > 0 && <> · <b style={{ color: C.accent }}>{selected.size} terpilih</b></>}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href="/shopee/pesanan/scan-resi" style={{ ...inputStyle, textDecoration: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700 }}>📷 Scan Resi</Link>
            <button onClick={handleSyncAll} disabled={syncing} style={{ padding: "8px 16px", background: `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`, border: "none", color: "#fff", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: C.fontSans, opacity: syncing ? 0.7 : 1 }}>{syncing ? "⏳ Syncing..." : "↻ Sync Semua"}</button>
          </div>
        </div>

        {selected.size > 0 && (
          <div className="no-print" style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 14px", background: C.accentGlow, border: `1px solid ${C.accent}`, borderRadius: 10, marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, fontFamily: C.fontSans, flex: 1 }}>{selected.size} pesanan dipilih · {selectedShippable.length} bisa dikirim</div>
            <button onClick={handleShipBulk} disabled={selectedShippable.length === 0} style={{ ...inputStyle, cursor: "pointer", fontWeight: 700, opacity: selectedShippable.length === 0 ? 0.5 : 1 }}>🚚 Atur Pengiriman Massal</button>
            <button onClick={handlePrintBulk} disabled={printing || selectedShippable.length === 0} style={{ ...inputStyle, cursor: "pointer", fontWeight: 700, opacity: printing || selectedShippable.length === 0 ? 0.5 : 1 }}>🖨 Print Label Massal</button>
            <button onClick={() => setSelected(new Set())} style={{ ...inputStyle, cursor: "pointer", color: C.muted }}>✕</button>
          </div>
        )}

        <div className="no-print" style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
          <select value={searchField} onChange={e => setSearchField(e.target.value)} style={{ ...inputStyle, cursor: "pointer", minWidth: 140 }}>
            {SEARCH_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <input value={searchVal} onChange={e => setSearchVal(e.target.value)} placeholder={`Cari ${SEARCH_FIELDS.find(f => f.key === searchField)?.label}...`} style={{ ...inputStyle, width: 280 }} />
          {searchVal && <button onClick={() => setSearchVal("")} style={{ ...inputStyle, cursor: "pointer", color: C.muted }}>✕</button>}
        </div>

        <div className="no-print" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
          <PillFilterRow label="Toko"       options={tokoOptions}   selected={filterToko}      onSelect={setFilterToko}      C={C} />
          <PillFilterRow label="Jasa Kirim" options={jasaOptions}   selected={filterJasaKirim} onSelect={setFilterJasaKirim} C={C} />
          <PillFilterRow label="Status"     options={statusOptions} selected={filterStatus}    onSelect={setFilterStatus}    C={C} />
        </div>

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", boxShadow: C.shadow }}>
          <div style={{ display: "grid", gridTemplateColumns: "32px 52px 1fr 110px 100px 110px 110px 110px 220px", padding: "10px 16px", background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)", borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 700, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, textTransform: "uppercase" as const, alignItems: "center", gap: 12 }}>
            <input type="checkbox" checked={allOnPageSelected} onChange={toggleAllOnPage} style={{ cursor: "pointer" }} />
            <span>Foto</span><span>Produk / Pesanan / Pembeli</span><span style={{ textAlign: "right" }}>Total</span>
            <span style={{ textAlign: "center" }}>Qty</span><span>Jasa Kirim</span><span>Toko</span><span>Batas Kirim</span><span>Status / Aksi</span>
          </div>

          {loading ? <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: C.fontMono }}>Memuat...</div>
            : paginated.length === 0 ? <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: C.fontMono }}>Tidak ada pesanan</div>
            : paginated.map(order => {
              const sc = STATUS_COLORS[order.status_shopee || ""];
              const bw = formatBatasWaktu(order.tanggal_pesanan);
              const isShippable = SHIPPABLE_STATUSES.has(order.status_shopee || "");
              const checked = selected.has(order.id);
              return (
                <div key={order.id} className="order-row" style={{ display: "grid", gridTemplateColumns: "32px 52px 1fr 110px 100px 110px 110px 110px 220px", padding: "12px 16px", borderBottom: `1px solid ${C.border}`, alignItems: "center", gap: 12, transition: "background 0.1s" }}>
                  <input type="checkbox" checked={checked} onChange={() => { setSelected(prev => { const n = new Set(prev); if (n.has(order.id)) n.delete(order.id); else n.add(order.id); return n; }); }} style={{ cursor: "pointer" }} />
                  <div style={{ width: 40, height: 40, borderRadius: 8, background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)", border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📦</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: C.fontSans, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{order.nama_produk} <span style={{ color: C.muted, fontWeight: 500, fontSize: 12 }}>×{order.qty}</span></div>
                    <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, marginTop: 2 }}>{order.no_pesanan} · {order.sku}</div>
                    <div style={{ fontSize: 11, color: C.textMid, marginTop: 2 }}>{order.nama_pembeli || "—"}</div>
                    {order.no_resi && <div style={{ fontSize: 10, color: C.accent, fontFamily: C.fontMono, marginTop: 1 }}>📦 {order.no_resi}</div>}
                  </div>
                  <div style={{ textAlign: "right", fontSize: 12, fontWeight: 700, color: C.green, fontFamily: C.fontMono }}>{rupiah(order.total_pembayaran)}</div>
                  <div style={{ textAlign: "center", fontSize: 13, fontWeight: 700, color: C.text, fontFamily: C.fontMono }}>{order.qty}</div>
                  <div style={{ fontSize: 11, color: C.textMid }}>{order.jasa_kirim || "—"}</div>
                  <div style={{ fontSize: 12, color: C.textMid }}>{order.nama_toko}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: bw.danger ? C.red : C.textMid, fontFamily: C.fontMono }}>
                    {bw.text}
                    <div style={{ fontSize: 10, color: C.muted, fontWeight: 500 }}>{tanggalFmt(order.tanggal_pesanan)}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 12, alignSelf: "flex-start", background: sc?.bg || C.border, color: sc?.color || C.muted, fontWeight: 700, fontFamily: C.fontMono }}>{order.status_shopee || "—"}</span>
                    {isShippable && (
                      <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={() => handleShipSingle(order)} style={{ padding: "4px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: `${C.accent}20`, color: C.accent, border: `1px solid ${C.accent}`, cursor: "pointer", fontFamily: C.fontSans }}>Atur Pengiriman</button>
                        <button onClick={() => handlePrintSingle(order)} disabled={printing} style={{ padding: "4px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: "transparent", color: C.muted, border: `1px solid ${C.border}`, cursor: "pointer", fontFamily: C.fontSans, opacity: printing ? 0.5 : 1 }}>Print</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
        </div>

        {totalPages > 1 && (
          <div className="no-print" style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 20, alignItems: "center" }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ ...inputStyle, cursor: page === 1 ? "not-allowed" : "pointer", opacity: page === 1 ? 0.4 : 1 }}>← Prev</button>
            <span style={{ padding: "8px 16px", fontFamily: C.fontMono, fontSize: 12, color: C.muted }}>{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ ...inputStyle, cursor: page === totalPages ? "not-allowed" : "pointer", opacity: page === totalPages ? 0.4 : 1 }}>Next →</button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
