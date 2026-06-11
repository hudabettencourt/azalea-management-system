"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import { useTheme, LIGHT, DARK } from "@/context/ThemeContext";
import { rupiah, rupiahShort, tanggalFmt as tanggalFmtBase } from "@/lib/format";
import * as XLSX from "xlsx";

type Toko = { id: number; nama: string; username_shopee: string | null };
type RekapHeader = {
  id: number; toko_id: number; periode_dari: string; periode_ke: string; created_at: string;
  nama_toko?: string; total_pesanan?: number; total_pending?: number; total_masuk?: number;
  total_batal?: number; nilai_pending?: number; nilai_masuk?: number;
};
type RekapDetail = {
  id: number; no_pesanan: string; status_pesanan: string; metode_bayar: string;
  tgl_pesanan: string | null; tgl_selesai: string | null; total_bayar: number;
  nominal_diterima: number; tgl_masuk_saldo: string | null; status_saldo: string;
};
type EscrowSyncStatus = {
  enabled: boolean; pause_reason: string; pending_count: number; synced_count: number; last_sync: string | null;
};
type AutoRekapItem = {
  toko_id: number; nama_toko: string; total_completed: number; total_escrow_synced: number;
  total_escrow_amount: number; total_commission: number; total_service_fee: number;
  total_seller_discount: number; total_buyer_amount: number;
};
type Toast = { msg: string; type: "success" | "error" | "info" };
type FilterSaldo = "Semua" | "Pending" | "Masuk" | "Batal";

// tanggalFmt lokal support null (berbeda dari helper yang hanya terima string)
const tanggalFmt = (s: string | null) => {
  if (!s) return "-";
  return tanggalFmtBase(s);
};

