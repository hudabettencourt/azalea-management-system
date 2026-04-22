"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

// ============================================================
// TYPES
// ============================================================
type Produk = { id: number; nama_produk: string; jumlah_stok: number; harga_jual: number; satuan: string };
type Mutasi = { id: number; tipe: string; jumlah: number; keterangan: string; created_at: string; stok_barang: { nama_produk: string } };
type Kas = { id: number; tipe: string; kategori: string; nominal: number; keterangan: string; created_at: string };
type Piutang = { id: number; nama_pelanggan: string; nominal: number; keterangan: string; status: string };
type Zakat = { id: number; nominal_belanja: number; zakat_keluar: number; saldo_zakat: number; created_at: string };

type Toast = { msg: string; type: "success" | "error" | "info" };
type ConfirmDialog = { open: boolean; title: string; desc: string; onConfirm: () => void };

// ============================================================
// HELPERS
// ============================================================
const formatIDR = (val: string) => val.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const toAngka = (str: string) => parseInt(str.replace(/\./g, "")) || 0;
const rupiahFmt = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;
const tanggalFmt = (s: string) => new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
const isHariIni = (s: string) => new Date(s).toDateString() === new Date().toDateString();

// ============================================================
// KOMPONEN KECIL
// ============================================================
function Toast({ toast, onClose }: { toast: Toast | null; onClose: () => void }) {
  if (!toast) return null;
  const colors: Record<string, string> = { success: "#10b981", error: "#ef4444", info: "#3b82f6" };
  const icons: Record<string, string> = { success: "✓", error: "✕", info: "ℹ" };
  return (
    <div style={{
      position: "fixed", top: "24px", right: "24px", zIndex: 9999,
      background: colors[toast.type], color: "#fff",
      padding: "14px 20px", borderRadius: "12px",
      boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
      display: "flex", alignItems: "center", gap: "10px",
      fontFamily: "'Instrument Sans', sans-serif", fontWeight: 600, fontSize: "14px",
      animation: "slideIn 0.3s ease",
    }}>
      <span style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px" }}>{icons[toast.type]}</span>
      {toast.msg}
      <button onClick={onClose} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", marginLeft: "8px", opacity: 0.7, fontSize: "16px" }}>×</button>
    </div>
  );
}

function ConfirmModal({ dialog, onClose }: { dialog: ConfirmDialog; onClose: () => void }) {
  if (!dialog.open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: "16px", padding: "28px", maxWidth: "360px", width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <h3 style={{ margin: "0 0 8px", fontFamily: "'Instrument Serif', serif", fontSize: "20px" }}>{dialog.title}</h3>
        <p style={{ margin: "0 0 24px", color: "#6b7280", fontSize: "14px" }}>{dialog.desc}</p>
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "10px 20px", border: "1px solid #e5e7eb", borderRadius: "8px", background: "#fff", cursor: "pointer", fontWeight: 600 }}>Batal</button>
          <button onClick={() => { dialog.onConfirm(); onClose(); }} style={{ padding: "10px 20px", border: "none", borderRadius: "8px", background: "#1e293b", color: "#fff", cursor: "pointer", fontWeight: 600 }}>Ya, Lanjutkan</button>
        </div>
      </div>
    </div>
  );
}

