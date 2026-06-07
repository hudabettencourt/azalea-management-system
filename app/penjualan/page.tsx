"use client";

// /app/penjualan/page.tsx
// Penjualan Offline — input transaksi + riwayat + print nota thermal 58mm

import React, { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import { useTheme, LIGHT, DARK } from "@/context/ThemeContext";

type Produk = { id: number; nama_produk: string; jumlah_stok: number; harga_jual: number; satuan: string };
type KeranjangItem = { produk_id: number; nama_produk: string; harga_jual: number; qty: number; subtotal: number; harga_khusus: boolean };
type PelangganOffline = { id: number; nama: string; telepon: string | null };
type PenjualanOffline = {
  id: number; pelanggan_id: number | null; nama_pelanggan: string | null;
  tanggal: string; metode_bayar: string; total_nominal: number;
  status_bayar: string; catatan: string | null; created_at: string;
  detail?: DetailPenjualanOffline[];
};
type DetailPenjualanOffline = {
  id: number; penjualan_id: number; stok_barang_id: number | null;
  nama_produk: string; qty: number; harga_satuan: number; subtotal: number;
};
type Toast = { msg: string; type: "success" | "error" | "info" };

const rupiahFmt = (n: number) => `Rp ${(n || 0).toLocaleString("id-ID")}`;
const formatIDR = (val: string) => val.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const toAngka = (str: string) => parseInt(str.replace(/\./g, "")) || 0;
const tanggalFmt = (s: string) => new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
const tanggalNotaFmt = (s: string) => new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });

