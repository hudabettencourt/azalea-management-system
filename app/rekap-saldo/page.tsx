"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import Sidebar from "@/components/Sidebar";
import * as XLSX from "xlsx";

type Toko = { id: number; nama: string; username_shopee: string | null };
type RekapHeader = {
  id: number;
  toko_id: number;
  periode_dari: string;
  periode_ke: string;
  created_at: string;
  nama_toko?: string;
  total_pesanan?: number;
  total_pending?: number;
  total_masuk?: number;
};
type RekapDetail = {
  id: number;
  no_pesanan: string;
  status_pesanan: string;
  metode_bayar: string;
  tgl_pesanan: string | null;
  tgl_selesai: string | null;
  total_bayar: number;
  nominal_diterima: number;
  tgl_masuk_saldo: string | null;
  status_saldo: string;
};
type Toast = { msg: string; type: "success" | "error" | "info" };

const rupiahFmt = (n: number) => `Rp ${(n || 0).toLocaleString("id-ID")}`;
const tanggalFmt = (s: string | null) => {
  if (!s) return "-";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
};

const C = {
  bg: "#100c16", card: "#1a1425", border: "#2a1f3d",
  text: "#e2d9f3", textMid: "#c0aed4", muted: "#7c6d8a", dim: "#3d3050",
  accent: "#a78bfa", success: "#34d399", danger: "#f87171",
  yellow: "#fbbf24", orange: "#fb923c", blue: "#60a5fa",
  fontDisplay: "'DM Serif Display', serif",
  fontMono: "'DM Mono', monospace",
  fontSans: "'DM Sans', sans-serif",
};

