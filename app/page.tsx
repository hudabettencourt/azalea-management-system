"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

type Produk = { id: number; nama_produk: string; jumlah_stok: number; harga_jual: number; satuan: string; harga_beli_avg: number };
type Mutasi = { id: number; tipe: string; jumlah: number; keterangan: string; created_at: string; stok_barang: { nama_produk: string } };
type Kas = { id: number; tipe: string; kategori: string; nominal: number; keterangan: string; created_at: string };
type Piutang = { id: number; nama_pelanggan: string; nominal: number; keterangan: string; status: string };
type Zakat = { id: number; nominal_belanja: number; zakat_keluar: number; saldo_zakat: number; created_at: string };
type Toast = { msg: string; type: "success" | "error" | "info" };
type ConfirmDialog = { open: boolean; title: string; desc: string; onConfirm: () => void };

const formatIDR = (val: string) => val.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const toAngka = (str: string) => parseInt(str.replace(/\./g, "")) || 0;
const rupiahFmt = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;
const tanggalFmt = (s: string) => new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
const isHariIni = (s: string) => new Date(s).toDateString() === new Date().toDateString();

const T = {
  bg: "#100c16", bgCard: "rgba(255,255,255,0.02)", sidebar: "#130d1a",
  border: "rgba(232,115,138,0.12)", borderStrong: "rgba(232,115,138,0.28)",
  accent: "#e8738a", accentDim: "rgba(232,115,138,0.12)", accentGlow: "rgba(232,115,138,0.25)",
  text: "#f0e6e9", textMid: "#c0a8b4", textDim: "#7a6880",
  green: "#6fcf97", yellow: "#f2c94c", red: "#eb5757",
  fontDisplay: "'DM Serif Display', Georgia, serif",
  fontMono: "'DM Mono', 'Fira Mono', monospace",
  fontSans: "'DM Sans', 'Segoe UI', sans-serif",
};