export default function PenjualanPage() {
  const { isDark } = useTheme();
  const C = isDark ? DARK : LIGHT;

  const [produk, setProduk] = useState<Produk[]>([]);
  const [pelangganMaster, setPelangganMaster] = useState<PelangganOffline[]>([]);
  const [penjualanList, setPenjualanList] = useState<PenjualanOffline[]>([]);
  const [pelangganHarga, setPelangganHarga] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [filterStatus, setFilterStatus] = useState<"semua" | "Belum Lunas" | "Lunas">("semua");
  const [showKonfirmasi, setShowKonfirmasi] = useState(false);

  // Form state
  const [keranjang, setKeranjang] = useState<KeranjangItem[]>([]);
  const [offlineProdukId, setOfflineProdukId] = useState("");
  const [offlineQty, setOfflineQty] = useState("");
  const [offlineMetode, setOfflineMetode] = useState("Tunai");
  const [offlineNamaPelanggan, setOfflineNamaPelanggan] = useState("");
  const [offlinePelangganId, setOfflinePelangganId] = useState("");
  const [loadingHarga, setLoadingHarga] = useState(false);

  // Print state
  const [printData, setPrintData] = useState<PenjualanOffline | null>(null);

  const totalKeranjang = keranjang.reduce((a, k) => a + k.subtotal, 0);

  const showToast = (msg: string, type: Toast["type"] = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px",
    background: isDark ? "rgba(255,255,255,0.05)" : "#f8fffe",
    border: `1.5px solid ${C.border}`, borderRadius: 10,
    color: C.text, fontFamily: C.fontSans, fontSize: 13,
    outline: "none", boxSizing: "border-box" as const,
  };

  const fetchHargaPelanggan = useCallback(async (pelangganId: number) => {
    setLoadingHarga(true);
    try {
      const { data } = await supabase.from("pelanggan_harga").select("produk_id, harga").eq("pelanggan_id", pelangganId);
      const map: Record<number, number> = {};
      (data || []).forEach((row: any) => { map[row.produk_id] = row.harga; });
      setPelangganHarga(map);
    } finally { setLoadingHarga(false); }
  }, []);

  const handlePilihPelanggan = useCallback(async (val: string) => {
    setOfflinePelangganId(val); setKeranjang([]);
    if (val === "baru") { setOfflineNamaPelanggan(""); setPelangganHarga({}); }
    else if (val) {
      const p = pelangganMaster.find(x => String(x.id) === val);
      setOfflineNamaPelanggan(p?.nama || "");
      await fetchHargaPelanggan(parseInt(val));
    } else { setOfflineNamaPelanggan(""); setPelangganHarga({}); }
  }, [pelangganMaster, fetchHargaPelanggan]);

  const tambahKeranjang = () => {
    if (!offlineProdukId || !offlineQty) return showToast("Pilih produk & isi qty!", "error");
    const p = produk.find(x => x.id === parseInt(offlineProdukId));
    if (!p) return showToast("Produk tidak ditemukan", "error");
    const qty = parseInt(offlineQty);
    if (qty <= 0) return showToast("Qty harus lebih dari 0", "error");
    const qtyDiKeranjang = keranjang.find(k => k.produk_id === p.id)?.qty || 0;
    if (p.jumlah_stok < qtyDiKeranjang + qty) return showToast(`Stok tidak cukup! Tersisa ${p.jumlah_stok - qtyDiKeranjang}`, "error");
    const hargaEfektif = pelangganHarga[p.id] ?? p.harga_jual;
    const isKhusus = pelangganHarga[p.id] !== undefined;
    setKeranjang(prev => {
      const existing = prev.find(k => k.produk_id === p.id);
      if (existing) return prev.map(k => k.produk_id === p.id ? { ...k, qty: k.qty + qty, subtotal: (k.qty + qty) * k.harga_jual } : k);
      return [...prev, { produk_id: p.id, nama_produk: p.nama_produk, harga_jual: hargaEfektif, qty, subtotal: hargaEfektif * qty, harga_khusus: isKhusus }];
    });
    setOfflineProdukId(""); setOfflineQty("");
  };

  const fetchData = useCallback(async () => {
    try {
      const [resProduk, resPelanggan, resPenjualan] = await Promise.all([
        supabase.from("stok_barang").select("id, nama_produk, jumlah_stok, harga_jual, satuan").order("nama_produk"),
        supabase.from("pelanggan_offline").select("id, nama, telepon").order("nama"),
        supabase.from("penjualan_offline").select("*, detail_penjualan_offline(*)").order("created_at", { ascending: false }).limit(100),
      ]);
      setProduk(resProduk.data || []);
      setPelangganMaster(resPelanggan.data || []);
      setPenjualanList((resPenjualan.data || []).map((pj: any) => ({ ...pj, detail: pj.detail_penjualan_offline || [] })));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

   const prosesOffline = async () => {
    setSubmitting(true);
    try {
      const { data: penjualanData, error: penjualanError } = await supabase.from("penjualan_offline").insert([{
        pelanggan_id: offlinePelangganId && offlinePelangganId !== "baru" ? parseInt(offlinePelangganId) : null,
        nama_pelanggan: offlineNamaPelanggan.trim() || null,
        tanggal: new Date().toLocaleDateString("sv", { timeZone: "Asia/Jakarta" }),
        metode_bayar: offlineMetode,
        total_nominal: totalKeranjang,
        status_bayar: offlineMetode === "Tunai" ? "Lunas" : "Belum Lunas",
      }]).select().single();
      if (penjualanError) throw penjualanError;

      const { error: detailError } = await supabase.from("detail_penjualan_offline").insert(
        keranjang.map(k => ({
          penjualan_id: penjualanData.id,
          stok_barang_id: k.produk_id,
          nama_produk: k.nama_produk,
          qty: k.qty,
          harga_satuan: k.harga_jual,
          subtotal: k.subtotal,
        }))
      );
      if (detailError) {
        // Rollback header jika detail gagal
        await supabase.from("penjualan_offline").delete().eq("id", penjualanData.id);
        throw new Error("Gagal simpan detail: " + detailError.message);
      }

      for (const item of keranjang) {
        const p = produk.find(x => x.id === item.produk_id);
        if (!p) continue;
        await supabase.from("stok_barang").update({ jumlah_stok: p.jumlah_stok - item.qty }).eq("id", p.id);
        await supabase.from("mutasi_stok").insert([{ stok_barang_id: p.id, tipe: "Keluar", qty: item.qty, keterangan: "Penjualan Offline" }]);
      }

      if (offlineMetode === "Tunai") {
        await supabase.from("kas").insert([{ tipe: "Masuk", kategori: "Offline", nominal: totalKeranjang, keterangan: keranjang.map(k => `${k.nama_produk} ×${k.qty}`).join(", ") }]);
      }

      showToast(`✓ ${keranjang.length} item terjual = ${rupiahFmt(totalKeranjang)}`);
      
      const newPenjualan: PenjualanOffline = {
        ...penjualanData,
        detail: keranjang.map((k, i) => ({ id: i, penjualan_id: penjualanData.id, stok_barang_id: k.produk_id, nama_produk: k.nama_produk, qty: k.qty, harga_satuan: k.harga_jual, subtotal: k.subtotal }))
      };
      setPrintData(newPenjualan);

      setKeranjang([]); setOfflineNamaPelanggan(""); setOfflinePelangganId("");
      setOfflineProdukId(""); setOfflineQty(""); setPelangganHarga({});
      setShowKonfirmasi(false);
      fetchData();
    } catch (err: any) {
      showToast(err.message || "Gagal simpan transaksi", "error");
    } finally { setSubmitting(false); }
  };


  const lunaskanOffline = async (pj: PenjualanOffline) => {
    try {
      await supabase.from("penjualan_offline").update({ status_bayar: "Lunas" }).eq("id", pj.id);
      await supabase.from("kas").insert([{ tipe: "Masuk", kategori: "Piutang", nominal: pj.total_nominal, keterangan: `Lunas: ${pj.nama_pelanggan}` }]);
      showToast(`Piutang ${pj.nama_pelanggan} lunas! ✓`);
      fetchData();
    } catch (err: any) { showToast(err.message || "Gagal", "error"); }
  };

  const printNota = (pj: PenjualanOffline) => {
    const w = window.open("", "_blank", "width=800,height=700,left=200,top=50");
    if (!w) return;
    const lines = (pj.detail || []).map(d =>
      `<div class="row"><span>${d.nama_produk} x${d.qty}</span><span>${rupiahFmt(d.subtotal)}</span></div>`
    ).join("");
    w.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          @page { size: 58mm 200mm; margin: 2mm; }
          body { font-family: monospace; font-size: 11px; color: black; width: 52mm; margin: 0; padding: 0; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 4px 0; }
          .row { display: flex; justify-content: space-between; padding: 2px 0; border-bottom: 1px dashed #ccc; }
          .total-row { display: flex; justify-content: space-between; padding: 4px 0; font-weight: bold; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="center bold" style="font-size:13px">AZALEA FOOD</div>
        <div class="center">Penjualan Offline</div>
        <div class="divider"></div>
        <div style="display:flex;justify-content:space-between">
          <span>Tgl: ${tanggalNotaFmt(pj.tanggal || pj.created_at)}</span>
          <span>No: OFF-${String(pj.id).padStart(3, "0")}</span>
        </div>
        ${pj.nama_pelanggan ? `<div>Pembeli: ${pj.nama_pelanggan}</div>` : ""}
        <div class="divider"></div>
        ${lines}
        <div class="divider"></div>
        <div class="total-row"><span>TOTAL</span><span>${rupiahFmt(pj.total_nominal)}</span></div>
        <div style="font-size:10px">Metode: ${pj.metode_bayar}</div>
        <div style="font-size:10px">Status: ${pj.status_bayar}</div>
        <div class="divider"></div>
        <div class="center" style="font-size:10px">Terima kasih!</div>
      </body>
      </html>
    `);
    w.document.close();
    setTimeout(() => { w.print(); w.onafterprint = () => w.close(); }, 500);
    setPrintData(null);
  };

  const filteredOffline = filterStatus === "semua" ? penjualanList : penjualanList.filter(p => p.status_bayar === filterStatus);
  const piutangList = penjualanList.filter(p => p.metode_bayar === "Piutang" && p.status_bayar === "Belum Lunas");
  const totalPiutang = piutangList.reduce((a, p) => a + p.total_nominal, 0);

  return (
    <AppShell>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .pj-row:hover { background: ${isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)"} !important; }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 24, right: 24, zIndex: 9999, background: toast.type === "success" ? C.accent : toast.type === "error" ? C.red : C.blue, color: "#fff", padding: "12px 20px", borderRadius: 12, boxShadow: C.shadowMd, fontFamily: C.fontSans, fontWeight: 700, fontSize: 14 }}>
          {toast.msg}
        </div>
      )}

      {/* Auto print setelah simpan */}
      {printData && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 20px", boxShadow: C.shadowMd, display: "flex", gap: 12, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Transaksi tersimpan!</div>
            <div style={{ fontSize: 12, color: C.muted }}>Print nota sekarang?</div>
          </div>
          <button onClick={() => printNota(printData)} style={{ padding: "8px 16px", background: `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`, border: "none", color: "#fff", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13 }}>🖨️ Print</button>
          <button onClick={() => setPrintData(null)} style={{ padding: "8px 12px", background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, cursor: "pointer", fontSize: 12 }}>Skip</button>
        </div>
      )}

      {/* Konfirmasi modal */}
      {showKonfirmasi && (
        <>
          <div onClick={() => setShowKonfirmasi(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 1001, width: 420, background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28, fontFamily: C.fontSans, boxShadow: C.shadowMd }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 16 }}>⚠️ Konfirmasi Transaksi</div>
            <div style={{ background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", borderRadius: 12, padding: "12px 16px", marginBottom: 16 }}>
              {keranjang.map(k => (
                <div key={k.produk_id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 13, color: C.textMid }}>{k.nama_produk} ×{k.qty}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: C.fontMono }}>{rupiahFmt(k.subtotal)}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, paddingTop: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Total</span>
                <span style={{ fontSize: 15, fontWeight: 900, color: C.accent, fontFamily: C.fontMono }}>{rupiahFmt(totalKeranjang)}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1, background: offlineMetode === "Tunai" ? `${C.green}15` : `${C.yellow}15`, borderRadius: 10, padding: "10px 14px", border: `1px solid ${offlineMetode === "Tunai" ? C.green : C.yellow}30` }}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>METODE</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: offlineMetode === "Tunai" ? C.green : C.yellow }}>{offlineMetode === "Tunai" ? "💵 Tunai" : "📝 Piutang"}</div>
              </div>
              {offlineNamaPelanggan && (
                <div style={{ flex: 1, background: `${C.accent}10`, borderRadius: 10, padding: "10px 14px", border: `1px solid ${C.accent}30` }}>
                  <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>PELANGGAN</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.accent, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{offlineNamaPelanggan}</div>
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowKonfirmasi(false)} style={{ flex: 1, padding: "11px", background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13 }}>✕ Batal</button>
              <button onClick={prosesOffline} disabled={submitting} style={{ flex: 1, padding: "11px", background: `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`, border: "none", color: "#fff", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13, opacity: submitting ? 0.7 : 1 }}>
                {submitting ? "Memproses..." : "✓ Ya, Simpan"}
              </button>
            </div>
          </div>
        </>
      )}

      <div style={{ padding: "24px 28px", animation: "fadeUp 0.3s ease" }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>Penjualan Offline</h1>
          <p style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono, margin: "4px 0 0" }}>
            Input transaksi reseller & print nota thermal
          </p>
        </div>

        {/* Summary */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Total Produk", value: `${produk.length} item`, color: C.accent, icon: "📦" },
            { label: "Piutang Belum Lunas", value: rupiahFmt(totalPiutang), color: C.red, icon: "📝", sub: `${piutangList.length} pelanggan` },
            { label: "Transaksi Hari Ini", value: penjualanList.filter(p => p.tanggal === new Date().toLocaleDateString("sv", { timeZone: "Asia/Jakarta" })).length.toString(), color: C.green, icon: "🧾", sub: "transaksi" },
          ].map((s, i) => (
            <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px", boxShadow: C.shadow }}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>{s.icon}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: s.color, fontFamily: C.fontMono }}>{s.value}</div>
              {s.sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{s.sub}</div>}
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 20 }}>

          {/* ── FORM INPUT ── */}
          <div style={{ background: C.card, borderRadius: 16, padding: 22, border: `1px solid ${C.border}`, boxShadow: C.shadow, height: "fit-content" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 16 }}>🏪 Input Penjualan</div>

            {/* Metode */}
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 6, textTransform: "uppercase" as const }}>Metode Bayar</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {["Tunai", "Piutang"].map(m => (
                <button key={m} onClick={() => { setOfflineMetode(m); setOfflinePelangganId(""); setOfflineNamaPelanggan(""); setPelangganHarga({}); setKeranjang([]); }}
                  style={{ flex: 1, padding: "10px", border: `2px solid ${offlineMetode === m ? C.accent : C.border}`, borderRadius: 10, background: offlineMetode === m ? `${C.accent}15` : "transparent", color: offlineMetode === m ? C.accent : C.muted, fontFamily: C.fontSans, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  {m === "Tunai" ? "💵 Tunai" : "📝 Piutang"}
                </button>
              ))}
            </div>

            {/* Pelanggan */}
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 6, textTransform: "uppercase" as const }}>
              Pelanggan {offlineMetode === "Piutang" ? <span style={{ color: C.red }}>*</span> : <span style={{ color: C.muted, fontSize: 10, textTransform: "none" as const }}>(opsional)</span>}
            </div>
            <select value={offlinePelangganId} onChange={e => handlePilihPelanggan(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }}>
              <option value="">{offlineMetode === "Piutang" ? "— Pilih Pelanggan —" : "— Tanpa Pelanggan —"}</option>
              {pelangganMaster.map(p => <option key={p.id} value={String(p.id)}>{p.nama}{p.telepon ? ` (${p.telepon})` : ""}</option>)}
              <option value="baru">✏️ + Pelanggan Baru</option>
            </select>
            {offlinePelangganId === "baru" && (
              <input value={offlineNamaPelanggan} onChange={e => setOfflineNamaPelanggan(e.target.value)} placeholder="Nama pelanggan baru..." style={{ ...inputStyle, marginBottom: 8 }} autoFocus />
            )}
            {offlinePelangganId && offlinePelangganId !== "baru" && (
              <div style={{ fontSize: 11, fontFamily: C.fontMono, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                {loadingHarga ? <span style={{ color: C.muted }}>⏳ Memuat harga...</span> : (
                  <>
                    <span style={{ color: C.accent, fontWeight: 700 }}>✓ {offlineNamaPelanggan}</span>
                    {Object.keys(pelangganHarga).length > 0
                      ? <span style={{ color: C.accent, background: `${C.accent}15`, padding: "2px 7px", borderRadius: 4, fontSize: 10 }}>🏷 {Object.keys(pelangganHarga).length} harga khusus</span>
                      : <span style={{ color: C.muted, fontSize: 10 }}>harga master</span>}
                  </>
                )}
              </div>
            )}

            {/* Tambah item */}
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 6, textTransform: "uppercase" as const }}>Tambah Item</div>
            <select value={offlineProdukId} onChange={e => setOfflineProdukId(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }}>
              <option value="">— Pilih Produk —</option>
              {produk.map(p => {
                const hargaKhusus = pelangganHarga[p.id];
                return <option key={p.id} value={p.id}>{p.nama_produk} — {rupiahFmt(hargaKhusus ?? p.harga_jual)} (stok: {p.jumlah_stok})</option>;
              })}
            </select>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <input type="number" min="1" value={offlineQty} onChange={e => setOfflineQty(e.target.value)} placeholder="Qty" style={{ ...inputStyle, flex: 1 }} onKeyDown={e => e.key === "Enter" && tambahKeranjang()} />
              <button onClick={tambahKeranjang} style={{ padding: "9px 16px", borderRadius: 10, background: `${C.accent}15`, color: C.accent, fontWeight: 800, cursor: "pointer", fontFamily: C.fontSans, fontSize: 13, border: `1px solid ${C.accent}30`, whiteSpace: "nowrap" as const }}>+ Tambah</button>
            </div>

            {/* Keranjang */}
            {keranjang.length > 0 && (
              <div style={{ background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase" as const, letterSpacing: 1, marginBottom: 8, fontWeight: 700 }}>Keranjang ({keranjang.length} item)</div>
                {keranjang.map(k => (
                  <div key={k.produk_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: C.text, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
                        {k.nama_produk}
                        {k.harga_khusus && <span style={{ fontSize: 9, background: `${C.accent}15`, color: C.accent, padding: "1px 5px", borderRadius: 3, fontFamily: C.fontMono }}>KHUSUS</span>}
                      </div>
                      <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{rupiahFmt(k.harga_jual)} × {k.qty}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: C.fontMono }}>{rupiahFmt(k.subtotal)}</span>
                      <button onClick={() => setKeranjang(prev => prev.filter(x => x.produk_id !== k.produk_id))} style={{ background: `${C.red}15`, border: "none", color: C.red, cursor: "pointer", fontSize: 13, padding: "2px 6px", borderRadius: 4 }}>×</button>
                    </div>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, paddingTop: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>Total</span>
                  <span style={{ fontSize: 14, fontWeight: 900, color: C.accent, fontFamily: C.fontMono }}>{rupiahFmt(totalKeranjang)}</span>
                </div>
              </div>
            )}

            <button onClick={() => {
              if (keranjang.length === 0) return showToast("Keranjang kosong!", "error");
              if (offlineMetode === "Piutang" && !offlineNamaPelanggan.trim()) return showToast("Pilih atau isi nama pelanggan!", "error");
              setShowKonfirmasi(true);
            }} style={{ width: "100%", padding: "12px", border: "none", borderRadius: 10, background: keranjang.length === 0 ? C.dim : `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`, color: keranjang.length === 0 ? C.muted : "#fff", fontWeight: 800, cursor: keranjang.length === 0 ? "not-allowed" : "pointer", fontFamily: C.fontSans, fontSize: 13, transition: "all 0.15s" }}>
              {`💳 Proses ${keranjang.length > 0 ? `(${rupiahFmt(totalKeranjang)}) via ${offlineMetode}` : "Keranjang"}`}
            </button>
          </div>

          {/* ── RIWAYAT TRANSAKSI ── */}
          <div style={{ background: C.card, borderRadius: 16, padding: 22, border: `1px solid ${C.border}`, boxShadow: C.shadow }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>📋 Riwayat Transaksi</div>
              <div style={{ display: "flex", gap: 6 }}>
                {(["semua", "Belum Lunas", "Lunas"] as const).map(f => (
                  <button key={f} onClick={() => setFilterStatus(f)} style={{ padding: "5px 12px", borderRadius: 8, border: `1px solid ${filterStatus === f ? C.accent : C.border}`, background: filterStatus === f ? `${C.accent}15` : "transparent", color: filterStatus === f ? C.accent : C.muted, fontFamily: C.fontSans, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    {f === "semua" ? "Semua" : f}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: C.fontMono }}>Memuat...</div>
            ) : filteredOffline.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 0", color: C.muted, fontSize: 13, fontFamily: C.fontMono }}>Belum ada transaksi</div>
            ) : filteredOffline.map(pj => (
              <div key={pj.id} className="pj-row" style={{ padding: "12px 8px", borderBottom: `1px solid ${C.border}`, borderRadius: 8, transition: "background 0.1s" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" as const }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{pj.nama_pelanggan || "Tanpa Pelanggan"}</span>
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, fontFamily: C.fontMono, fontWeight: 700, background: pj.status_bayar === "Lunas" ? `${C.green}20` : `${C.yellow}20`, color: pj.status_bayar === "Lunas" ? C.green : C.yellow }}>
                        {pj.status_bayar}
                      </span>
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, fontFamily: C.fontMono, background: pj.metode_bayar === "Tunai" ? `${C.green}15` : `${C.blue}15`, color: pj.metode_bayar === "Tunai" ? C.green : C.blue }}>
                        {pj.metode_bayar}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, marginBottom: 3 }}>{tanggalFmt(pj.created_at)} · {(pj.detail || []).length} item</div>
                    <div style={{ fontSize: 11, color: C.textMid }}>
                      {(pj.detail || []).slice(0, 2).map(d => `${d.nama_produk} ×${d.qty}`).join(", ")}
                      {(pj.detail || []).length > 2 && ` +${(pj.detail || []).length - 2} lainnya`}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    <span style={{ fontSize: 15, fontWeight: 900, color: pj.status_bayar === "Lunas" ? C.green : C.red, fontFamily: C.fontMono }}>{rupiahFmt(pj.total_nominal)}</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => printNota(pj)} style={{ padding: "5px 10px", background: `${C.accent}15`, border: `1px solid ${C.accent}30`, color: C.accent, borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700 }}>🖨️ Nota</button>
                      {pj.metode_bayar === "Piutang" && pj.status_bayar === "Belum Lunas" && (
                        <button onClick={() => lunaskanOffline(pj)} style={{ padding: "5px 10px", background: `${C.green}15`, border: `1px solid ${C.green}30`, color: C.green, borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700 }}>✓ Lunas</button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {piutangList.length > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, paddingTop: 12, borderTop: `2px solid ${C.border}` }}>
                <span style={{ fontSize: 13, color: C.text, fontWeight: 700 }}>Total Piutang Belum Lunas</span>
                <span style={{ fontSize: 16, fontWeight: 900, color: C.red, fontFamily: C.fontMono }}>{rupiahFmt(totalPiutang)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
