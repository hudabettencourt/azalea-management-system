"use client";

import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import Sidebar from "@/components/Sidebar";

// ── Types ──
type Toko = { id: number; nama: string; aktif: boolean };
type Produk = { id: number; nama_produk: string; jumlah_stok: number; harga_jual: number; satuan: string };
type PiutangShopee = { toko_id: number; toko_nama: string; total_piutang: number; total_retur: number; total_cair: number; sisa_piutang: number };
type ReturShopee = { id: number; toko_id: number; produk_id: number; qty: number; nominal: number; tipe: string; stok_kembali: boolean; created_at: string; nama_produk?: string; nama_toko?: string };
type PencairanShopee = { id: number; toko_id: number; nominal_cair: number; nominal_piutang: number; selisih: number; created_at: string; nama_toko?: string };
type Piutang = { id: number; nama_pelanggan: string; nominal: number; keterangan: string; status: string };
type Toast = { msg: string; type: "success" | "error" | "info" };

const rupiahFmt = (n: number) => `Rp ${(n || 0).toLocaleString("id-ID")}`;
const formatIDR = (val: string) => val.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const toAngka = (str: string) => parseInt(str.replace(/\./g, "")) || 0;
const tanggalFmt = (s: string) => new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });

const C = {
  bg: "#100c16",
  card: "#1a1425",
  cardHover: "#1e1830",
  border: "#2a1f3d",
  borderStrong: "#3d2f5a",
  text: "#e2d9f3",
  textMid: "#c0aed4",
  muted: "#7c6d8a",
  dim: "#3d3050",
  accent: "#a78bfa",
  accentDim: "#a78bfa20",
  green: "#34d399",
  red: "#f87171",
  yellow: "#fbbf24",
  orange: "#fb923c",
  fontDisplay: "'DM Serif Display', serif",
  fontMono: "'DM Mono', monospace",
  fontSans: "'DM Sans', sans-serif",
};

function ToastBar({ toast, onClose }: { toast: Toast | null; onClose: () => void }) {
  if (!toast) return null;
  const colors = { success: C.green, error: C.red, info: C.accent };
  return (
    <div style={{ position: "fixed", top: 24, right: 24, zIndex: 9999, background: "#1a1020", border: `1px solid ${colors[toast.type]}44`, color: colors[toast.type], padding: "14px 20px", borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.5)", display: "flex", alignItems: "center", gap: 10, fontFamily: C.fontMono, fontWeight: 600, fontSize: 13, maxWidth: 380 }}>
      <span style={{ flex: 1 }}>{toast.msg}</span>
      <button onClick={onClose} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 16, opacity: 0.6 }}>×</button>
    </div>
  );
}

