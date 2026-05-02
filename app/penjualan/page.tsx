"use client";

import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import Sidebar from "@/components/Sidebar";
import { ShopeeUploadTab } from "@/components/ShopeeUploadTab";

// ── Types ──
type Toko = { id: number; nama: string; aktif: boolean };
type Produk = { id: number; nama_produk: string; jumlah_stok: number; harga_jual: number; satuan: string };
type PiutangShopee = { toko_id: number; toko_nama: string; total_piutang: number; total_retur: number; total_fee: number; total_cair: number; sisa_piutang: number };
type ReturShopee = { id: number; toko_id: number; produk_id: number; qty: number; nominal: number; tipe: string; stok_kembali: boolean; created_at: string; nama_produk?: string; nama_toko?: string };
type PencairanShopee = { id: number; toko_id: number; nominal_cair: number; nominal_piutang: number; selisih: number; created_at: string; nama_toko?: string };
type Piutang = { id: number; nama_pelanggan: string; nominal: number; keterangan: string; status: string };
type KeranjangItem = { produk_id: number; nama_produk: string; harga_jual: number; qty: number; subtotal: number; harga_khusus: boolean };
type PelangganOffline = { id: number; nama: string; telepon: string | null };
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
  const [pelangganMaster, setPelangganMaster] = useState<PelangganOffline[]>([]);

  // Harga khusus: map produk_id → harga (dari tabel pelanggan_harga)
  const [pelangganHarga, setPelangganHarga] = useState<Record<number, number>>({});
  const [loadingHarga, setLoadingHarga] = useState(false);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

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
  const [keranjang, setKeranjang] = useState<KeranjangItem[]>([]);
  const [offlineProdukId, setOfflineProdukId] = useState("");
  const [offlineQty, setOfflineQty] = useState("");
  const [offlineMetode, setOfflineMetode] = useState("Tunai");
  const [offlineNamaPelanggan, setOfflineNamaPelanggan] = useState("");
  const [offlinePelangganId, setOfflinePelangganId] = useState("");

  const totalKeranjang = keranjang.reduce((a, k) => a + k.subtotal, 0);

  const showToast = (msg: string, type: Toast["type"] = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Fetch harga khusus dari tabel pelanggan_harga ──
  const fetchHargaPelanggan = useCallback(async (pelangganId: number) => {
    setLoadingHarga(true);
    try {
      const { data, error } = await supabase
        .from("pelanggan_harga")
        .select("produk_id, harga")
        .eq("pelanggan_id", pelangganId);
      if (error) throw error;
      const map: Record<number, number> = {};
      (data || []).forEach((row: { produk_id: number; harga: number }) => {
        map[row.produk_id] = row.harga;
      });
      setPelangganHarga(map);
    } catch (err) {
      console.error("Gagal fetch harga pelanggan:", err);
      setPelangganHarga({});
    } finally {
      setLoadingHarga(false);
    }
  }, []);

  // ── Pilih pelanggan dari dropdown ──
  const handlePilihPelanggan = useCallback(async (val: string) => {
    setOfflinePelangganId(val);
    setKeranjang([]); // reset keranjang karena harga bisa berubah
    if (val === "baru") {
      setOfflineNamaPelanggan("");
      setPelangganHarga({});
    } else if (val) {
      const p = pelangganMaster.find(x => String(x.id) === val);
      setOfflineNamaPelanggan(p?.nama || "");
      await fetchHargaPelanggan(parseInt(val));
    } else {
      setOfflineNamaPelanggan("");
      setPelangganHarga({});
    }
  }, [pelangganMaster, fetchHargaPelanggan]);

  // ── Tambah ke keranjang — pakai harga khusus jika ada, fallback harga master ──
  const tambahKeranjang = () => {
    if (!offlineProdukId || !offlineQty) return showToast("Pilih produk & isi qty!", "error");
    const p = produk.find(x => x.id === parseInt(offlineProdukId));
    if (!p) return showToast("Produk tidak ditemukan", "error");
    const qty = parseInt(offlineQty);
    if (qty <= 0) return showToast("Qty harus lebih dari 0", "error");
    const qtyDiKeranjang = keranjang.find(k => k.produk_id === p.id)?.qty || 0;
    if (p.jumlah_stok < qtyDiKeranjang + qty) {
      return showToast(`Stok tidak cukup! Tersisa ${p.jumlah_stok - qtyDiKeranjang}`, "error");
    }

    // Pakai harga khusus pelanggan jika ada, fallback ke harga master
    const hargaEfektif = pelangganHarga[p.id] ?? p.harga_jual;
    const isKhusus = pelangganHarga[p.id] !== undefined;

    setKeranjang(prev => {
      const existing = prev.find(k => k.produk_id === p.id);
      if (existing) {
        return prev.map(k => k.produk_id === p.id
          ? { ...k, qty: k.qty + qty, subtotal: (k.qty + qty) * k.harga_jual }
          : k
        );
      }
      return [...prev, {
        produk_id: p.id,
        nama_produk: p.nama_produk,
        harga_jual: hargaEfektif,
        qty,
        subtotal: hargaEfektif * qty,
        harga_khusus: isKhusus,
      }];
    });
    setOfflineProdukId(""); setOfflineQty("");
  };

  const hapusKeranjang = (produk_id: number) => setKeranjang(prev => prev.filter(k => k.produk_id !== produk_id));

  // ── Fetch semua data ──
  const fetchData = useCallback(async () => {
    try {
      const [resToko, resProduk, resPenjualan, resRetur, resPencairan, resPiutangOffline, resFee, resPelanggan] = await Promise.all([
        supabase.from("toko_online").select("*").eq("aktif", true).order("id"),
        supabase.from("stok_barang").select("*").order("nama_produk"),
        supabase.from("penjualan_online").select("toko_id, total_nominal, total_ditarik, status"),
        supabase.from("retur_online").select("*, stok_barang(nama_produk), toko_online(nama)").order("created_at", { ascending: false }).limit(50),
        supabase.from("pencairan_online").select("*, toko_online(nama)").order("created_at", { ascending: false }).limit(50),
        supabase.from("piutang").select("*").eq("status", "Belum Lunas").order("created_at", { ascending: false }),
        supabase.from("fee_platform").select("toko_id, total_fee"),
        supabase.from("pelanggan_offline").select("id, nama, telepon").order("nama"),
      ]);

      setToko(resToko.data || []);
      setProduk(resProduk.data || []);
      setPelangganMaster(resPelanggan.data || []);

      const penjualanData = resPenjualan.data || [];
      const returData = resRetur.data || [];
      const pencairanData = resPencairan.data || [];
      const feeData = resFee.data || [];
      const tokoList = resToko.data || [];

      const piutangPerToko: PiutangShopee[] = tokoList.map((t: Toko) => {
        const penjualanToko = penjualanData.filter((p: any) => p.toko_id === t.id);
        const totalPiutang = penjualanToko.reduce((a: number, p: any) => a + Math.round(p.total_nominal || 0), 0);
        const totalDitarik = penjualanToko.reduce((a: number, p: any) => a + Math.round(p.total_ditarik || 0), 0);
        const totalRetur = returData.filter((r: any) => r.toko_id === t.id).reduce((a: number, r: any) => a + Math.round(r.nominal || 0), 0);
        const totalFee = feeData.filter((f: any) => f.toko_id === t.id).reduce((a: number, f: any) => a + Math.round(f.total_fee || 0), 0);
        const sisaPiutang = totalPiutang - totalRetur - totalFee - totalDitarik;
        return { toko_id: t.id, toko_nama: t.nama, total_piutang: totalPiutang, total_retur: totalRetur, total_fee: totalFee, total_cair: totalDitarik, sisa_piutang: Math.max(0, sisaPiutang) };
      });

      setPiutangShopee(piutangPerToko);
      setReturList(returData.map((r: any) => ({ ...r, nama_produk: r.stok_barang?.nama_produk, nama_toko: r.toko_online?.nama })));
      setPencairanList(pencairanData.map((p: any) => ({ ...p, nama_toko: p.toko_online?.nama })));
      setPiutangOffline(resPiutangOffline.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalPiutangShopee = piutangShopee.reduce((a, p) => a + p.sisa_piutang, 0);
  const totalPiutangOffline = piutangOffline.reduce((a, p) => a + p.nominal, 0);

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", background: "#120e1e",
    border: `1px solid ${C.border}`, borderRadius: 8, color: C.text,
    fontFamily: C.fontSans, fontSize: 13, outline: "none", boxSizing: "border-box",
    marginBottom: 8,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 10, color: C.muted, fontFamily: C.fontMono,
    letterSpacing: "0.1em", textTransform: "uppercase" as const,
    display: "block", marginBottom: 6,
  };

  // ── RETUR ──
  const prosesRetur = async () => {
    if (!returTokoId || !returProdukId || !returQty) return showToast("Lengkapi semua field retur!", "error");
    setSubmitting("retur");
    try {
      const p = produk.find(x => x.id === parseInt(returProdukId));
      if (!p) throw new Error("Produk tidak ditemukan");
      const qty = parseInt(returQty);
      const nominal = p.harga_jual * qty;
      await supabase.from("retur_online").insert([{ toko_id: parseInt(returTokoId), produk_id: parseInt(returProdukId), qty, nominal, tipe: returTipe, stok_kembali: returStokKembali }]);
      if (returStokKembali) {
        await supabase.from("stok_barang").update({ jumlah_stok: p.jumlah_stok + qty }).eq("id", p.id);
        await supabase.from("mutasi_stok").insert([{ stok_barang_id: p.id, tipe: "Masuk", qty, keterangan: `Retur ${returTipe}` }]);
      }
      showToast(`Retur ${p.nama_produk} ×${qty} berhasil!`);
      setReturTokoId(""); setReturProdukId(""); setReturQty("");
      fetchData();
    } catch (err: any) {
      showToast(err.message || "Gagal proses retur", "error");
    } finally {
      setSubmitting(null);
    }
  };

  // ── PENCAIRAN ──
  const prosesPencairan = async () => {
    if (!cairTokoId || !cairNominal) return showToast("Pilih toko & isi nominal!", "error");
    setSubmitting("cair");
    try {
      const nominalCair = toAngka(cairNominal);
      if (nominalCair <= 0) throw new Error("Nominal harus lebih dari 0");
      const tokoData = piutangShopee.find(p => p.toko_id === parseInt(cairTokoId));
      if (!tokoData) throw new Error("Data toko tidak ditemukan");
      if (nominalCair > tokoData.sisa_piutang) throw new Error(`Nominal melebihi sisa piutang (${rupiahFmt(tokoData.sisa_piutang)})`);
      await supabase.from("pencairan_online").insert([{ toko_id: parseInt(cairTokoId), nominal_cair: nominalCair, nominal_piutang: tokoData.sisa_piutang, selisih: tokoData.sisa_piutang - nominalCair }]);
      let sisaCair = nominalCair;
      const penjualanToko = await supabase.from("penjualan_online").select("*").eq("toko_id", parseInt(cairTokoId)).neq("status", "Lunas").order("created_at", { ascending: true });
      for (const pj of (penjualanToko.data || [])) {
        if (sisaCair <= 0) break;
        const sisaPiutangBaris = pj.total_nominal - pj.total_ditarik;
        const ditarikSekarang = Math.min(sisaCair, sisaPiutangBaris);
        await supabase.from("penjualan_online").update({ total_ditarik: pj.total_ditarik + ditarikSekarang, status: (pj.total_ditarik + ditarikSekarang) >= pj.total_nominal ? "Lunas" : "Sebagian" }).eq("id", pj.id);
        sisaCair -= ditarikSekarang;
      }
      await supabase.from("kas").insert([{ tipe: "Masuk", kategori: "Shopee", nominal: nominalCair, keterangan: `Pencairan Shopee - ${tokoData.toko_nama}` }]);
      showToast(`Pencairan ${tokoData.toko_nama} berhasil! Dana: ${rupiahFmt(nominalCair)}`);
      setCairTokoId(""); setCairNominal("");
      fetchData();
    } catch (err: any) {
      showToast(err.message || "Gagal catat pencairan", "error");
    } finally {
      setSubmitting(null);
    }
  };

  // ── PENJUALAN OFFLINE ──
  const prosesOffline = async () => {
    if (keranjang.length === 0) return showToast("Keranjang kosong!", "error");
    if (offlineMetode === "Piutang" && !offlineNamaPelanggan.trim()) return showToast("Pilih atau isi nama pelanggan!", "error");
    setSubmitting("offline");
    for (const item of keranjang) {
      const p = produk.find(x => x.id === item.produk_id);
      if (!p) continue;
      await supabase.from("stok_barang").update({ jumlah_stok: p.jumlah_stok - item.qty }).eq("id", p.id);
      await supabase.from("mutasi_stok").insert([{ stok_barang_id: p.id, tipe: "Keluar", qty: item.qty, keterangan: "Penjualan Offline" }]);
    }
    const keterangan = keranjang.map(k => `${k.nama_produk} ×${k.qty}`).join(", ");
    if (offlineMetode === "Tunai") {
      await supabase.from("kas").insert([{ tipe: "Masuk", kategori: "Offline", nominal: totalKeranjang, keterangan }]);
    } else {
      await supabase.from("piutang").insert([{ nama_pelanggan: offlineNamaPelanggan.trim(), nominal: totalKeranjang, keterangan, status: "Belum Lunas" }]);
    }
    showToast(`${keranjang.length} item terjual = ${rupiahFmt(totalKeranjang)} via ${offlineMetode}`);
    setKeranjang([]);
    setOfflineNamaPelanggan("");
    setOfflinePelangganId("");
    setOfflineProdukId("");
    setOfflineQty("");
    setPelangganHarga({});
    fetchData();
    setSubmitting(null);
  };

  const lunaskanPiutang = async (pt: Piutang) => {
    const { error } = await supabase.from("piutang").update({ status: "Lunas" }).eq("id", pt.id);
    if (error) { showToast("Gagal update piutang", "error"); return; }
    await supabase.from("kas").insert([{ tipe: "Masuk", kategori: "Piutang", nominal: pt.nominal, keterangan: `Lunas: ${pt.nama_pelanggan}` }]);
    showToast(`Piutang ${pt.nama_pelanggan} lunas!`);
    fetchData();
  };

  if (loading) return (
    <Sidebar>
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg }}>
        <div style={{ color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>Memuat data...</div>
      </div>
    </Sidebar>
  );

  return (
    <Sidebar>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        select option { background: #1a1020; color: #e2d9f3; }
      `}</style>

      <ToastBar toast={toast} onClose={() => setToast(null)} />

      <div style={{ background: C.bg, minHeight: "100vh", padding: "32px 28px", fontFamily: C.fontSans, color: C.text }}>

        {/* Header */}
        <div style={{ marginBottom: 28, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: C.fontDisplay, fontSize: 28, color: "#f0eaff", fontWeight: 400 }}>Penjualan</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: C.muted, fontFamily: C.fontMono }}>Kelola orderan Shopee & penjualan offline</p>
          </div>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", background: C.accentDim, border: `1px solid ${C.accent}40`, borderRadius: 8, color: C.accent, fontWeight: 600, fontSize: 13, textDecoration: "none", fontFamily: C.fontSans, whiteSpace: "nowrap" }}>
            🏠 Home
          </a>
        </div>

        {/* Summary Cards */}
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

        {/* Tab utama */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          {[{ id: "shopee", label: "🛍 Shopee" }, { id: "offline", label: "🏪 Offline" }].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} style={{
              padding: "10px 24px", borderRadius: 10, border: "none", cursor: "pointer",
              fontFamily: C.fontSans, fontWeight: 600, fontSize: 14,
              background: activeTab === tab.id ? C.accent : C.card,
              color: activeTab === tab.id ? "#fff" : C.muted,
              transition: "all 0.15s",
            }}>{tab.label}</button>
          ))}
        </div>

        {/* ══ TAB SHOPEE ══ */}
        {activeTab === "shopee" && (
          <div style={{ animation: "fadeUp 0.25s ease" }}>
            <div style={{ display: "flex", gap: 4, marginBottom: 20, background: C.card, padding: 4, borderRadius: 10, width: "fit-content", border: `1px solid ${C.border}` }}>
              {[
                { id: "input", label: "📤 Input Orderan" },
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
                }}>{t.label}</button>
              ))}
            </div>

            {activeShopeeTab === "input" && <ShopeeUploadTab />}

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
                      { label: "Fee Platform", val: p.total_fee, color: C.orange },
                      { label: "Sudah Cair", val: p.total_cair, color: C.green },
                    ].map(row => (
                      <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
                        <span style={{ fontSize: 12, color: C.muted }}>{row.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: row.color, fontFamily: C.fontMono }}>{rupiahFmt(row.val)}</span>
                      </div>
                    ))}
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Sisa Piutang</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: p.sisa_piutang > 0 ? C.yellow : C.muted, fontFamily: C.fontMono }}>{rupiahFmt(p.sisa_piutang)}</span>
                    </div>
                  </div>
                ))}
                {piutangShopee.length === 0 && <div style={{ color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>Belum ada data piutang.</div>}
              </div>
            )}

            {activeShopeeTab === "retur" && (
              <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 24 }}>
                <div style={{ background: C.card, borderRadius: 14, padding: 20, border: `1px solid ${C.border}` }}>
                  <h3 style={{ margin: "0 0 16px", fontFamily: C.fontDisplay, fontSize: 18, color: "#f0eaff", fontWeight: 400 }}>Input Retur / Batal</h3>
                  <label style={labelStyle}>Toko</label>
                  <select value={returTokoId} onChange={e => setReturTokoId(e.target.value)} style={inputStyle}>
                    <option value="">— Pilih Toko —</option>
                    {toko.map(t => <option key={t.id} value={t.id}>{t.nama}</option>)}
                  </select>
                  <label style={labelStyle}>Produk</label>
                  <select value={returProdukId} onChange={e => setReturProdukId(e.target.value)} style={inputStyle}>
                    <option value="">— Pilih Produk —</option>
                    {produk.map(p => <option key={p.id} value={p.id}>{p.nama_produk}</option>)}
                  </select>
                  <label style={labelStyle}>Qty</label>
                  <input type="number" min="1" value={returQty} onChange={e => setReturQty(e.target.value)} placeholder="1" style={inputStyle} />
                  <label style={labelStyle}>Tipe</label>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    {(["Pembatalan", "Retur"] as const).map(t => (
                      <button key={t} onClick={() => setReturTipe(t)} style={{ flex: 1, padding: "9px", border: `1px solid ${returTipe === t ? C.accent : C.border}`, borderRadius: 8, background: returTipe === t ? C.accentDim : "transparent", color: returTipe === t ? C.accent : C.muted, fontFamily: C.fontSans, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>{t}</button>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                    {[{ val: true, label: "Stok Kembali" }, { val: false, label: "Stok Tidak Kembali" }].map(o => (
                      <button key={String(o.val)} onClick={() => setReturStokKembali(o.val)} style={{ flex: 1, padding: "9px", border: `1px solid ${returStokKembali === o.val ? C.green : C.border}`, borderRadius: 8, background: returStokKembali === o.val ? C.green + "20" : "transparent", color: returStokKembali === o.val ? C.green : C.muted, fontFamily: C.fontSans, fontWeight: 600, fontSize: 11, cursor: "pointer" }}>{o.label}</button>
                    ))}
                  </div>
                  <button onClick={prosesRetur} disabled={submitting === "retur"} style={{ width: "100%", padding: "11px", border: "none", borderRadius: 8, background: `linear-gradient(135deg, #7c3aed, ${C.accent})`, color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: C.fontMono, fontSize: 13, boxShadow: `0 4px 16px ${C.accent}33` }}>
                    {submitting === "retur" ? "Memproses..." : "✓ Catat Retur"}
                  </button>
                </div>
                <div style={{ background: C.card, borderRadius: 14, padding: 20, border: `1px solid ${C.border}` }}>
                  <h3 style={{ margin: "0 0 16px", fontFamily: C.fontDisplay, fontSize: 18, color: "#f0eaff", fontWeight: 400 }}>Riwayat Retur</h3>
                  {returList.length === 0 ? <div style={{ color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>Belum ada retur.</div> : returList.map(r => (
                    <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.textMid }}>{r.nama_produk || `Produk #${r.produk_id}`} ×{r.qty}</div>
                        <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{r.nama_toko} · {r.tipe} · {tanggalFmt(r.created_at)}</div>
                      </div>
                      <div style={{ fontSize: 12, color: C.red, fontFamily: C.fontMono, fontWeight: 700 }}>-{rupiahFmt(r.nominal)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeShopeeTab === "pencairan" && (
              <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 24 }}>
                <div style={{ background: C.card, borderRadius: 14, padding: 20, border: `1px solid ${C.border}` }}>
                  <h3 style={{ margin: "0 0 16px", fontFamily: C.fontDisplay, fontSize: 18, color: "#f0eaff", fontWeight: 400 }}>Catat Pencairan</h3>
                  <label style={labelStyle}>Toko</label>
                  <select value={cairTokoId} onChange={e => setCairTokoId(e.target.value)} style={inputStyle}>
                    <option value="">— Pilih Toko —</option>
                    {piutangShopee.filter(p => p.sisa_piutang > 0).map(p => (
                      <option key={p.toko_id} value={p.toko_id}>{p.toko_nama} — sisa {rupiahFmt(p.sisa_piutang)}</option>
                    ))}
                  </select>
                  <label style={labelStyle}>Nominal Cair</label>
                  <input value={cairNominal} onChange={e => setCairNominal(formatIDR(e.target.value))} placeholder="0" style={{ ...inputStyle, fontFamily: C.fontMono }} />
                  {cairTokoId && (
                    <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, marginBottom: 12 }}>
                      Sisa piutang: {rupiahFmt(piutangShopee.find(p => p.toko_id === parseInt(cairTokoId))?.sisa_piutang || 0)}
                    </div>
                  )}
                  <button onClick={prosesPencairan} disabled={submitting === "cair"} style={{ width: "100%", padding: "11px", border: "none", borderRadius: 8, background: `linear-gradient(135deg, #7c3aed, ${C.accent})`, color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: C.fontMono, fontSize: 13, boxShadow: `0 4px 16px ${C.accent}33` }}>
                    {submitting === "cair" ? "Memproses..." : "💰 Catat Pencairan"}
                  </button>
                </div>
                <div style={{ background: C.card, borderRadius: 14, padding: 20, border: `1px solid ${C.border}` }}>
                  <h3 style={{ margin: "0 0 16px", fontFamily: C.fontDisplay, fontSize: 18, color: "#f0eaff", fontWeight: 400 }}>Riwayat Pencairan</h3>
                  {pencairanList.length === 0 ? <div style={{ color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>Belum ada pencairan.</div> : pencairanList.map(p => (
                    <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.textMid }}>{p.nama_toko}</div>
                        <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{tanggalFmt(p.created_at)}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.green, fontFamily: C.fontMono }}>{rupiahFmt(p.nominal_cair)}</div>
                        {p.selisih > 0 && <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>sisa {rupiahFmt(p.selisih)}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ TAB OFFLINE ══ */}
        {activeTab === "offline" && (
          <div style={{ animation: "fadeUp 0.25s ease", display: "grid", gridTemplateColumns: "360px 1fr", gap: 24 }}>

            {/* Form Input */}
            <div style={{ background: C.card, borderRadius: 14, padding: 20, border: `1px solid ${C.border}`, height: "fit-content" }}>
              <h3 style={{ margin: "0 0 16px", fontFamily: C.fontDisplay, fontSize: 18, color: "#f0eaff", fontWeight: 400 }}>Penjualan Offline</h3>

              {/* Metode Bayar — di atas segalanya */}
              <label style={labelStyle}>Metode Bayar</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                {["Tunai", "Piutang"].map(m => (
                  <button key={m} onClick={() => {
                    setOfflineMetode(m);
                    // Reset pelanggan & keranjang saat ganti metode
                    setOfflinePelangganId("");
                    setOfflineNamaPelanggan("");
                    setPelangganHarga({});
                    setKeranjang([]);
                  }} style={{ flex: 1, padding: "9px", border: `1px solid ${offlineMetode === m ? C.accent : C.border}`, borderRadius: 8, background: offlineMetode === m ? C.accentDim : "transparent", color: offlineMetode === m ? C.accent : C.muted, fontFamily: C.fontSans, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                    {m === "Tunai" ? "💵 Tunai" : "📝 Piutang"}
                  </button>
                ))}
              </div>

              {/* Dropdown Pelanggan — muncul untuk TUNAI (opsional) dan PIUTANG (wajib) */}
              <label style={labelStyle}>
                Pelanggan{" "}
                {offlineMetode === "Piutang"
                  ? <span style={{ color: C.red }}>*</span>
                  : <span style={{ color: C.dim, fontSize: 9, textTransform: "none", letterSpacing: 0 }}>(opsional)</span>
                }
              </label>
              <select
                value={offlinePelangganId}
                onChange={e => handlePilihPelanggan(e.target.value)}
                style={inputStyle}
              >
                <option value="">{offlineMetode === "Piutang" ? "— Pilih Pelanggan —" : "— Tanpa Pelanggan —"}</option>
                {pelangganMaster.map(p => (
                  <option key={p.id} value={String(p.id)}>
                    {p.nama}{p.telepon ? ` (${p.telepon})` : ""}
                  </option>
                ))}
                <option value="baru">✏️ + Pelanggan Baru (input manual)</option>
              </select>

              {/* Input nama manual kalau pilih "Pelanggan Baru" */}
              {offlinePelangganId === "baru" && (
                <input
                  type="text"
                  value={offlineNamaPelanggan}
                  onChange={e => setOfflineNamaPelanggan(e.target.value)}
                  placeholder="Nama pelanggan baru..."
                  style={{ ...inputStyle, marginTop: -4 }}
                  autoFocus
                />
              )}

              {/* Info pelanggan terpilih + badge harga khusus */}
              {offlinePelangganId && offlinePelangganId !== "baru" && (
                <div style={{ fontSize: 11, fontFamily: C.fontMono, marginTop: -4, marginBottom: 6, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  {loadingHarga ? (
                    <span style={{ color: C.muted }}>⏳ Memuat harga khusus...</span>
                  ) : (
                    <>
                      <span style={{ color: C.green }}>✓ {offlineNamaPelanggan}</span>
                      {Object.keys(pelangganHarga).length > 0
                        ? <span style={{ color: C.accent, background: C.accentDim, padding: "2px 7px", borderRadius: 4, fontSize: 10 }}>
                            🏷 {Object.keys(pelangganHarga).length} harga khusus
                          </span>
                        : <span style={{ color: C.muted, fontSize: 10 }}>pakai harga master</span>
                      }
                    </>
                  )}
                </div>
              )}

              {/* Dropdown Produk — tampilkan harga khusus jika ada */}
              <label style={labelStyle}>Tambah Item</label>
              <select value={offlineProdukId} onChange={e => setOfflineProdukId(e.target.value)} style={inputStyle}>
                <option value="">— Pilih Produk —</option>
                {produk.map(p => {
                  const hargaKhusus = pelangganHarga[p.id];
                  return (
                    <option key={p.id} value={p.id}>
                      {hargaKhusus
                        ? `${p.nama_produk} — 🏷 ${rupiahFmt(hargaKhusus)} (stok: ${p.jumlah_stok})`
                        : `${p.nama_produk} — ${rupiahFmt(p.harga_jual)} (stok: ${p.jumlah_stok})`
                      }
                    </option>
                  );
                })}
              </select>

              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input type="number" min="1" value={offlineQty} onChange={e => setOfflineQty(e.target.value)} placeholder="Qty" style={{ ...inputStyle, marginBottom: 0, flex: 1 }} onKeyDown={e => e.key === "Enter" && tambahKeranjang()} />
                <button onClick={tambahKeranjang} style={{ padding: "10px 18px", borderRadius: 8, background: C.accentDim, color: C.accent, fontWeight: 700, cursor: "pointer", fontFamily: C.fontMono, fontSize: 13, whiteSpace: "nowrap", border: `1px solid ${C.accent}40` }}>+ Tambah</button>
              </div>

              {/* Keranjang */}
              {keranjang.length > 0 && (
                <div style={{ background: "#120e1e", border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Keranjang ({keranjang.length} item)</div>
                  {keranjang.map(k => (
                    <div key={k.produk_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.dim}` }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, color: C.textMid, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
                          {k.nama_produk}
                          {k.harga_khusus && (
                            <span style={{ fontSize: 9, background: C.accent + "30", color: C.accent, padding: "1px 5px", borderRadius: 3, fontFamily: C.fontMono }}>KHUSUS</span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{rupiahFmt(k.harga_jual)} × {k.qty}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: C.fontMono }}>{rupiahFmt(k.subtotal)}</span>
                        <button onClick={() => hapusKeranjang(k.produk_id)} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 14, opacity: 0.7, padding: "2px 4px" }}>×</button>
                      </div>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, paddingTop: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Total</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: C.green, fontFamily: C.fontMono }}>{rupiahFmt(totalKeranjang)}</span>
                  </div>
                </div>
              )}

              <button
                onClick={prosesOffline}
                disabled={submitting === "offline" || keranjang.length === 0}
                style={{ width: "100%", padding: "12px", border: "none", borderRadius: 8, background: keranjang.length === 0 ? C.dim : `linear-gradient(135deg, #7c3aed, ${C.accent})`, color: keranjang.length === 0 ? C.muted : "#fff", fontWeight: 700, cursor: keranjang.length === 0 ? "not-allowed" : "pointer", fontFamily: C.fontMono, fontSize: 13, boxShadow: keranjang.length === 0 ? "none" : `0 4px 16px ${C.accent}33` }}
              >
                {submitting === "offline" ? "Memproses..." : `💳 Proses ${keranjang.length > 0 ? `(${keranjang.length} item = ${rupiahFmt(totalKeranjang)})` : "Keranjang"} via ${offlineMetode}`}
              </button>
            </div>

            {/* Piutang Offline */}
            <div style={{ background: C.card, borderRadius: 14, padding: 20, border: `1px solid ${C.border}` }}>
              <h3 style={{ margin: "0 0 16px", fontFamily: C.fontDisplay, fontSize: 18, color: "#f0eaff", fontWeight: 400 }}>Piutang Offline</h3>
              {piutangOffline.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 0", color: C.green, fontFamily: C.fontMono, fontSize: 13 }}>
                  Tidak ada piutang offline 🎉
                </div>
              ) : piutangOffline.map(pt => (
                <div key={pt.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.textMid }}>{pt.nama_pelanggan}</div>
                    <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, marginTop: 2 }}>{pt.keterangan}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: C.red, fontFamily: C.fontMono }}>{rupiahFmt(pt.nominal)}</span>
                    <button onClick={() => lunaskanPiutang(pt)} style={{ padding: "6px 14px", background: C.green + "20", border: `1px solid ${C.green}40`, color: C.green, borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: C.fontMono }}>Lunas</button>
                  </div>
                </div>
              ))}
              {piutangOffline.length > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, paddingTop: 12, borderTop: `2px solid ${C.border}` }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Total Piutang</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: C.red, fontFamily: C.fontMono }}>{rupiahFmt(totalPiutangOffline)}</span>
                </div>
              )}
            </div>

          </div>
        )}

      </div>
    </Sidebar>
  );
}