function ToastBar({ toast, onClose }: { toast: Toast | null; onClose: () => void }) {
  if (!toast) return null;
  const colors: Record<string, string> = { success: T.green, error: T.red, info: T.accent };
  return (
    <div style={{ position: "fixed", top: 24, right: 24, zIndex: 9999, background: "#1a1020", border: `1px solid ${colors[toast.type]}44`, color: colors[toast.type], padding: "14px 20px", borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", display: "flex", alignItems: "center", gap: 10, fontFamily: T.fontMono, fontWeight: 600, fontSize: 13, animation: "slideIn 0.3s ease" }}>
      {toast.msg}
      <button onClick={onClose} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", opacity: 0.6, fontSize: 16 }}>×</button>
    </div>
  );
}

function ConfirmModal({ dialog, onClose }: { dialog: ConfirmDialog; onClose: () => void }) {
  if (!dialog.open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
      <div style={{ background: "#1a1020", border: `1px solid ${T.border}`, borderRadius: 16, padding: 28, maxWidth: 360, width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
        <h3 style={{ margin: "0 0 8px", fontFamily: T.fontDisplay, fontSize: 20, color: T.text }}>{dialog.title}</h3>
        <p style={{ margin: "0 0 24px", color: T.textDim, fontSize: 13 }}>{dialog.desc}</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "9px 20px", border: `1px solid ${T.border}`, borderRadius: 8, background: "transparent", color: T.textMid, cursor: "pointer", fontFamily: T.fontMono, fontSize: 12 }}>Batal</button>
          <button onClick={() => { dialog.onConfirm(); onClose(); }} style={{ padding: "9px 20px", border: "none", borderRadius: 8, background: `linear-gradient(135deg, #c94f68, ${T.accent})`, color: "#fff", cursor: "pointer", fontWeight: 700, fontFamily: T.fontMono, fontSize: 12, boxShadow: `0 4px 16px ${T.accentGlow}` }}>Ya, Lanjutkan</button>
        </div>
      </div>
    </div>
  );
}

// Modal edit produk
function EditProdukModal({ produk, onClose, onSave }: { produk: Produk | null; onClose: () => void; onSave: (id: number, nama: string, harga: number) => void }) {
  const [nama, setNama] = useState(produk?.nama_produk || "");
  const [harga, setHarga] = useState(produk ? formatIDR(String(produk.harga_jual)) : "");
  if (!produk) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
      <div style={{ background: "#1a1020", border: `1px solid ${T.border}`, borderRadius: 16, padding: 28, maxWidth: 380, width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
        <h3 style={{ margin: "0 0 20px", fontFamily: T.fontDisplay, fontSize: 20, color: T.text }}>Edit Produk</h3>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 1.5, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Nama Produk</label>
          <input value={nama} onChange={e => setNama(e.target.value)} style={{ width: "100%", padding: "10px 14px", background: "rgba(255,255,255,0.04)", border: `1.5px solid rgba(232,115,138,0.2)`, borderRadius: 8, color: T.text, fontFamily: T.fontSans, fontSize: 13, boxSizing: "border-box" as const, outline: "none" }} />
        </div>
        <div style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 1.5, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Harga Jual</label>
          <input value={harga} onChange={e => setHarga(formatIDR(e.target.value))} style={{ width: "100%", padding: "10px 14px", background: "rgba(255,255,255,0.04)", border: `1.5px solid rgba(232,115,138,0.2)`, borderRadius: 8, color: T.text, fontFamily: T.fontSans, fontSize: 13, boxSizing: "border-box" as const, outline: "none" }} />
          {harga && <div style={{ fontSize: 11, color: T.accent, marginTop: 4, fontFamily: T.fontMono }}>HPP: {rupiahFmt(produk.harga_beli_avg || 0)} → Margin: {produk.harga_beli_avg > 0 ? Math.round(((toAngka(harga) - produk.harga_beli_avg) / produk.harga_beli_avg) * 100) : "—"}%</div>}
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "9px 20px", border: `1px solid ${T.border}`, borderRadius: 8, background: "transparent", color: T.textMid, cursor: "pointer", fontFamily: T.fontMono, fontSize: 12 }}>Batal</button>
          <button onClick={() => { onSave(produk.id, nama.trim(), toAngka(harga)); onClose(); }} style={{ padding: "9px 20px", border: "none", borderRadius: 8, background: `linear-gradient(135deg, #c94f68, ${T.accent})`, color: "#fff", cursor: "pointer", fontWeight: 700, fontFamily: T.fontMono, fontSize: 12, boxShadow: `0 4px 16px ${T.accentGlow}` }}>Simpan</button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", marginBottom: 8,
  background: "rgba(255,255,255,0.04)", border: "1.5px solid rgba(232,115,138,0.15)",
  borderRadius: 8, color: "#e0d0d8", fontFamily: "'DM Sans', sans-serif", fontSize: 13,
  boxSizing: "border-box", outline: "none", transition: "border-color 0.2s",
};

function DarkBtn({ onClick, color, children, disabled }: { onClick: () => void; color: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ width: "100%", padding: "11px", border: "none", borderRadius: 8, background: disabled ? "rgba(255,255,255,0.06)" : `linear-gradient(135deg, ${color}dd, ${color})`, color: disabled ? T.textDim : "#fff", fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", fontFamily: T.fontMono, fontSize: 13, boxShadow: disabled ? "none" : `0 4px 16px ${color}33`, transition: "all 0.2s" }}>{children}</button>
  );
}

function Panel({ title, icon, accent, children }: { title: string; icon: string; accent: string; children: React.ReactNode }) {
  return (
    <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden", borderTop: `3px solid ${accent}` }}>
      <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.border}` }}>
        <h4 style={{ margin: 0, fontFamily: T.fontDisplay, fontSize: 15, color: T.text, display: "flex", alignItems: "center", gap: 8 }}><span>{icon}</span>{title}</h4>
      </div>
      <div style={{ padding: "16px 18px" }}>{children}</div>
    </div>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<"toko" | "zakat" | "riwayat">("toko");
  const [produk, setProduk] = useState<Produk[]>([]);
  const [mutasi, setMutasi] = useState<Mutasi[]>([]);
  const [kas, setKas] = useState<Kas[]>([]);
  const [piutang, setPiutang] = useState<Piutang[]>([]);
  const [zakat, setZakat] = useState<Zakat[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [confirm, setConfirm] = useState<ConfirmDialog>({ open: false, title: "", desc: "", onConfirm: () => {} });

  // Edit produk
  const [editProduk, setEditProduk] = useState<Produk | null>(null);

  // Search
  const [searchKas, setSearchKas] = useState("");
  const [searchMutasi, setSearchMutasi] = useState("");

  // Form inputs
  const [namaBaru, setNamaBaru] = useState("");
  const [hargaBaru, setHargaBaru] = useState("");
  const [idProduksi, setIdProduksi] = useState("");
  const [qtyProduksi, setQtyProduksi] = useState("");
  const [inputShopee, setInputShopee] = useState("");
  const [idProdukOffline, setIdProdukOffline] = useState("");
  const [qtyOffline, setQtyOffline] = useState("");
  const [namaPelanggan, setNamaPelanggan] = useState("");
  const [metodeBayar, setMetodeBayar] = useState("Tunai");
 
  const showToast = (msg: string, type: Toast["type"] = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };
  const askConfirm = (title: string, desc: string, onConfirm: () => void) => setConfirm({ open: true, title, desc, onConfirm });

  const fetchData = useCallback(async () => {
    try {
      const [resStok, resMutasi, resKas, resPiutang, resZakat] = await Promise.all([
        supabase.from("stok_barang").select("*").order("id", { ascending: true }),
        supabase.from("mutasi_stok").select("*, stok_barang(nama_produk)").order("created_at", { ascending: false }).limit(50),
        supabase.from("kas").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("piutang").select("*").eq("status", "Belum Lunas"),
        supabase.from("data_zakat").select("*").order("created_at", { ascending: false }),
      ]);
      [resStok, resMutasi, resKas, resPiutang, resZakat].forEach((r, i) => { if (r.error) throw new Error(`Query ${i}: ${r.error.message}`); });
      setProduk(resStok.data || []);
      setMutasi(resMutasi.data || []);
      setKas(resKas.data || []);
      setPiutang(resPiutang.data || []);
      setZakat(resZakat.data || []);
    } catch (err: any) {
      showToast(err.message || "Gagal memuat data", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Actions ──
  const tambahMaster = async () => {
    if (!namaBaru.trim() || !hargaBaru) return showToast("Lengkapi Nama & Harga!", "error");
    setSubmitting("master");
    const { error } = await supabase.from("stok_barang").insert([{ nama_produk: namaBaru.trim(), jumlah_stok: 0, harga_jual: toAngka(hargaBaru), satuan: "Bal" }]);
    if (error) showToast("Gagal mendaftar produk: " + error.message, "error");
    else { showToast("Produk berhasil didaftarkan!"); setNamaBaru(""); setHargaBaru(""); fetchData(); }
    setSubmitting(null);
  };

  const simpanEditProduk = async (id: number, nama: string, harga: number) => {
    if (!nama || harga <= 0) return showToast("Data tidak valid!", "error");
    const { error } = await supabase.from("stok_barang").update({ nama_produk: nama, harga_jual: harga }).eq("id", id);
    if (error) showToast("Gagal update produk: " + error.message, "error");
    else { showToast("Produk berhasil diupdate!"); fetchData(); }
  };

  const simpanProduksi = async () => {
    if (!idProduksi || !qtyProduksi) return showToast("Pilih produk & isi qty!", "error");
    const p = produk.find(x => x.id === parseInt(idProduksi));
    if (!p) return showToast("Produk tidak ditemukan", "error");
    const qty = parseInt(qtyProduksi);
    if (qty <= 0) return showToast("Qty harus lebih dari 0", "error");
    setSubmitting("produksi");
    const { error: errStok } = await supabase.rpc("increment_stok", { p_id: p.id, p_delta: qty });
    if (errStok) {
      const { error } = await supabase.from("stok_barang").update({ jumlah_stok: p.jumlah_stok + qty }).eq("id", p.id);
      if (error) { showToast("Gagal update stok: " + error.message, "error"); setSubmitting(null); return; }
    }
    await supabase.from("mutasi_stok").insert([{ produk_id: p.id, tipe: "Masuk", jumlah: qty, keterangan: "Produksi" }]);
    showToast(`+${qty} stok ${p.nama_produk} berhasil dicatat!`);
    setIdProduksi(""); setQtyProduksi(""); fetchData();
    setSubmitting(null);
  };

  const prosesPotongStok = async () => {
    if (!inputShopee.trim()) return showToast("Input Shopee kosong!", "error");
    setSubmitting("shopee");
    const baris = inputShopee.split("\n").filter(l => l.trim());
    let berhasil = 0; let gagal: string[] = [];
    for (const line of baris) {
      const kolom = line.trim().split(/\t| {2,}/);
      const namaInput = kolom[0]?.trim().toLowerCase();
      const qtyInput = parseInt(kolom[1]);
      if (!namaInput || isNaN(qtyInput) || qtyInput <= 0) { gagal.push(line); continue; }
      const p = produk.find(x => x.nama_produk.toLowerCase().includes(namaInput));
      if (!p) { gagal.push(`"${kolom[0]}" tidak ditemukan`); continue; }
      if (p.jumlah_stok < qtyInput) { gagal.push(`Stok ${p.nama_produk} tidak cukup`); continue; }
      const { error } = await supabase.from("stok_barang").update({ jumlah_stok: p.jumlah_stok - qtyInput }).eq("id", p.id);
      if (error) { gagal.push(`Gagal update ${p.nama_produk}`); continue; }
      await supabase.from("mutasi_stok").insert([{ produk_id: p.id, tipe: "Keluar", jumlah: qtyInput, keterangan: "Shopee" }]);
      berhasil++;
    }
    if (gagal.length > 0) showToast(`${berhasil} berhasil, ${gagal.length} gagal: ${gagal[0]}`, "info");
    else showToast(`${berhasil} item stok Shopee berhasil dipotong!`);
    setInputShopee(""); fetchData(); setSubmitting(null);
  };

  const prosesOffline = async () => {
    if (!idProdukOffline || !qtyOffline) return showToast("Pilih produk & isi qty!", "error");
    const p = produk.find(x => x.id === parseInt(idProdukOffline));
    if (!p) return showToast("Produk tidak ditemukan", "error");
    const qty = parseInt(qtyOffline);
    if (qty <= 0) return showToast("Qty harus lebih dari 0", "error");
    if (p.jumlah_stok < qty) return showToast(`Stok tidak cukup! Tersisa ${p.jumlah_stok}`, "error");
    if (metodeBayar === "Piutang" && !namaPelanggan.trim()) return showToast("Isi nama pelanggan!", "error");
    const total = p.harga_jual * qty;
    askConfirm("Konfirmasi Penjualan", `Jual ${p.nama_produk} ×${qty} = ${rupiahFmt(total)} via ${metodeBayar}?`, async () => {
      setSubmitting("offline");
      const { error: errStok } = await supabase.from("stok_barang").update({ jumlah_stok: p.jumlah_stok - qty }).eq("id", p.id);
      if (errStok) { showToast("Gagal update stok", "error"); setSubmitting(null); return; }
      await supabase.from("mutasi_stok").insert([{ produk_id: p.id, tipe: "Keluar", jumlah: qty, keterangan: "Offline" }]);
      if (metodeBayar === "Tunai") {
        await supabase.from("kas").insert([{ tipe: "Masuk", kategori: "Offline", nominal: total, keterangan: `Jual ${p.nama_produk} ×${qty}` }]);
      } else {
        await supabase.from("piutang").insert([{ nama_pelanggan: namaPelanggan.trim(), nominal: total, keterangan: `Hutang ${p.nama_produk} ×${qty}`, status: "Belum Lunas" }]);
      }
      showToast(`Jual ${p.nama_produk} ×${qty} berhasil!`);
      setIdProdukOffline(""); setQtyOffline(""); setNamaPelanggan(""); fetchData(); setSubmitting(null);
    });
  };

 

  const lunaskanPiutang = (pt: Piutang) => {
    askConfirm("Lunaskan Piutang", `Tandai piutang ${pt.nama_pelanggan} ${rupiahFmt(pt.nominal)} sebagai lunas?`, async () => {
      const { error } = await supabase.from("piutang").update({ status: "Lunas" }).eq("id", pt.id);
      if (error) { showToast("Gagal update piutang", "error"); return; }
      await supabase.from("kas").insert([{ tipe: "Masuk", kategori: "Piutang", nominal: pt.nominal, keterangan: `Lunas: ${pt.nama_pelanggan}` }]);
      showToast(`Piutang ${pt.nama_pelanggan} lunas!`); fetchData();
    });
  };

  // ── Kalkulasi ──
  const totalKas = kas.reduce((acc, k) => k.tipe === "Masuk" ? acc + k.nominal : acc - k.nominal, 0);
  const omzetHariIni = kas.filter(k => k.tipe === "Masuk" && isHariIni(k.created_at)).reduce((a, b) => a + b.nominal, 0);
  const totalPiutang = piutang.reduce((a, b) => a + b.nominal, 0);
  const saldoZakat = zakat[0]?.saldo_zakat || 0;
  const stokRendah = produk.filter(p => p.jumlah_stok < 10);

  // Search filter
  const kasFiltered = kas.filter(k => searchKas === "" || k.keterangan?.toLowerCase().includes(searchKas.toLowerCase()) || k.kategori?.toLowerCase().includes(searchKas.toLowerCase()));
  const mutasiFiltered = mutasi.filter(m => searchMutasi === "" || m.stok_barang?.nama_produk?.toLowerCase().includes(searchMutasi.toLowerCase()) || m.keterangan?.toLowerCase().includes(searchMutasi.toLowerCase()));

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.bg }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 12, filter: "drop-shadow(0 0 20px #e8738a88)" }}>✿</div>
        <div style={{ color: T.textDim, fontFamily: T.fontMono, fontSize: 12, letterSpacing: 2 }}>MEMUAT AZALEA...</div>
      </div>
    </div>
  );

  const tabs = [
    { id: "toko", label: "Operasional", icon: "◈" },
    { id: "riwayat", label: "Riwayat", icon: "▤" },
    { id: "zakat", label: "Zakat", icon: "◎" },
  ] as const;

  const navLinks = [
    { href: "/dashboard", label: "Dashboard", icon: "◈" },
    { href: "/pembelian", label: "Pembelian Reseller", icon: "⊕" },
    { href: "/pembelian-bahan", label: "Bahan Produksi", icon: "🧪" },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${T.bg}; }
        input:focus, select:focus, textarea:focus { border-color: rgba(232,115,138,0.5) !important; box-shadow: 0 0 0 3px rgba(232,115,138,0.08) !important; outline: none; }
        input, select, textarea { color: #e0d0d8 !important; }
        input::placeholder, textarea::placeholder { color: #5a4860 !important; }
        select option { background: #1a1020; color: #e0d0d8; }
        @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: rgba(232,115,138,0.2); border-radius: 3px; }
        .nav-link:hover { background: rgba(232,115,138,0.08) !important; color: ${T.accent} !important; }
      `}</style>

      <ToastBar toast={toast} onClose={() => setToast(null)} />
      <ConfirmModal dialog={confirm} onClose={() => setConfirm(p => ({ ...p, open: false }))} />
      <EditProdukModal produk={editProduk} onClose={() => setEditProduk(null)} onSave={simpanEditProduk} />

      <div style={{ display: "flex", minHeight: "100vh", fontFamily: T.fontSans, background: T.bg, color: T.text }}>

        {/* Sidebar */}
        <aside style={{ width: 220, flexShrink: 0, background: T.sidebar, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh" }}>
          <div style={{ padding: "28px 20px 20px", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg, #e8738a, #c94f68)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, boxShadow: `0 0 20px ${T.accentGlow}` }}>✿</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.text, fontFamily: T.fontDisplay }}>Azalea</div>
                <div style={{ fontSize: 9, color: T.accent, letterSpacing: 2, textTransform: "uppercase", fontFamily: T.fontMono }}>ERP System</div>
              </div>
            </div>
          </div>
          <nav style={{ flex: 1, padding: "16px 12px" }}>
            <div style={{ fontSize: 9, color: T.textDim, letterSpacing: 2, textTransform: "uppercase", fontFamily: T.fontMono, padding: "0 8px", marginBottom: 8 }}>Menu Utama</div>
            {tabs.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <div key={tab.id} onClick={() => setActiveTab(tab.id)} className="nav-link" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, cursor: "pointer", background: isActive ? T.accentDim : "transparent", borderLeft: isActive ? `2px solid ${T.accent}` : "2px solid transparent", marginBottom: 2, transition: "all 0.15s", color: isActive ? T.accent : T.textDim }}>
                  <span style={{ fontSize: 14 }}>{tab.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 400, color: isActive ? T.text : T.textDim }}>{tab.label}</span>
                </div>
              );
            })}
            <div style={{ height: 1, background: T.border, margin: "16px 0" }} />
            <div style={{ fontSize: 9, color: T.textDim, letterSpacing: 2, textTransform: "uppercase", fontFamily: T.fontMono, padding: "0 8px", marginBottom: 8 }}>Modul</div>
            {navLinks.map(link => (
              <a key={link.href} href={link.href} className="nav-link" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, cursor: "pointer", background: "transparent", borderLeft: "2px solid transparent", marginBottom: 2, transition: "all 0.15s", color: T.textDim, textDecoration: "none", fontSize: 13 }}>
                <span style={{ fontSize: 14 }}>{link.icon}</span>
                <span>{link.label}</span>
              </a>
            ))}
          </nav>
          <div style={{ padding: "16px 20px", borderTop: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, #8b2d42, #e8738a)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff" }}>AZ</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.textMid }}>Azalea</div>
              <div style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono }}>Admin</div>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <header style={{ height: 58, padding: "0 28px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${T.border}`, background: "rgba(16,12,22,0.9)", backdropFilter: "blur(8px)", position: "sticky", top: 0, zIndex: 100 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 1 }}>AZALEA /</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: T.text, fontFamily: T.fontDisplay, marginLeft: 4 }}>
                {activeTab === "toko" ? "Operasional Toko" : activeTab === "riwayat" ? "Riwayat Transaksi" : "Zakat Tijarah"}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {stokRendah.length > 0 && (
                <div style={{ background: "rgba(235,87,87,0.1)", border: "1px solid rgba(235,87,87,0.25)", borderRadius: 8, padding: "5px 12px", fontSize: 11, color: T.red, fontFamily: T.fontMono, cursor: "pointer" }} onClick={() => setActiveTab("toko")}>
                  ⚠ {stokRendah.length} stok rendah
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: T.green, boxShadow: `0 0 6px ${T.green}` }} />
                <span style={{ fontSize: 10, color: T.green, fontFamily: T.fontMono }}>Live</span>
              </div>
            </div>
          </header>

          <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>

            {/* ====== TAB: TOKO ====== */}
            {activeTab === "toko" && (
              <div style={{ animation: "fadeUp 0.3s ease" }}>
                {/* Stats */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
                  {[
                    { label: "Omzet Hari Ini", nilai: rupiahFmt(omzetHariIni), icon: "📈", accent: T.accent, sub: "dari kas masuk hari ini" },
                    { label: "Kas Kelola", nilai: rupiahFmt(totalKas), icon: "💰", accent: T.yellow, sub: "saldo berjalan" },
                    { label: "Piutang Aktif", nilai: rupiahFmt(totalPiutang), icon: "📝", accent: T.red, sub: `${piutang.length} pelanggan` },
                    { label: "Hutang Zakat", nilai: rupiahFmt(saldoZakat), icon: "🌙", accent: T.green, sub: "tijarah 2.5%" },
                  ].map(s => (
                    <div key={s.label} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, padding: "18px 20px", position: "relative", overflow: "hidden" }}>
                      <div style={{ position: "absolute", top: 0, right: 0, width: 70, height: 70, background: `radial-gradient(circle at top right, ${s.accent}18, transparent 70%)`, borderRadius: "0 14px 0 100%" }} />
                      <div style={{ fontSize: 10, letterSpacing: 2, color: T.textDim, textTransform: "uppercase", fontFamily: T.fontMono, marginBottom: 8 }}>{s.icon} {s.label}</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: T.text, fontFamily: T.fontDisplay, marginBottom: 4 }}>{s.nilai}</div>
                      <div style={{ fontSize: 11, color: s.accent, fontFamily: T.fontMono }}>{s.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Stok Monitor */}
                <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, padding: "18px 22px", marginBottom: 24 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: T.fontDisplay }}>Monitor Stok Gudang</span>
                    {stokRendah.length > 0 && <span style={{ fontSize: 10, color: T.red, fontFamily: T.fontMono, background: "rgba(235,87,87,0.1)", padding: "3px 10px", borderRadius: 4 }}>⚠ {stokRendah.length} produk stok rendah</span>}
                  </div>
                  <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8 }}>
                    {produk.map(p => {
                      const low = p.jumlah_stok < 10;
                      const margin = p.harga_beli_avg > 0 ? Math.round(((p.harga_jual - p.harga_beli_avg) / p.harga_beli_avg) * 100) : null;
                      return (
                        <div key={p.id} style={{ minWidth: 115, padding: "14px 12px", border: `1px solid ${low ? `${T.red}44` : T.border}`, borderRadius: 12, textAlign: "center", background: low ? "rgba(235,87,87,0.06)" : "rgba(255,255,255,0.02)", flexShrink: 0, cursor: "pointer", transition: "border-color 0.2s" }}
                          onClick={() => setEditProduk(p)}
                          title="Klik untuk edit">
                          <div style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, marginBottom: 6, lineHeight: 1.3 }}>{p.nama_produk}</div>
                          <div style={{ fontSize: 24, fontWeight: 700, color: low ? T.red : T.text, fontFamily: T.fontDisplay }}>{p.jumlah_stok}</div>
                          <div style={{ fontSize: 10, color: T.accent, fontFamily: T.fontMono, marginTop: 4 }}>{rupiahFmt(p.harga_jual)}</div>
                          {margin !== null && <div style={{ fontSize: 9, color: margin > 0 ? T.green : T.red, fontFamily: T.fontMono, marginTop: 2 }}>margin {margin}%</div>}
                          {low && <div style={{ fontSize: 9, color: T.red, marginTop: 4, fontFamily: T.fontMono, letterSpacing: 1 }}>⚠ RENDAH</div>}
                          <div style={{ fontSize: 9, color: T.textDim, marginTop: 4 }}>✏ edit</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Input Panels */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                  <Panel title="Produksi & Shopee" icon="🍳" accent="#2ecc71">
                    <select value={idProduksi} onChange={e => setIdProduksi(e.target.value)} style={inputStyle}>
                      <option value="">Pilih Produk</option>
                      {produk.map(p => <option key={p.id} value={p.id}>{p.nama_produk} (stok: {p.jumlah_stok})</option>)}
                    </select>
                    <input type="number" min="1" value={qtyProduksi} onChange={e => setQtyProduksi(e.target.value)} placeholder="Qty Produksi" style={inputStyle} />
                    <DarkBtn onClick={simpanProduksi} color="#2ecc71" disabled={submitting === "produksi"}>{submitting === "produksi" ? "Menyimpan..." : "✓ Update Stok Produksi"}</DarkBtn>
                    <hr style={{ margin: "16px 0", border: "none", borderTop: `1px solid ${T.border}` }} />
                    <label style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 1, display: "block", marginBottom: 6 }}>INPUT SHOPEE (Nama⇥Qty, per baris)</label>
                    <textarea value={inputShopee} onChange={e => setInputShopee(e.target.value)} placeholder={"Produk A\t5\nProduk B\t3"} style={{ ...inputStyle, height: 72, resize: "vertical" }} />
                    <DarkBtn onClick={prosesPotongStok} color="#ee4d2d" disabled={submitting === "shopee"}>{submitting === "shopee" ? "Memproses..." : "✂ Potong Stok Shopee"}</DarkBtn>
                  </Panel>

                  <Panel title="Kasir & Belanja" icon="🏪" accent="#8b5cf6">
                    <select value={idProdukOffline} onChange={e => setIdProdukOffline(e.target.value)} style={inputStyle}>
                      <option value="">Pilih Produk</option>
                      {produk.map(p => <option key={p.id} value={p.id}>{p.nama_produk} — {rupiahFmt(p.harga_jual)}</option>)}
                    </select>
                    <input type="number" min="1" value={qtyOffline} onChange={e => setQtyOffline(e.target.value)} placeholder="Qty" style={inputStyle} />
                    <select value={metodeBayar} onChange={e => setMetodeBayar(e.target.value)} style={inputStyle}>
                      <option value="Tunai">💵 Tunai</option>
                      <option value="Piutang">📝 Piutang (Hutang)</option>
                    </select>
                    {metodeBayar === "Piutang" && <input type="text" value={namaPelanggan} onChange={e => setNamaPelanggan(e.target.value)} placeholder="Nama Pelanggan" style={inputStyle} />}
                    {idProdukOffline && qtyOffline && (
                      <div style={{ background: "rgba(111,207,151,0.08)", border: "1px solid rgba(111,207,151,0.2)", padding: "10px 12px", borderRadius: 8, marginBottom: 8, fontSize: 13, color: T.green, fontFamily: T.fontMono, fontWeight: 700 }}>
                        Total: {rupiahFmt((produk.find(p => p.id === parseInt(idProdukOffline))?.harga_jual || 0) * parseInt(qtyOffline || "0"))}
                      </div>
                    )}
                    <DarkBtn onClick={prosesOffline} color="#8b5cf6" disabled={submitting === "offline"}>{submitting === "offline" ? "Memproses..." : "💳 Proses Penjualan"}</DarkBtn>
                    
                  </Panel>

                  <Panel title="Master Produk & Piutang" icon="✨" accent="#3b82f6">
                    <input type="text" value={namaBaru} onChange={e => setNamaBaru(e.target.value)} placeholder="Nama Produk Baru" style={inputStyle} />
                    <input type="text" value={hargaBaru} onChange={e => setHargaBaru(formatIDR(e.target.value))} placeholder="Harga Jual (Rp)" style={inputStyle} />
                    <DarkBtn onClick={tambahMaster} color="#3b82f6" disabled={submitting === "master"}>{submitting === "master" ? "Mendaftar..." : "+ Daftarkan Produk"}</DarkBtn>
                    <hr style={{ margin: "16px 0", border: "none", borderTop: `1px solid ${T.border}` }} />
                    <div style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 1.5, marginBottom: 10 }}>PIUTANG AKTIF ({piutang.length})</div>
                    <div style={{ maxHeight: 180, overflowY: "auto" }}>
                      {piutang.length === 0 && <div style={{ color: T.textDim, fontSize: 12, textAlign: "center", padding: 16, fontFamily: T.fontMono }}>Tidak ada piutang aktif 🎉</div>}
                      {piutang.map(pt => (
                        <div key={pt.id} style={{ borderBottom: `1px solid ${T.border}`, padding: "10px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13, color: T.textMid }}>{pt.nama_pelanggan}</div>
                            <div style={{ fontSize: 12, color: T.red, fontWeight: 700, fontFamily: T.fontMono }}>{rupiahFmt(pt.nominal)}</div>
                          </div>
                          <button onClick={() => lunaskanPiutang(pt)} style={{ background: "rgba(111,207,151,0.12)", color: T.green, border: "1px solid rgba(111,207,151,0.25)", padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: T.fontMono, whiteSpace: "nowrap" }}>✓ Lunas</button>
                        </div>
                      ))}
                    </div>
                  </Panel>
                </div>
              </div>
            )}

            {/* ====== TAB: RIWAYAT ====== */}
            {activeTab === "riwayat" && (
              <div style={{ animation: "fadeUp 0.3s ease" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                  {/* Mutasi */}
                  <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden" }}>
                    <div style={{ padding: "14px 20px", borderBottom: `1px solid ${T.border}` }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: T.text, fontFamily: T.fontDisplay, marginBottom: 10 }}>📦 Mutasi Stok</div>
                      <input value={searchMutasi} onChange={e => setSearchMutasi(e.target.value)} placeholder="🔍 Cari produk atau keterangan..." style={{ width: "100%", padding: "8px 12px", background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: 8, color: T.textMid, fontFamily: T.fontSans, fontSize: 12, boxSizing: "border-box" as const, outline: "none" }} />
                    </div>
                    <div style={{ maxHeight: 480, overflowY: "auto" }}>
                      {mutasiFiltered.slice(0, 50).map(m => (
                        <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 20px", borderBottom: `1px solid ${T.border}` }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13, color: T.textMid }}>{m.stok_barang?.nama_produk}</div>
                            <div style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>{m.keterangan} · {tanggalFmt(m.created_at)}</div>
                          </div>
                          <div style={{ fontWeight: 800, fontSize: 15, color: m.tipe === "Masuk" ? T.green : T.red, fontFamily: T.fontMono }}>
                            {m.tipe === "Masuk" ? "+" : "-"}{m.jumlah}
                          </div>
                        </div>
                      ))}
                      {mutasiFiltered.length === 0 && <div style={{ padding: 24, textAlign: "center", color: T.textDim, fontFamily: T.fontMono, fontSize: 12 }}>Tidak ada hasil</div>}
                    </div>
                  </div>

                  {/* Kas */}
                  <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden" }}>
                    <div style={{ padding: "14px 20px", borderBottom: `1px solid ${T.border}` }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: T.text, fontFamily: T.fontDisplay, marginBottom: 10 }}>💰 Arus Kas</div>
                      <input value={searchKas} onChange={e => setSearchKas(e.target.value)} placeholder="🔍 Cari keterangan atau kategori..." style={{ width: "100%", padding: "8px 12px", background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: 8, color: T.textMid, fontFamily: T.fontSans, fontSize: 12, boxSizing: "border-box" as const, outline: "none" }} />
                    </div>
                    <div style={{ maxHeight: 480, overflowY: "auto" }}>
                      {kasFiltered.slice(0, 50).map(k => (
                        <div key={k.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 20px", borderBottom: `1px solid ${T.border}` }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13, color: T.textMid }}>{k.keterangan || k.kategori}</div>
                            <div style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>{k.kategori} · {tanggalFmt(k.created_at)}</div>
                          </div>
                          <div style={{ fontWeight: 800, fontSize: 13, color: k.tipe === "Masuk" ? T.green : T.red, fontFamily: T.fontMono }}>
                            {k.tipe === "Masuk" ? "+" : "-"}{rupiahFmt(k.nominal)}
                          </div>
                        </div>
                      ))}
                      {kasFiltered.length === 0 && <div style={{ padding: 24, textAlign: "center", color: T.textDim, fontFamily: T.fontMono, fontSize: 12 }}>Tidak ada hasil</div>}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ====== TAB: ZAKAT ====== */}
            {activeTab === "zakat" && (
              <div style={{ maxWidth: 560, margin: "0 auto", animation: "fadeUp 0.3s ease" }}>
                <div style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.15), rgba(5,150,105,0.08))", border: "1px solid rgba(111,207,151,0.25)", padding: 36, borderRadius: 16, textAlign: "center", marginBottom: 20, boxShadow: "0 8px 32px rgba(16,185,129,0.1)" }}>
                  <div style={{ fontSize: 11, fontFamily: T.fontMono, letterSpacing: 2, color: T.green, opacity: 0.8, marginBottom: 10, textTransform: "uppercase" }}>Hutang Zakat Tijarah Azalea</div>
                  <div style={{ fontFamily: T.fontDisplay, fontSize: 42, fontWeight: 400, color: T.text, marginBottom: 8 }}>{rupiahFmt(saldoZakat)}</div>
                  <div style={{ fontSize: 12, color: T.textDim, fontFamily: T.fontMono }}>2.5% dari total belanja operasional</div>
                </div>
                <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden" }}>
                  <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}` }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: T.text, fontFamily: T.fontDisplay }}>Riwayat Zakat</span>
                  </div>
                  <div style={{ maxHeight: 480, overflowY: "auto" }}>
                    {zakat.map(z => (
                      <div key={z.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: `1px solid ${T.border}` }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: T.textMid }}>{z.nominal_belanja > 0 ? "Belanja Operasional" : "Bayar Zakat"}</div>
                          <div style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>{tanggalFmt(z.created_at)}</div>
                          {z.nominal_belanja > 0 && <div style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>Belanja: {rupiahFmt(z.nominal_belanja)}</div>}
                        </div>
                        <div style={{ fontWeight: 800, fontFamily: T.fontMono, color: z.nominal_belanja > 0 ? T.accent : T.red }}>
                          {z.nominal_belanja > 0 ? `+${rupiahFmt(Math.floor(z.nominal_belanja * 0.025))}` : `-${rupiahFmt(z.zakat_keluar)}`}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
