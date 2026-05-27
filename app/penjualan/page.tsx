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
type KeranjangItem = { produk_id: number; nama_produk: string; harga_jual: number; qty: number; subtotal: number; harga_khusus: boolean };
type PelangganOffline = { id: number; nama: string; telepon: string | null };
type Toast = { msg: string; type: "success" | "error" | "info" };
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
type EditOfflineData = {
  id: number; nama_pelanggan: string; nominal: number;
  metode_asal: "Tunai" | "Piutang"; status_bayar: string;
};

const rupiahFmt = (n: number) => `Rp ${(n || 0).toLocaleString("id-ID")}`;
const formatIDR = (val: string) => val.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const toAngka = (str: string) => parseInt(str.replace(/\./g, "")) || 0;
const tanggalFmt = (s: string) => new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });

// Light theme tokens — sama dengan Dashboard
const T = {
  bg: "var(--bg, #f0f4ff)",
  card: "var(--card, #ffffff)",
  border: "var(--border, #e8eaf6)",
  text: "var(--text, #1a1a2e)",
  textMid: "var(--text-mid, #4a5568)",
  muted: "var(--muted, #94a3b8)",
  accent: "#7c6ff7",
  accentLight: "#ede9fe",
  green: "#22c55e",
  greenLight: "#dcfce7",
  red: "#ef4444",
  redLight: "#fee2e2",
  yellow: "#f59e0b",
  yellowLight: "#fef3c7",
  orange: "#f97316",
  orangeLight: "#ffedd5",
  blue: "#3b82f6",
  blueLight: "#dbeafe",
  pink: "#ec4899",
  pinkLight: "#fce7f3",
  teal: "#14b8a6",
  tealLight: "#ccfbf1",
  font: "'Nunito', sans-serif",
  mono: "'DM Mono', monospace",
  shadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
  shadowMd: "0 4px 16px rgba(0,0,0,0.08)",
};

function ToastBar({ toast, onClose }: { toast: Toast | null; onClose: () => void }) {
  if (!toast) return null;
  const map = { success: { bg: T.greenLight, color: "#166534", border: "#bbf7d0" }, error: { bg: T.redLight, color: "#991b1b", border: "#fecaca" }, info: { bg: T.accentLight, color: "#4c1d95", border: "#ddd6fe" } };
  const s = map[toast.type];
  return (
    <div style={{ position: "fixed", top: 24, right: 24, zIndex: 9999, background: s.bg, border: `1px solid ${s.border}`, color: s.color, padding: "14px 20px", borderRadius: 12, boxShadow: T.shadowMd, display: "flex", alignItems: "center", gap: 10, fontFamily: T.font, fontWeight: 700, fontSize: 13, maxWidth: 380 }}>
      <span style={{ flex: 1 }}>{toast.msg}</span>
      <button onClick={onClose} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 16, opacity: 0.5 }}>×</button>
    </div>
  );
}