export default function RekapSaldoPage() {
  const { isDark } = useTheme();
  const C = isDark ? DARK : LIGHT;

  const CC = {
    pending: { bg: isDark ? "rgba(251,191,36,0.12)" : "#fef9c3", color: "#f59e0b", border: isDark ? "rgba(251,191,36,0.25)" : "#fde68a" },
    masuk:   { bg: isDark ? "rgba(34,197,94,0.12)"  : "#dcfce7", color: "#22c55e", border: isDark ? "rgba(34,197,94,0.25)"  : "#bbf7d0" },
    batal:   { bg: isDark ? "rgba(239,68,68,0.12)"  : "#fee2e2", color: "#ef4444", border: isDark ? "rgba(239,68,68,0.25)"  : "#fecaca" },
    total:   { bg: isDark ? "rgba(96,165,250,0.12)" : "#dbeafe", color: "#3b82f6", border: isDark ? "rgba(96,165,250,0.25)" : "#bfdbfe" },
    orange:  { bg: isDark ? "rgba(249,115,22,0.12)" : "#ffedd5", color: "#f97316", border: isDark ? "rgba(249,115,22,0.25)" : "#fed7aa" },
  };

  const [tokoList, setTokoList] = useState<Toko[]>([]);
  const [riwayat, setRiwayat] = useState<RekapHeader[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"auto" | "upload" | "riwayat">("auto");

  const [syncStatus, setSyncStatus] = useState<EscrowSyncStatus | null>(null);
  const [autoRekap, setAutoRekap] = useState<AutoRekapItem[]>([]);
  const [loadingAuto, setLoadingAuto] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [togglingPause, setTogglingPause] = useState(false);

  const [fileOrder, setFileOrder] = useState<File | null>(null);
  const [fileBalance, setFileBalance] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [preview, setPreview] = useState<RekapDetail[] | null>(null);
  const [detectedToko, setDetectedToko] = useState<Toko | null>(null);
  const [detectedPeriode, setDetectedPeriode] = useState<{ dari: string; ke: string } | null>(null);
  const [tokoManual, setTokoManual] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [filterPreview, setFilterPreview] = useState<FilterSaldo>("Semua");

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detailCache, setDetailCache] = useState<Record<number, RekapDetail[]>>({});
  const [filterDetailSaldo, setFilterDetailSaldo] = useState<Record<number, FilterSaldo>>({});
  const [filterToko, setFilterToko] = useState("Semua");

  const showToast = (msg: string, type: Toast["type"] = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchSyncStatus = useCallback(async () => {
    const [{ data: enabled }, { data: reason }, { data: escrowData }, { data: completedData }] = await Promise.all([
      supabase.from("app_settings").select("value, updated_at").eq("key", "escrow_sync_enabled").single(),
      supabase.from("app_settings").select("value").eq("key", "escrow_sync_pause_reason").single(),
      supabase.from("escrow_detail").select("id, fetched_at").order("fetched_at", { ascending: false }).limit(1),
      supabase.from("detail_penjualan_online").select("no_pesanan").eq("status_shopee", "COMPLETED"),
    ]);

    const syncedCount = (await supabase.from("escrow_detail").select("id", { count: "exact", head: true })).count || 0;
    const totalCompleted = completedData?.length || 0;
    const pendingCount = Math.max(0, totalCompleted - (syncedCount as number));

    setSyncStatus({
      enabled: enabled?.value !== "false",
      pause_reason: reason?.value || "",
      pending_count: pendingCount,
      synced_count: syncedCount as number,
      last_sync: escrowData?.[0]?.fetched_at || null,
    });
  }, []);

  const fetchAutoRekap = useCallback(async () => {
    setLoadingAuto(true);
    try {
      const { data: tokoData } = await supabase.from("toko_online").select("id, nama").eq("platform", "Shopee").eq("aktif", true);
      if (!tokoData?.length) { setAutoRekap([]); return; }

      const results: AutoRekapItem[] = [];
      for (const toko of tokoData) {
        const { data: penjualanIds } = await supabase.from("penjualan_online").select("id").eq("toko_id", toko.id);
        const ids = (penjualanIds || []).map((p: any) => p.id);
        let totalCompleted = 0;
        if (ids.length) {
          const { count } = await supabase
            .from("detail_penjualan_online")
            .select("no_pesanan", { count: "exact", head: true })
            .eq("status_shopee", "COMPLETED")
            .in("penjualan_online_id", ids);
          totalCompleted = count || 0;
        }

        const { data: escrows } = await supabase
          .from("escrow_detail")
          .select("escrow_amount, commission_fee, service_fee, seller_discount, buyer_total_amount")
          .eq("toko_id", toko.id);

        results.push({
          toko_id: toko.id,
          nama_toko: toko.nama,
          total_completed: totalCompleted,
          total_escrow_synced: escrows?.length || 0,
          total_escrow_amount: (escrows || []).reduce((a: number, e: any) => a + (e.escrow_amount || 0), 0),
          total_commission: (escrows || []).reduce((a: number, e: any) => a + (e.commission_fee || 0), 0),
          total_service_fee: (escrows || []).reduce((a: number, e: any) => a + (e.service_fee || 0), 0),
          total_seller_discount: (escrows || []).reduce((a: number, e: any) => a + (e.seller_discount || 0), 0),
          total_buyer_amount: (escrows || []).reduce((a: number, e: any) => a + (e.buyer_total_amount || 0), 0),
        });
      }
      setAutoRekap(results);
    } finally {
      setLoadingAuto(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [resToko, resRekap] = await Promise.all([
        supabase.from("toko_online").select("id, nama, username_shopee").eq("platform", "Shopee").eq("aktif", true).order("nama"),
        supabase.from("rekap_saldo_shopee").select("*, toko_online(nama)").order("created_at", { ascending: false }).limit(100),
      ]);
      setTokoList(resToko.data || []);
      const headers = (resRekap.data || []).map((r: any) => ({ ...r, nama_toko: r.toko_online?.nama }));
      const enriched = await Promise.all(headers.map(async (h: any) => {
        const { data: details } = await supabase.from("rekap_saldo_detail").select("status_saldo, total_bayar, nominal_diterima").eq("rekap_id", h.id);
        const nilaiPending = details?.filter(d => d.status_saldo === "Pending").reduce((a, d) => a + (d.total_bayar || 0), 0) || 0;
        const nilaiMasuk = details?.filter(d => d.status_saldo === "Masuk").reduce((a, d) => a + (d.nominal_diterima || 0), 0) || 0;
        return { ...h, total_pesanan: details?.length || 0, total_pending: details?.filter(d => d.status_saldo === "Pending").length || 0, total_masuk: details?.filter(d => d.status_saldo === "Masuk").length || 0, total_batal: details?.filter(d => d.status_saldo === "Batal").length || 0, nilai_pending: nilaiPending, nilai_masuk: nilaiMasuk };
      }));
      setRiwayat(enriched);
    } catch (err: any) {
      showToast(err.message || "Gagal memuat data", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchSyncStatus();
    fetchAutoRekap();
  }, [fetchData, fetchSyncStatus, fetchAutoRekap]);

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/shopee/sync-escrow");
      const data = await res.json();
      if (data.auto_paused) {
        showToast("⚠️ Sync otomatis dihentikan! Pesanan terlalu banyak. Gunakan Upload Excel.", "error");
      } else if (data.ok) {
        showToast(`✓ ${data.total_fetched} escrow berhasil di-sync`);
      } else {
        showToast(data.error || "Gagal sync", "error");
      }
      fetchSyncStatus();
      fetchAutoRekap();
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setSyncing(false);
    }
  };

  const togglePause = async () => {
    if (!syncStatus) return;
    setTogglingPause(true);
    try {
      const newEnabled = !syncStatus.enabled;
      await fetch("/api/shopee/sync-escrow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newEnabled, reason: newEnabled ? "" : "Manual pause oleh owner" }),
      });
      showToast(newEnabled ? "✓ Escrow sync diaktifkan kembali" : "Escrow sync dijeda");
      fetchSyncStatus();
    } finally {
      setTogglingPause(false);
    }
  };

  const parseExcel = (file: File): Promise<any[][]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: "array", cellDates: true });
          const ws = wb.Sheets[wb.SheetNames[0]];
          resolve(XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as any[][]);
        } catch (err) { reject(err); }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const parseNumber = (val: any): number => {
    if (val === null || val === undefined || val === "") return 0;
    const n = parseFloat(String(val).replace(/[^\d.-]/g, ""));
    return isNaN(n) ? 0 : n;
  };

  const prosesFile = async () => {
    if (!fileOrder || !fileBalance) return showToast("Upload kedua file dulu!", "error");
    setProcessing(true); setPreview(null); setDetectedToko(null); setFilterPreview("Semua");
    try {
      const [orderRows, balanceRows] = await Promise.all([parseExcel(fileOrder), parseExcel(fileBalance)]);
      const usernameShopee = String(balanceRows[5]?.[1] || "").trim().toLowerCase();
      const periodeFrom = String(balanceRows[6]?.[1] || "").trim();
      const periodeTo = String(balanceRows[7]?.[1] || "").trim();
      if (periodeFrom && periodeTo) setDetectedPeriode({ dari: periodeFrom, ke: periodeTo });
      const toko = tokoList.find(t => t.username_shopee?.toLowerCase() === usernameShopee);
      if (toko) setDetectedToko(toko);
      else showToast(`Username "${usernameShopee}" tidak ditemukan. Pilih manual.`, "info");

      const balHeaderRow = balanceRows[17];
      const colNoOrder = balHeaderRow?.findIndex((h: any) => String(h || "").includes("No. Pesanan"));
      const colTipe = balHeaderRow?.findIndex((h: any) => String(h || "").includes("Tipe Transaksi"));
      const colJumlah = balHeaderRow?.findIndex((h: any) => String(h || "").toLowerCase().includes("jumlah"));
      const colTanggal = balHeaderRow?.findIndex((h: any) => String(h || "").includes("Tanggal Transaksi"));

      const sudahMasuk: Record<string, { jumlah: number; tanggal: string }> = {};
      for (let i = 18; i < balanceRows.length; i++) {
        const row = balanceRows[i];
        if (!row) continue;
        if (String(row[colTipe] || "").includes("Penghasilan dari Pesanan")) {
          const noPesanan = String(row[colNoOrder] || "").trim();
          const jumlah = parseNumber(row[colJumlah]);
          const tanggal = row[colTanggal] ? String(row[colTanggal]).substring(0, 10) : "";
          if (noPesanan && noPesanan !== "-") sudahMasuk[noPesanan] = { jumlah, tanggal };
        }
      }

      const orderHeader = orderRows[0];
      const colOrderNo = orderHeader?.findIndex((h: any) => String(h || "") === "No. Pesanan");
      const colStatus = orderHeader?.findIndex((h: any) => String(h || "") === "Status Pesanan");
      const colMetode = orderHeader?.findIndex((h: any) => String(h || "") === "Metode Pembayaran");
      const colTglDibuat = orderHeader?.findIndex((h: any) => String(h || "") === "Waktu Pesanan Dibuat");
      const colTglSelesai = orderHeader?.findIndex((h: any) => String(h || "") === "Waktu Pesanan Selesai");
      const colTotalBayar = orderHeader?.findIndex((h: any) => String(h || "") === "Total Pembayaran");

      const pesananMap: Record<string, any> = {};
      for (let i = 1; i < orderRows.length; i++) {
        const row = orderRows[i];
        if (!row) continue;
        const noPesanan = String(row[colOrderNo] || "").trim();
        if (!noPesanan) continue;
        if (!pesananMap[noPesanan]) {
          pesananMap[noPesanan] = { no_pesanan: noPesanan, status_pesanan: String(row[colStatus] || ""), metode_bayar: String(row[colMetode] || ""), tgl_pesanan: row[colTglDibuat] ? String(row[colTglDibuat]).substring(0, 19) : null, tgl_selesai: row[colTglSelesai] ? String(row[colTglSelesai]).substring(0, 19) : null, total_bayar: 0 };
        }
        pesananMap[noPesanan].total_bayar += parseNumber(row[colTotalBayar]);
      }

      const STATUS_BATAL = ["Batal", "Dibatalkan", "Cancelled", "Batalkan"];
      const details: RekapDetail[] = Object.values(pesananMap).map((p: any, idx: number) => {
        const masuk = sudahMasuk[p.no_pesanan];
        const isBatal = STATUS_BATAL.some(s => p.status_pesanan?.toLowerCase().includes(s.toLowerCase()));
        return {
          id: idx, no_pesanan: p.no_pesanan, status_pesanan: p.status_pesanan, metode_bayar: p.metode_bayar,
          tgl_pesanan: p.tgl_pesanan, tgl_selesai: p.tgl_selesai, total_bayar: Math.round(p.total_bayar * 1000),
          nominal_diterima: masuk ? masuk.jumlah : 0, tgl_masuk_saldo: masuk ? masuk.tanggal : null,
          status_saldo: masuk ? "Masuk" : isBatal ? "Batal" : "Pending",
        };
      }).sort((a, b) => {
        const order = { Pending: 0, Masuk: 1, Batal: 2 };
        return (order[a.status_saldo as keyof typeof order] ?? 3) - (order[b.status_saldo as keyof typeof order] ?? 3);
      });
      setPreview(details);
    } catch (err: any) {
      showToast("Gagal parse file: " + err.message, "error");
    } finally {
      setProcessing(false);
    }
  };

  const simpanRekap = async () => {
    if (!preview) return;
    const tokoId = detectedToko?.id || parseInt(tokoManual);
    if (!tokoId) return showToast("Toko tidak terdeteksi!", "error");
    if (!detectedPeriode) return showToast("Periode tidak terdeteksi!", "error");
    setSaving(true);
    try {
      const { data: rekapData, error: errRekap } = await supabase.from("rekap_saldo_shopee").insert([{ toko_id: tokoId, periode_dari: detectedPeriode.dari, periode_ke: detectedPeriode.ke }]).select().single();
      if (errRekap) throw new Error("Gagal simpan rekap: " + errRekap.message);
      for (let i = 0; i < preview.length; i += 50) {
        const batch = preview.slice(i, i + 50).map(d => ({ rekap_id: rekapData.id, no_pesanan: d.no_pesanan, status_pesanan: d.status_pesanan, metode_bayar: d.metode_bayar, tgl_pesanan: d.tgl_pesanan, tgl_selesai: d.tgl_selesai, total_bayar: d.total_bayar, nominal_diterima: d.nominal_diterima, tgl_masuk_saldo: d.tgl_masuk_saldo, status_saldo: d.status_saldo }));
        const { error } = await supabase.from("rekap_saldo_detail").upsert(batch, { onConflict: "no_pesanan" });
        if (error) throw new Error("Gagal simpan detail: " + error.message);
      }
      showToast(`✓ Rekap ${preview.length} pesanan berhasil disimpan!`);
      setFileOrder(null); setFileBalance(null); setPreview(null); setDetectedToko(null); setDetectedPeriode(null);
      fetchData(); setActiveTab("riwayat");
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const toggleDetail = async (id: number) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (detailCache[id]) return;
    const { data } = await supabase.from("rekap_saldo_detail").select("*").eq("rekap_id", id).order("status_saldo").order("tgl_pesanan", { ascending: false });
    setDetailCache(prev => ({ ...prev, [id]: data || [] }));
  };

  const pendingList  = preview?.filter(d => d.status_saldo === "Pending") || [];
  const masukList    = preview?.filter(d => d.status_saldo === "Masuk") || [];
  const batalList    = preview?.filter(d => d.status_saldo === "Batal") || [];
  const pendingTotal = pendingList.reduce((a, d) => a + d.total_bayar, 0);
  const masukTotal   = masukList.reduce((a, d) => a + d.nominal_diterima, 0);
  const batalTotal   = batalList.reduce((a, d) => a + d.total_bayar, 0);
  const previewFiltered = filterPreview === "Semua" ? (preview || []) : (preview || []).filter(d => d.status_saldo === filterPreview);
  const riwayatFiltered = riwayat.filter(r => filterToko === "Semua" || String(r.toko_id) === filterToko);

  const inputS: React.CSSProperties = { width: "100%", padding: "9px 12px", background: isDark ? "rgba(255,255,255,0.05)" : "#f8fffe", border: `1.5px solid ${C.border}`, borderRadius: 10, color: C.text, fontFamily: C.fontSans, fontSize: 13, boxSizing: "border-box", outline: "none" };
  const tabStyle = (active: boolean, color: string): React.CSSProperties => ({ flex: 1, padding: "10px 8px", borderRadius: 10, border: `1.5px solid ${active ? color + "60" : C.border}`, background: active ? color + "15" : "transparent", color: active ? color : C.muted, fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: C.fontSans, transition: "all 0.15s" });

  const StatusBadge = ({ status }: { status: string }) => {
    const col = status === "Masuk" ? CC.masuk : status === "Batal" ? CC.batal : CC.pending;
    return <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: col.bg, color: col.color, border: `1px solid ${col.border}`, whiteSpace: "nowrap" as const }}>{status === "Masuk" ? "✅ Masuk" : status === "Batal" ? "✕ Batal" : "⏳ Pending"}</span>;
  };

  const TableHeader = () => (
    <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr 1.2fr 0.9fr 0.9fr 1.1fr 1fr", gap: 8, padding: "8px 14px", background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", borderRadius: 8, marginBottom: 4 }}>
      {["NO. PESANAN", "STATUS", "METODE BAYAR", "TGL PESANAN", "TGL SELESAI", "TOTAL BAYAR", "STATUS SALDO"].map(h => (
        <div key={h} style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>{h}</div>
      ))}
    </div>
  );

  const TableRow = ({ d }: { d: RekapDetail }) => (
    <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr 1.2fr 0.9fr 0.9fr 1.1fr 1fr", gap: 8, padding: "9px 14px", borderBottom: `1px solid ${C.border}`, alignItems: "center" }}>
      <div style={{ fontSize: 12, color: CC.total.color, fontFamily: C.fontMono, fontWeight: 700 }}>{d.no_pesanan}</div>
      <div style={{ fontSize: 11, color: C.textMid }}>{d.status_pesanan}</div>
      <div style={{ fontSize: 11, color: C.muted }}>{d.metode_bayar}</div>
      <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{tanggalFmt(d.tgl_pesanan)}</div>
      <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{tanggalFmt(d.tgl_selesai)}</div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 800, color: C.text, fontFamily: C.fontMono }}>{rupiah(d.total_bayar)}</div>
        {d.status_saldo === "Masuk" && d.nominal_diterima > 0 && <div style={{ fontSize: 10, color: CC.masuk.color, fontFamily: C.fontMono, marginTop: 1 }}>+{rupiahShort(d.nominal_diterima)}</div>}
      </div>
      <div>
        <StatusBadge status={d.status_saldo} />
        {d.status_saldo === "Masuk" && d.tgl_masuk_saldo && <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, marginTop: 3 }}>{tanggalFmt(d.tgl_masuk_saldo)}</div>}
      </div>
    </div>
  );

  if (loading) return (
    <AppShell>
      <div style={{ minHeight: "100vh", background: C.bgPage, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: C.muted }}><div style={{ fontSize: 28, marginBottom: 12 }}>◈</div><div style={{ fontSize: 13 }}>Memuat...</div></div>
      </div>
    </AppShell>
  );

  const isAutoPaused = syncStatus && !syncStatus.enabled && syncStatus.pause_reason.includes("Auto-pause");
  const isManualPaused = syncStatus && !syncStatus.enabled && !syncStatus.pause_reason.includes("Auto-pause");

  return (
    <AppShell>
      <style>{`
        input:focus, select:focus { border-color: ${CC.total.color} !important; outline: none; }
        select option { background: ${isDark ? "#172218" : "#fff"}; color: ${C.text}; }
        .row-hover:hover { background: ${isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)"} !important; }
        .card-click { transition: transform 0.15s, box-shadow 0.15s; cursor: pointer; }
        .card-click:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.12); }
      `}</style>

      {toast && (
        <div style={{ position: "fixed", top: 24, right: 24, zIndex: 9999, background: toast.type === "success" ? "#22c55e" : toast.type === "error" ? "#ef4444" : "#3b82f6", color: "#fff", padding: "12px 20px", borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.2)", fontFamily: C.fontSans, fontWeight: 700, fontSize: 14 }}>
          {toast.msg}
        </div>
      )}

      <div style={{ padding: 24, fontFamily: C.fontSans, background: C.bgPage, minHeight: "100vh" }}>

        {isAutoPaused && (
          <div style={{ background: "#ef4444", borderRadius: 14, padding: "16px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 16, boxShadow: "0 4px 20px rgba(239,68,68,0.4)" }}>
            <div style={{ fontSize: 28 }}>🚨</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: "#fff", marginBottom: 4 }}>ESCROW SYNC DIHENTIKAN OTOMATIS</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>{syncStatus?.pause_reason}</div>
              <div style={{ fontSize: 13, color: "#fff", fontWeight: 700, marginTop: 4 }}>⚠️ Gunakan tab <strong>Upload Excel</strong> untuk rekap saldo yang akurat.</div>
            </div>
            <button onClick={togglePause} disabled={togglingPause} style={{ padding: "10px 20px", background: "#fff", border: "none", borderRadius: 10, color: "#ef4444", fontWeight: 800, cursor: "pointer", fontSize: 13, flexShrink: 0 }}>
              {togglingPause ? "..." : "Aktifkan Kembali"}
            </button>
          </div>
        )}

        {isManualPaused && (
          <div style={{ background: CC.orange.bg, border: `2px solid ${CC.orange.color}`, borderRadius: 14, padding: "14px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ fontSize: 24 }}>⏸️</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: CC.orange.color }}>Escrow Sync Dijeda Manual</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Sync otomatis tidak berjalan. Klik Aktifkan untuk melanjutkan.</div>
            </div>
            <button onClick={togglePause} disabled={togglingPause} style={{ padding: "8px 18px", background: CC.orange.color, border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
              {togglingPause ? "..." : "Aktifkan"}
            </button>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <button onClick={() => setActiveTab("auto")} style={tabStyle(activeTab === "auto", CC.masuk.color)}>
            🤖 Rekap Otomatis {syncStatus && !syncStatus.enabled && <span style={{ marginLeft: 6, background: "#ef4444", color: "#fff", borderRadius: 10, padding: "1px 6px", fontSize: 10 }}>PAUSE</span>}
          </button>
          <button onClick={() => setActiveTab("upload")} style={tabStyle(activeTab === "upload", CC.total.color)}>📤 Upload Excel</button>
          <button onClick={() => setActiveTab("riwayat")} style={tabStyle(activeTab === "riwayat", CC.pending.color)}>📋 Riwayat Upload ({riwayat.length})</button>
        </div>

        {/* TAB AUTO */}
        {activeTab === "auto" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 20px", boxShadow: C.shadow }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Status Escrow Sync</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2, fontFamily: C.fontMono }}>Data dari Shopee API · Auto-pause jika &gt; 500 pesanan pending</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={handleManualSync} disabled={syncing || !syncStatus?.enabled} style={{ padding: "8px 18px", background: (!syncStatus?.enabled || syncing) ? "transparent" : `${CC.masuk.color}15`, border: `1.5px solid ${(!syncStatus?.enabled || syncing) ? C.border : CC.masuk.color}`, color: (!syncStatus?.enabled || syncing) ? C.muted : CC.masuk.color, borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13, opacity: syncing ? 0.7 : 1 }}>
                    {syncing ? "⏳ Syncing..." : "↻ Sync Sekarang"}
                  </button>
                  <button onClick={togglePause} disabled={togglingPause} style={{ padding: "8px 16px", background: "transparent", border: `1.5px solid ${C.border}`, color: C.muted, borderRadius: 10, cursor: "pointer", fontSize: 12 }}>
                    {syncStatus?.enabled ? "⏸ Jeda" : "▶ Aktifkan"}
                  </button>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                {[
                  { label: "Status", value: syncStatus?.enabled ? "🟢 Aktif" : "🔴 Pause", color: syncStatus?.enabled ? CC.masuk.color : "#ef4444" },
                  { label: "Sudah Sync", value: `${syncStatus?.synced_count || 0} pesanan`, color: CC.masuk.color },
                  { label: "Pending Sync", value: `${syncStatus?.pending_count || 0} pesanan`, color: syncStatus && syncStatus.pending_count > 400 ? "#ef4444" : CC.pending.color },
                  { label: "Sync Terakhir", value: syncStatus?.last_sync ? tanggalFmt(syncStatus.last_sync) : "Belum pernah", color: C.muted },
                ].map((s, i) => (
                  <div key={i} style={{ background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>
              {syncStatus && syncStatus.pending_count > 300 && syncStatus.enabled && (
                <div style={{ marginTop: 12, padding: "10px 14px", background: CC.orange.bg, border: `1px solid ${CC.orange.border}`, borderRadius: 10, fontSize: 12, color: CC.orange.color, fontWeight: 600 }}>
                  ⚠️ {syncStatus.pending_count} pesanan pending — mendekati batas auto-pause (500). Pertimbangkan beralih ke Upload Excel.
                </div>
              )}
            </div>

            {loadingAuto ? (
              <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: C.fontMono }}>Memuat rekap...</div>
            ) : autoRekap.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: C.fontMono }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📊</div>
                Belum ada data escrow. Klik "Sync Sekarang" untuk mulai.
              </div>
            ) : (
              <>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>Rekap Escrow per Toko</div>
                {autoRekap.map(r => {
                  const coveragePct = r.total_completed > 0 ? Math.round((r.total_escrow_synced / r.total_completed) * 100) : 0;
                  return (
                    <div key={r.toko_id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 20px", boxShadow: C.shadow }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{r.nama_toko}</div>
                          <div style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono, marginTop: 2 }}>{r.total_escrow_synced}/{r.total_completed} pesanan ter-sync ({coveragePct}%)</div>
                        </div>
                        {coveragePct < 100 && (
                          <span style={{ padding: "4px 12px", background: CC.pending.bg, color: CC.pending.color, borderRadius: 20, fontSize: 11, fontWeight: 700, border: `1px solid ${CC.pending.border}` }}>
                            ⏳ {r.total_completed - r.total_escrow_synced} belum sync
                          </span>
                        )}
                      </div>
                      <div style={{ height: 6, background: C.dim, borderRadius: 3, marginBottom: 16, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${coveragePct}%`, background: coveragePct === 100 ? CC.masuk.color : CC.pending.color, borderRadius: 3, transition: "width 0.5s ease" }} />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                        {[
                          { label: "Total Diterima", value: rupiahShort(r.total_escrow_amount), color: CC.masuk.color, desc: "escrow_amount" },
                          { label: "Total Pembeli Bayar", value: rupiahShort(r.total_buyer_amount), color: CC.total.color, desc: "buyer_total" },
                          { label: "Fee Shopee", value: rupiahShort(r.total_commission + r.total_service_fee), color: CC.batal.color, desc: "commission + service" },
                          { label: "Diskon Seller", value: rupiahShort(r.total_seller_discount), color: CC.orange.color, desc: "voucher seller" },
                        ].map((s, i) => (
                          <div key={i} style={{ background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", borderRadius: 10, padding: "12px 14px", border: `1px solid ${C.border}` }}>
                            <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{s.label}</div>
                            <div style={{ fontSize: 16, fontWeight: 900, color: s.color }}>{s.value}</div>
                            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{s.desc}</div>
                          </div>
                        ))}
                      </div>
                      {coveragePct < 100 && (
                        <div style={{ marginTop: 12, fontSize: 11, color: C.muted, fontFamily: C.fontMono, fontStyle: "italic" }}>
                          * Data belum lengkap — {r.total_completed - r.total_escrow_synced} pesanan belum ter-sync.
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* TAB UPLOAD */}
        {activeTab === "upload" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: C.card, padding: 24, borderRadius: 16, border: `1px solid ${C.border}`, boxShadow: C.shadow }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 16 }}>Upload File Shopee</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>File Order All (.xlsx)</div>
                  <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px", border: `2px dashed ${fileOrder ? CC.masuk.color + "80" : C.border}`, borderRadius: 12, cursor: "pointer", background: fileOrder ? CC.masuk.bg : isDark ? "rgba(255,255,255,0.03)" : "#f8fffe" }}>
                    <input type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={e => { setFileOrder(e.target.files?.[0] || null); setPreview(null); }} />
                    <div style={{ fontSize: 28, marginBottom: 8 }}>{fileOrder ? "✅" : "📊"}</div>
                    <div style={{ fontSize: 12, color: fileOrder ? CC.masuk.color : C.muted, textAlign: "center", fontFamily: C.fontMono }}>{fileOrder ? fileOrder.name : "Klik untuk upload\nOrder_all_*.xlsx"}</div>
                  </label>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>File Balance Transaction (.xlsx)</div>
                  <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px", border: `2px dashed ${fileBalance ? CC.masuk.color + "80" : C.border}`, borderRadius: 12, cursor: "pointer", background: fileBalance ? CC.masuk.bg : isDark ? "rgba(255,255,255,0.03)" : "#f8fffe" }}>
                    <input type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={e => { setFileBalance(e.target.files?.[0] || null); setPreview(null); }} />
                    <div style={{ fontSize: 28, marginBottom: 8 }}>{fileBalance ? "✅" : "💳"}</div>
                    <div style={{ fontSize: 12, color: fileBalance ? CC.masuk.color : C.muted, textAlign: "center", fontFamily: C.fontMono }}>{fileBalance ? fileBalance.name : "Klik untuk upload\nmy_balance_*.xlsx"}</div>
                  </label>
                </div>
              </div>
              <button onClick={prosesFile} disabled={!fileOrder || !fileBalance || processing} style={{ width: "100%", padding: 12, borderRadius: 12, background: (!fileOrder || !fileBalance || processing) ? "transparent" : CC.total.bg, border: `1.5px solid ${(!fileOrder || !fileBalance || processing) ? C.border : CC.total.color}`, color: (!fileOrder || !fileBalance || processing) ? C.muted : CC.total.color, fontWeight: 800, cursor: "pointer", fontFamily: C.fontSans, fontSize: 14 }}>
                {processing ? "⏳ Memproses..." : "🔍 Analisis Saldo"}
              </button>
            </div>

            {preview && (
              <>
                <div style={{ background: C.card, padding: "14px 20px", borderRadius: 14, border: `1px solid ${C.border}`, display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: "0.08em", marginBottom: 4, textTransform: "uppercase" }}>Toko</div>
                    {detectedToko ? <div style={{ fontSize: 15, fontWeight: 800, color: CC.masuk.color }}>{detectedToko.nama}</div> : (
                      <select value={tokoManual} onChange={e => setTokoManual(e.target.value)} style={{ ...inputS, width: 200 }}>
                        <option value="">— Pilih Toko —</option>
                        {tokoList.map(t => <option key={t.id} value={t.id}>{t.nama}</option>)}
                      </select>
                    )}
                  </div>
                  {detectedPeriode && <div><div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, marginBottom: 4, textTransform: "uppercase" }}>Periode</div><div style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: C.fontMono }}>{detectedPeriode.dari} → {detectedPeriode.ke}</div></div>}
                  <div><div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, marginBottom: 4, textTransform: "uppercase" }}>Total</div><div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{preview.length} pesanan</div></div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  {[
                    { key: "Pending" as FilterSaldo, label: "Pending", icon: "⏳", count: pendingList.length, nilai: pendingTotal, col: CC.pending },
                    { key: "Batal" as FilterSaldo, label: "Batal", icon: "✕", count: batalList.length, nilai: batalTotal, col: CC.batal },
                    { key: "Masuk" as FilterSaldo, label: "Masuk", icon: "✅", count: masukList.length, nilai: masukTotal, col: CC.masuk },
                  ].map(s => (
                    <div key={s.key} className="card-click" onClick={() => setFilterPreview(filterPreview === s.key ? "Semua" : s.key)} style={{ background: filterPreview === s.key ? s.col.bg : C.card, border: `1.5px solid ${filterPreview === s.key ? s.col.color : s.col.border}`, borderRadius: 14, padding: "18px 20px", color: s.col.color, boxShadow: C.shadow }}>
                      <div style={{ fontSize: 24, marginBottom: 8 }}>{s.icon}</div>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{s.label}</div>
                      <div style={{ fontSize: 22, fontWeight: 900 }}>{s.count}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, fontFamily: C.fontMono }}>{rupiahShort(s.nilai)}</div>
                    </div>
                  ))}
                </div>

                <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                  <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{filterPreview === "Semua" ? `Semua (${preview.length})` : `${filterPreview} (${previewFiltered.length})`}</div>
                  </div>
                  <TableHeader />
                  <div style={{ maxHeight: 400, overflowY: "auto" }}>
                    {previewFiltered.map((d, i) => <TableRow key={i} d={d} />)}
                  </div>
                </div>

                <button onClick={simpanRekap} disabled={saving || (!detectedToko && !tokoManual)} style={{ width: "100%", padding: 13, borderRadius: 12, background: (saving || (!detectedToko && !tokoManual)) ? "transparent" : CC.masuk.bg, border: `1.5px solid ${(saving || (!detectedToko && !tokoManual)) ? C.border : CC.masuk.color}`, color: (saving || (!detectedToko && !tokoManual)) ? C.muted : CC.masuk.color, fontWeight: 800, cursor: "pointer", fontFamily: C.fontSans, fontSize: 15 }}>
                  {saving ? "Menyimpan..." : `💾 Simpan Rekap (${preview.length} pesanan)`}
                </button>
              </>
            )}
          </div>
        )}

        {/* TAB RIWAYAT */}
        {activeTab === "riwayat" && (
          <div>
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <select value={filterToko} onChange={e => setFilterToko(e.target.value)} style={{ ...inputS, width: 200 }}>
                <option value="Semua">Semua Toko</option>
                {tokoList.map(t => <option key={t.id} value={t.id}>{t.nama}</option>)}
              </select>
            </div>
            {riwayatFiltered.length === 0 && <div style={{ textAlign: "center", color: C.muted, padding: 60, fontFamily: C.fontMono, fontSize: 13 }}>Belum ada riwayat rekap</div>}
            {riwayatFiltered.map(r => (
              <div key={r.id} style={{ marginBottom: 12 }}>
                <div onClick={() => toggleDetail(r.id)} style={{ background: C.card, border: `1px solid ${expandedId === r.id ? CC.total.border : C.border}`, borderRadius: expandedId === r.id ? "14px 14px 0 0" : 14, padding: "16px 20px", cursor: "pointer", boxShadow: C.shadow }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 4 }}>{r.nama_toko} <span style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono, fontWeight: 400 }}>{r.periode_dari} → {r.periode_ke}</span></div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: CC.pending.bg, color: CC.pending.color, border: `1px solid ${CC.pending.border}` }}>⏳ {r.total_pending || 0} pending · {rupiahShort(r.nilai_pending || 0)}</span>
                        <span style={{ padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: CC.batal.bg, color: CC.batal.color, border: `1px solid ${CC.batal.border}` }}>✕ {r.total_batal || 0} batal</span>
                        <span style={{ padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: CC.masuk.bg, color: CC.masuk.color, border: `1px solid ${CC.masuk.border}` }}>✅ {r.total_masuk || 0} masuk · {rupiahShort(r.nilai_masuk || 0)}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, textAlign: "right" }}>
                      <div>{new Date(r.created_at).toLocaleDateString("id-ID")}</div>
                      <div style={{ marginTop: 4, fontSize: 14 }}>{expandedId === r.id ? "▲" : "▼"}</div>
                    </div>
                  </div>
                </div>
                {expandedId === r.id && (
                  <div style={{ background: C.card, border: `1px solid ${CC.total.border}`, borderTop: "none", borderRadius: "0 0 14px 14px", overflow: "hidden" }}>
                    <div style={{ display: "flex", gap: 6, padding: "12px 14px", borderBottom: `1px solid ${C.border}` }}>
                      {(["Semua", "Pending", "Batal", "Masuk"] as FilterSaldo[]).map(f => (
                        <button key={f} onClick={() => setFilterDetailSaldo(prev => ({ ...prev, [r.id]: f }))} style={{ padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, border: `1.5px solid ${(filterDetailSaldo[r.id] || "Semua") === f ? CC.total.color : C.border}`, background: (filterDetailSaldo[r.id] || "Semua") === f ? CC.total.bg : "transparent", color: (filterDetailSaldo[r.id] || "Semua") === f ? CC.total.color : C.muted, cursor: "pointer" }}>{f}</button>
                      ))}
                    </div>
                    {!detailCache[r.id] ? <div style={{ padding: 20, color: C.muted, fontFamily: C.fontMono, fontSize: 12 }}>Memuat...</div> : (
                      <>
                        <TableHeader />
                        <div style={{ maxHeight: 360, overflowY: "auto" }}>
                          {detailCache[r.id].filter(d => (filterDetailSaldo[r.id] || "Semua") === "Semua" || d.status_saldo === filterDetailSaldo[r.id]).map((d, i) => <TableRow key={i} d={d} />)}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