export default function RekapSaldoPage() {
  const [tokoList, setTokoList] = useState<Toko[]>([]);
  const [riwayat, setRiwayat] = useState<RekapHeader[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"upload" | "riwayat">("upload");

  // Upload state
  const [fileOrder, setFileOrder] = useState<File | null>(null);
  const [fileBalance, setFileBalance] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [preview, setPreview] = useState<RekapDetail[] | null>(null);
  const [detectedToko, setDetectedToko] = useState<Toko | null>(null);
  const [detectedPeriode, setDetectedPeriode] = useState<{ dari: string; ke: string } | null>(null);
  const [tokoManual, setTokoManual] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  // Riwayat state
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detailCache, setDetailCache] = useState<Record<number, RekapDetail[]>>({});
  const [filterToko, setFilterToko] = useState("Semua");
  const [filterStatus, setFilterStatus] = useState("Semua");

  const showToast = (msg: string, type: Toast["type"] = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchData = useCallback(async () => {
    try {
      const [resToko, resRekap] = await Promise.all([
        supabase.from("toko_online").select("id, nama, username_shopee").eq("platform", "Shopee").eq("aktif", true).order("nama"),
        supabase.from("rekap_saldo_shopee").select("*, toko_online(nama)").order("created_at", { ascending: false }).limit(100),
      ]);
      setTokoList(resToko.data || []);

      // Enrich dengan count
      const headers = (resRekap.data || []).map((r: any) => ({
        ...r,
        nama_toko: r.toko_online?.nama,
      }));

      // Fetch counts per rekap
      const enriched = await Promise.all(headers.map(async (h: any) => {
        const { data: details } = await supabase
          .from("rekap_saldo_detail")
          .select("status_saldo")
          .eq("rekap_id", h.id);
        const total = details?.length || 0;
        const pending = details?.filter(d => d.status_saldo === "Pending").length || 0;
        return { ...h, total_pesanan: total, total_pending: pending, total_masuk: total - pending };
      }));
      setRiwayat(enriched);
    } catch (err: any) {
      showToast(err.message || "Gagal memuat data", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Parse Excel ──
  const parseExcel = (file: File): Promise<any[][]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: "array", cellDates: true });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as any[][];
          resolve(rows);
        } catch (err) {
          reject(err);
        }
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

  // ── Proses kedua file ──
  const prosesFile = async () => {
    if (!fileOrder || !fileBalance) return showToast("Upload kedua file dulu!", "error");
    setProcessing(true);
    setPreview(null);
    setDetectedToko(null);
    try {
      const [orderRows, balanceRows] = await Promise.all([
        parseExcel(fileOrder),
        parseExcel(fileBalance),
      ]);

      // ── Parse balance ──
      // Username di row 5 (index 5), col 1
      const usernameShopee = String(balanceRows[5]?.[1] || "").trim().toLowerCase();
      const periodeFrom = String(balanceRows[6]?.[1] || "").trim();
      const periodeTo = String(balanceRows[7]?.[1] || "").trim();

      if (periodeFrom && periodeTo) {
        setDetectedPeriode({ dari: periodeFrom, ke: periodeTo });
      }

      // Auto detect toko
      const toko = tokoList.find(t => t.username_shopee?.toLowerCase() === usernameShopee);
      if (toko) {
        setDetectedToko(toko);
      } else {
        showToast(`Username "${usernameShopee}" tidak ditemukan di Master Toko. Pilih manual.`, "info");
      }

      // Header balance di row 17 (index 17)
      const balHeaderRow = balanceRows[17];
      const colNoOrder = balHeaderRow?.findIndex((h: any) => String(h || "").includes("No. Pesanan"));
      const colTipe = balHeaderRow?.findIndex((h: any) => String(h || "").includes("Tipe Transaksi"));
      const colJumlah = balHeaderRow?.findIndex((h: any) => String(h || "").toLowerCase().includes("jumlah"));
      const colTanggal = balHeaderRow?.findIndex((h: any) => String(h || "").includes("Tanggal Transaksi"));

      // Set no pesanan yang sudah masuk saldo
      const sudahMasuk: Record<string, { jumlah: number; tanggal: string }> = {};
      for (let i = 18; i < balanceRows.length; i++) {
        const row = balanceRows[i];
        if (!row) continue;
        const tipeTransaksi = String(row[colTipe] || "");
        if (tipeTransaksi.includes("Penghasilan dari Pesanan")) {
          const noPesanan = String(row[colNoOrder] || "").trim();
          const jumlah = parseNumber(row[colJumlah]);
          const tanggal = row[colTanggal] ? String(row[colTanggal]).substring(0, 10) : "";
          if (noPesanan && noPesanan !== "-") {
            sudahMasuk[noPesanan] = { jumlah, tanggal };
          }
        }
      }

      // ── Parse orders ──
      const orderHeader = orderRows[0];
      const colOrderNo = orderHeader?.findIndex((h: any) => String(h || "") === "No. Pesanan");
      const colStatus = orderHeader?.findIndex((h: any) => String(h || "") === "Status Pesanan");
      const colMetode = orderHeader?.findIndex((h: any) => String(h || "") === "Metode Pembayaran");
      const colTglDibuat = orderHeader?.findIndex((h: any) => String(h || "") === "Waktu Pesanan Dibuat");
      const colTglSelesai = orderHeader?.findIndex((h: any) => String(h || "") === "Waktu Pesanan Selesai");
      const colTotalBayar = orderHeader?.findIndex((h: any) => String(h || "") === "Total Pembayaran");

      // Deduplicate per no pesanan
      const pesananMap: Record<string, any> = {};
      for (let i = 1; i < orderRows.length; i++) {
        const row = orderRows[i];
        if (!row) continue;
        const noPesanan = String(row[colOrderNo] || "").trim();
        if (!noPesanan) continue;
        if (!pesananMap[noPesanan]) {
          pesananMap[noPesanan] = {
            no_pesanan: noPesanan,
            status_pesanan: String(row[colStatus] || ""),
            metode_bayar: String(row[colMetode] || ""),
            tgl_pesanan: row[colTglDibuat] ? String(row[colTglDibuat]).substring(0, 19) : null,
            tgl_selesai: row[colTglSelesai] ? String(row[colTglSelesai]).substring(0, 19) : null,
            total_bayar: 0,
          };
        }
        // Sum total bayar (karena bisa multi baris per pesanan)
        pesananMap[noPesanan].total_bayar += parseNumber(row[colTotalBayar]);
      }

      // Build detail
      const details: RekapDetail[] = Object.values(pesananMap)
        .filter((p: any) => p.status_pesanan !== "Dibatalkan")
        .map((p: any, idx: number) => {
          const masuk = sudahMasuk[p.no_pesanan];
          return {
            id: idx,
            no_pesanan: p.no_pesanan,
            status_pesanan: p.status_pesanan,
            metode_bayar: p.metode_bayar,
            tgl_pesanan: p.tgl_pesanan,
            tgl_selesai: p.tgl_selesai,
            total_bayar: Math.round(p.total_bayar * 1000), // × 1000 karena Shopee dalam ribuan
            nominal_diterima: masuk ? masuk.jumlah : 0,
            tgl_masuk_saldo: masuk ? masuk.tanggal : null,
            status_saldo: masuk ? "Masuk" : "Pending",
          };
        })
        .sort((a, b) => (a.status_saldo === "Pending" ? -1 : 1));

      setPreview(details);
    } catch (err: any) {
      showToast("Gagal parse file: " + err.message, "error");
    } finally {
      setProcessing(false);
    }
  };

  // ── Simpan ke Supabase ──
  const simpanRekap = async () => {
    if (!preview) return;
    const tokoId = detectedToko?.id || parseInt(tokoManual);
    if (!tokoId) return showToast("Toko tidak terdeteksi. Pilih manual!", "error");
    if (!detectedPeriode) return showToast("Periode tidak terdeteksi!", "error");

    setSaving(true);
    try {
      const { data: rekapData, error: errRekap } = await supabase
        .from("rekap_saldo_shopee")
        .insert([{
          toko_id: tokoId,
          periode_dari: detectedPeriode.dari,
          periode_ke: detectedPeriode.ke,
        }])
        .select().single();
      if (errRekap) throw new Error("Gagal simpan rekap: " + errRekap.message);

      // Batch insert detail
      const batchSize = 50;
      for (let i = 0; i < preview.length; i += batchSize) {
        const batch = preview.slice(i, i + batchSize).map(d => ({
          rekap_id: rekapData.id,
          no_pesanan: d.no_pesanan,
          status_pesanan: d.status_pesanan,
          metode_bayar: d.metode_bayar,
          tgl_pesanan: d.tgl_pesanan,
          tgl_selesai: d.tgl_selesai,
          total_bayar: d.total_bayar,
          nominal_diterima: d.nominal_diterima,
          tgl_masuk_saldo: d.tgl_masuk_saldo,
          status_saldo: d.status_saldo,
        }));
        const { error } = await supabase.from("rekap_saldo_detail").insert(batch);
        if (error) throw new Error("Gagal simpan detail: " + error.message);
      }

      showToast(`✓ Rekap ${preview.length} pesanan berhasil disimpan!`);
      setFileOrder(null); setFileBalance(null);
      setPreview(null); setDetectedToko(null); setDetectedPeriode(null);
      fetchData();
      setActiveTab("riwayat");
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  // ── Expand riwayat ──
  const toggleDetail = async (id: number) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (detailCache[id]) return;
    const { data } = await supabase
      .from("rekap_saldo_detail")
      .select("*")
      .eq("rekap_id", id)
      .order("status_saldo")
      .order("tgl_pesanan", { ascending: false });
    setDetailCache(prev => ({ ...prev, [id]: data || [] }));
  };

  const pendingCount = preview?.filter(d => d.status_saldo === "Pending").length || 0;
  const masukCount = preview?.filter(d => d.status_saldo === "Masuk").length || 0;
  const pendingTotal = preview?.filter(d => d.status_saldo === "Pending").reduce((a, d) => a + d.total_bayar, 0) || 0;
  const masukTotal = preview?.filter(d => d.status_saldo === "Masuk").reduce((a, d) => a + d.nominal_diterima, 0) || 0;

  const riwayatFiltered = riwayat.filter(r => {
    if (filterToko !== "Semua" && String(r.toko_id) !== filterToko) return false;
    return true;
  });

  const inputS: React.CSSProperties = {
    width: "100%", padding: "9px 12px", background: "#0f0b1a",
    border: `1.5px solid ${C.border}`, borderRadius: "8px",
    color: C.text, fontFamily: C.fontSans, fontSize: "13px",
    boxSizing: "border-box", outline: "none",
  };

  const tabBtn = (active: boolean, color: string): React.CSSProperties => ({
    flex: 1, padding: "10px 8px", borderRadius: "8px",
    border: `1px solid ${active ? color + "60" : C.border}`,
    background: active ? color + "20" : "transparent",
    color: active ? color : C.muted,
    fontWeight: 600, cursor: "pointer", fontSize: "13px",
    fontFamily: C.fontSans, transition: "all 0.15s",
  });

  const Lbl = ({ children }: { children: React.ReactNode }) => (
    <div style={{ fontSize: "10px", fontWeight: 700, color: C.muted, letterSpacing: "0.08em", marginBottom: "5px", textTransform: "uppercase" as const }}>{children}</div>
  );

  if (loading) return (
    <Sidebar>
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>◈</div>Memuat...
        </div>
      </div>
    </Sidebar>
  );

  return (
    <Sidebar>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        input:focus, select:focus { border-color: #a78bfa80 !important; outline: none; }
        select option { background: #1a1020; color: #e2d9f3; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #2a1f3d; border-radius: 2px; }
      `}</style>

      {toast && (
        <div style={{ position: "fixed", top: 24, right: 24, zIndex: 9999, background: "#1a1020", border: `1px solid ${toast.type === "success" ? C.success : toast.type === "error" ? C.danger : C.blue}44`, color: toast.type === "success" ? C.success : toast.type === "error" ? C.danger : C.blue, padding: "14px 18px", borderRadius: "10px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", fontFamily: C.fontMono, fontWeight: 600, fontSize: 13, maxWidth: 400 }}>
          {toast.msg}
        </div>
      )}

      <div style={{ padding: "28px 24px", fontFamily: C.fontSans, background: C.bg, minHeight: "100vh", maxWidth: "1100px", margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: "28px" }}>
          <h1 style={{ margin: 0, fontFamily: C.fontDisplay, fontSize: "26px", color: "#f0eaff", fontWeight: 400 }}>
            💳 Rekap Saldo Shopee
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: "12px", color: C.muted, fontFamily: C.fontMono }}>
            Upload Order All + Balance → cek pesanan pending vs sudah masuk saldo
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          <button onClick={() => setActiveTab("upload")} style={tabBtn(activeTab === "upload", C.accent)}>📤 Upload & Analisis</button>
          <button onClick={() => setActiveTab("riwayat")} style={tabBtn(activeTab === "riwayat", C.blue)}>📋 Riwayat Rekap ({riwayat.length})</button>
        </div>

        {/* ══ TAB UPLOAD ══ */}
        {activeTab === "upload" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Upload area */}
            <div style={{ background: C.card, padding: "24px", borderRadius: "14px", border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: C.accent, fontFamily: C.fontMono, marginBottom: 16, letterSpacing: 1 }}>📁 UPLOAD FILE SHOPEE</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                {/* File Order */}
                <div>
                  <Lbl>FILE ORDER ALL (.xlsx)</Lbl>
                  <label style={{
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    padding: "24px 16px", border: `2px dashed ${fileOrder ? C.success + "60" : C.border}`,
                    borderRadius: "10px", cursor: "pointer", background: fileOrder ? C.success + "08" : "#0f0b1a",
                    transition: "all 0.2s",
                  }}>
                    <input type="file" accept=".xlsx,.xls" style={{ display: "none" }}
                      onChange={e => { setFileOrder(e.target.files?.[0] || null); setPreview(null); }} />
                    <div style={{ fontSize: 28, marginBottom: 8 }}>{fileOrder ? "✅" : "📊"}</div>
                    <div style={{ fontSize: 12, color: fileOrder ? C.success : C.muted, textAlign: "center", fontFamily: C.fontMono }}>
                      {fileOrder ? fileOrder.name : "Klik untuk upload\nOrder_all_*.xlsx"}
                    </div>
                  </label>
                </div>

                {/* File Balance */}
                <div>
                  <Lbl>FILE BALANCE TRANSACTION (.xlsx)</Lbl>
                  <label style={{
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    padding: "24px 16px", border: `2px dashed ${fileBalance ? C.success + "60" : C.border}`,
                    borderRadius: "10px", cursor: "pointer", background: fileBalance ? C.success + "08" : "#0f0b1a",
                    transition: "all 0.2s",
                  }}>
                    <input type="file" accept=".xlsx,.xls" style={{ display: "none" }}
                      onChange={e => { setFileBalance(e.target.files?.[0] || null); setPreview(null); }} />
                    <div style={{ fontSize: 28, marginBottom: 8 }}>{fileBalance ? "✅" : "💳"}</div>
                    <div style={{ fontSize: 12, color: fileBalance ? C.success : C.muted, textAlign: "center", fontFamily: C.fontMono }}>
                      {fileBalance ? fileBalance.name : "Klik untuk upload\nmy_balance_*.xlsx"}
                    </div>
                  </label>
                </div>
              </div>

              <button
                onClick={prosesFile}
                disabled={!fileOrder || !fileBalance || processing}
                style={{
                  width: "100%", padding: "12px", borderRadius: "10px",
                  background: (!fileOrder || !fileBalance || processing) ? "transparent" : C.accent + "25",
                  border: `1px solid ${(!fileOrder || !fileBalance || processing) ? C.dim : C.accent + "60"}`,
                  color: (!fileOrder || !fileBalance || processing) ? C.dim : C.accent,
                  fontWeight: 700, cursor: (!fileOrder || !fileBalance || processing) ? "not-allowed" : "pointer",
                  fontFamily: C.fontSans, fontSize: "14px",
                }}
              >
                {processing ? "⏳ Memproses..." : "🔍 Analisis Saldo"}
              </button>
            </div>

            {/* Hasil analisis */}
            {preview && (
              <>
                {/* Info toko + periode */}
                <div style={{ background: C.card, padding: "16px 20px", borderRadius: "12px", border: `1px solid ${C.border}`, display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: "0.08em", marginBottom: 4 }}>TOKO TERDETEKSI</div>
                    {detectedToko ? (
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.success }}>{detectedToko.nama}</div>
                    ) : (
                      <div>
                        <div style={{ fontSize: 12, color: C.danger, marginBottom: 6 }}>⚠ Toko tidak terdeteksi — pilih manual:</div>
                        <select value={tokoManual} onChange={e => setTokoManual(e.target.value)} style={{ ...inputS, width: "200px" }}>
                          <option value="">— Pilih Toko —</option>
                          {tokoList.map(t => <option key={t.id} value={t.id}>{t.nama}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                  {detectedPeriode && (
                    <div>
                      <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: "0.08em", marginBottom: 4 }}>PERIODE</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.textMid, fontFamily: C.fontMono }}>
                        {detectedPeriode.dari} → {detectedPeriode.ke}
                      </div>
                    </div>
                  )}
                </div>

                {/* Summary cards */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div style={{ background: C.card, padding: "18px 20px", borderRadius: "12px", border: `1px solid ${C.yellow}40`, borderLeft: `4px solid ${C.yellow}` }}>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, fontFamily: C.fontMono, textTransform: "uppercase", letterSpacing: "0.08em" }}>⏳ Pending / Belum Masuk Saldo</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: C.yellow, fontFamily: C.fontDisplay }}>{pendingCount} pesanan</div>
                    <div style={{ fontSize: 13, color: C.textMid, fontFamily: C.fontMono, marginTop: 4 }}>{rupiahFmt(pendingTotal)}</div>
                  </div>
                  <div style={{ background: C.card, padding: "18px 20px", borderRadius: "12px", border: `1px solid ${C.success}40`, borderLeft: `4px solid ${C.success}` }}>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, fontFamily: C.fontMono, textTransform: "uppercase", letterSpacing: "0.08em" }}>✅ Sudah Masuk Saldo</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: C.success, fontFamily: C.fontDisplay }}>{masukCount} pesanan</div>
                    <div style={{ fontSize: 13, color: C.textMid, fontFamily: C.fontMono, marginTop: 4 }}>{rupiahFmt(masukTotal)}</div>
                  </div>
                </div>

                {/* Tabel detail */}
                <div style={{ background: C.card, borderRadius: "14px", border: `1px solid ${C.border}`, overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr 1.4fr 1fr 1fr 1.2fr 1fr", gap: 8, padding: "10px 16px", background: "#0f0b1a", borderBottom: `1px solid ${C.border}` }}>
                    {["NO. PESANAN", "STATUS", "METODE BAYAR", "TGL PESANAN", "TGL SELESAI", "TOTAL BAYAR", "STATUS SALDO"].map(h => (
                      <div key={h} style={{ fontSize: 9, fontWeight: 700, color: C.dim, letterSpacing: "0.08em" }}>{h}</div>
                    ))}
                  </div>

                  <div style={{ maxHeight: 400, overflowY: "auto" }}>
                    {preview.map((d, i) => {
                      const isPending = d.status_saldo === "Pending";
                      return (
                        <div key={i} style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr 1.4fr 1fr 1fr 1.2fr 1fr", gap: 8, padding: "10px 16px", borderBottom: `1px solid ${C.border}20`, alignItems: "center" }}>
                          <div style={{ fontSize: 11, color: C.accent, fontFamily: C.fontMono, fontWeight: 600 }}>{d.no_pesanan}</div>
                          <div style={{ fontSize: 11, color: C.textMid }}>{d.status_pesanan}</div>
                          <div style={{ fontSize: 11, color: C.muted }}>{d.metode_bayar}</div>
                          <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{tanggalFmt(d.tgl_pesanan)}</div>
                          <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{tanggalFmt(d.tgl_selesai)}</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#f0eaff", fontFamily: C.fontMono }}>{rupiahFmt(d.total_bayar)}</div>
                          <div>
                            <span style={{
                              padding: "3px 8px", borderRadius: "4px", fontSize: 10, fontWeight: 700,
                              background: isPending ? C.yellow + "20" : C.success + "20",
                              color: isPending ? C.yellow : C.success,
                            }}>
                              {isPending ? "⏳ Pending" : "✅ Masuk"}
                            </span>
                            {!isPending && d.tgl_masuk_saldo && (
                              <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, marginTop: 2 }}>{tanggalFmt(d.tgl_masuk_saldo)}</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Tombol simpan */}
                <button
                  onClick={simpanRekap}
                  disabled={saving || (!detectedToko && !tokoManual)}
                  style={{
                    width: "100%", padding: "13px", borderRadius: "10px",
                    background: (saving || (!detectedToko && !tokoManual)) ? "transparent" : C.success + "25",
                    border: `1px solid ${(saving || (!detectedToko && !tokoManual)) ? C.dim : C.success + "60"}`,
                    color: (saving || (!detectedToko && !tokoManual)) ? C.dim : C.success,
                    fontWeight: 700, cursor: "pointer", fontFamily: C.fontSans, fontSize: "14px",
                  }}
                >
                  {saving ? "Menyimpan..." : `💾 Simpan Rekap (${preview.length} pesanan)`}
                </button>
              </>
            )}
          </div>
        )}

        {/* ══ TAB RIWAYAT ══ */}
        {activeTab === "riwayat" && (
          <div>
            {/* Filter */}
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <select value={filterToko} onChange={e => setFilterToko(e.target.value)} style={{ ...inputS, width: "200px" }}>
                <option value="Semua">Semua Toko</option>
                {tokoList.map(t => <option key={t.id} value={t.id}>{t.nama}</option>)}
              </select>
            </div>

            {riwayatFiltered.length === 0 && (
              <div style={{ textAlign: "center", color: C.muted, padding: 60, fontFamily: C.fontMono, fontSize: 13 }}>
                Belum ada riwayat rekap
              </div>
            )}

            {riwayatFiltered.map(r => (
              <div key={r.id} style={{ marginBottom: 10 }}>
                <div
                  onClick={() => toggleDetail(r.id)}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", background: expandedId === r.id ? C.accent + "10" : "#0f0b1a", border: `1px solid ${expandedId === r.id ? C.accent + "40" : C.border}`, borderRadius: expandedId === r.id ? "10px 10px 0 0" : "10px", cursor: "pointer", transition: "all 0.15s" }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: C.text, marginBottom: 4 }}>
                      {r.nama_toko}
                      <span style={{ fontSize: 11, color: C.muted, marginLeft: 10, fontFamily: C.fontMono, fontWeight: 400 }}>
                        {r.periode_dari} → {r.periode_ke}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, display: "flex", gap: 12 }}>
                      <span>{r.total_pesanan} pesanan</span>
                      {(r.total_pending || 0) > 0 && <span style={{ color: C.yellow }}>⏳ {r.total_pending} pending</span>}
                      {(r.total_masuk || 0) > 0 && <span style={{ color: C.success }}>✅ {r.total_masuk} masuk</span>}
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono }}>
                    {new Date(r.created_at).toLocaleDateString("id-ID")} · {expandedId === r.id ? "▲" : "▼"}
                  </div>
                </div>

                {expandedId === r.id && (
                  <div style={{ background: "#0f0b1a", border: `1px solid ${C.border}`, borderTop: "none", borderRadius: "0 0 10px 10px", overflow: "hidden" }}>
                    {!detailCache[r.id] ? (
                      <div style={{ padding: 20, color: C.muted, fontFamily: C.fontMono, fontSize: 12 }}>Memuat detail...</div>
                    ) : (
                      <>
                        <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr 1.4fr 1fr 1fr 1.2fr 1fr", gap: 8, padding: "8px 16px", background: C.border + "30", borderBottom: `1px solid ${C.border}` }}>
                          {["NO. PESANAN", "STATUS", "METODE BAYAR", "TGL PESANAN", "TGL SELESAI", "TOTAL BAYAR", "STATUS SALDO"].map(h => (
                            <div key={h} style={{ fontSize: 9, fontWeight: 700, color: C.dim, letterSpacing: "0.08em" }}>{h}</div>
                          ))}
                        </div>
                        <div style={{ maxHeight: 360, overflowY: "auto" }}>
                          {detailCache[r.id].map((d, i) => {
                            const isPending = d.status_saldo === "Pending";
                            return (
                              <div key={i} style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr 1.4fr 1fr 1fr 1.2fr 1fr", gap: 8, padding: "9px 16px", borderBottom: `1px solid ${C.border}20`, alignItems: "center" }}>
                                <div style={{ fontSize: 11, color: C.accent, fontFamily: C.fontMono, fontWeight: 600 }}>{d.no_pesanan}</div>
                                <div style={{ fontSize: 11, color: C.textMid }}>{d.status_pesanan}</div>
                                <div style={{ fontSize: 11, color: C.muted }}>{d.metode_bayar}</div>
                                <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{tanggalFmt(d.tgl_pesanan)}</div>
                                <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{tanggalFmt(d.tgl_selesai)}</div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: "#f0eaff", fontFamily: C.fontMono }}>{rupiahFmt(d.total_bayar)}</div>
                                <div>
                                  <span style={{ padding: "3px 8px", borderRadius: "4px", fontSize: 10, fontWeight: 700, background: isPending ? C.yellow + "20" : C.success + "20", color: isPending ? C.yellow : C.success }}>
                                    {isPending ? "⏳ Pending" : "✅ Masuk"}
                                  </span>
                                  {!isPending && d.tgl_masuk_saldo && (
                                    <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, marginTop: 2 }}>{tanggalFmt(d.tgl_masuk_saldo)}</div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
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
    </Sidebar>
  );
}