function ModalKonfirmasi({ open, keranjang, metode, pelanggan, total, onConfirm, onCancel, loading }: {
  open: boolean; keranjang: KeranjangItem[]; metode: string; pelanggan: string;
  total: number; onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
  if (!open) return null;
  return (
    <>
      <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 1000 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 1001, width: 420, background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: 28, fontFamily: T.font, boxShadow: T.shadowMd }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: T.text, marginBottom: 4 }}>⚠️ Konfirmasi Transaksi</div>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 20 }}>Pastikan data sudah benar sebelum disimpan</div>
        <div style={{ background: T.bg, borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
          {keranjang.map(k => (
            <div key={k.produk_id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${T.border}` }}>
              <span style={{ fontSize: 13, color: T.textMid }}>{k.nama_produk} ×{k.qty}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: T.mono }}>{rupiahFmt(k.subtotal)}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, paddingTop: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: T.text }}>Total</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: T.green, fontFamily: T.mono }}>{rupiahFmt(total)}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1, background: metode === "Tunai" ? T.greenLight : T.yellowLight, borderRadius: 12, padding: "10px 14px" }}>
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>METODE</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: metode === "Tunai" ? "#166534" : "#92400e" }}>{metode === "Tunai" ? "💵 Tunai" : "📝 Piutang"}</div>
          </div>
          {pelanggan && (
            <div style={{ flex: 1, background: T.accentLight, borderRadius: 12, padding: "10px 14px" }}>
              <div style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>PELANGGAN</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.accent, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pelanggan}</div>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "12px", background: T.bg, border: `1px solid ${T.border}`, color: T.muted, borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: T.font }}>✕ Batal</button>
          <button onClick={onConfirm} disabled={loading} style={{ flex: 1, padding: "12px", background: T.accent, border: "none", color: "#fff", borderRadius: 10, cursor: loading ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 13, fontFamily: T.font, opacity: loading ? 0.7 : 1 }}>
            {loading ? "Memproses..." : "✓ Ya, Simpan"}
          </button>
        </div>
      </div>
    </>
  );
}

function ModalEditOffline({ open, data, onSave, onCancel, loading }: {
  open: boolean; data: EditOfflineData | null;
  onSave: (id: number, newMetode: "Tunai" | "Piutang", newNama: string) => void;
  onCancel: () => void; loading: boolean;
}) {
  const [metode, setMetode] = useState<"Tunai" | "Piutang">("Piutang");
  const [nama, setNama] = useState("");
  useEffect(() => { if (data) { setMetode(data.metode_asal); setNama(data.nama_pelanggan || ""); } }, [data]);
  if (!open || !data) return null;
  return (
    <>
      <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 1000 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 1001, width: 380, background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: 28, fontFamily: T.font, boxShadow: T.shadowMd }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: T.text, marginBottom: 4 }}>✏️ Edit Transaksi</div>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 20, fontFamily: T.mono }}>{rupiahFmt(data.nominal)}</div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Metode Bayar</div>
          <div style={{ display: "flex", gap: 8 }}>
            {(["Tunai", "Piutang"] as const).map(m => (
              <button key={m} onClick={() => setMetode(m)} style={{ flex: 1, padding: "10px", border: `2px solid ${metode === m ? T.accent : T.border}`, borderRadius: 10, background: metode === m ? T.accentLight : T.bg, color: metode === m ? T.accent : T.muted, fontFamily: T.font, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                {m === "Tunai" ? "💵 Tunai" : "📝 Piutang"}
              </button>
            ))}
          </div>
        </div>
        {metode === "Piutang" && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Nama Pelanggan</div>
            <input value={nama} onChange={e => setNama(e.target.value)} placeholder="Nama pelanggan" style={{ width: "100%", padding: "10px 12px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, color: T.text, fontFamily: T.font, fontSize: 13, outline: "none", boxSizing: "border-box" as const }} />
          </div>
        )}
        {metode !== data.metode_asal && (
          <div style={{ background: T.yellowLight, borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#92400e", fontFamily: T.mono }}>
            ⚠ {data.metode_asal === "Tunai" ? "Kas masuk akan dihapus, diganti piutang" : "Status berubah Lunas, masuk kas"}
          </div>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "11px", background: T.bg, border: `1px solid ${T.border}`, color: T.muted, borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: T.font }}>Batal</button>
          <button onClick={() => onSave(data.id, metode, nama)} disabled={loading || (metode === "Piutang" && !nama.trim())} style={{ flex: 1, padding: "11px", background: T.accent, border: "none", color: "#fff", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: T.font, opacity: loading ? 0.7 : 1 }}>
            {loading ? "Menyimpan..." : "✓ Simpan"}
          </button>
        </div>
      </div>
    </>
  );
}

function ModalDetailTransaksi({ open, data, onClose }: { open: boolean; data: PenjualanOffline | null; onClose: () => void }) {
  if (!open || !data) return null;
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 1000 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 1001, width: 440, background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: 28, fontFamily: T.font, boxShadow: T.shadowMd }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: T.text, marginBottom: 4 }}>📋 Detail Transaksi</div>
        <div style={{ fontSize: 12, color: T.muted, marginBottom: 16, fontFamily: T.mono }}>{tanggalFmt(data.created_at)} · {data.metode_bayar}</div>
        {data.nama_pelanggan && (
          <div style={{ background: T.accentLight, borderRadius: 10, padding: "8px 14px", marginBottom: 14, fontSize: 13, color: T.accent, fontWeight: 700 }}>👤 {data.nama_pelanggan}</div>
        )}
        <div style={{ background: T.bg, borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
          {(data.detail || []).map((d, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${T.border}` }}>
              <div>
                <div style={{ fontSize: 13, color: T.text, fontWeight: 700 }}>{d.nama_produk}</div>
                <div style={{ fontSize: 11, color: T.muted, fontFamily: T.mono }}>{rupiahFmt(d.harga_satuan)} × {d.qty}</div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: T.mono }}>{rupiahFmt(d.subtotal)}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, paddingTop: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: T.text }}>Total</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: T.green, fontFamily: T.mono }}>{rupiahFmt(data.total_nominal)}</span>
          </div>
        </div>
        <button onClick={onClose} style={{ width: "100%", padding: "11px", background: T.bg, border: `1px solid ${T.border}`, color: T.muted, borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: T.font }}>Tutup</button>
      </div>
    </>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", background: "var(--bg, #f0f4ff)",
  border: "1px solid var(--border, #e8eaf6)", borderRadius: 10, color: "var(--text, #1a1a2e)",
  fontFamily: "'Nunito', sans-serif", fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 10,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, color: "var(--muted, #94a3b8)", textTransform: "uppercase" as const,
  letterSpacing: "0.08em", display: "block", marginBottom: 6, fontFamily: "'Nunito', sans-serif", fontWeight: 700,
};

