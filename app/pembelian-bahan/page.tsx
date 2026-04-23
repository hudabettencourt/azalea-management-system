"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

type BahanBaku = { id: number; nama: string; satuan: string; kategori: string; stok: number; harga_beli_avg: number };
type PembelianBahan = { id: number; tanggal: string; supplier_nama: string; total_bayar: number; metode_bayar: string; status_bayar: string; total_item: number; created_at: string };
type HutangBahan = { id: number; supplier_nama: string; nominal: number; status: string; created_at: string };
type ItemBeli = { bahan_id: string; nama: string; qty: string; harga_beli: string; satuan: string };
type Toast = { msg: string; type: "success" | "error" | "info" };

const rupiahFmt = (n: number) => `Rp ${(n || 0).toLocaleString("id-ID")}`;
const tanggalFmt = (s: string) => new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });

export default function PembelianBahanPage() {
  const [bahan, setBahan] = useState<BahanBaku[]>([]);
  const [riwayat, setRiwayat] = useState<PembelianBahan[]>([]);
  const [hutang, setHutang] = useState<HutangBahan[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [activeTab, setActiveTab] = useState<"beli" | "riwayat" | "hutang" | "master">("beli");

  // Form pembelian
  const [supplierNama, setSupplierNama] = useState("");
  const [metodeBayar, setMetodeBayar] = useState("Tunai");
  const [catatan, setCatatan] = useState("");
  const [items, setItems] = useState<ItemBeli[]>([
    { bahan_id: "", nama: "", qty: "", harga_beli: "", satuan: "" }
  ]);

  // Form master bahan baru
  const [namaBaru, setNamaBaru] = useState("");
  const [satuanBaru, setSatuanBaru] = useState("kg");
  const [kategoriBaru, setKategoriBaru] = useState("Bahan Baku");
  const [filterKategori, setFilterKategori] = useState("Semua");

  const showToast = (msg: string, type: Toast["type"] = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchData = useCallback(async () => {
    try {
      const [resBahan, resRiwayat, resHutang] = await Promise.all([
        // FIX BUG 1: Pakai .or() agar bahan dengan aktif=null tetap muncul
        supabase.from("bahan_baku").select("*").or("aktif.eq.true,aktif.is.null").order("kategori").order("nama"),
        supabase.from("pembelian_bahan").select("*").order("created_at", { ascending: false }).limit(20),
        supabase.from("hutang_supplier_bahan").select("*").eq("status", "Belum Lunas").order("created_at", { ascending: false }),
      ]);

      if (resBahan.error) throw new Error("Gagal load bahan: " + resBahan.error.message);
      if (resRiwayat.error) throw new Error("Gagal load riwayat: " + resRiwayat.error.message);
      if (resHutang.error) throw new Error("Gagal load hutang: " + resHutang.error.message);

      setBahan(resBahan.data || []);
      setRiwayat(resRiwayat.data || []);
      setHutang(resHutang.data || []);
    } catch (err: any) {
      showToast(err.message || "Gagal memuat data", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const addItem = () => setItems([...items, { bahan_id: "", nama: "", qty: "", harga_beli: "", satuan: "" }]);

  const removeItem = (idx: number) => {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, field: keyof ItemBeli, value: string) => {
    const newItems = [...items];
    if (field === "bahan_id") {
      const b = bahan.find(x => x.id === parseInt(value));
      newItems[idx] = {
        ...newItems[idx],
        bahan_id: value,
        nama: b?.nama || "",
        satuan: b?.satuan || "",
        harga_beli: b?.harga_beli_avg ? String(Math.round(b.harga_beli_avg)) : "",
      };
    } else {
      newItems[idx] = { ...newItems[idx], [field]: value };
    }
    setItems(newItems);
  };

  const totalBayar = items.reduce((acc, item) => {
    return acc + (parseFloat(item.qty || "0") * parseInt(item.harga_beli || "0"));
  }, 0);

  const simpanPembelian = async () => {
    if (!supplierNama.trim()) return showToast("Isi nama supplier!", "error");
    const validItems = items.filter(i => i.bahan_id && i.qty && i.harga_beli);
    if (validItems.length === 0) return showToast("Minimal 1 bahan harus diisi!", "error");

    setSubmitting(true);
    try {
      // FIX BUG 2: Ganti .single() dengan .limit(1) agar tidak crash saat tabel zakat kosong
      const { data: zakatRows } = await supabase
        .from("data_zakat")
        .select("saldo_zakat")
        .order("created_at", { ascending: false })
        .limit(1);
      const saldoZakatLalu = zakatRows?.[0]?.saldo_zakat || 0;
      const zakatBaru = Math.floor(totalBayar * 0.025);

      // Simpan header pembelian
      const { data: pembelianData, error: errPembelian } = await supabase
        .from("pembelian_bahan")
        .insert([{
          supplier_nama: supplierNama.trim(),
          total_item: validItems.length,
          total_bayar: totalBayar,
          metode_bayar: metodeBayar,
          status_bayar: metodeBayar === "Hutang" ? "Belum Lunas" : "Lunas",
          catatan: catatan.trim() || null,
        }])
        .select()
        .single();

      if (errPembelian) throw new Error("Gagal simpan: " + errPembelian.message);

      // Simpan detail + update stok & HPP per bahan
      for (const item of validItems) {
        const qty = parseFloat(item.qty);
        const harga = parseInt(item.harga_beli);
        const bahanId = parseInt(item.bahan_id);

        const { error: errDetail } = await supabase.from("detail_pembelian_bahan").insert([{
          pembelian_bahan_id: pembelianData.id,
          bahan_baku_id: bahanId,
          qty,
          harga_beli: harga,
          subtotal: qty * harga,
        }]);
        if (errDetail) throw new Error("Gagal simpan detail: " + errDetail.message);

        // FIX BUG 3: Tambah fallback manual kalau RPC update_hpp_bahan belum ada
        const { error: errRpc } = await supabase.rpc("update_hpp_bahan", {
          p_bahan_id: bahanId,
          p_qty: qty,
          p_harga_beli: harga,
        });
        if (errRpc) {
          // Fallback: update stok saja langsung
          const bahanData = bahan.find(b => b.id === bahanId);
          if (bahanData) {
            const stokBaru = (bahanData.stok || 0) + qty;
            const nilaiLama = (bahanData.stok || 0) * (bahanData.harga_beli_avg || 0);
            const nilaiMasuk = qty * harga;
            const hppBaru = stokBaru > 0 ? Math.round((nilaiLama + nilaiMasuk) / stokBaru) : harga;
            await supabase.from("bahan_baku").update({
              stok: stokBaru,
              harga_beli_avg: hppBaru,
              total_nilai_stok: stokBaru * hppBaru,
            }).eq("id", bahanId);
          }
        }
      }

      // Catat kas keluar (kalau bukan hutang)
      if (metodeBayar !== "Hutang") {
        await supabase.from("kas").insert([{
          tipe: "Keluar",
          kategori: "Beli Bahan",
          nominal: totalBayar,
          keterangan: `Beli bahan dari ${supplierNama} (${validItems.length} item)`,
        }]);
      }

      // Catat hutang (kalau hutang)
      if (metodeBayar === "Hutang") {
        await supabase.from("hutang_supplier_bahan").insert([{
          pembelian_bahan_id: pembelianData.id,
          supplier_nama: supplierNama.trim(),
          nominal: totalBayar,
          status: "Belum Lunas",
        }]);
      }

      // Catat zakat otomatis
      await supabase.from("data_zakat").insert([{
        nominal_belanja: totalBayar,
        zakat_keluar: 0,
        saldo_zakat: saldoZakatLalu + zakatBaru,
        pj: `Beli Bahan - ${supplierNama}`,
      }]);

      showToast(`Pembelian ${rupiahFmt(totalBayar)} berhasil! Zakat +${rupiahFmt(zakatBaru)}`);

      // Reset form
      setSupplierNama("");
      setMetodeBayar("Tunai");
      setCatatan("");
      setItems([{ bahan_id: "", nama: "", qty: "", harga_beli: "", satuan: "" }]);
      fetchData();
      setActiveTab("riwayat");

    } catch (err: any) {
      showToast(err.message || "Gagal simpan", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const lunaskanHutang = async (id: number, nominal: number, nama: string) => {
    const { error } = await supabase.from("hutang_supplier_bahan").update({ status: "Lunas" }).eq("id", id);
    if (error) return showToast("Gagal update hutang", "error");
    await supabase.from("kas").insert([{
      tipe: "Keluar",
      kategori: "Hutang Supplier",
      nominal,
      keterangan: `Bayar hutang bahan ke ${nama}`,
    }]);
    showToast(`Hutang ke ${nama} lunas!`);
    fetchData();
  };

  const tambahBahan = async () => {
    if (!namaBaru.trim()) return showToast("Isi nama bahan!", "error");
    const { error } = await supabase.from("bahan_baku").insert([{
      nama: namaBaru.trim(),
      satuan: satuanBaru,
      kategori: kategoriBaru,
      aktif: true,
      stok: 0,
      harga_beli_avg: 0,
      total_nilai_stok: 0,
    }]);
    if (error) return showToast("Gagal tambah bahan: " + error.message, "error");
    showToast(`${namaBaru} berhasil ditambahkan!`);
    setNamaBaru("");
    fetchData();
  };

  const totalHutang = hutang.reduce((a, b) => a + b.nominal, 0);

  // Ambil kategori unik dari data (tidak hardcode)
  const kategoriList = Array.from(new Set(bahan.map(b => b.kategori).filter(Boolean)));
  const bahanFiltered = filterKategori === "Semua" ? bahan : bahan.filter(b => b.kategori === filterKategori);

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px",
    border: "1.5px solid #e2e8f0", borderRadius: "8px",
    fontFamily: "'Instrument Sans', sans-serif", fontSize: "13px",
    boxSizing: "border-box", outline: "none", background: "#fff",
  };

  const tabBtn = (active: boolean, color: string): React.CSSProperties => ({
    flex: 1, padding: "11px", borderRadius: "8px", border: "none",
    background: active ? color : "#e2e8f0",
    color: active ? "#fff" : "#64748b",
    fontWeight: 700, cursor: "pointer", fontSize: "12px",
    fontFamily: "'Instrument Sans', sans-serif",
  });

  const kategoriColor: Record<string, string> = {
    "Bahan Baku": "#3b82f6",
    "Bahan Penolong": "#f59e0b",
    "Packaging": "#8b5cf6",
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Instrument Sans', sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "32px", marginBottom: "12px" }}>🧪</div>
        <div style={{ color: "#64748b", fontWeight: 600 }}>Memuat data bahan...</div>
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;600;700;800&family=Instrument+Serif:ital@0;1&display=swap');
        * { box-sizing: border-box; }
        input:focus, select:focus, textarea:focus { border-color: #6366f1 !important; outline: none; }
      `}</style>

      {toast && (
        <div style={{
          position: "fixed", top: "24px", right: "24px", zIndex: 9999,
          background: toast.type === "success" ? "#10b981" : toast.type === "error" ? "#ef4444" : "#3b82f6",
          color: "#fff", padding: "14px 20px", borderRadius: "12px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          fontFamily: "'Instrument Sans', sans-serif", fontWeight: 600, fontSize: "14px",
        }}>{toast.msg}</div>
      )}

      <div style={{ padding: "24px 20px", fontFamily: "'Instrument Sans', sans-serif", background: "#f8fafc", minHeight: "100vh", maxWidth: "900px", margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
          <a href="/" style={{ color: "#64748b", textDecoration: "none", fontSize: "13px" }}>← Kembali</a>
          <div>
            <h1 style={{ margin: 0, fontFamily: "'Instrument Serif', serif", fontSize: "24px", color: "#1e293b" }}>🧪 Pembelian Bahan Produksi</h1>
            <p style={{ margin: 0, fontSize: "12px", color: "#94a3b8" }}>Bahan baku, penolong & packaging · Zakat otomatis 2.5%</p>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "24px" }}>
          <div style={{ background: "#fff", padding: "16px 20px", borderRadius: "14px", borderLeft: "5px solid #3b82f6", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>Total Bahan</div>
            <div style={{ fontSize: "22px", fontWeight: 800, color: "#1e293b", fontFamily: "'Instrument Serif', serif" }}>{bahan.length} item</div>
          </div>
          <div style={{ background: "#fff", padding: "16px 20px", borderRadius: "14px", borderLeft: "5px solid #f59e0b", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>Hutang Supplier</div>
            <div style={{ fontSize: "22px", fontWeight: 800, color: "#1e293b", fontFamily: "'Instrument Serif', serif" }}>{rupiahFmt(totalHutang)}</div>
          </div>
          <div style={{ background: "#fff", padding: "16px 20px", borderRadius: "14px", borderLeft: "5px solid #10b981", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>Total Transaksi</div>
            <div style={{ fontSize: "22px", fontWeight: 800, color: "#1e293b", fontFamily: "'Instrument Serif', serif" }}>{riwayat.length} pembelian</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          <button onClick={() => setActiveTab("beli")} style={tabBtn(activeTab === "beli", "#6366f1")}>🛒 Input Beli</button>
          <button onClick={() => setActiveTab("riwayat")} style={tabBtn(activeTab === "riwayat", "#1e293b")}>📋 Riwayat</button>
          <button onClick={() => setActiveTab("hutang")} style={tabBtn(activeTab === "hutang", "#f59e0b")}>💳 Hutang {hutang.length > 0 && `(${hutang.length})`}</button>
          <button onClick={() => setActiveTab("master")} style={tabBtn(activeTab === "master", "#3b82f6")}>📦 Master Bahan</button>
        </div>

        {/* TAB: INPUT BELI */}
        {activeTab === "beli" && (
          <div style={{ background: "#fff", padding: "24px", borderRadius: "14px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            <h3 style={{ margin: "0 0 20px", fontFamily: "'Instrument Serif', serif", fontSize: "18px" }}>Input Pembelian Bahan</h3>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", display: "block", marginBottom: "6px" }}>SUPPLIER / TOKO</label>
                <input type="text" value={supplierNama} onChange={e => setSupplierNama(e.target.value)} placeholder="Nama supplier/toko" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", display: "block", marginBottom: "6px" }}>METODE BAYAR</label>
                <select value={metodeBayar} onChange={e => setMetodeBayar(e.target.value)} style={inputStyle}>
                  <option value="Tunai">💵 Tunai</option>
                  <option value="Transfer">🏦 Transfer</option>
                  <option value="Hutang">📝 Hutang</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", display: "block", marginBottom: "6px" }}>CATATAN</label>
              <input type="text" value={catatan} onChange={e => setCatatan(e.target.value)} placeholder="Opsional" style={inputStyle} />
            </div>

            {/* Items */}
            <div style={{ marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b" }}>
                  BAHAN YANG DIBELI
                  {bahan.length === 0 && (
                    <span style={{ color: "#ef4444", marginLeft: "8px", fontWeight: 400 }}>
                      ⚠ Belum ada bahan — tambah dulu di tab Master Bahan
                    </span>
                  )}
                </label>
                <button onClick={addItem} style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#15803d", padding: "5px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: 700 }}>+ Tambah Bahan</button>
              </div>

              {/* Header kolom */}
              <div style={{ display: "grid", gridTemplateColumns: "2fr 80px 80px 140px 30px", gap: "8px", marginBottom: "6px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8" }}>BAHAN</div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8" }}>QTY</div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8" }}>SATUAN</div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8" }}>HARGA BELI</div>
                <div></div>
              </div>

              {items.map((item, idx) => (
                <div key={idx} style={{ marginBottom: "8px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 80px 80px 140px 30px", gap: "8px", alignItems: "center" }}>
                    {/* FIX BUG 1: Render optgroup hanya kalau ada bahan di kategori itu */}
                    <select value={item.bahan_id} onChange={e => updateItem(idx, "bahan_id", e.target.value)} style={inputStyle}>
                      <option value="">— Pilih Bahan —</option>
                      {kategoriList.length > 0
                        ? kategoriList.map(kat => {
                            const bahanDalamKat = bahan.filter(b => b.kategori === kat);
                            if (bahanDalamKat.length === 0) return null;
                            return (
                              <optgroup key={kat} label={kat}>
                                {bahanDalamKat.map(b => (
                                  <option key={b.id} value={b.id}>
                                    {b.nama} (stok: {b.stok} {b.satuan})
                                  </option>
                                ))}
                              </optgroup>
                            );
                          })
                        : bahan.map(b => (
                            <option key={b.id} value={b.id}>
                              {b.nama} (stok: {b.stok} {b.satuan})
                            </option>
                          ))
                      }
                    </select>
                    <input type="number" value={item.qty} onChange={e => updateItem(idx, "qty", e.target.value)} placeholder="0" style={inputStyle} min="0" step="0.1" />
                    <div style={{ padding: "9px 12px", background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", color: "#64748b", textAlign: "center" }}>
                      {item.satuan || "-"}
                    </div>
                    <input type="number" value={item.harga_beli} onChange={e => updateItem(idx, "harga_beli", e.target.value)} placeholder="Harga/satuan" style={inputStyle} min="0" />
                    <button onClick={() => removeItem(idx)} style={{ background: "#fff5f5", border: "1px solid #fecaca", color: "#ef4444", width: "30px", height: "38px", borderRadius: "6px", cursor: "pointer", fontSize: "16px", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                  </div>
                  {item.qty && item.harga_beli && (
                    <div style={{ fontSize: "11px", color: "#6366f1", marginTop: "2px", paddingLeft: "4px", fontWeight: 600 }}>
                      Subtotal: {rupiahFmt(parseFloat(item.qty || "0") * parseInt(item.harga_beli || "0"))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Total & Zakat */}
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px 16px", marginBottom: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontWeight: 700, color: "#64748b" }}>TOTAL BAYAR</span>
                <span style={{ fontWeight: 800, fontSize: "20px", color: "#1e293b", fontFamily: "'Instrument Serif', serif" }}>{rupiahFmt(totalBayar)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "12px", color: "#10b981", fontWeight: 600 }}>🌙 Zakat Tijarah (2.5%)</span>
                <span style={{ fontSize: "12px", color: "#10b981", fontWeight: 700 }}>+{rupiahFmt(Math.floor(totalBayar * 0.025))}</span>
              </div>
            </div>

            {metodeBayar === "Hutang" && (
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "10px", padding: "12px 16px", marginBottom: "12px", fontSize: "13px", color: "#92400e" }}>
                ⚠️ Akan dicatat sebagai <strong>hutang ke supplier</strong> sebesar {rupiahFmt(totalBayar)}
              </div>
            )}

            <button onClick={simpanPembelian} disabled={submitting} style={{
              width: "100%", padding: "13px", border: "none", borderRadius: "10px",
              background: submitting ? "#cbd5e1" : "#6366f1",
              color: "#fff", fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer",
              fontFamily: "'Instrument Sans', sans-serif", fontSize: "15px",
            }}>
              {submitting ? "Menyimpan..." : "✓ Simpan Pembelian Bahan"}
            </button>
          </div>
        )}

        {/* TAB: RIWAYAT */}
        {activeTab === "riwayat" && (
          <div style={{ background: "#fff", padding: "20px", borderRadius: "14px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            <h3 style={{ margin: "0 0 16px", fontFamily: "'Instrument Serif', serif" }}>Riwayat Pembelian Bahan</h3>
            {riwayat.length === 0 && <div style={{ textAlign: "center", color: "#94a3b8", padding: "32px", fontSize: "14px" }}>Belum ada riwayat pembelian bahan</div>}
            {riwayat.map(r => (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #f1f5f9" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "14px" }}>{r.supplier_nama}</div>
                  <div style={{ fontSize: "12px", color: "#94a3b8" }}>{tanggalFmt(r.created_at)} · {r.total_item} bahan · {r.metode_bayar}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800, fontSize: "15px", color: "#1e293b" }}>{rupiahFmt(r.total_bayar)}</div>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: r.status_bayar === "Lunas" ? "#10b981" : "#f59e0b" }}>{r.status_bayar}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB: HUTANG */}
        {activeTab === "hutang" && (
          <div style={{ background: "#fff", padding: "20px", borderRadius: "14px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            <h3 style={{ margin: "0 0 16px", fontFamily: "'Instrument Serif', serif" }}>Hutang ke Supplier Bahan</h3>
            {hutang.length === 0 && <div style={{ textAlign: "center", color: "#94a3b8", padding: "32px", fontSize: "14px" }}>Tidak ada hutang supplier 🎉</div>}
            {hutang.map(h => (
              <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #f1f5f9" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "14px" }}>{h.supplier_nama}</div>
                  <div style={{ fontSize: "12px", color: "#94a3b8" }}>{tanggalFmt(h.created_at)}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ fontWeight: 800, fontSize: "15px", color: "#f59e0b" }}>{rupiahFmt(h.nominal)}</div>
                  <button onClick={() => lunaskanHutang(h.id, h.nominal, h.supplier_nama)} style={{ background: "#10b981", color: "#fff", border: "none", padding: "6px 14px", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: 700 }}>
                    ✓ Lunas
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB: MASTER BAHAN */}
        {activeTab === "master" && (
          <div>
            {/* Form tambah bahan baru */}
            <div style={{ background: "#fff", padding: "20px", borderRadius: "14px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: "16px" }}>
              <h3 style={{ margin: "0 0 16px", fontFamily: "'Instrument Serif', serif", fontSize: "16px" }}>+ Tambah Bahan Baru</h3>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: "10px", alignItems: "end" }}>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", display: "block", marginBottom: "6px" }}>NAMA BAHAN</label>
                  <input type="text" value={namaBaru} onChange={e => setNamaBaru(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && tambahBahan()}
                    placeholder="Nama bahan baru" style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", display: "block", marginBottom: "6px" }}>SATUAN</label>
                  <select value={satuanBaru} onChange={e => setSatuanBaru(e.target.value)} style={inputStyle}>
                    <option value="kg">kg</option>
                    <option value="liter">liter</option>
                    <option value="pack">pack</option>
                    <option value="pcs">pcs</option>
                    <option value="roll">roll</option>
                    <option value="karung">karung</option>
                    <option value="lusin">lusin</option>
                    <option value="box">box</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", display: "block", marginBottom: "6px" }}>KATEGORI</label>
                  <select value={kategoriBaru} onChange={e => setKategoriBaru(e.target.value)} style={inputStyle}>
                    <option value="Bahan Baku">Bahan Baku</option>
                    <option value="Bahan Penolong">Bahan Penolong</option>
                    <option value="Packaging">Packaging</option>
                  </select>
                </div>
                <button onClick={tambahBahan} style={{ padding: "9px 16px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 700, fontSize: "13px", fontFamily: "'Instrument Sans', sans-serif", whiteSpace: "nowrap" }}>
                  + Tambah
                </button>
              </div>
            </div>

            {/* List bahan */}
            <div style={{ background: "#fff", padding: "20px", borderRadius: "14px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3 style={{ margin: 0, fontFamily: "'Instrument Serif', serif", fontSize: "16px" }}>Daftar Bahan ({bahan.length})</h3>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {["Semua", ...kategoriList].map(k => (
                    <button key={k} onClick={() => setFilterKategori(k)} style={{
                      padding: "5px 10px", borderRadius: "6px", border: "none", cursor: "pointer",
                      background: filterKategori === k ? "#1e293b" : "#f1f5f9",
                      color: filterKategori === k ? "#fff" : "#64748b",
                      fontSize: "11px", fontWeight: 700,
                    }}>{k}</button>
                  ))}
                </div>
              </div>
              {bahanFiltered.length === 0 && (
                <div style={{ textAlign: "center", color: "#94a3b8", padding: "32px", fontSize: "14px" }}>
                  Belum ada bahan. Tambahkan di atas!
                </div>
              )}
              {bahanFiltered.map(b => (
                <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ background: (kategoriColor[b.kategori] || "#64748b") + "20", color: kategoriColor[b.kategori] || "#64748b", padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: 700 }}>
                      {b.kategori}
                    </span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "14px" }}>{b.nama}</div>
                      <div style={{ fontSize: "11px", color: "#94a3b8" }}>HPP: {rupiahFmt(b.harga_beli_avg)}/{b.satuan}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700, fontSize: "15px", color: b.stok <= 0 ? "#ef4444" : "#1e293b" }}>
                      {b.stok} {b.satuan}
                    </div>
                    {b.stok <= 0 && <div style={{ fontSize: "10px", color: "#ef4444", fontWeight: 700 }}>⚠ Habis</div>}
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