function KartuStat({ label, nilai, warna, icon }: { label: string; nilai: string; warna: string; icon: string }) {
  return (
    <div style={{ background: "#fff", padding: "20px 24px", borderRadius: "16px", borderLeft: `5px solid ${warna}`, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
        <span style={{ fontSize: "20px" }}>{icon}</span>
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", color: "#9ca3af", textTransform: "uppercase" }}>{label}</span>
      </div>
      <div style={{ fontSize: "22px", fontWeight: 800, color: "#1e293b", fontFamily: "'Instrument Serif', serif" }}>{nilai}</div>
    </div>
  );
}

function Panel({ title, icon, color, children }: { title: string; icon: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", padding: "20px", borderRadius: "14px", borderTop: `4px solid ${color}`, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
      <h4 style={{ margin: "0 0 16px", fontFamily: "'Instrument Serif', serif", fontSize: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
        <span>{icon}</span> {title}
      </h4>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", marginBottom: "8px",
  border: "1.5px solid #e5e7eb", borderRadius: "8px",
  fontFamily: "'Instrument Sans', sans-serif", fontSize: "14px",
  boxSizing: "border-box", outline: "none", transition: "border-color 0.2s",
};

function Btn({ onClick, color, children, disabled }: { onClick: () => void; color: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: "100%", padding: "11px", border: "none", borderRadius: "8px",
      background: disabled ? "#d1d5db" : color, color: "#fff",
      fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
      fontFamily: "'Instrument Sans', sans-serif", fontSize: "14px",
      transition: "opacity 0.2s", opacity: disabled ? 0.7 : 1,
    }}>{children}</button>
  );
}

// ============================================================
// KOMPONEN UTAMA
// ============================================================
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

  // Inputs
  const [namaBaru, setNamaBaru] = useState("");
  const [hargaBaru, setHargaBaru] = useState("");
  const [idProduksi, setIdProduksi] = useState("");
  const [qtyProduksi, setQtyProduksi] = useState("");
  const [inputShopee, setInputShopee] = useState("");
  const [idProdukOffline, setIdProdukOffline] = useState("");
  const [qtyOffline, setQtyOffline] = useState("");
  const [namaPelanggan, setNamaPelanggan] = useState("");
  const [metodeBayar, setMetodeBayar] = useState("Tunai");
  const [nomBelanja, setNomBelanja] = useState("");
  const [itemBelanja, setItemBelanja] = useState("");

  // ── Helpers ──
  const showToast = (msg: string, type: Toast["type"] = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const askConfirm = (title: string, desc: string, onConfirm: () => void) =>
    setConfirm({ open: true, title, desc, onConfirm });

  // ── Fetch ──
  const fetchData = useCallback(async () => {
    try {
      const [resStok, resMutasi, resKas, resPiutang, resZakat] = await Promise.all([
        supabase.from("stok_barang").select("*").order("id", { ascending: true }),
        supabase.from("mutasi_stok").select("*, stok_barang(nama_produk)").order("created_at", { ascending: false }).limit(20),
        supabase.from("kas").select("*").order("created_at", { ascending: false }).limit(30),
        supabase.from("piutang").select("*").eq("status", "Belum Lunas"),
        supabase.from("data_zakat").select("*").order("created_at", { ascending: false }),
      ]);

      // Cek error
      [resStok, resMutasi, resKas, resPiutang, resZakat].forEach((r, i) => {
        if (r.error) throw new Error(`Query ${i} gagal: ${r.error.message}`);
      });

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
    const { error } = await supabase.from("stok_barang").insert([{
      nama_produk: namaBaru.trim(), jumlah_stok: 0,
      harga_jual: toAngka(hargaBaru), satuan: "Bal",
    }]);
    if (error) showToast("Gagal mendaftar produk: " + error.message, "error");
    else { showToast("Produk berhasil didaftarkan!"); setNamaBaru(""); setHargaBaru(""); fetchData(); }
    setSubmitting(null);
  };

  const simpanProduksi = async () => {
    if (!idProduksi || !qtyProduksi) return showToast("Pilih produk & isi qty!", "error");
    const p = produk.find((x) => x.id === parseInt(idProduksi));
    if (!p) return showToast("Produk tidak ditemukan", "error");
    const qty = parseInt(qtyProduksi);
    if (qty <= 0) return showToast("Qty harus lebih dari 0", "error");

    setSubmitting("produksi");
    // ✅ FIX: Gunakan increment via RPC agar aman dari race condition
    const { error: errStok } = await supabase.rpc("increment_stok", { p_id: p.id, p_delta: qty });
    if (errStok) {
      // Fallback kalau RPC belum ada
      const { error } = await supabase.from("stok_barang").update({ jumlah_stok: p.jumlah_stok + qty }).eq("id", p.id);
      if (error) { showToast("Gagal update stok: " + error.message, "error"); setSubmitting(null); return; }
    }
    const { error: errMutasi } = await supabase.from("mutasi_stok").insert([{ produk_id: p.id, tipe: "Masuk", jumlah: qty, keterangan: "Produksi" }]);
    if (errMutasi) showToast("Stok diupdate, tapi gagal catat mutasi", "info");
    else { showToast(`+${qty} stok ${p.nama_produk} berhasil dicatat!`); }

    setIdProduksi(""); setQtyProduksi(""); fetchData();
    setSubmitting(null);
  };

  const prosesPotongStok = async () => {
    if (!inputShopee.trim()) return showToast("Input Shopee kosong!", "error");
    setSubmitting("shopee");
    const baris = inputShopee.split("\n").filter((l) => l.trim());
    let berhasil = 0; let gagal: string[] = [];

    for (const line of baris) {
      const kolom = line.trim().split(/\t| {2,}/);
      const namaInput = kolom[0]?.trim().toLowerCase();
      const qtyInput = parseInt(kolom[1]);
      if (!namaInput || isNaN(qtyInput) || qtyInput <= 0) { gagal.push(line); continue; }

      const p = produk.find((x) => x.nama_produk.toLowerCase().includes(namaInput));
      if (!p) { gagal.push(`"${kolom[0]}" tidak ditemukan`); continue; }
      if (p.jumlah_stok < qtyInput) { gagal.push(`Stok ${p.nama_produk} tidak cukup (${p.jumlah_stok} < ${qtyInput})`); continue; }

      const { error } = await supabase.from("stok_barang").update({ jumlah_stok: p.jumlah_stok - qtyInput }).eq("id", p.id);
      if (error) { gagal.push(`Gagal update ${p.nama_produk}`); continue; }
      await supabase.from("mutasi_stok").insert([{ produk_id: p.id, tipe: "Keluar", jumlah: qtyInput, keterangan: "Shopee" }]);
      berhasil++;
    }

    if (gagal.length > 0) showToast(`${berhasil} berhasil, ${gagal.length} gagal: ${gagal[0]}`, "info");
    else showToast(`${berhasil} item stok Shopee berhasil dipotong!`);
    setInputShopee(""); fetchData();
    setSubmitting(null);
  };

  const prosesOffline = async () => {
    if (!idProdukOffline || !qtyOffline) return showToast("Pilih produk & isi qty!", "error");
    const p = produk.find((x) => x.id === parseInt(idProdukOffline));
    if (!p) return showToast("Produk tidak ditemukan", "error");
    const qty = parseInt(qtyOffline);
    if (qty <= 0) return showToast("Qty harus lebih dari 0", "error");
    if (p.jumlah_stok < qty) return showToast(`Stok tidak cukup! Tersisa ${p.jumlah_stok}`, "error");
    if (metodeBayar === "Piutang" && !namaPelanggan.trim()) return showToast("Isi nama pelanggan untuk piutang!", "error");

    const total = p.harga_jual * qty;
    askConfirm(
      "Konfirmasi Penjualan",
      `Jual ${p.nama_produk} x${qty} = ${rupiahFmt(total)} via ${metodeBayar}?`,
      async () => {
        setSubmitting("offline");
        const { error: errStok } = await supabase.from("stok_barang").update({ jumlah_stok: p.jumlah_stok - qty }).eq("id", p.id);
        if (errStok) { showToast("Gagal update stok: " + errStok.message, "error"); setSubmitting(null); return; }

        await supabase.from("mutasi_stok").insert([{ produk_id: p.id, tipe: "Keluar", jumlah: qty, keterangan: "Offline" }]);

        if (metodeBayar === "Tunai") {
          const { error } = await supabase.from("kas").insert([{ tipe: "Masuk", kategori: "Offline", nominal: total, keterangan: `Jual ${p.nama_produk} x${qty}` }]);
          if (error) showToast("Stok dipotong, tapi gagal catat kas", "info");
        } else {
          const { error } = await supabase.from("piutang").insert([{ nama_pelanggan: namaPelanggan.trim(), nominal: total, keterangan: `Hutang ${p.nama_produk} x${qty}`, status: "Belum Lunas" }]);
          if (error) showToast("Stok dipotong, tapi gagal catat piutang", "info");
        }

        showToast(`Jual ${p.nama_produk} x${qty} berhasil!`);
        setIdProdukOffline(""); setQtyOffline(""); setNamaPelanggan(""); fetchData();
        setSubmitting(null);
      }
    );
  };

  const prosesBelanja = async () => {
    if (!nomBelanja) return showToast("Isi nominal belanja!", "error");
    const nominal = toAngka(nomBelanja);
    if (nominal <= 0) return showToast("Nominal tidak valid", "error");
    const zakatBaru = Math.floor(nominal * 0.025);
    const saldoZakatLalu = zakat[0]?.saldo_zakat || 0;

    setSubmitting("belanja");
    const { error: errKas } = await supabase.from("kas").insert([{ tipe: "Keluar", kategori: "Belanja", nominal, keterangan: itemBelanja || "Belanja operasional" }]);
    if (errKas) { showToast("Gagal catat kas belanja: " + errKas.message, "error"); setSubmitting(null); return; }

    const { error: errZakat } = await supabase.from("data_zakat").insert([{
      nominal_belanja: nominal, zakat_keluar: 0,
      saldo_zakat: saldoZakatLalu + zakatBaru, pj: "Sistem",
    }]);
    if (errZakat) showToast("Belanja dicatat, tapi gagal update zakat", "info");
    else showToast(`Belanja ${rupiahFmt(nominal)} dicatat. Zakat +${rupiahFmt(zakatBaru)}`);

    setNomBelanja(""); setItemBelanja(""); fetchData();
    setSubmitting(null);
  };

  const lunaskanPiutang = (pt: Piutang) => {
    askConfirm(
      "Lunaskan Piutang",
      `Tandai piutang ${pt.nama_pelanggan} sebesar ${rupiahFmt(pt.nominal)} sebagai lunas?`,
      async () => {
        const { error: errUpdate } = await supabase.from("piutang").update({ status: "Lunas" }).eq("id", pt.id);
        if (errUpdate) { showToast("Gagal update piutang", "error"); return; }
        const { error: errKas } = await supabase.from("kas").insert([{ tipe: "Masuk", kategori: "Piutang", nominal: pt.nominal, keterangan: `Lunas: ${pt.nama_pelanggan}` }]);
        if (errKas) showToast("Piutang dilunas, tapi gagal catat kas", "info");
        else showToast(`Piutang ${pt.nama_pelanggan} lunas!`);
        fetchData();
      }
    );
  };

  // ── Kalkulasi ──
  const totalKas = kas.reduce((acc, k) => k.tipe === "Masuk" ? acc + k.nominal : acc - k.nominal, 0);
  const omzetHariIni = kas.filter((k) => k.tipe === "Masuk" && isHariIni(k.created_at)).reduce((a, b) => a + b.nominal, 0);
  const totalPiutang = piutang.reduce((a, b) => a + b.nominal, 0);
  const saldoZakat = zakat[0]?.saldo_zakat || 0;

  // ── Loading ──
  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", fontFamily: "'Instrument Sans', sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "32px", marginBottom: "12px" }}>🌸</div>
        <div style={{ color: "#64748b", fontWeight: 600 }}>Memuat Azalea...</div>
      </div>
    </div>
  );

  const tabBtnStyle = (active: boolean, color: string): React.CSSProperties => ({
    flex: 1, padding: "13px 10px", borderRadius: "10px", border: "none",
    background: active ? color : "#e2e8f0", color: active ? "#fff" : "#64748b",
    fontWeight: 700, cursor: "pointer", fontSize: "13px",
    fontFamily: "'Instrument Sans', sans-serif", transition: "all 0.2s",
    letterSpacing: "0.02em",
  });

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;600;700;800&family=Instrument+Serif:ital@0;1&display=swap');
        * { box-sizing: border-box; }
        input:focus, select:focus, textarea:focus { border-color: #6366f1 !important; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
        @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #f1f5f9; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
      `}</style>

      <Toast toast={toast} onClose={() => setToast(null)} />
      <ConfirmModal dialog={confirm} onClose={() => setConfirm((p) => ({ ...p, open: false }))} />

      <div style={{ padding: "24px 20px", fontFamily: "'Instrument Sans', sans-serif", background: "#f8fafc", minHeight: "100vh", maxWidth: "1200px", margin: "0 auto" }}>

        {/* HEADER */}
        <div style={{ marginBottom: "24px", display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "28px" }}>🌸</span>
          <div>
            <h1 style={{ margin: 0, fontFamily: "'Instrument Serif', serif", fontSize: "26px", color: "#1e293b" }}>Azalea</h1>
            <p style={{ margin: 0, fontSize: "12px", color: "#94a3b8" }}>Manajemen Toko & Zakat Tijarah</p>
          </div>
        </div>

        {/* TABS */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
          <button onClick={() => setActiveTab("toko")} style={tabBtnStyle(activeTab === "toko", "#1e293b")}>🏪 Toko</button>
          <button onClick={() => setActiveTab("riwayat")} style={tabBtnStyle(activeTab === "riwayat", "#6366f1")}>📋 Riwayat</button>
          <button onClick={() => setActiveTab("zakat")} style={tabBtnStyle(activeTab === "zakat", "#10b981")}>🌙 Zakat</button>
        </div>

        {/* ====== TAB: TOKO ====== */}
        {activeTab === "toko" && (
          <div>
            {/* STATS */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "24px" }}>
              <KartuStat label="Omzet Hari Ini" nilai={rupiahFmt(omzetHariIni)} warna="#3b82f6" icon="📈" />
              <KartuStat label="Kas Kelola" nilai={rupiahFmt(totalKas)} warna="#f59e0b" icon="💰" />
              <KartuStat label="Piutang Aktif" nilai={rupiahFmt(totalPiutang)} warna="#ef4444" icon="📝" />
              <KartuStat label="Hutang Zakat" nilai={rupiahFmt(saldoZakat)} warna="#10b981" icon="🌙" />
            </div>

            {/* STOK MONITOR */}
            <div style={{ background: "#fff", padding: "20px", borderRadius: "14px", marginBottom: "24px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
              <h4 style={{ margin: "0 0 16px", fontFamily: "'Instrument Serif', serif", fontSize: "16px" }}>📦 Monitor Stok Gudang</h4>
              <div style={{ display: "flex", gap: "12px", overflowX: "auto", paddingBottom: "8px" }}>
                {produk.map((p) => {
                  const low = p.jumlah_stok < 10;
                  return (
                    <div key={p.id} style={{
                      minWidth: "120px", padding: "14px 12px", border: `1.5px solid ${low ? "#fecaca" : "#e2e8f0"}`,
                      borderRadius: "12px", textAlign: "center", background: low ? "#fff5f5" : "#fafafa",
                      transition: "transform 0.2s",
                    }}>
                      <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, marginBottom: "6px", lineHeight: 1.3 }}>{p.nama_produk}</div>
                      <div style={{ fontSize: "28px", fontWeight: 800, color: low ? "#ef4444" : "#1e293b", fontFamily: "'Instrument Serif', serif" }}>{p.jumlah_stok}</div>
                      <div style={{ fontSize: "10px", color: "#6366f1", fontWeight: 600, marginTop: "4px" }}>{rupiahFmt(p.harga_jual)}</div>
                      {low && <div style={{ fontSize: "10px", color: "#ef4444", marginTop: "4px", fontWeight: 700 }}>⚠ Stok Rendah</div>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* INPUT PANELS */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>

              {/* Produksi & Shopee */}
              <Panel title="Produksi & Shopee" icon="🍳" color="#2ecc71">
                <select value={idProduksi} onChange={(e) => setIdProduksi(e.target.value)} style={inputStyle}>
                  <option value="">Pilih Produk</option>
                  {produk.map((p) => <option key={p.id} value={p.id}>{p.nama_produk} (stok: {p.jumlah_stok})</option>)}
                </select>
                <input type="number" min="1" value={qtyProduksi} onChange={(e) => setQtyProduksi(e.target.value)} placeholder="Qty Produksi" style={inputStyle} />
                <Btn onClick={simpanProduksi} color="#2ecc71" disabled={submitting === "produksi"}>
                  {submitting === "produksi" ? "Menyimpan..." : "✓ Update Stok Produksi"}
                </Btn>
                <hr style={{ margin: "16px 0", border: "none", borderTop: "1px solid #f1f5f9" }} />
                <label style={{ fontSize: "12px", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                  Input Shopee (Format: Nama{"\t"}Qty, per baris)
                </label>
                <textarea value={inputShopee} onChange={(e) => setInputShopee(e.target.value)} placeholder={"Produk A\t5\nProduk B\t3"} style={{ ...inputStyle, height: "72px", resize: "vertical", marginBottom: "8px" }} />
                <Btn onClick={prosesPotongStok} color="#ee4d2d" disabled={submitting === "shopee"}>
                  {submitting === "shopee" ? "Memproses..." : "✂ Potong Stok Shopee"}
                </Btn>
              </Panel>

              {/* Kasir & Belanja */}
              <Panel title="Kasir & Belanja" icon="🏪" color="#8b5cf6">
                <select value={idProdukOffline} onChange={(e) => setIdProdukOffline(e.target.value)} style={inputStyle}>
                  <option value="">Pilih Produk</option>
                  {produk.map((p) => <option key={p.id} value={p.id}>{p.nama_produk} — {rupiahFmt(p.harga_jual)}</option>)}
                </select>
                <input type="number" min="1" value={qtyOffline} onChange={(e) => setQtyOffline(e.target.value)} placeholder="Qty" style={inputStyle} />
                <select value={metodeBayar} onChange={(e) => setMetodeBayar(e.target.value)} style={inputStyle}>
                  <option value="Tunai">💵 Tunai</option>
                  <option value="Piutang">📝 Piutang (Hutang)</option>
                </select>
                {metodeBayar === "Piutang" && (
                  <input type="text" value={namaPelanggan} onChange={(e) => setNamaPelanggan(e.target.value)} placeholder="Nama Pelanggan" style={inputStyle} />
                )}
                {idProdukOffline && qtyOffline && (
                  <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "10px 12px", borderRadius: "8px", marginBottom: "8px", fontSize: "13px", color: "#15803d", fontWeight: 700 }}>
                    Total: {rupiahFmt((produk.find(p => p.id === parseInt(idProdukOffline))?.harga_jual || 0) * parseInt(qtyOffline || "0"))}
                  </div>
                )}
                <Btn onClick={prosesOffline} color="#8b5cf6" disabled={submitting === "offline"}>
                  {submitting === "offline" ? "Memproses..." : "💳 Proses Penjualan"}
                </Btn>
                <hr style={{ margin: "16px 0", border: "none", borderTop: "1px solid #f1f5f9" }} />
                <input type="text" value={itemBelanja} onChange={(e) => setItemBelanja(e.target.value)} placeholder="Keterangan Item Belanja" style={inputStyle} />
                <input type="text" value={nomBelanja} onChange={(e) => setNomBelanja(formatIDR(e.target.value))} placeholder="Nominal (Rp)" style={inputStyle} />
                {nomBelanja && (
                  <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "8px" }}>
                    Zakat 2.5%: +{rupiahFmt(Math.floor(toAngka(nomBelanja) * 0.025))}
                  </div>
                )}
                <Btn onClick={prosesBelanja} color="#ef4444" disabled={submitting === "belanja"}>
                  {submitting === "belanja" ? "Menyimpan..." : "🛒 Catat Belanja"}
                </Btn>
              </Panel>

              {/* Master & Piutang */}
              <Panel title="Master Produk & Piutang" icon="✨" color="#3b82f6">
                <input type="text" value={namaBaru} onChange={(e) => setNamaBaru(e.target.value)} placeholder="Nama Produk Baru" style={inputStyle} />
                <input type="text" value={hargaBaru} onChange={(e) => setHargaBaru(formatIDR(e.target.value))} placeholder="Harga Jual (Rp)" style={inputStyle} />
                <Btn onClick={tambahMaster} color="#3b82f6" disabled={submitting === "master"}>
                  {submitting === "master" ? "Mendaftar..." : "+ Daftarkan Produk"}
                </Btn>
                <hr style={{ margin: "16px 0", border: "none", borderTop: "1px solid #f1f5f9" }} />
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", marginBottom: "10px" }}>
                  PIUTANG AKTIF ({piutang.length})
                </div>
                <div style={{ maxHeight: "180px", overflowY: "auto" }}>
                  {piutang.length === 0 && <div style={{ color: "#94a3b8", fontSize: "13px", textAlign: "center", padding: "16px" }}>Tidak ada piutang aktif 🎉</div>}
                  {piutang.map((pt) => (
                    <div key={pt.id} style={{ borderBottom: "1px solid #f1f5f9", padding: "10px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "13px" }}>{pt.nama_pelanggan}</div>
                        <div style={{ fontSize: "12px", color: "#ef4444", fontWeight: 700 }}>{rupiahFmt(pt.nominal)}</div>
                        <div style={{ fontSize: "11px", color: "#94a3b8" }}>{pt.keterangan}</div>
                      </div>
                      <button onClick={() => lunaskanPiutang(pt)} style={{ background: "#10b981", color: "#fff", border: "none", padding: "6px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: 700, whiteSpace: "nowrap" }}>
                        ✓ Lunas
                      </button>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          </div>
        )}

        {/* ====== TAB: RIWAYAT ====== */}
        {activeTab === "riwayat" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div style={{ background: "#fff", padding: "20px", borderRadius: "14px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
              <h4 style={{ margin: "0 0 16px", fontFamily: "'Instrument Serif', serif" }}>📦 Mutasi Stok Terakhir</h4>
              <div style={{ maxHeight: "480px", overflowY: "auto" }}>
                {mutasi.map((m) => (
                  <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "13px" }}>{m.stok_barang?.nama_produk}</div>
                      <div style={{ fontSize: "11px", color: "#94a3b8" }}>{m.keterangan} · {tanggalFmt(m.created_at)}</div>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: "15px", color: m.tipe === "Masuk" ? "#10b981" : "#ef4444" }}>
                      {m.tipe === "Masuk" ? "+" : "-"}{m.jumlah}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: "#fff", padding: "20px", borderRadius: "14px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
              <h4 style={{ margin: "0 0 16px", fontFamily: "'Instrument Serif', serif" }}>💰 Arus Kas Terakhir</h4>
              <div style={{ maxHeight: "480px", overflowY: "auto" }}>
                {kas.map((k) => (
                  <div key={k.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "13px" }}>{k.keterangan || k.kategori}</div>
                      <div style={{ fontSize: "11px", color: "#94a3b8" }}>{k.kategori} · {tanggalFmt(k.created_at)}</div>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: "14px", color: k.tipe === "Masuk" ? "#10b981" : "#ef4444" }}>
                      {k.tipe === "Masuk" ? "+" : "-"}{rupiahFmt(k.nominal)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           
        {/* ====== TAB: ZAKAT ====== */}
        {activeTab === "zakat" && (
          <div style={{ maxWidth: "560px", margin: "0 auto" }}>
            <div style={{ background: "linear-gradient(135deg, #10b981, #059669)", color: "#fff", padding: "32px", borderRadius: "16px", textAlign: "center", marginBottom: "20px", boxShadow: "0 8px 24px rgba(16,185,129,0.35)" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, letterSpacing: "0.1em", opacity: 0.85, marginBottom: "8px" }}>HUTANG ZAKAT TIJARAH AZALEA</div>
              <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: "40px", fontWeight: 400 }}>{rupiahFmt(saldoZakat)}</div>
              <div style={{ fontSize: "12px", opacity: 0.75, marginTop: "8px" }}>2.5% dari total belanja operasional</div>
            </div>
            <div style={{ background: "#fff", padding: "20px", borderRadius: "14px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
              <h4 style={{ margin: "0 0 16px", fontFamily: "'Instrument Serif', serif" }}>Riwayat Zakat</h4>
              {zakat.map((z) => (
                <div key={z.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #f1f5f9", fontSize: "14px" }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{z.nominal_belanja > 0 ? "Belanja Operasional" : "Bayar Zakat"}</div>
                    <div style={{ fontSize: "11px", color: "#94a3b8" }}>{tanggalFmt(z.created_at)}</div>
                    {z.nominal_belanja > 0 && <div style={{ fontSize: "11px", color: "#64748b" }}>Belanja: {rupiahFmt(z.nominal_belanja)}</div>}
                  </div>
                  <div style={{ fontWeight: 800, color: z.nominal_belanja > 0 ? "#3b82f6" : "#ef4444" }}>
                    {z.nominal_belanja > 0 ? `+${rupiahFmt(Math.floor(z.nominal_belanja * 0.025))}` : `-${rupiahFmt(z.zakat_keluar)}`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