export default function PenjualanPage() {
  const [activeTab, setActiveTab] = useState<"shopee" | "offline">("shopee");
  const [activeShopeeTab, setActiveShopeeTab] = useState<"input" | "piutang" | "retur" | "pencairan">("input");

  const [toko, setToko] = useState<Toko[]>([]);
  const [produk, setProduk] = useState<Produk[]>([]);
  const [piutangShopee, setPiutangShopee] = useState<PiutangShopee[]>([]);
  const [returList, setReturList] = useState<ReturShopee[]>([]);
  const [pencairanList, setPencairanList] = useState<PencairanShopee[]>([]);
  const [piutangOffline, setPiutangOffline] = useState<Piutang[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  // Form Shopee
  const [selectedToko, setSelectedToko] = useState("");
  const [inputShopee, setInputShopee] = useState("");

  // Form Retur
  const [returTokoId, setReturTokoId] = useState("");
  const [returProdukId, setReturProdukId] = useState("");
  const [returQty, setReturQty] = useState("");
  const [returTipe, setReturTipe] = useState<"Pembatalan" | "Retur">("Pembatalan");
  const [returStokKembali, setReturStokKembali] = useState(true);

  // Form Pencairan
  const [cairTokoId, setCairTokoId] = useState("");
  const [cairNominal, setCairNominal] = useState("");

  // Form Offline
  const [offlineProdukId, setOfflineProdukId] = useState("");
  const [offlineQty, setOfflineQty] = useState("");
  const [offlineMetode, setOfflineMetode] = useState("Tunai");
  const [offlineNamaPelanggan, setOfflineNamaPelanggan] = useState("");

  const showToast = (msg: string, type: Toast["type"] = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchData = useCallback(async () => {
    try {
      const [resToko, resProduk, resPenjualan, resRetur, resPencairan, resPiutangOffline] = await Promise.all([
        supabase.from("toko_shopee").select("*").eq("aktif", true).order("id"),
        supabase.from("stok_barang").select("*").order("nama_produk"),
        supabase.from("penjualan_shopee").select("toko_id, total_nominal"),
        supabase.from("retur_shopee").select("*, stok_barang(nama_produk), toko_shopee(nama)").order("created_at", { ascending: false }).limit(50),
        supabase.from("pencairan_shopee").select("*, toko_shopee(nama)").order("created_at", { ascending: false }).limit(50),
        supabase.from("piutang").select("*").eq("status", "Belum Lunas").order("created_at", { ascending: false }),
      ]);

      setToko(resToko.data || []);
      setProduk(resProduk.data || []);

      // Hitung piutang per toko
      const penjualanData = resPenjualan.data || [];
      const returData = resRetur.data || [];
      const pencairanData = resPencairan.data || [];

      const tokoList = resToko.data || [];
      const piutangPerToko: PiutangShopee[] = tokoList.map((t: Toko) => {
        const totalPiutang = penjualanData.filter((p: any) => p.toko_id === t.id).reduce((a: number, p: any) => a + (p.total_nominal || 0), 0);
        const totalRetur = returData.filter((r: any) => r.toko_id === t.id).reduce((a: number, r: any) => a + (r.nominal || 0), 0);
        const totalCair = pencairanData.filter((p: any) => p.toko_id === t.id).reduce((a: number, p: any) => a + (p.nominal_cair || 0), 0);
        return {
          toko_id: t.id,
          toko_nama: t.nama,
          total_piutang: totalPiutang,
          total_retur: totalRetur,
          total_cair: totalCair,
          sisa_piutang: totalPiutang - totalRetur - totalCair,
        };
      });

      setPiutangShopee(piutangPerToko);
      setReturList(returData.map((r: any) => ({ ...r, nama_produk: r.stok_barang?.nama_produk, nama_toko: r.toko_shopee?.nama })));
      setPencairanList(pencairanData.map((p: any) => ({ ...p, nama_toko: p.toko_shopee?.nama })));
      setPiutangOffline(resPiutangOffline.data || []);
    } catch (err: any) {
      showToast(err.message || "Gagal memuat data", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Action: Input Orderan Shopee ──
  const prosesOrderanShopee = async () => {
    if (!selectedToko) return showToast("Pilih toko dulu!", "error");
    if (!inputShopee.trim()) return showToast("Input orderan kosong!", "error");

    const baris = inputShopee.split("\n").filter(l => l.trim());
    if (baris.length === 0) return showToast("Tidak ada baris valid!", "error");

    setSubmitting("shopee");
    let totalNominal = 0;
    const details: { produk_id: number; qty: number; harga_satuan: number }[] = [];
    const gagal: string[] = [];

    for (const line of baris) {
      const kolom = line.trim().split(/\t| {2,}/);
      const namaInput = kolom[0]?.trim().toLowerCase();
      const qtyInput = parseInt(kolom[1]);
      if (!namaInput || isNaN(qtyInput) || qtyInput <= 0) { gagal.push(line); continue; }
      const p = produk.find(x => x.nama_produk.toLowerCase().includes(namaInput));
      if (!p) { gagal.push(`"${kolom[0]}" tidak ditemukan`); continue; }
      if (p.jumlah_stok < qtyInput) { gagal.push(`Stok ${p.nama_produk} tidak cukup (${p.jumlah_stok})`); continue; }
      details.push({ produk_id: p.id, qty: qtyInput, harga_satuan: p.harga_jual });
      totalNominal += p.harga_jual * qtyInput;
    }

    if (details.length === 0) {
      showToast("Tidak ada item yang bisa diproses: " + gagal[0], "error");
      setSubmitting(null);
      return;
    }

    // Insert penjualan_shopee
    const { data: penjualan, error: errPenjualan } = await supabase
      .from("penjualan_shopee")
      .insert([{ toko_id: parseInt(selectedToko), total_nominal: totalNominal }])
      .select()
      .single();

    if (errPenjualan || !penjualan) {
      showToast("Gagal catat penjualan: " + errPenjualan?.message, "error");
      setSubmitting(null);
      return;
    }

    // Insert detail
    const detailInsert = details.map(d => ({ ...d, penjualan_id: penjualan.id }));
    await supabase.from("detail_penjualan_shopee").insert(detailInsert);

    // Potong stok
    for (const d of details) {
      const p = produk.find(x => x.id === d.produk_id)!;
      await supabase.from("stok_barang").update({ jumlah_stok: p.jumlah_stok - d.qty }).eq("id", p.id);
      await supabase.from("mutasi_stok").insert([{ produk_id: p.id, tipe: "Keluar", jumlah: d.qty, keterangan: `Shopee - ${toko.find(t => t.id === parseInt(selectedToko))?.nama}` }]);
    }

    const msg = gagal.length > 0
      ? `${details.length} item berhasil (${rupiahFmt(totalNominal)}). ${gagal.length} gagal: ${gagal[0]}`
      : `${details.length} item berhasil! Total piutang: ${rupiahFmt(totalNominal)}`;
    showToast(msg, gagal.length > 0 ? "info" : "success");
    setInputShopee("");
    fetchData();
    setSubmitting(null);
  };

  // ── Action: Retur/Pembatalan ──
  const prosesRetur = async () => {
    if (!returTokoId || !returProdukId || !returQty) return showToast("Lengkapi semua field!", "error");
    const qty = parseInt(returQty);
    const p = produk.find(x => x.id === parseInt(returProdukId));
    if (!p) return showToast("Produk tidak ditemukan", "error");
    const nominal = p.harga_jual * qty;

    setSubmitting("retur");
    const { error } = await supabase.from("retur_shopee").insert([{
      toko_id: parseInt(returTokoId),
      produk_id: parseInt(returProdukId),
      qty,
      nominal,
      tipe: returTipe,
      stok_kembali: returStokKembali,
    }]);

    if (error) { showToast("Gagal catat retur: " + error.message, "error"); setSubmitting(null); return; }

    if (returStokKembali) {
      await supabase.from("stok_barang").update({ jumlah_stok: p.jumlah_stok + qty }).eq("id", p.id);
      await supabase.from("mutasi_stok").insert([{ produk_id: p.id, tipe: "Masuk", jumlah: qty, keterangan: `${returTipe} Shopee` }]);
    }

    showToast(`${returTipe} ${p.nama_produk} ×${qty} dicatat. Piutang berkurang ${rupiahFmt(nominal)}`);
    setReturTokoId(""); setReturProdukId(""); setReturQty(""); setReturStokKembali(true);
    fetchData();
    setSubmitting(null);
  };

  // ── Action: Pencairan Dana ──
  const prosesPencairan = async () => {
    if (!cairTokoId || !cairNominal) return showToast("Lengkapi semua field!", "error");
    const nominalCair = toAngka(cairNominal);
    const tokoData = piutangShopee.find(p => p.toko_id === parseInt(cairTokoId));
    if (!tokoData) return showToast("Toko tidak ditemukan", "error");
    if (tokoData.sisa_piutang <= 0) return showToast("Tidak ada piutang aktif untuk toko ini", "error");

    const nominalPiutang = tokoData.sisa_piutang;
    const selisih = nominalPiutang - nominalCair;

    setSubmitting("cair");
    const { error: errCair } = await supabase.from("pencairan_shopee").insert([{
      toko_id: parseInt(cairTokoId),
      nominal_cair: nominalCair,
      nominal_piutang: nominalPiutang,
      selisih,
    }]);

    if (errCair) { showToast("Gagal catat pencairan: " + errCair.message, "error"); setSubmitting(null); return; }

    // Dana cair → kas masuk
    await supabase.from("kas").insert([{
      tipe: "Masuk",
      kategori: "Shopee",
      nominal: nominalCair,
      keterangan: `Pencairan Shopee - ${tokoData.toko_nama}`,
    }]);

    // Selisih → kas keluar (fee shopee)
    if (selisih > 0) {
      await supabase.from("kas").insert([{
        tipe: "Keluar",
        kategori: "Fee Shopee",
        nominal: selisih,
        keterangan: `Fee/Potongan Shopee - ${tokoData.toko_nama}`,
      }]);
    }

    showToast(`Pencairan ${tokoData.toko_nama} berhasil! Dana: ${rupiahFmt(nominalCair)}, Fee: ${rupiahFmt(Math.max(selisih, 0))}`);
    setCairTokoId(""); setCairNominal("");
    fetchData();
    setSubmitting(null);
  };

  // ── Action: Penjualan Offline ──
  const prosesOffline = async () => {
    if (!offlineProdukId || !offlineQty) return showToast("Pilih produk & isi qty!", "error");
    const p = produk.find(x => x.id === parseInt(offlineProdukId));
    if (!p) return showToast("Produk tidak ditemukan", "error");
    const qty = parseInt(offlineQty);
    if (qty <= 0) return showToast("Qty harus lebih dari 0", "error");
    if (p.jumlah_stok < qty) return showToast(`Stok tidak cukup! Tersisa ${p.jumlah_stok}`, "error");
    if (offlineMetode === "Piutang" && !offlineNamaPelanggan.trim()) return showToast("Isi nama pelanggan!", "error");

    const total = p.harga_jual * qty;
    setSubmitting("offline");

    await supabase.from("stok_barang").update({ jumlah_stok: p.jumlah_stok - qty }).eq("id", p.id);
    await supabase.from("mutasi_stok").insert([{ produk_id: p.id, tipe: "Keluar", jumlah: qty, keterangan: "Offline" }]);

    if (offlineMetode === "Tunai") {
      await supabase.from("kas").insert([{ tipe: "Masuk", kategori: "Offline", nominal: total, keterangan: `Jual ${p.nama_produk} ×${qty}` }]);
    } else {
      await supabase.from("piutang").insert([{ nama_pelanggan: offlineNamaPelanggan.trim(), nominal: total, keterangan: `Hutang ${p.nama_produk} ×${qty}`, status: "Belum Lunas" }]);
    }

    showToast(`Jual ${p.nama_produk} ×${qty} = ${rupiahFmt(total)} via ${offlineMetode}`);
    setOfflineProdukId(""); setOfflineQty(""); setOfflineNamaPelanggan("");
    fetchData();
    setSubmitting(null);
  };

  // ── Action: Lunas Piutang Offline ──
  const lunaskanPiutang = async (pt: Piutang) => {
    const { error } = await supabase.from("piutang").update({ status: "Lunas" }).eq("id", pt.id);
    if (error) { showToast("Gagal update piutang", "error"); return; }
    await supabase.from("kas").insert([{ tipe: "Masuk", kategori: "Piutang", nominal: pt.nominal, keterangan: `Lunas: ${pt.nama_pelanggan}` }]);
    showToast(`Piutang ${pt.nama_pelanggan} lunas!`);
    fetchData();
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 14px", marginBottom: 8,
    background: "rgba(255,255,255,0.04)", border: `1.5px solid ${C.border}`,
    borderRadius: 8, color: C.text, fontFamily: C.fontSans, fontSize: 13,
    boxSizing: "border-box", outline: "none",
  };

  const totalPiutangShopee = piutangShopee.reduce((a, p) => a + Math.max(p.sisa_piutang, 0), 0);
  const totalPiutangOffline = piutangOffline.reduce((a, p) => a + p.nominal, 0);

  if (loading) return (
    <Sidebar>
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg }}>
        <div style={{ textAlign: "center", color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>◈</div>
          Memuat data...
        </div>
      </div>
    </Sidebar>
  );

  return (
    <Sidebar>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        input:focus, select:focus, textarea:focus { border-color: ${C.accent}80 !important; outline: none; }
        input::placeholder, textarea::placeholder { color: ${C.dim} !important; }
        select option { background: #1a1020; color: ${C.text}; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <ToastBar toast={toast} onClose={() => setToast(null)} />

      <div style={{ background: C.bg, minHeight: "100vh", padding: "32px 28px", fontFamily: C.fontSans, color: C.text }}>

        {/* Header */}
        <div style={{ marginBottom: 28, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: C.fontDisplay, fontSize: 28, color: "#f0eaff", fontWeight: 400 }}>
              Penjualan
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: C.muted, fontFamily: C.fontMono }}>
              Kelola orderan Shopee & penjualan offline
            </p>
          </div>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", background: C.accentDim, border: `1px solid ${C.accent}40`, borderRadius: 8, color: C.accent, fontWeight: 600, fontSize: 13, textDecoration: "none", fontFamily: C.fontSans, whiteSpace: "nowrap" }}>
            🏠 Home
          </a>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 28 }}>
          {[
            { label: "Piutang Shopee", value: rupiahFmt(totalPiutangShopee), color: C.yellow, icon: "🛍", sub: `${piutangShopee.filter(p => p.sisa_piutang > 0).length} toko aktif` },
            { label: "Piutang Offline", value: rupiahFmt(totalPiutangOffline), color: C.red, icon: "📝", sub: `${piutangOffline.length} pelanggan` },
            { label: "Total Toko Shopee", value: `${toko.length} toko`, color: C.accent, icon: "🏪", sub: "Aktif terdaftar" },
            { label: "Total Produk", value: `${produk.length} item`, color: C.green, icon: "📦", sub: "Di stok gudang" },
          ].map((s, i) => (
            <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 20px", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, right: 0, width: 70, height: 70, background: s.color + "12", borderRadius: "0 14px 0 80px" }} />
              <div style={{ fontSize: 18, marginBottom: 8 }}>{s.icon}</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#f0eaff", fontFamily: C.fontDisplay }}>{s.value}</div>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Tab Utama */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          {[
            { id: "shopee", label: "🛍 Shopee" },
            { id: "offline", label: "🏪 Offline" },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} style={{
              padding: "10px 24px", borderRadius: 10, border: "none", cursor: "pointer",
              fontFamily: C.fontSans, fontWeight: 600, fontSize: 14,
              background: activeTab === tab.id ? C.accent : C.card,
              color: activeTab === tab.id ? "#fff" : C.muted,
              transition: "all 0.15s",
            }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ══ TAB SHOPEE ══ */}
        {activeTab === "shopee" && (
          <div style={{ animation: "fadeUp 0.25s ease" }}>
            {/* Sub-tab */}
            <div style={{ display: "flex", gap: 4, marginBottom: 20, background: C.card, padding: 4, borderRadius: 10, width: "fit-content", border: `1px solid ${C.border}` }}>
              {[
                { id: "input", label: "Input Orderan" },
                { id: "piutang", label: "Piutang per Toko" },
                { id: "retur", label: "Retur / Batal" },
                { id: "pencairan", label: "Pencairan Dana" },
              ].map(t => (
                <button key={t.id} onClick={() => setActiveShopeeTab(t.id as any)} style={{
                  padding: "7px 16px", borderRadius: 7, border: "none", cursor: "pointer",
                  fontFamily: C.fontSans, fontWeight: 600, fontSize: 12,
                  background: activeShopeeTab === t.id ? C.accentDim : "transparent",
                  color: activeShopeeTab === t.id ? C.accent : C.muted,
                  transition: "all 0.15s",
                }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Input Orderan */}
            {activeShopeeTab === "input" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
                  <h3 style={{ margin: "0 0 18px", fontFamily: C.fontDisplay, fontSize: 16, color: "#f0eaff", fontWeight: 400 }}>
                    Input Orderan Shopee
                  </h3>
                  <label style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Pilih Toko</label>
                  <select value={selectedToko} onChange={e => setSelectedToko(e.target.value)} style={inputStyle}>
                    <option value="">— Pilih Toko —</option>
                    {toko.map(t => <option key={t.id} value={t.id}>{t.nama}</option>)}
                  </select>
                  <label style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6, marginTop: 8 }}>
                    Paste Orderan (Nama Produk ⇥ Qty, per baris)
                  </label>
                  <textarea
                    value={inputShopee}
                    onChange={e => setInputShopee(e.target.value)}
                    placeholder={"Sabun Mandi\t10\nLotion Azalea\t5\nScrub Wajah\t3"}
                    style={{ ...inputStyle, height: 160, resize: "vertical", fontFamily: C.fontMono, fontSize: 12 }}
                  />
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 12, fontFamily: C.fontMono }}>
                    {inputShopee.split("\n").filter(l => l.trim()).length} baris terdeteksi
                  </div>
                  <button
                    onClick={prosesOrderanShopee}
                    disabled={submitting === "shopee"}
                    style={{ width: "100%", padding: "12px", border: "none", borderRadius: 8, background: submitting === "shopee" ? C.dim : `linear-gradient(135deg, #7c3aed, ${C.accent})`, color: "#fff", fontWeight: 700, cursor: submitting === "shopee" ? "not-allowed" : "pointer", fontFamily: C.fontMono, fontSize: 13, boxShadow: `0 4px 16px ${C.accent}33` }}
                  >
                    {submitting === "shopee" ? "Memproses..." : "✂ Potong Stok & Catat Piutang"}
                  </button>
                </div>

                {/* Ringkasan stok produk */}
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
                  <h3 style={{ margin: "0 0 16px", fontFamily: C.fontDisplay, fontSize: 16, color: "#f0eaff", fontWeight: 400 }}>Stok Saat Ini</h3>
                  <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                    {produk.map(p => (
                      <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderRadius: 8, background: p.jumlah_stok < 10 ? "#f8717110" : "rgba(255,255,255,0.02)", border: `1px solid ${p.jumlah_stok < 10 ? C.red + "30" : C.border}` }}>
                        <span style={{ fontSize: 12, color: C.textMid }}>{p.nama_produk}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: p.jumlah_stok < 10 ? C.red : C.green, fontFamily: C.fontMono }}>{p.jumlah_stok}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Piutang per Toko */}
            {activeShopeeTab === "piutang" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
                {piutangShopee.map(p => (
                  <div key={p.toko_id} style={{ background: C.card, border: `1px solid ${p.sisa_piutang > 0 ? C.yellow + "50" : C.border}`, borderRadius: 14, padding: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                      <span style={{ fontFamily: C.fontDisplay, fontSize: 16, color: "#f0eaff" }}>{p.toko_nama}</span>
                      {p.sisa_piutang > 0 && <span style={{ fontSize: 10, background: C.yellow + "20", color: C.yellow, padding: "3px 8px", borderRadius: 4, fontFamily: C.fontMono, fontWeight: 700 }}>AKTIF</span>}
                    </div>
                    {[
                      { label: "Total Orderan", val: p.total_piutang, color: C.text },
                      { label: "Retur/Batal", val: p.total_retur, color: C.red },
                      { label: "Sudah Cair", val: p.total_cair, color: C.green },
                    ].map(row => (
                      <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
                        <span style={{ fontSize: 12, color: C.muted }}>{row.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: row.color, fontFamily: C.fontMono }}>{rupiahFmt(row.val)}</span>
                      </div>
                    ))}
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Sisa Piutang</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: p.sisa_piutang > 0 ? C.yellow : C.green, fontFamily: C.fontMono }}>{rupiahFmt(Math.max(p.sisa_piutang, 0))}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Retur / Batal */}
            {activeShopeeTab === "retur" && (
              <div style={{ display: "grid", gridTemplateColumns: "400px 1fr", gap: 20 }}>
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
                  <h3 style={{ margin: "0 0 18px", fontFamily: C.fontDisplay, fontSize: 16, color: "#f0eaff", fontWeight: 400 }}>
                    Catat Retur / Pembatalan
                  </h3>
                  <label style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Tipe</label>
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    {["Pembatalan", "Retur"].map(t => (
                      <button key={t} onClick={() => setReturTipe(t as any)} style={{ flex: 1, padding: "9px", border: `1px solid ${returTipe === t ? C.accent : C.border}`, borderRadius: 8, background: returTipe === t ? C.accentDim : "transparent", color: returTipe === t ? C.accent : C.muted, fontFamily: C.fontSans, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>{t}</button>
                    ))}
                  </div>
                  <select value={returTokoId} onChange={e => setReturTokoId(e.target.value)} style={inputStyle}>
                    <option value="">— Pilih Toko —</option>
                    {toko.map(t => <option key={t.id} value={t.id}>{t.nama}</option>)}
                  </select>
                  <select value={returProdukId} onChange={e => setReturProdukId(e.target.value)} style={inputStyle}>
                    <option value="">— Pilih Produk —</option>
                    {produk.map(p => <option key={p.id} value={p.id}>{p.nama_produk} (stok: {p.jumlah_stok})</option>)}
                  </select>
                  <input type="number" min="1" value={returQty} onChange={e => setReturQty(e.target.value)} placeholder="Qty" style={inputStyle} />
                  {returProdukId && returQty && (
                    <div style={{ background: C.red + "15", border: `1px solid ${C.red}30`, borderRadius: 8, padding: "10px 12px", marginBottom: 10, fontSize: 12, color: C.red, fontFamily: C.fontMono }}>
                      Piutang berkurang: {rupiahFmt((produk.find(p => p.id === parseInt(returProdukId))?.harga_jual || 0) * parseInt(returQty || "0"))}
                    </div>
                  )}
                  <label style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 8 }}>Stok Barang Kembali?</label>
                  <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                    {[{ val: true, label: "Ya, masuk stok" }, { val: false, label: "Tidak (rusak/hilang)" }].map(opt => (
                      <button key={String(opt.val)} onClick={() => setReturStokKembali(opt.val)} style={{ flex: 1, padding: "9px", border: `1px solid ${returStokKembali === opt.val ? C.green : C.border}`, borderRadius: 8, background: returStokKembali === opt.val ? C.green + "20" : "transparent", color: returStokKembali === opt.val ? C.green : C.muted, fontFamily: C.fontSans, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>{opt.label}</button>
                    ))}
                  </div>
                  <button onClick={prosesRetur} disabled={submitting === "retur"} style={{ width: "100%", padding: "12px", border: "none", borderRadius: 8, background: submitting === "retur" ? C.dim : `linear-gradient(135deg, #dc2626, ${C.red})`, color: "#fff", fontWeight: 700, cursor: submitting === "retur" ? "not-allowed" : "pointer", fontFamily: C.fontMono, fontSize: 13 }}>
                    {submitting === "retur" ? "Menyimpan..." : "↩ Catat Retur / Pembatalan"}
                  </button>
                </div>

                {/* Riwayat Retur */}
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
                  <h3 style={{ margin: "0 0 16px", fontFamily: C.fontDisplay, fontSize: 16, color: "#f0eaff", fontWeight: 400 }}>Riwayat Retur</h3>
                  <div style={{ maxHeight: 400, overflowY: "auto" }}>
                    {returList.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "40px 0", color: C.muted, fontFamily: C.fontMono, fontSize: 12 }}>Belum ada retur</div>
                    ) : returList.map(r => (
                      <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.textMid }}>{r.nama_produk} ×{r.qty}</div>
                          <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{r.nama_toko} · {r.tipe} · {tanggalFmt(r.created_at)}</div>
                          <div style={{ fontSize: 10, color: r.stok_kembali ? C.green : C.red, fontFamily: C.fontMono }}>{r.stok_kembali ? "✓ Stok kembali" : "✗ Stok tidak kembali"}</div>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.red, fontFamily: C.fontMono }}>-{rupiahFmt(r.nominal)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Pencairan Dana */}
            {activeShopeeTab === "pencairan" && (
              <div style={{ display: "grid", gridTemplateColumns: "400px 1fr", gap: 20 }}>
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
                  <h3 style={{ margin: "0 0 18px", fontFamily: C.fontDisplay, fontSize: 16, color: "#f0eaff", fontWeight: 400 }}>
                    Input Pencairan Dana Shopee
                  </h3>
                  <select value={cairTokoId} onChange={e => { setCairTokoId(e.target.value); setCairNominal(""); }} style={inputStyle}>
                    <option value="">— Pilih Toko —</option>
                    {piutangShopee.filter(p => p.sisa_piutang > 0).map(p => (
                      <option key={p.toko_id} value={p.toko_id}>{p.toko_nama} — piutang {rupiahFmt(p.sisa_piutang)}</option>
                    ))}
                  </select>
                  {cairTokoId && (
                    <div style={{ background: C.yellow + "15", border: `1px solid ${C.yellow}30`, borderRadius: 8, padding: "10px 14px", marginBottom: 10, fontSize: 12, fontFamily: C.fontMono }}>
                      <div style={{ color: C.muted, marginBottom: 4 }}>Piutang aktif toko ini:</div>
                      <div style={{ color: C.yellow, fontWeight: 700, fontSize: 14 }}>
                        {rupiahFmt(piutangShopee.find(p => p.toko_id === parseInt(cairTokoId))?.sisa_piutang || 0)}
                      </div>
                    </div>
                  )}
                  <input
                    type="text"
                    value={cairNominal}
                    onChange={e => setCairNominal(formatIDR(e.target.value))}
                    placeholder="Nominal dana yang cair (Rp)"
                    style={inputStyle}
                  />
                  {cairTokoId && cairNominal && (
                    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px", marginBottom: 12 }}>
                      {(() => {
                        const piutang = piutangShopee.find(p => p.toko_id === parseInt(cairTokoId))?.sisa_piutang || 0;
                        const cair = toAngka(cairNominal);
                        const selisih = piutang - cair;
                        return (
                          <>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                              <span style={{ fontSize: 12, color: C.muted }}>Dana masuk kas</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: C.green, fontFamily: C.fontMono }}>{rupiahFmt(cair)}</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span style={{ fontSize: 12, color: C.muted }}>Fee/Potongan Shopee</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: selisih > 0 ? C.red : C.green, fontFamily: C.fontMono }}>{rupiahFmt(Math.max(selisih, 0))}</span>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}
                  <button onClick={prosesPencairan} disabled={submitting === "cair"} style={{ width: "100%", padding: "12px", border: "none", borderRadius: 8, background: submitting === "cair" ? C.dim : `linear-gradient(135deg, #065f46, ${C.green})`, color: "#fff", fontWeight: 700, cursor: submitting === "cair" ? "not-allowed" : "pointer", fontFamily: C.fontMono, fontSize: 13 }}>
                    {submitting === "cair" ? "Memproses..." : "💰 Catat Pencairan Dana"}
                  </button>
                </div>

                {/* Riwayat Pencairan */}
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
                  <h3 style={{ margin: "0 0 16px", fontFamily: C.fontDisplay, fontSize: 16, color: "#f0eaff", fontWeight: 400 }}>Riwayat Pencairan</h3>
                  <div style={{ maxHeight: 400, overflowY: "auto" }}>
                    {pencairanList.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "40px 0", color: C.muted, fontFamily: C.fontMono, fontSize: 12 }}>Belum ada pencairan</div>
                    ) : pencairanList.map(p => (
                      <div key={p.id} style={{ padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: C.textMid }}>{p.nama_toko}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: C.green, fontFamily: C.fontMono }}>+{rupiahFmt(p.nominal_cair)}</span>
                        </div>
                        <div style={{ display: "flex", gap: 16 }}>
                          <span style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>Piutang: {rupiahFmt(p.nominal_piutang)}</span>
                          <span style={{ fontSize: 11, color: C.red, fontFamily: C.fontMono }}>Fee: {rupiahFmt(p.selisih)}</span>
                          <span style={{ fontSize: 11, color: C.dim, fontFamily: C.fontMono }}>{tanggalFmt(p.created_at)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ TAB OFFLINE ══ */}
        {activeTab === "offline" && (
          <div style={{ animation: "fadeUp 0.25s ease", display: "grid", gridTemplateColumns: "420px 1fr", gap: 20 }}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
              <h3 style={{ margin: "0 0 18px", fontFamily: C.fontDisplay, fontSize: 16, color: "#f0eaff", fontWeight: 400 }}>
                Penjualan Offline
              </h3>
              <select value={offlineProdukId} onChange={e => setOfflineProdukId(e.target.value)} style={inputStyle}>
                <option value="">— Pilih Produk —</option>
                {produk.map(p => <option key={p.id} value={p.id}>{p.nama_produk} — {rupiahFmt(p.harga_jual)} (stok: {p.jumlah_stok})</option>)}
              </select>
              <input type="number" min="1" value={offlineQty} onChange={e => setOfflineQty(e.target.value)} placeholder="Qty" style={inputStyle} />
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                {["Tunai", "Piutang"].map(m => (
                  <button key={m} onClick={() => setOfflineMetode(m)} style={{ flex: 1, padding: "9px", border: `1px solid ${offlineMetode === m ? C.accent : C.border}`, borderRadius: 8, background: offlineMetode === m ? C.accentDim : "transparent", color: offlineMetode === m ? C.accent : C.muted, fontFamily: C.fontSans, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                    {m === "Tunai" ? "💵 Tunai" : "📝 Piutang"}
                  </button>
                ))}
              </div>
              {offlineMetode === "Piutang" && (
                <input type="text" value={offlineNamaPelanggan} onChange={e => setOfflineNamaPelanggan(e.target.value)} placeholder="Nama Pelanggan" style={inputStyle} />
              )}
              {offlineProdukId && offlineQty && (
                <div style={{ background: C.green + "15", border: `1px solid ${C.green}30`, borderRadius: 8, padding: "10px 12px", marginBottom: 10, fontSize: 13, fontWeight: 700, color: C.green, fontFamily: C.fontMono }}>
                  Total: {rupiahFmt((produk.find(p => p.id === parseInt(offlineProdukId))?.harga_jual || 0) * parseInt(offlineQty || "0"))}
                </div>
              )}
              <button onClick={prosesOffline} disabled={submitting === "offline"} style={{ width: "100%", padding: "12px", border: "none", borderRadius: 8, background: submitting === "offline" ? C.dim : `linear-gradient(135deg, #7c3aed, ${C.accent})`, color: "#fff", fontWeight: 700, cursor: submitting === "offline" ? "not-allowed" : "pointer", fontFamily: C.fontMono, fontSize: 13, boxShadow: `0 4px 16px ${C.accent}33` }}>
                {submitting === "offline" ? "Memproses..." : "💳 Proses Penjualan"}
              </button>
            </div>

            {/* Piutang Offline */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
              <h3 style={{ margin: "0 0 16px", fontFamily: C.fontDisplay, fontSize: 16, color: "#f0eaff", fontWeight: 400 }}>
                Piutang Offline Aktif
                <span style={{ marginLeft: 8, fontSize: 12, color: C.red, fontFamily: C.fontMono }}>{rupiahFmt(totalPiutangOffline)}</span>
              </h3>
              {piutangOffline.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: C.green, fontSize: 13, fontFamily: C.fontMono }}>Tidak ada piutang aktif 🎉</div>
              ) : (
                <div style={{ maxHeight: 400, overflowY: "auto" }}>
                  {piutangOffline.map(pt => (
                    <div key={pt.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.textMid }}>{pt.nama_pelanggan}</div>
                        <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{pt.keterangan}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.red, fontFamily: C.fontMono }}>{rupiahFmt(pt.nominal)}</div>
                      </div>
                      <button onClick={() => lunaskanPiutang(pt)} style={{ background: C.green + "15", color: C.green, border: `1px solid ${C.green}30`, padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: C.fontMono, whiteSpace: "nowrap" }}>
                        ✓ Lunas
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Sidebar>
  );
}