export default function PenjualanPage() {
  const [activeTab, setActiveTab] = useState<"shopee" | "offline">("shopee");
  const [activeShopeeTab, setActiveShopeeTab] = useState<"input" | "piutang" | "retur" | "pencairan">("input");
  const [toko, setToko] = useState<Toko[]>([]);
  const [produk, setProduk] = useState<Produk[]>([]);
  const [piutangShopee, setPiutangShopee] = useState<PiutangShopee[]>([]);
  const [returList, setReturList] = useState<ReturShopee[]>([]);
  const [pencairanList, setPencairanList] = useState<PencairanShopee[]>([]);
  const [penjualanOfflineList, setPenjualanOfflineList] = useState<PenjualanOffline[]>([]);
  const [pelangganMaster, setPelangganMaster] = useState<PelangganOffline[]>([]);
  const [pelangganHarga, setPelangganHarga] = useState<Record<number, number>>({});
  const [loadingHarga, setLoadingHarga] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [showKonfirmasi, setShowKonfirmasi] = useState(false);
  const [editData, setEditData] = useState<EditOfflineData | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [detailData, setDetailData] = useState<PenjualanOffline | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"semua" | "Belum Lunas" | "Lunas">("semua");
  const [returTokoId, setReturTokoId] = useState("");
  const [returProdukId, setReturProdukId] = useState("");
  const [returQty, setReturQty] = useState("");
  const [returTipe, setReturTipe] = useState<"Pembatalan" | "Retur">("Pembatalan");
  const [returStokKembali, setReturStokKembali] = useState(true);
  const [cairTokoId, setCairTokoId] = useState("");
  const [cairNominal, setCairNominal] = useState("");
  const [keranjang, setKeranjang] = useState<KeranjangItem[]>([]);
  const [offlineProdukId, setOfflineProdukId] = useState("");
  const [offlineQty, setOfflineQty] = useState("");
  const [offlineMetode, setOfflineMetode] = useState("Tunai");
  const [offlineNamaPelanggan, setOfflineNamaPelanggan] = useState("");
  const [offlinePelangganId, setOfflinePelangganId] = useState("");

  const totalKeranjang = keranjang.reduce((a, k) => a + k.subtotal, 0);
  const showToast = (msg: string, type: Toast["type"] = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };

  const fetchHargaPelanggan = useCallback(async (pelangganId: number) => {
    setLoadingHarga(true);
    try {
      const { data } = await supabase.from("pelanggan_harga").select("produk_id, harga").eq("pelanggan_id", pelangganId);
      const map: Record<number, number> = {};
      (data || []).forEach((row: any) => { map[row.produk_id] = row.harga; });
      setPelangganHarga(map);
    } catch { setPelangganHarga({}); } finally { setLoadingHarga(false); }
  }, []);

  const handlePilihPelanggan = useCallback(async (val: string) => {
    setOfflinePelangganId(val); setKeranjang([]);
    if (val === "baru") { setOfflineNamaPelanggan(""); setPelangganHarga({}); }
    else if (val) { const p = pelangganMaster.find(x => String(x.id) === val); setOfflineNamaPelanggan(p?.nama || ""); await fetchHargaPelanggan(parseInt(val)); }
    else { setOfflineNamaPelanggan(""); setPelangganHarga({}); }
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

  const hapusKeranjang = (produk_id: number) => setKeranjang(prev => prev.filter(k => k.produk_id !== produk_id));

  const fetchData = useCallback(async () => {
    try {
      const [resToko, resProduk, resPenjualan, resRetur, resPencairan, resFee, resPelanggan, resPenjualanOffline] = await Promise.all([
        supabase.from("toko_online").select("*").eq("aktif", true).order("id"),
        supabase.from("stok_barang").select("*").order("nama_produk"),
        supabase.from("penjualan_online").select("toko_id, total_nominal, total_ditarik, status"),
        supabase.from("retur_online").select("*, stok_barang(nama_produk), toko_online(nama)").order("created_at", { ascending: false }).limit(50),
        supabase.from("pencairan_online").select("*, toko_online(nama)").order("created_at", { ascending: false }).limit(50),
        supabase.from("fee_platform").select("toko_id, total_fee"),
        supabase.from("pelanggan_offline").select("id, nama, telepon").order("nama"),
        supabase.from("penjualan_offline").select("*, detail_penjualan_offline(*)").order("created_at", { ascending: false }).limit(100),
      ]);
      setToko(resToko.data || []);
      setProduk(resProduk.data || []);
      setPelangganMaster(resPelanggan.data || []);
      const penjualanData = resPenjualan.data || [];
      const returData = resRetur.data || [];
      const feeData = resFee.data || [];
      const piutangPerToko: PiutangShopee[] = (resToko.data || []).map((t: Toko) => {
        const pjToko = penjualanData.filter((p: any) => p.toko_id === t.id);
        const totalPiutang = pjToko.reduce((a: number, p: any) => a + Math.round(p.total_nominal || 0), 0);
        const totalDitarik = pjToko.reduce((a: number, p: any) => a + Math.round(p.total_ditarik || 0), 0);
        const totalRetur = returData.filter((r: any) => r.toko_id === t.id).reduce((a: number, r: any) => a + Math.round(r.nominal || 0), 0);
        const totalFee = feeData.filter((f: any) => f.toko_id === t.id).reduce((a: number, f: any) => a + Math.round(f.total_fee || 0), 0);
        return { toko_id: t.id, toko_nama: t.nama, total_piutang: totalPiutang, total_retur: totalRetur, total_fee: totalFee, total_cair: totalDitarik, sisa_piutang: Math.max(0, totalPiutang - totalRetur - totalFee - totalDitarik) };
      });
      setPiutangShopee(piutangPerToko);
      setReturList(returData.map((r: any) => ({ ...r, nama_produk: r.stok_barang?.nama_produk, nama_toko: r.toko_online?.nama })));
      setPencairanList((resPencairan.data || []).map((p: any) => ({ ...p, nama_toko: p.toko_online?.nama })));
      setPenjualanOfflineList((resPenjualanOffline.data || []).map((pj: any) => ({ ...pj, detail: pj.detail_penjualan_offline || [] })));
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalPiutangShopee = piutangShopee.reduce((a, p) => a + p.sisa_piutang, 0);
  const piutangOfflineList = penjualanOfflineList.filter(p => p.metode_bayar === "Piutang" && p.status_bayar === "Belum Lunas");
  const totalPiutangOffline = piutangOfflineList.reduce((a, p) => a + p.total_nominal, 0);
  const filteredOffline = filterStatus === "semua" ? penjualanOfflineList : penjualanOfflineList.filter(p => p.status_bayar === filterStatus);

  const prosesRetur = async () => {
    if (!returTokoId || !returProdukId || !returQty) return showToast("Lengkapi semua field!", "error");
    setSubmitting("retur");
    try {
      const p = produk.find(x => x.id === parseInt(returProdukId));
      if (!p) throw new Error("Produk tidak ditemukan");
      const qty = parseInt(returQty);
      await supabase.from("retur_online").insert([{ toko_id: parseInt(returTokoId), produk_id: parseInt(returProdukId), qty, nominal: p.harga_jual * qty, tipe: returTipe, stok_kembali: returStokKembali }]);
      if (returStokKembali) {
        await supabase.from("stok_barang").update({ jumlah_stok: p.jumlah_stok + qty }).eq("id", p.id);
        await supabase.from("mutasi_stok").insert([{ stok_barang_id: p.id, tipe: "Masuk", qty, keterangan: `Retur ${returTipe}` }]);
      }
      showToast(`Retur ${p.nama_produk} ×${qty} berhasil!`);
      setReturTokoId(""); setReturProdukId(""); setReturQty("");
      fetchData();
    } catch (err: any) { showToast(err.message || "Gagal proses retur", "error"); } finally { setSubmitting(null); }
  };

  const prosesPencairan = async () => {
    if (!cairTokoId || !cairNominal) return showToast("Pilih toko & isi nominal!", "error");
    setSubmitting("cair");
    try {
      const nominalCair = toAngka(cairNominal);
      if (nominalCair <= 0) throw new Error("Nominal harus lebih dari 0");
      const tokoData = piutangShopee.find(p => p.toko_id === parseInt(cairTokoId));
      if (!tokoData) throw new Error("Data toko tidak ditemukan");
      if (nominalCair > tokoData.sisa_piutang) throw new Error(`Melebihi sisa piutang (${rupiahFmt(tokoData.sisa_piutang)})`);
      await supabase.from("pencairan_online").insert([{ toko_id: parseInt(cairTokoId), nominal_cair: nominalCair, nominal_piutang: tokoData.sisa_piutang, selisih: tokoData.sisa_piutang - nominalCair }]);
      let sisaCair = nominalCair;
      const penjualanToko = await supabase.from("penjualan_online").select("*").eq("toko_id", parseInt(cairTokoId)).neq("status", "Lunas").order("created_at", { ascending: true });
      for (const pj of (penjualanToko.data || [])) {
        if (sisaCair <= 0) break;
        const sisa = pj.total_nominal - pj.total_ditarik;
        const ditarik = Math.min(sisaCair, sisa);
        await supabase.from("penjualan_online").update({ total_ditarik: pj.total_ditarik + ditarik, status: (pj.total_ditarik + ditarik) >= pj.total_nominal ? "Lunas" : "Sebagian" }).eq("id", pj.id);
        sisaCair -= ditarik;
      }
      await supabase.from("kas").insert([{ tipe: "Masuk", kategori: "Shopee", nominal: nominalCair, keterangan: `Pencairan Shopee - ${tokoData.toko_nama}` }]);
      showToast(`Pencairan berhasil! ${rupiahFmt(nominalCair)}`);
      setCairTokoId(""); setCairNominal(""); fetchData();
    } catch (err: any) { showToast(err.message || "Gagal catat pencairan", "error"); } finally { setSubmitting(null); }
  };

  const handleClickProses = () => {
    if (keranjang.length === 0) return showToast("Keranjang kosong!", "error");
    if (offlineMetode === "Piutang" && !offlineNamaPelanggan.trim()) return showToast("Pilih atau isi nama pelanggan!", "error");
    setShowKonfirmasi(true);
  };

  const prosesOffline = async () => {
    setSubmitting("offline");
    try {
      const { data: penjualanData, error: penjualanError } = await supabase.from("penjualan_offline").insert([{
        pelanggan_id: offlinePelangganId && offlinePelangganId !== "baru" ? parseInt(offlinePelangganId) : null,
        nama_pelanggan: offlineNamaPelanggan.trim() || null,
        tanggal: new Date().toISOString().split("T")[0],
        metode_bayar: offlineMetode,
        total_nominal: totalKeranjang,
        status_bayar: offlineMetode === "Tunai" ? "Lunas" : "Belum Lunas",
      }]).select().single();
      if (penjualanError) throw penjualanError;
      const { error: detailError } = await supabase.from("detail_penjualan_offline").insert(
        keranjang.map(k => ({ penjualan_id: penjualanData.id, stok_barang_id: k.produk_id, nama_produk: k.nama_produk, qty: k.qty, harga_satuan: k.harga_jual }))
      );
      if (detailError) throw detailError;
      for (const item of keranjang) {
        const p = produk.find(x => x.id === item.produk_id);
        if (!p) continue;
        await supabase.from("stok_barang").update({ jumlah_stok: p.jumlah_stok - item.qty }).eq("id", p.id);
        await supabase.from("mutasi_stok").insert([{ stok_barang_id: p.id, tipe: "Keluar", qty: item.qty, keterangan: "Penjualan Offline" }]);
      }
      if (offlineMetode === "Tunai") {
        await supabase.from("kas").insert([{ tipe: "Masuk", kategori: "Offline", nominal: totalKeranjang, keterangan: keranjang.map(k => `${k.nama_produk} ×${k.qty}`).join(", ") }]);
      }
      showToast(`${keranjang.length} item terjual = ${rupiahFmt(totalKeranjang)} via ${offlineMetode}`);
      setKeranjang([]); setOfflineNamaPelanggan(""); setOfflinePelangganId(""); setOfflineProdukId(""); setOfflineQty(""); setPelangganHarga({}); setShowKonfirmasi(false);
      fetchData();
    } catch (err: any) { showToast(err.message || "Gagal simpan transaksi", "error"); } finally { setSubmitting(null); }
  };

  const handleEditOffline = (pj: PenjualanOffline) => {
    setEditData({ id: pj.id, nama_pelanggan: pj.nama_pelanggan || "", nominal: pj.total_nominal, metode_asal: pj.metode_bayar as "Tunai" | "Piutang", status_bayar: pj.status_bayar });
    setShowEdit(true);
  };

  const simpanEditOffline = async (id: number, newMetode: "Tunai" | "Piutang", newNama: string) => {
    if (!editData) return;
    setSavingEdit(true);
    try {
      if (newMetode === "Tunai" && editData.metode_asal === "Piutang") {
        await supabase.from("penjualan_offline").update({ metode_bayar: "Tunai", status_bayar: "Lunas", nama_pelanggan: newNama.trim() || null }).eq("id", id);
        const pj = penjualanOfflineList.find(x => x.id === id);
        await supabase.from("kas").insert([{ tipe: "Masuk", kategori: "Offline", nominal: editData.nominal, keterangan: `[Koreksi] ${(pj?.detail || []).map(d => `${d.nama_produk} ×${d.qty}`).join(", ")}` }]);
        showToast("Diubah ke Tunai, masuk Kas ✓");
      } else if (newMetode === "Piutang" && editData.metode_asal === "Tunai") {
        await supabase.from("penjualan_offline").update({ metode_bayar: "Piutang", status_bayar: "Belum Lunas", nama_pelanggan: newNama.trim() || null }).eq("id", id);
        showToast("Diubah ke Piutang ✓");
      } else {
        await supabase.from("penjualan_offline").update({ nama_pelanggan: newNama.trim() || null }).eq("id", id);
        showToast("Data diupdate ✓");
      }
      setShowEdit(false); setEditData(null); fetchData();
    } catch (err: any) { showToast(err.message || "Gagal edit", "error"); } finally { setSavingEdit(false); }
  };

  const lunaskanOffline = async (pj: PenjualanOffline) => {
    try {
      await supabase.from("penjualan_offline").update({ status_bayar: "Lunas" }).eq("id", pj.id);
      await supabase.from("kas").insert([{ tipe: "Masuk", kategori: "Piutang", nominal: pj.total_nominal, keterangan: `Lunas: ${pj.nama_pelanggan} — ${(pj.detail || []).map(d => `${d.nama_produk} ×${d.qty}`).join(", ")}` }]);
      showToast(`Piutang ${pj.nama_pelanggan} lunas! ✓`);
      fetchData();
    } catch (err: any) { showToast(err.message || "Gagal", "error"); }
  };

  if (loading) return (
    <Sidebar>
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.bg }}>
        <div style={{ color: T.muted, fontFamily: T.font, fontSize: 14 }}>Memuat data...</div>
      </div>
    </Sidebar>
  );

  const summaryCards = [
    { label: "Piutang Shopee", value: rupiahFmt(totalPiutangShopee), sub: `${piutangShopee.filter(p => p.sisa_piutang > 0).length} toko aktif`, icon: "🛍️", bg: T.yellowLight, color: "#92400e", border: "#fde68a" },
    { label: "Piutang Offline", value: rupiahFmt(totalPiutangOffline), sub: `${piutangOfflineList.length} pelanggan`, icon: "📝", bg: T.redLight, color: "#991b1b", border: "#fecaca" },
    { label: "Total Toko Shopee", value: `${toko.length} toko`, sub: "Aktif terdaftar", icon: "🏪", bg: T.blueLight, color: "#1e40af", border: "#bfdbfe" },
    { label: "Total Produk", value: `${produk.length} item`, sub: "Di stok gudang", icon: "📦", bg: T.tealLight, color: "#0f766e", border: "#99f6e4" },
  ];

  return (
    <Sidebar>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        select option { background: #fff; color: #1a1a2e; }
        .pj-tab-btn:hover { opacity: 0.85; }
        .pj-row:hover { background: var(--bg, #f0f4ff) !important; }
      `}</style>

      <ToastBar toast={toast} onClose={() => setToast(null)} />
      <ModalKonfirmasi open={showKonfirmasi} keranjang={keranjang} metode={offlineMetode} pelanggan={offlineNamaPelanggan} total={totalKeranjang} onConfirm={prosesOffline} onCancel={() => setShowKonfirmasi(false)} loading={submitting === "offline"} />
      <ModalEditOffline open={showEdit} data={editData} onSave={simpanEditOffline} onCancel={() => { setShowEdit(false); setEditData(null); }} loading={savingEdit} />
      <ModalDetailTransaksi open={showDetail} data={detailData} onClose={() => { setShowDetail(false); setDetailData(null); }} />

      <div style={{ background: T.bg, minHeight: "100vh", padding: "28px 28px", fontFamily: T.font, color: T.text }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, color: T.text }}>Penjualan</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: T.muted }}>Kelola orderan Shopee & penjualan offline</p>
        </div>

        {/* Summary Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
          {summaryCards.map((s, i) => (
            <div key={i} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 16, padding: "18px 20px", boxShadow: T.shadow }}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>{s.icon}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: s.color, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, opacity: 0.7 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: s.color, opacity: 0.6, marginTop: 4 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Tab Utama */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {[{ id: "shopee", label: "🛍️ Shopee" }, { id: "offline", label: "🏪 Offline" }].map(tab => (
            <button key={tab.id} className="pj-tab-btn" onClick={() => setActiveTab(tab.id as any)} style={{ padding: "10px 28px", borderRadius: 10, border: "none", cursor: "pointer", fontFamily: T.font, fontWeight: 800, fontSize: 14, background: activeTab === tab.id ? T.accent : T.card, color: activeTab === tab.id ? "#fff" : T.muted, boxShadow: activeTab === tab.id ? `0 4px 12px ${T.accent}40` : T.shadow, transition: "all 0.15s" }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ══ TAB SHOPEE ══ */}
        {activeTab === "shopee" && (
          <div style={{ animation: "fadeUp 0.2s ease" }}>
            <div style={{ display: "flex", gap: 4, marginBottom: 20, background: T.card, padding: 4, borderRadius: 12, width: "fit-content", boxShadow: T.shadow }}>
              {[{ id: "input", label: "📤 Input Orderan" }, { id: "piutang", label: "💰 Piutang" }, { id: "retur", label: "↩️ Retur" }, { id: "pencairan", label: "🏦 Pencairan" }].map(t => (
                <button key={t.id} className="pj-tab-btn" onClick={() => setActiveShopeeTab(t.id as any)} style={{ padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: T.font, fontWeight: 700, fontSize: 12, background: activeShopeeTab === t.id ? T.accentLight : "transparent", color: activeShopeeTab === t.id ? T.accent : T.muted, transition: "all 0.15s" }}>
                  {t.label}
                </button>
              ))}
            </div>

            {activeShopeeTab === "input" && <ShopeeUploadTab />}

            {activeShopeeTab === "piutang" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
                {piutangShopee.map(p => (
                  <div key={p.toko_id} style={{ background: T.card, border: `1px solid ${p.sisa_piutang > 0 ? "#fde68a" : T.border}`, borderRadius: 16, padding: 20, boxShadow: T.shadow }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                      <span style={{ fontSize: 15, fontWeight: 800, color: T.text }}>🏪 {p.toko_nama}</span>
                      {p.sisa_piutang > 0 && <span style={{ fontSize: 10, background: T.yellowLight, color: "#92400e", padding: "3px 8px", borderRadius: 6, fontFamily: T.mono, fontWeight: 700 }}>AKTIF</span>}
                    </div>
                    {[{ label: "Total Orderan", val: p.total_piutang, color: T.text }, { label: "Retur/Batal", val: p.total_retur, color: T.red }, { label: "Fee Platform", val: p.total_fee, color: T.orange }, { label: "Sudah Cair", val: p.total_cair, color: T.green }].map(row => (
                      <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${T.border}` }}>
                        <span style={{ fontSize: 12, color: T.muted }}>{row.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: row.color, fontFamily: T.mono }}>{rupiahFmt(row.val)}</span>
                      </div>
                    ))}
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: T.text }}>Sisa Piutang</span>
                      <span style={{ fontSize: 14, fontWeight: 900, color: p.sisa_piutang > 0 ? "#92400e" : T.muted, fontFamily: T.mono }}>{rupiahFmt(p.sisa_piutang)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeShopeeTab === "retur" && (
              <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 24 }}>
                <div style={{ background: T.card, borderRadius: 16, padding: 22, border: `1px solid ${T.border}`, boxShadow: T.shadow }}>
                  <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 800, color: T.text }}>Input Retur / Batal</h3>
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
                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    {(["Pembatalan", "Retur"] as const).map(t => (
                      <button key={t} onClick={() => setReturTipe(t)} style={{ flex: 1, padding: "9px", border: `2px solid ${returTipe === t ? T.accent : T.border}`, borderRadius: 10, background: returTipe === t ? T.accentLight : T.bg, color: returTipe === t ? T.accent : T.muted, fontFamily: T.font, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{t}</button>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                    {[{ val: true, label: "Stok Kembali" }, { val: false, label: "Tidak Kembali" }].map(o => (
                      <button key={String(o.val)} onClick={() => setReturStokKembali(o.val)} style={{ flex: 1, padding: "9px", border: `2px solid ${returStokKembali === o.val ? T.green : T.border}`, borderRadius: 10, background: returStokKembali === o.val ? T.greenLight : T.bg, color: returStokKembali === o.val ? "#166534" : T.muted, fontFamily: T.font, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>{o.label}</button>
                    ))}
                  </div>
                  <button onClick={prosesRetur} disabled={submitting === "retur"} style={{ width: "100%", padding: "11px", border: "none", borderRadius: 10, background: T.accent, color: "#fff", fontWeight: 800, cursor: "pointer", fontFamily: T.font, fontSize: 13, boxShadow: `0 4px 12px ${T.accent}40` }}>
                    {submitting === "retur" ? "Memproses..." : "✓ Catat Retur"}
                  </button>
                </div>
                <div style={{ background: T.card, borderRadius: 16, padding: 22, border: `1px solid ${T.border}`, boxShadow: T.shadow }}>
                  <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 800, color: T.text }}>Riwayat Retur</h3>
                  {returList.length === 0 ? <div style={{ color: T.muted, fontSize: 13, textAlign: "center", padding: "24px 0" }}>Belum ada retur</div> : returList.map(r => (
                    <div key={r.id} className="pj-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 8px", borderBottom: `1px solid ${T.border}`, borderRadius: 8, transition: "background 0.1s" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{r.nama_produk || `Produk #${r.produk_id}`} ×{r.qty}</div>
                        <div style={{ fontSize: 11, color: T.muted, fontFamily: T.mono }}>{r.nama_toko} · {r.tipe} · {tanggalFmt(r.created_at)}</div>
                      </div>
                      <div style={{ fontSize: 13, color: T.red, fontFamily: T.mono, fontWeight: 700 }}>-{rupiahFmt(r.nominal)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeShopeeTab === "pencairan" && (
              <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 24 }}>
                <div style={{ background: T.card, borderRadius: 16, padding: 22, border: `1px solid ${T.border}`, boxShadow: T.shadow }}>
                  <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 800, color: T.text }}>Catat Pencairan</h3>
                  <label style={labelStyle}>Toko</label>
                  <select value={cairTokoId} onChange={e => setCairTokoId(e.target.value)} style={inputStyle}>
                    <option value="">— Pilih Toko —</option>
                    {piutangShopee.filter(p => p.sisa_piutang > 0).map(p => (
                      <option key={p.toko_id} value={p.toko_id}>{p.toko_nama} — sisa {rupiahFmt(p.sisa_piutang)}</option>
                    ))}
                  </select>
                  <label style={labelStyle}>Nominal Cair</label>
                  <input value={cairNominal} onChange={e => setCairNominal(formatIDR(e.target.value))} placeholder="0" style={{ ...inputStyle, fontFamily: T.mono }} />
                  {cairTokoId && (
                    <div style={{ fontSize: 12, color: T.muted, fontFamily: T.mono, marginBottom: 12, marginTop: -6 }}>
                      Sisa: {rupiahFmt(piutangShopee.find(p => p.toko_id === parseInt(cairTokoId))?.sisa_piutang || 0)}
                    </div>
                  )}
                  <button onClick={prosesPencairan} disabled={submitting === "cair"} style={{ width: "100%", padding: "11px", border: "none", borderRadius: 10, background: T.green, color: "#fff", fontWeight: 800, cursor: "pointer", fontFamily: T.font, fontSize: 13, boxShadow: `0 4px 12px ${T.green}40` }}>
                    {submitting === "cair" ? "Memproses..." : "💰 Catat Pencairan"}
                  </button>
                </div>
                <div style={{ background: T.card, borderRadius: 16, padding: 22, border: `1px solid ${T.border}`, boxShadow: T.shadow }}>
                  <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 800, color: T.text }}>Riwayat Pencairan</h3>
                  {pencairanList.length === 0 ? <div style={{ color: T.muted, fontSize: 13, textAlign: "center", padding: "24px 0" }}>Belum ada pencairan</div> : pencairanList.map(p => (
                    <div key={p.id} className="pj-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 8px", borderBottom: `1px solid ${T.border}`, borderRadius: 8, transition: "background 0.1s" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{p.nama_toko}</div>
                        <div style={{ fontSize: 11, color: T.muted, fontFamily: T.mono }}>{tanggalFmt(p.created_at)}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.green, fontFamily: T.mono }}>{rupiahFmt(p.nominal_cair)}</div>
                        {p.selisih > 0 && <div style={{ fontSize: 11, color: T.muted, fontFamily: T.mono }}>sisa {rupiahFmt(p.selisih)}</div>}
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
          <div style={{ animation: "fadeUp 0.2s ease", display: "grid", gridTemplateColumns: "360px 1fr", gap: 24 }}>

            {/* Form Input */}
            <div style={{ background: T.card, borderRadius: 16, padding: 22, border: `1px solid ${T.border}`, boxShadow: T.shadow, height: "fit-content" }}>
              <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 800, color: T.text }}>🏪 Input Penjualan</h3>

              <label style={labelStyle}>Metode Bayar</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                {["Tunai", "Piutang"].map(m => (
                  <button key={m} onClick={() => { setOfflineMetode(m); setOfflinePelangganId(""); setOfflineNamaPelanggan(""); setPelangganHarga({}); setKeranjang([]); }} style={{ flex: 1, padding: "10px", border: `2px solid ${offlineMetode === m ? T.accent : T.border}`, borderRadius: 10, background: offlineMetode === m ? T.accentLight : T.bg, color: offlineMetode === m ? T.accent : T.muted, fontFamily: T.font, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                    {m === "Tunai" ? "💵 Tunai" : "📝 Piutang"}
                  </button>
                ))}
              </div>

              <label style={labelStyle}>
                Pelanggan {offlineMetode === "Piutang" ? <span style={{ color: T.red }}>*</span> : <span style={{ color: T.muted, fontSize: 10, textTransform: "none" }}>(opsional)</span>}
              </label>
              <select value={offlinePelangganId} onChange={e => handlePilihPelanggan(e.target.value)} style={inputStyle}>
                <option value="">{offlineMetode === "Piutang" ? "— Pilih Pelanggan —" : "— Tanpa Pelanggan —"}</option>
                {pelangganMaster.map(p => <option key={p.id} value={String(p.id)}>{p.nama}{p.telepon ? ` (${p.telepon})` : ""}</option>)}
                <option value="baru">✏️ + Pelanggan Baru</option>
              </select>

              {offlinePelangganId === "baru" && (
                <input type="text" value={offlineNamaPelanggan} onChange={e => setOfflineNamaPelanggan(e.target.value)} placeholder="Nama pelanggan baru..." style={{ ...inputStyle, marginTop: -6 }} autoFocus />
              )}
              {offlinePelangganId && offlinePelangganId !== "baru" && (
                <div style={{ fontSize: 11, fontFamily: T.mono, marginTop: -6, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                  {loadingHarga ? <span style={{ color: T.muted }}>⏳ Memuat harga...</span> : (
                    <>
                      <span style={{ color: T.green, fontWeight: 700 }}>✓ {offlineNamaPelanggan}</span>
                      {Object.keys(pelangganHarga).length > 0
                        ? <span style={{ color: T.accent, background: T.accentLight, padding: "2px 7px", borderRadius: 4, fontSize: 10 }}>🏷 {Object.keys(pelangganHarga).length} harga khusus</span>
                        : <span style={{ color: T.muted, fontSize: 10 }}>harga master</span>
                      }
                    </>
                  )}
                </div>
              )}

              <label style={labelStyle}>Tambah Item</label>
              <select value={offlineProdukId} onChange={e => setOfflineProdukId(e.target.value)} style={inputStyle}>
                <option value="">— Pilih Produk —</option>
                {produk.map(p => {
                  const hargaKhusus = pelangganHarga[p.id];
                  return <option key={p.id} value={p.id}>{hargaKhusus ? `${p.nama_produk} — 🏷 ${rupiahFmt(hargaKhusus)} (stok: ${p.jumlah_stok})` : `${p.nama_produk} — ${rupiahFmt(p.harga_jual)} (stok: ${p.jumlah_stok})`}</option>;
                })}
              </select>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <input type="number" min="1" value={offlineQty} onChange={e => setOfflineQty(e.target.value)} placeholder="Qty" style={{ ...inputStyle, marginBottom: 0, flex: 1 }} onKeyDown={e => e.key === "Enter" && tambahKeranjang()} />
                <button onClick={tambahKeranjang} style={{ padding: "10px 18px", borderRadius: 10, background: T.accentLight, color: T.accent, fontWeight: 800, cursor: "pointer", fontFamily: T.font, fontSize: 13, whiteSpace: "nowrap", border: `1px solid #ddd6fe` }}>+ Tambah</button>
              </div>

              {keranjang.length > 0 && (
                <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontWeight: 700 }}>Keranjang ({keranjang.length} item)</div>
                  {keranjang.map(k => (
                    <div key={k.produk_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${T.border}` }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, color: T.text, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
                          {k.nama_produk}
                          {k.harga_khusus && <span style={{ fontSize: 9, background: T.accentLight, color: T.accent, padding: "1px 5px", borderRadius: 3, fontFamily: T.mono }}>KHUSUS</span>}
                        </div>
                        <div style={{ fontSize: 11, color: T.muted, fontFamily: T.mono }}>{rupiahFmt(k.harga_jual)} × {k.qty}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: T.text, fontFamily: T.mono }}>{rupiahFmt(k.subtotal)}</span>
                        <button onClick={() => hapusKeranjang(k.produk_id)} style={{ background: T.redLight, border: "none", color: T.red, cursor: "pointer", fontSize: 13, padding: "2px 6px", borderRadius: 4 }}>×</button>
                      </div>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, paddingTop: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: T.text }}>Total</span>
                    <span style={{ fontSize: 14, fontWeight: 900, color: T.green, fontFamily: T.mono }}>{rupiahFmt(totalKeranjang)}</span>
                  </div>
                </div>
              )}

              <button onClick={handleClickProses} disabled={keranjang.length === 0} style={{ width: "100%", padding: "12px", border: "none", borderRadius: 10, background: keranjang.length === 0 ? T.border : T.accent, color: keranjang.length === 0 ? T.muted : "#fff", fontWeight: 800, cursor: keranjang.length === 0 ? "not-allowed" : "pointer", fontFamily: T.font, fontSize: 13, boxShadow: keranjang.length > 0 ? `0 4px 12px ${T.accent}40` : "none", transition: "all 0.15s" }}>
                {`💳 Proses ${keranjang.length > 0 ? `(${keranjang.length} item = ${rupiahFmt(totalKeranjang)})` : "Keranjang"} via ${offlineMetode}`}
              </button>
            </div>

            {/* Riwayat Transaksi */}
            <div style={{ background: T.card, borderRadius: 16, padding: 22, border: `1px solid ${T.border}`, boxShadow: T.shadow }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: T.text }}>📋 Riwayat Transaksi</h3>
                <div style={{ display: "flex", gap: 6 }}>
                  {(["semua", "Belum Lunas", "Lunas"] as const).map(f => (
                    <button key={f} onClick={() => setFilterStatus(f)} style={{ padding: "5px 12px", borderRadius: 8, border: `1px solid ${filterStatus === f ? T.accent : T.border}`, background: filterStatus === f ? T.accentLight : T.bg, color: filterStatus === f ? T.accent : T.muted, fontFamily: T.font, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      {f === "semua" ? "Semua" : f}
                    </button>
                  ))}
                </div>
              </div>

              {filteredOffline.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 0", color: T.muted, fontSize: 13 }}>Belum ada transaksi offline</div>
              ) : filteredOffline.map(pj => (
                <div key={pj.id} className="pj-row" style={{ padding: "12px 8px", borderBottom: `1px solid ${T.border}`, borderRadius: 8, transition: "background 0.1s" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: T.text }}>{pj.nama_pelanggan || "Tanpa Pelanggan"}</span>
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, fontFamily: T.mono, fontWeight: 700, background: pj.status_bayar === "Lunas" ? T.greenLight : T.yellowLight, color: pj.status_bayar === "Lunas" ? "#166534" : "#92400e" }}>
                          {pj.status_bayar}
                        </span>
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, fontFamily: T.mono, background: pj.metode_bayar === "Tunai" ? T.greenLight : T.blueLight, color: pj.metode_bayar === "Tunai" ? "#166534" : "#1e40af" }}>
                          {pj.metode_bayar}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: T.muted, fontFamily: T.mono, marginBottom: 3 }}>{tanggalFmt(pj.created_at)} · {(pj.detail || []).length} item</div>
                      <div style={{ fontSize: 11, color: T.muted }}>
                        {(pj.detail || []).slice(0, 2).map(d => `${d.nama_produk} ×${d.qty}`).join(", ")}
                        {(pj.detail || []).length > 2 && ` +${(pj.detail || []).length - 2} lainnya`}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                      <span style={{ fontSize: 15, fontWeight: 900, color: pj.status_bayar === "Lunas" ? T.green : T.red, fontFamily: T.mono }}>{rupiahFmt(pj.total_nominal)}</span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => { setDetailData(pj); setShowDetail(true); }} style={{ padding: "5px 10px", background: T.blueLight, border: "none", color: T.blue, borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: T.font }}>📋 Detail</button>
                        <button onClick={() => handleEditOffline(pj)} style={{ padding: "5px 10px", background: T.accentLight, border: "none", color: T.accent, borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: T.font }}>✏️ Edit</button>
                        {pj.metode_bayar === "Piutang" && pj.status_bayar === "Belum Lunas" && (
                          <button onClick={() => lunaskanOffline(pj)} style={{ padding: "5px 10px", background: T.greenLight, border: "none", color: "#166534", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: T.font }}>✓ Lunas</button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {piutangOfflineList.length > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, paddingTop: 12, borderTop: `2px solid ${T.border}` }}>
                  <span style={{ fontSize: 13, color: T.muted, fontWeight: 700 }}>Total Piutang Belum Lunas</span>
                  <span style={{ fontSize: 16, fontWeight: 900, color: T.red, fontFamily: T.mono }}>{rupiahFmt(totalPiutangOffline)}</span>
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </Sidebar>
  );
}
