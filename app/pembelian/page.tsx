"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

type Produk = { id: number; nama_produk: string; jumlah_stok: number; harga_beli_avg: number; satuan: string };
type Supplier = { id: number; nama: string };
type Pembelian = { id: number; tanggal: string; supplier_nama: string; total_bayar: number; metode_bayar: string; status_bayar: string; total_item: number; created_at: string };
type HutangSupplier = { id: number; supplier_nama: string; nominal: number; status: string; created_at: string };
type ItemBeli = { produk_id: string; nama_produk: string; qty: string; harga_beli: string };

const rupiahFmt = (n: number) => `Rp ${(n || 0).toLocaleString("id-ID")}`;
const tanggalFmt = (s: string) => new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });

type Toast = { msg: string; type: "success" | "error" | "info" };

export default function PembelianPage() {
  const [produk, setProduk] = useState<Produk[]>([]);
  const [supplier, setSupplier] = useState<Supplier[]>([]);
  const [riwayat, setRiwayat] = useState<Pembelian[]>([]);
  const [hutang, setHutang] = useState<HutangSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [activeTab, setActiveTab] = useState<"beli" | "riwayat" | "hutang">("beli");

  // Form state
  const [supplierNama, setSupplierNama] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [metodeBayar, setMetodeBayar] = useState("Tunai");
  const [catatan, setCatatan] = useState("");
  const [items, setItems] = useState<ItemBeli[]>([
    { produk_id: "", nama_produk: "", qty: "", harga_beli: "" }
  ]);

  const showToast = (msg: string, type: Toast["type"] = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchData = useCallback(async () => {
    try {
      const [resProduk, resSupplier, resRiwayat, resHutang] = await Promise.all([
        supabase.from("stok_barang").select("*").order("nama_produk"),
        supabase.from("supplier").select("*").order("nama"),
        supabase.from("pembelian").select("*").order("created_at", { ascending: false }).limit(20),
        supabase.from("hutang_supplier").select("*").eq("status", "Belum Lunas").order("created_at", { ascending: false }),
      ]);
      setProduk(resProduk.data || []);
      setSupplier(resSupplier.data || []);
      setRiwayat(resRiwayat.data || []);
      setHutang(resHutang.data || []);
    } catch (err) {
      showToast("Gagal memuat data", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const addItem = () => setItems([...items, { produk_id: "", nama_produk: "", qty: "", harga_beli: "" }]);
  
  const removeItem = (idx: number) => {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, field: keyof ItemBeli, value: string) => {
    const newItems = [...items];
    if (field === "produk_id") {
      const p = produk.find(x => x.id === parseInt(value));
      newItems[idx] = { 
        ...newItems[idx], 
        produk_id: value,
        nama_produk: p?.nama_produk || "",
        harga_beli: p?.harga_beli_avg ? String(p.harga_beli_avg) : ""
      };
    } else {
      newItems[idx] = { ...newItems[idx], [field]: value };
    }
    setItems(newItems);
  };

  const totalBayar = items.reduce((acc, item) => {
    return acc + (parseInt(item.qty || "0") * parseInt(item.harga_beli || "0"));
  }, 0);

  const simpanPembelian = async () => {
    // Validasi
    if (!supplierNama.trim()) return showToast("Isi nama supplier!", "error");
    const validItems = items.filter(i => i.produk_id && i.qty && i.harga_beli);
    if (validItems.length === 0) return showToast("Minimal 1 produk harus diisi!", "error");
    for (const item of validItems) {
      if (parseInt(item.qty) <= 0) return showToast("Qty harus lebih dari 0!", "error");
      if (parseInt(item.harga_beli) <= 0) return showToast("Harga beli harus lebih dari 0!", "error");
    }

    setSubmitting(true);
    try {
      // 1. Simpan header pembelian
      const { data: pembelianData, error: errPembelian } = await supabase
        .from("pembelian")
        .insert([{
          supplier_id: supplierId || null,
          supplier_nama: supplierNama.trim(),
          total_item: validItems.length,
          total_bayar: totalBayar,
          metode_bayar: metodeBayar,
          status_bayar: metodeBayar === "Hutang" ? "Belum Lunas" : "Lunas",
          catatan: catatan.trim() || null,
        }])
        .select()
        .single();

      if (errPembelian) throw new Error("Gagal simpan pembelian: " + errPembelian.message);

      // 2. Simpan detail + update stok & HPP per produk
      for (const item of validItems) {
        const qty = parseInt(item.qty);
        const harga = parseInt(item.harga_beli);
        const produkId = parseInt(item.produk_id);

        // Simpan detail
        await supabase.from("detail_pembelian").insert([{
          pembelian_id: pembelianData.id,
          produk_id: produkId,
          qty,
          harga_beli: harga,
        }]);

        // Update HPP rata-rata via RPC
        await supabase.rpc("update_hpp_avg", {
          p_produk_id: produkId,
          p_qty: qty,
          p_harga_beli: harga,
        });

        // Catat mutasi stok
        await supabase.from("mutasi_stok").insert([{
          produk_id: produkId,
          tipe: "Masuk",
          jumlah: qty,
          keterangan: `Beli dari ${supplierNama}`,
        }]);
      }

      // 3. Catat kas keluar (kalau tunai/transfer)
      if (metodeBayar !== "Hutang") {
        await supabase.from("kas").insert([{
          tipe: "Keluar",
          kategori: "Pembelian",
          nominal: totalBayar,
          keterangan: `Beli dari ${supplierNama} (${validItems.length} item)`,
        }]);
      }

      // 4. Catat hutang supplier (kalau hutang)
      if (metodeBayar === "Hutang") {
        await supabase.from("hutang_supplier").insert([{
          pembelian_id: pembelianData.id,
          supplier_nama: supplierNama.trim(),
          nominal: totalBayar,
          status: "Belum Lunas",
        }]);
      }

      showToast(`Pembelian ${rupiahFmt(totalBayar)} berhasil dicatat!`);
      
      // Reset form
      setSupplierNama("");
      setSupplierId("");
      setMetodeBayar("Tunai");
      setCatatan("");
      setItems([{ produk_id: "", nama_produk: "", qty: "", harga_beli: "" }]);
      fetchData();
      setActiveTab("riwayat");

    } catch (err: any) {
      showToast(err.message || "Gagal simpan pembelian", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const lunaskanHutang = async (id: number, nominal: number, nama: string) => {
    const { error } = await supabase.from("hutang_supplier").update({ status: "Lunas" }).eq("id", id);
    if (error) return showToast("Gagal update hutang", "error");
    await supabase.from("kas").insert([{
      tipe: "Keluar",
      kategori: "Hutang Supplier",
      nominal,
      keterangan: `Bayar hutang ke ${nama}`,
    }]);
    showToast(`Hutang ke ${nama} lunas!`);
    fetchData();
  };

  const totalHutang = hutang.reduce((a, b) => a + b.nominal, 0);

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
    fontWeight: 700, cursor: "pointer", fontSize: "13px",
    fontFamily: "'Instrument Sans', sans-serif",
  });

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Instrument Sans', sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "32px", marginBottom: "12px" }}>🛒</div>
        <div style={{ color: "#64748b", fontWeight: 600 }}>Memuat data pembelian...</div>
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

      {/* Toast */}
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
            <h1 style={{ margin: 0, fontFamily: "'Instrument Serif', serif", fontSize: "24px", color: "#1e293b" }}>🛒 Pembelian Reseller</h1>
            <p style={{ margin: 0, fontSize: "12px", color: "#94a3b8" }}>Catat pembelian & update HPP otomatis</p>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
          <div style={{ background: "#fff", padding: "16px 20px", borderRadius: "14px", borderLeft: "5px solid #f59e0b", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>Hutang Supplier</div>
            <div style={{ fontSize: "22px", fontWeight: 800, color: "#1e293b", fontFamily: "'Instrument Serif', serif" }}>{rupiahFmt(totalHutang)}</div>
          </div>
          <div style={{ background: "#fff", padding: "16px 20px", borderRadius: "14px", borderLeft: "5px solid #6366f1", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>Total Transaksi</div>
            <div style={{ fontSize: "22px", fontWeight: 800, color: "#1e293b", fontFamily: "'Instrument Serif', serif" }}>{riwayat.length} pembelian</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          <button onClick={() => setActiveTab("beli")} style={tabBtn(activeTab === "beli", "#6366f1")}>🛒 Input Beli</button>
          <button onClick={() => setActiveTab("riwayat")} style={tabBtn(activeTab === "riwayat", "#1e293b")}>📋 Riwayat</button>
          <button onClick={() => setActiveTab("hutang")} style={tabBtn(activeTab === "hutang", "#f59e0b")}>💳 Hutang Supplier {hutang.length > 0 && `(${hutang.length})`}</button>
        </div>

        {/* TAB: INPUT BELI */}
        {activeTab === "beli" && (
          <div style={{ background: "#fff", padding: "24px", borderRadius: "14px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            <h3 style={{ margin: "0 0 20px", fontFamily: "'Instrument Serif', serif", fontSize: "18px" }}>Input Pembelian Baru</h3>

            {/* Supplier */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", display: "block", marginBottom: "6px" }}>SUPPLIER</label>
                <select value={supplierId} onChange={e => {
                  setSupplierId(e.target.value);
                  const s = supplier.find(x => x.id === parseInt(e.target.value));
                  if (s) setSupplierNama(s.nama);
                }} style={inputStyle}>
                  <option value="">Pilih atau ketik manual</option>
                  {supplier.map(s => <option key={s.id} value={s.id}>{s.nama}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", display: "block", marginBottom: "6px" }}>NAMA SUPPLIER</label>
                <input type="text" value={supplierNama} onChange={e => setSupplierNama(e.target.value)} placeholder="Nama supplier" style={inputStyle} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", display: "block", marginBottom: "6px" }}>METODE BAYAR</label>
                <select value={metodeBayar} onChange={e => setMetodeBayar(e.target.value)} style={inputStyle}>
                  <option value="Tunai">💵 Tunai</option>
                  <option value="Transfer">🏦 Transfer</option>
                  <option value="Hutang">📝 Hutang</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", display: "block", marginBottom: "6px" }}>CATATAN</label>
                <input type="text" value={catatan} onChange={e => setCatatan(e.target.value)} placeholder="Opsional" style={inputStyle} />
              </div>
            </div>

            {/* Items */}
            <div style={{ marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b" }}>PRODUK YANG DIBELI</label>
                <button onClick={addItem} style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#15803d", padding: "5px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: 700 }}>+ Tambah Produk</button>
              </div>

              {items.map((item, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "2fr 80px 140px 30px", gap: "8px", marginBottom: "8px", alignItems: "center" }}>
                  <select value={item.produk_id} onChange={e => updateItem(idx, "produk_id", e.target.value)} style={inputStyle}>
                    <option value="">Pilih Produk</option>
                    {produk.map(p => <option key={p.id} value={p.id}>{p.nama_produk} (stok: {p.jumlah_stok})</option>)}
                  </select>
                  <input type="number" value={item.qty} onChange={e => updateItem(idx, "qty", e.target.value)} placeholder="Qty" style={inputStyle} min="1" />
                  <div style={{ position: "relative" }}>
                    <input type="number" value={item.harga_beli} onChange={e => updateItem(idx, "harga_beli", e.target.value)} placeholder="Harga beli" style={inputStyle} min="0" />
                    {item.harga_beli && item.qty && (
                      <div style={{ fontSize: "10px", color: "#6366f1", marginTop: "2px", fontWeight: 600 }}>
                        = {rupiahFmt(parseInt(item.qty || "0") * parseInt(item.harga_beli || "0"))}
                      </div>
                    )}
                  </div>
                  <button onClick={() => removeItem(idx)} style={{ background: "#fff5f5", border: "1px solid #fecaca", color: "#ef4444", width: "30px", height: "38px", borderRadius: "6px", cursor: "pointer", fontSize: "16px", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                </div>
              ))}
            </div>

            {/* Total */}
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px 16px", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, color: "#64748b" }}>TOTAL BAYAR</span>
              <span style={{ fontWeight: 800, fontSize: "20px", color: "#1e293b", fontFamily: "'Instrument Serif', serif" }}>{rupiahFmt(totalBayar)}</span>
            </div>

            {metodeBayar === "Hutang" && (
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "10px", padding: "12px 16px", marginBottom: "16px", fontSize: "13px", color: "#92400e" }}>
                ⚠️ Pembelian ini akan dicatat sebagai <strong>hutang ke supplier</strong> sebesar {rupiahFmt(totalBayar)}
              </div>
            )}

            <button onClick={simpanPembelian} disabled={submitting} style={{
              width: "100%", padding: "13px", border: "none", borderRadius: "10px",
              background: submitting ? "#cbd5e1" : "#6366f1",
              color: "#fff", fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer",
              fontFamily: "'Instrument Sans', sans-serif", fontSize: "15px",
            }}>
              {submitting ? "Menyimpan..." : "✓ Simpan Pembelian"}
            </button>
          </div>
        )}

        {/* TAB: RIWAYAT */}
        {activeTab === "riwayat" && (
          <div style={{ background: "#fff", padding: "20px", borderRadius: "14px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            <h3 style={{ margin: "0 0 16px", fontFamily: "'Instrument Serif', serif" }}>Riwayat Pembelian</h3>
            {riwayat.length === 0 && <div style={{ textAlign: "center", color: "#94a3b8", padding: "32px", fontSize: "14px" }}>Belum ada riwayat pembelian</div>}
            {riwayat.map(r => (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #f1f5f9" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "14px" }}>{r.supplier_nama}</div>
                  <div style={{ fontSize: "12px", color: "#94a3b8" }}>{tanggalFmt(r.created_at)} · {r.total_item} produk · {r.metode_bayar}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800, fontSize: "15px", color: "#1e293b" }}>{rupiahFmt(r.total_bayar)}</div>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: r.status_bayar === "Lunas" ? "#10b981" : "#f59e0b" }}>{r.status_bayar}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB: HUTANG SUPPLIER */}
        {activeTab === "hutang" && (
          <div style={{ background: "#fff", padding: "20px", borderRadius: "14px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            <h3 style={{ margin: "0 0 16px", fontFamily: "'Instrument Serif', serif" }}>Hutang ke Supplier</h3>
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
      </div>
    </>
  );
}