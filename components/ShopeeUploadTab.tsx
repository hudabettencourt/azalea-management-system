"use client";

/**
 * TAB: Input Orderan Shopee (Upload File)
 *
 * SETUP REQUIRED — jalankan SQL ini di Supabase sekali saja:
 *   (lihat bagian bawah komponen untuk SQL lengkap)
 */

import { useEffect, useState, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

type Toko = { id: number; nama: string };
type StokBarang = { id: number; nama: string; stok: number; sku: string | null };
type Toast = { msg: string; type: "success" | "error" | "info" };

type ParsedOrder = {
  no_pesanan: string;
  no_resi: string;
  sku: string;
  nama_produk: string;
  qty: number;
  harga_satuan: number;
  total_pembayaran: number;
  tanggal_pesanan: string;
  isDuplicate: boolean;
  skuDitemukan: boolean;
  produkNama?: string;
  produkId?: number;
};

const rupiahFmt = (n: number) => `Rp ${(n || 0).toLocaleString("id-ID")}`;
const tanggalFmt = (s: string) => {
  try {
    return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return s;
  }
};

export function ShopeeUploadTab() {
  const [tokoList, setTokoList] = useState<Toko[]>([]);
  const [stokBarang, setStokBarang] = useState<StokBarang[]>([]);
  const [tokoId, setTokoId] = useState<string>("");
  const [toast, setToast] = useState<Toast | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [fileName, setFileName] = useState("");
  const [parsedOrders, setParsedOrders] = useState<ParsedOrder[]>([]);
  const [skippedNoResi, setSkippedNoResi] = useState(0);
  const [step, setStep] = useState<"upload" | "preview" | "done">("upload");
  const fileRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string, type: Toast["type"] = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchInit = useCallback(async () => {
    const [resToko, resStok] = await Promise.all([
      supabase.from("toko_shopee").select("id, nama").eq("aktif", true).order("nama"),
      supabase.from("stok_barang").select("id, nama, stok, sku").order("nama"),
    ]);
    if (resToko.data) setTokoList(resToko.data);
    if (resStok.data) setStokBarang(resStok.data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchInit(); }, [fetchInit]);

  const reset = () => {
    setParsedOrders([]);
    setFileName("");
    setStep("upload");
    setSkippedNoResi(0);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParsedOrders([]);
    setStep("upload");

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      if (rows.length === 0) return showToast("File kosong atau format tidak dikenal", "error");

      // Filter hanya yang punya No. Resi (sudah diproses/dikirim)
      const withResi = rows.filter(r => {
        const resi = String(r["No. Resi"] || "").trim();
        return resi !== "" && resi !== "-";
      });
      setSkippedNoResi(rows.length - withResi.length);

      if (withResi.length === 0) {
        return showToast("Tidak ada pesanan dengan No. Resi di file ini", "error");
      }

      // Cek duplikat — No. Pesanan yang sudah pernah diproses di DB
      const noPesananList = withResi.map(r => String(r["No. Pesanan"]).trim());
      const { data: existing } = await supabase
        .from("detail_penjualan_shopee")
        .select("no_pesanan")
        .in("no_pesanan", noPesananList);
      const existingSet = new Set((existing || []).map((x: any) => x.no_pesanan));

      // Map SKU → produk dari stok_barang
      const skuMap = new Map<string, StokBarang>();
      stokBarang.forEach(s => {
        if (s.sku) skuMap.set(s.sku.trim().toUpperCase(), s);
      });

      const parsed: ParsedOrder[] = withResi.map(r => {
        const sku = String(r["SKU Induk"] || r["Nomor Referensi SKU"] || "").trim().toUpperCase();
        const produk = skuMap.get(sku);
        return {
          no_pesanan: String(r["No. Pesanan"]).trim(),
          no_resi: String(r["No. Resi"]).trim(),
          sku,
          nama_produk: String(r["Nama Produk"] || "").slice(0, 80),
          qty: Number(r["Jumlah"]) || 1,
          harga_satuan: Number(r["Harga Setelah Diskon"]) || 0,
          total_pembayaran: Number(r["Total Pembayaran"]) || 0,
          tanggal_pesanan: String(r["Waktu Pesanan Dibuat"] || "").trim(),
          isDuplicate: existingSet.has(String(r["No. Pesanan"]).trim()),
          skuDitemukan: !!produk,
          produkNama: produk?.nama,
          produkId: produk?.id,
        };
      });

      setParsedOrders(parsed);
      setStep("preview");
    } catch (err: any) {
      showToast("Gagal baca file: " + (err.message || "Format tidak dikenal"), "error");
    }
  };

  const validOrders = parsedOrders.filter(o => !o.isDuplicate && o.skuDitemukan);
  const dupOrders = parsedOrders.filter(o => o.isDuplicate);
  const unknownSkuOrders = parsedOrders.filter(o => !o.isDuplicate && !o.skuDitemukan);
  const totalQty = validOrders.reduce((a, o) => a + o.qty, 0);
  const totalNominal = validOrders.reduce((a, o) => a + o.total_pembayaran, 0);

  const submitPenjualan = async () => {
    if (!tokoId) return showToast("Pilih toko dulu!", "error");
    if (validOrders.length === 0) return showToast("Tidak ada pesanan valid untuk diproses", "error");

    setSubmitting(true);
    try {
      // Hitung total qty keluar per produk
      const qtyPerProduk = new Map<number, number>();
      validOrders.forEach(o => {
        if (o.produkId) qtyPerProduk.set(o.produkId, (qtyPerProduk.get(o.produkId) || 0) + o.qty);
      });

      // Validasi stok cukup sebelum proses
      for (const [produkId, totalKeluar] of qtyPerProduk) {
        const produk = stokBarang.find(s => s.id === produkId);
        if (produk && produk.stok < totalKeluar) {
          throw new Error(`Stok ${produk.nama} tidak cukup! Tersedia: ${produk.stok}, dibutuhkan: ${totalKeluar}`);
        }
      }

      // 1. Simpan header penjualan_shopee
      const { data: penjualanData, error: errHeader } = await supabase
        .from("penjualan_shopee")
        .insert([{
          toko_id: parseInt(tokoId),
          total_item: validOrders.length,
          total_nominal: totalNominal,
          tanggal_upload: new Date().toISOString().split("T")[0],
        }])
        .select()
        .single();
      if (errHeader) throw new Error("Gagal simpan header: " + errHeader.message);

      // 2. Simpan detail per pesanan (bulk insert)
      const { error: errDetail } = await supabase
        .from("detail_penjualan_shopee")
        .insert(validOrders.map(o => ({
          penjualan_shopee_id: penjualanData.id,
          stok_barang_id: o.produkId,
          no_pesanan: o.no_pesanan,
          no_resi: o.no_resi,
          sku: o.sku,
          qty: o.qty,
          harga_satuan: o.harga_satuan,
          total_pembayaran: o.total_pembayaran,
          tanggal_pesanan: o.tanggal_pesanan,
        })));
      if (errDetail) throw new Error("Gagal simpan detail: " + errDetail.message);

      // 3. Potong stok + catat mutasi per produk
      const tokoNama = tokoList.find(t => t.id === parseInt(tokoId))?.nama || "";
      for (const [produkId, totalKeluar] of qtyPerProduk) {
        const produk = stokBarang.find(s => s.id === produkId);
        if (!produk) continue;
        await supabase
          .from("stok_barang")
          .update({ stok: produk.stok - totalKeluar })
          .eq("id", produkId);
        await supabase.from("mutasi_stok").insert([{
          stok_barang_id: produkId,
          tipe: "Keluar",
          qty: totalKeluar,
          keterangan: `Penjualan Shopee ${tokoNama} — ${validOrders.length} pesanan`,
        }]);
      }

      showToast(`✓ ${validOrders.length} pesanan berhasil diproses! Total ${rupiahFmt(totalNominal)}`);
      setStep("done");
      fetchInit();
    } catch (err: any) {
      showToast(err.message || "Gagal simpan", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const inp: React.CSSProperties = {
    width: "100%", padding: "9px 12px", border: "1.5px solid #e2e8f0",
    borderRadius: "8px", fontFamily: "'Instrument Sans', sans-serif",
    fontSize: "13px", boxSizing: "border-box", outline: "none", background: "#fff",
  };

  if (loading) return (
    <div style={{ textAlign: "center", padding: "48px", color: "#94a3b8", fontFamily: "'Instrument Sans', sans-serif" }}>
      Memuat data...
    </div>
  );

  return (
    <div style={{ fontFamily: "'Instrument Sans', sans-serif" }}>

      {/* Toast notifikasi */}
      {toast && (
        <div style={{
          position: "fixed", top: "24px", right: "24px", zIndex: 9999,
          background: toast.type === "success" ? "#10b981" : toast.type === "error" ? "#ef4444" : "#3b82f6",
          color: "#fff", padding: "14px 20px", borderRadius: "12px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)", fontWeight: 600, fontSize: "14px",
        }}>{toast.msg}</div>
      )}

      {/* ── STEP 1: Pilih Toko + Upload File ────────────────────────────────── */}
      <div style={{ background: "#fff", padding: "24px", borderRadius: "14px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: "16px" }}>
        <h3 style={{ margin: "0 0 16px", fontFamily: "'Instrument Serif', serif", fontSize: "18px" }}>
          Upload File Orderan Shopee
        </h3>

        <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "10px", padding: "12px 16px", marginBottom: "20px", fontSize: "12px", color: "#1d4ed8", lineHeight: 1.7 }}>
          💡 <strong>Cara pakai:</strong> Download file <em>To Ship</em> dari Seller Center per toko →
          upload keesokan harinya → sistem otomatis ambil yang sudah ada No. Resi dan skip duplikat
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div>
            <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", display: "block", marginBottom: "6px" }}>
              TOKO SHOPEE
            </label>
            <select value={tokoId} onChange={e => { setTokoId(e.target.value); reset(); }} style={inp}>
              <option value="">— Pilih Toko —</option>
              {tokoList.map(t => <option key={t.id} value={t.id}>{t.nama}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", display: "block", marginBottom: "6px" }}>
              FILE XLSX SHOPEE
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              disabled={!tokoId}
              onChange={handleFileChange}
              style={{ ...inp, cursor: tokoId ? "pointer" : "not-allowed", background: tokoId ? "#fff" : "#f8fafc", color: "#374151" }}
            />
            {!tokoId && (
              <div style={{ fontSize: "11px", color: "#f59e0b", marginTop: "4px", fontWeight: 600 }}>⚠ Pilih toko dulu</div>
            )}
          </div>
        </div>
      </div>

      {/* ── STEP 2: Preview Tabel ────────────────────────────────────────────── */}
      {step === "preview" && parsedOrders.length > 0 && (
        <div style={{ background: "#fff", padding: "24px", borderRadius: "14px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: "16px" }}>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
            <div>
              <h3 style={{ margin: "0 0 4px", fontFamily: "'Instrument Serif', serif", fontSize: "18px" }}>Preview Pesanan</h3>
              <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                {fileName} · Toko: <strong style={{ color: "#1e293b" }}>{tokoList.find(t => t.id === parseInt(tokoId))?.nama}</strong>
              </div>
            </div>
            <button onClick={reset} style={{ background: "#f1f5f9", border: "none", color: "#64748b", padding: "6px 14px", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: 700 }}>
              ✕ Ganti File
            </button>
          </div>

          {/* Status badges */}
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "20px" }}>
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "8px 14px", fontSize: "12px" }}>
              <span style={{ color: "#15803d", fontWeight: 700 }}>✓ {validOrders.length} pesanan valid</span>
              <span style={{ color: "#64748b", marginLeft: "6px" }}>· {totalQty} item · {rupiahFmt(totalNominal)}</span>
            </div>
            {skippedNoResi > 0 && (
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "8px 14px", fontSize: "12px", color: "#64748b" }}>
                ⏭ {skippedNoResi} belum ada resi (dilewati)
              </div>
            )}
            {dupOrders.length > 0 && (
              <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: "8px", padding: "8px 14px", fontSize: "12px", color: "#c2410c", fontWeight: 700 }}>
                ⚠ {dupOrders.length} duplikat (sudah pernah diproses)
              </div>
            )}
            {unknownSkuOrders.length > 0 && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "8px 14px", fontSize: "12px", color: "#dc2626", fontWeight: 700 }}>
                ❌ {unknownSkuOrders.length} SKU tidak dikenal
              </div>
            )}
          </div>

          {/* Tabel preview */}
          <div style={{ overflowX: "auto", marginBottom: "16px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {[
                    { label: "Status", align: "left" },
                    { label: "No. Pesanan", align: "left" },
                    { label: "Tanggal", align: "left" },
                    { label: "SKU", align: "left" },
                    { label: "Produk (mapped)", align: "left" },
                    { label: "Qty", align: "center" },
                    { label: "Total Bayar", align: "right" },
                  ].map(h => (
                    <th key={h.label} style={{
                      padding: "8px 12px", textAlign: h.align as any,
                      fontWeight: 700, color: "#64748b", fontSize: "11px",
                      letterSpacing: "0.05em", textTransform: "uppercase",
                      borderBottom: "2px solid #e2e8f0", whiteSpace: "nowrap",
                    }}>{h.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsedOrders.map((o, idx) => {
                  const rowBg = o.isDuplicate ? "#fff7ed" : !o.skuDitemukan ? "#fef2f2" : idx % 2 === 0 ? "#fff" : "#fafafa";
                  return (
                    <tr key={o.no_pesanan} style={{ background: rowBg }}>
                      <td style={{ padding: "9px 12px", borderBottom: "1px solid #f1f5f9" }}>
                        {o.isDuplicate
                          ? <span style={{ color: "#f59e0b", fontWeight: 700, fontSize: "11px" }}>Duplikat</span>
                          : !o.skuDitemukan
                          ? <span style={{ color: "#ef4444", fontWeight: 700, fontSize: "11px" }}>SKU ?</span>
                          : <span style={{ color: "#10b981", fontWeight: 700 }}>✓</span>
                        }
                      </td>
                      <td style={{ padding: "9px 12px", borderBottom: "1px solid #f1f5f9", fontFamily: "monospace", fontSize: "11px", color: "#64748b" }}>
                        {o.no_pesanan}
                      </td>
                      <td style={{ padding: "9px 12px", borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap" }}>
                        {tanggalFmt(o.tanggal_pesanan)}
                      </td>
                      <td style={{ padding: "9px 12px", borderBottom: "1px solid #f1f5f9", fontWeight: 700, color: o.skuDitemukan ? "#6366f1" : "#ef4444" }}>
                        {o.sku}
                      </td>
                      <td style={{ padding: "9px 12px", borderBottom: "1px solid #f1f5f9", color: o.skuDitemukan ? "#1e293b" : "#94a3b8" }}>
                        {o.skuDitemukan ? o.produkNama : <em>Tidak ditemukan — isi SKU di Master Produk</em>}
                      </td>
                      <td style={{ padding: "9px 12px", borderBottom: "1px solid #f1f5f9", textAlign: "center", fontWeight: 700 }}>
                        {o.qty}
                      </td>
                      <td style={{ padding: "9px 12px", borderBottom: "1px solid #f1f5f9", textAlign: "right", fontWeight: 700 }}>
                        {rupiahFmt(o.total_pembayaran)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {validOrders.length > 0 && (
                <tfoot>
                  <tr style={{ background: "#f8fafc" }}>
                    <td colSpan={5} style={{ padding: "10px 12px", fontWeight: 700, fontSize: "12px", color: "#64748b" }}>
                      TOTAL VALID ({validOrders.length} pesanan)
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 800, fontSize: "13px" }}>{totalQty}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 800, fontSize: "13px" }}>{rupiahFmt(totalNominal)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Warning SKU tidak dikenal */}
          {unknownSkuOrders.length > 0 && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "10px", padding: "12px 16px", marginBottom: "16px", fontSize: "12px", color: "#991b1b", lineHeight: 1.7 }}>
              <strong>❌ SKU tidak dikenal:</strong> {Array.from(new Set(unknownSkuOrders.map(o => o.sku))).join(", ")}
              <br />Buka <strong>Admin → Master Produk</strong> → edit produk → isi kolom <strong>SKU</strong> dengan nilai di atas, lalu upload ulang.
            </div>
          )}

          {/* Tombol submit */}
          {validOrders.length > 0 && (
            <button
              onClick={submitPenjualan}
              disabled={submitting}
              style={{
                width: "100%", padding: "13px", border: "none", borderRadius: "10px",
                background: submitting ? "#cbd5e1" : "#6366f1",
                color: "#fff", fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer",
                fontFamily: "'Instrument Sans', sans-serif", fontSize: "15px",
              }}
            >
              {submitting ? "Memproses..." : `✓ Proses ${validOrders.length} Pesanan — Potong Stok & Catat Piutang`}
            </button>
          )}
        </div>
      )}

      {/* ── STEP 3: Selesai ─────────────────────────────────────────────────── */}
      {step === "done" && (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "40px 24px", borderRadius: "14px", textAlign: "center", marginBottom: "16px" }}>
          <div style={{ fontSize: "40px", marginBottom: "12px" }}>🎉</div>
          <div style={{ fontWeight: 800, fontSize: "20px", color: "#15803d", marginBottom: "8px", fontFamily: "'Instrument Serif', serif" }}>
            Berhasil Diproses!
          </div>
          <div style={{ color: "#166534", fontSize: "14px", marginBottom: "24px" }}>
            {validOrders.length} pesanan · {totalQty} item · {rupiahFmt(totalNominal)}
          </div>
          <button onClick={reset} style={{ background: "#10b981", color: "#fff", border: "none", padding: "10px 28px", borderRadius: "8px", cursor: "pointer", fontWeight: 700, fontFamily: "'Instrument Sans', sans-serif", fontSize: "14px" }}>
            + Upload File Toko Lain
          </button>
        </div>
      )}

      {/* ── Info SQL Setup ───────────────────────────────────────────────────── */}
      <div style={{ background: "#fff", padding: "20px", borderRadius: "14px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginTop: "8px" }}>
        <h4 style={{ margin: "0 0 10px", fontSize: "13px", fontWeight: 700, color: "#64748b" }}>
          📋 SETUP SUPABASE — Jalankan sekali di SQL Editor
        </h4>
        <pre style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px", fontSize: "11px", overflowX: "auto", color: "#1e293b", lineHeight: 1.8, margin: 0 }}>
{`-- 1. Tambah kolom SKU ke stok_barang
ALTER TABLE stok_barang ADD COLUMN IF NOT EXISTS sku TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS stok_barang_sku_idx
  ON stok_barang(sku) WHERE sku IS NOT NULL;

-- 2. Tambah kolom yang dibutuhkan di detail_penjualan_shopee
ALTER TABLE detail_penjualan_shopee
  ADD COLUMN IF NOT EXISTS no_pesanan TEXT,
  ADD COLUMN IF NOT EXISTS no_resi TEXT,
  ADD COLUMN IF NOT EXISTS sku TEXT,
  ADD COLUMN IF NOT EXISTS harga_satuan NUMERIC,
  ADD COLUMN IF NOT EXISTS total_pembayaran NUMERIC,
  ADD COLUMN IF NOT EXISTS tanggal_pesanan TEXT;

-- 3. Tambah kolom tanggal_upload di penjualan_shopee
ALTER TABLE penjualan_shopee
  ADD COLUMN IF NOT EXISTS tanggal_upload DATE;

-- 4. Isi SKU produk (sesuaikan nama produk kamu)
UPDATE stok_barang SET sku = 'SM1KG'
  WHERE nama ILIKE '%siomay mini%1%kg%';`}
        </pre>
      </div>
    </div>
  );
}
