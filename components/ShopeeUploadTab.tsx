"use client";

import { useCallback, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

type Toko = { id: number; nama: string };
type StokBarang = { id: number; nama_produk: string; jumlah_stok: number; sku: string | null };

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

const C = {
  bg: "#100c16",
  card: "#1a1425",
  border: "#2a1f3d",
  text: "#e2d9f3",
  textMid: "#c0aed4",
  muted: "#7c6d8a",
  dim: "#3d3050",
  accent: "#a78bfa",
  accentDim: "#a78bfa20",
  green: "#34d399",
  red: "#f87171",
  yellow: "#fbbf24",
  fontDisplay: "'DM Serif Display', serif",
  fontMono: "'DM Mono', monospace",
  fontSans: "'DM Sans', sans-serif",
};

const rupiahFmt = (n: number) => `Rp ${(n || 0).toLocaleString("id-ID")}`;
const tanggalFmt = (s: string) => {
  try { return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return s; }
};

export function ShopeeUploadTab() {
  const [tokoList, setTokoList] = useState<Toko[]>([]);
  const [stokBarang, setStokBarang] = useState<StokBarang[]>([]);
  const [tokoId, setTokoId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ msg: string; ok: boolean } | null>(null);

  const [fileName, setFileName] = useState("");
  const [parsedOrders, setParsedOrders] = useState<ParsedOrder[]>([]);
  const [skippedNoResi, setSkippedNoResi] = useState(0);
  const [step, setStep] = useState<"upload" | "preview" | "done">("upload");
  const [initialized, setInitialized] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Lazy-load data hanya saat komponen pertama kali dirender
  const init = useCallback(async () => {
    if (initialized) return;
    setInitialized(true);
    const [resToko, resStok] = await Promise.all([
      supabase.from("toko_shopee").select("id, nama").eq("aktif", true).order("nama"),
      supabase.from("stok_barang").select("id, nama_produk, jumlah_stok, sku").order("nama_produk"),
    ]);
    if (resToko.data) setTokoList(resToko.data);
    if (resStok.data) setStokBarang(resStok.data);
  }, [initialized]);

  // Panggil init saat render pertama
  if (!initialized) init();

  const toast = (msg: string, ok = true) => {
    setToastMsg({ msg, ok });
    setTimeout(() => setToastMsg(null), 4000);
  };

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

      if (rows.length === 0) return toast("File kosong atau format tidak dikenal", false);

      const withResi = rows.filter(r => {
        const resi = String(r["No. Resi"] || "").trim();
        return resi !== "" && resi !== "-";
      });
      setSkippedNoResi(rows.length - withResi.length);

      if (withResi.length === 0) return toast("Tidak ada pesanan dengan No. Resi di file ini", false);

      // Cek duplikat
      const noPesananList = withResi.map(r => String(r["No. Pesanan"]).trim());
      const { data: existing } = await supabase
        .from("detail_penjualan_shopee")
        .select("no_pesanan")
        .in("no_pesanan", noPesananList);
      const existingSet = new Set((existing || []).map((x: any) => x.no_pesanan));

      // Map SKU → produk
      const skuMap = new Map<string, StokBarang>();
      stokBarang.forEach(s => { if (s.sku) skuMap.set(s.sku.trim().toUpperCase(), s); });

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
          produkNama: produk?.nama_produk,
          produkId: produk?.id,
        };
      });

      setParsedOrders(parsed);
      setStep("preview");
    } catch (err: any) {
      toast("Gagal baca file: " + (err.message || "Format tidak dikenal"), false);
    }
  };

  const validOrders = parsedOrders.filter(o => !o.isDuplicate && o.skuDitemukan);
  const dupOrders = parsedOrders.filter(o => o.isDuplicate);
  const unknownSkuOrders = parsedOrders.filter(o => !o.isDuplicate && !o.skuDitemukan);
  const totalQty = validOrders.reduce((a, o) => a + o.qty, 0);
  const totalNominal = validOrders.reduce((a, o) => a + o.total_pembayaran, 0);

  const submitPenjualan = async () => {
    if (!tokoId) return toast("Pilih toko dulu!", false);
    if (validOrders.length === 0) return toast("Tidak ada pesanan valid untuk diproses", false);

    setSubmitting(true);
    try {
      // Cek duplikat sekali lagi sebelum insert apapun (antisipasi retry)
      const noPesananList = validOrders.map(o => o.no_pesanan);
      const { data: existingCheck } = await supabase
        .from("detail_penjualan_shopee")
        .select("no_pesanan")
        .in("no_pesanan", noPesananList);
      const alreadySaved = (existingCheck || []).map((x: any) => x.no_pesanan);
      if (alreadySaved.length > 0) {
        setSubmitting(false);
        return toast(`${alreadySaved.length} pesanan sudah tersimpan sebelumnya. Upload ulang file untuk refresh.`, false);
      }

      const qtyPerProduk = new Map<number, number>();
      validOrders.forEach(o => {
        if (o.produkId) qtyPerProduk.set(o.produkId, (qtyPerProduk.get(o.produkId) || 0) + o.qty);
      });

      for (const [produkId, totalKeluar] of qtyPerProduk) {
        const produk = stokBarang.find(s => s.id === produkId);
        if (produk && produk.jumlah_stok < totalKeluar)
          throw new Error(`Stok ${produk.nama_produk} tidak cukup! Tersedia: ${produk.jumlah_stok}, butuh: ${totalKeluar}`);
      }

      const { data: penjualanData, error: errHeader } = await supabase
        .from("penjualan_shopee")
        .insert([{ toko_id: parseInt(tokoId), total_item: validOrders.length, total_nominal: Math.round(totalNominal), tanggal_upload: new Date().toISOString().split("T")[0] }])
        .select().single();
      if (errHeader) throw new Error("Gagal simpan header: " + errHeader.message);

      const { error: errDetail } = await supabase.from("detail_penjualan_shopee").insert(
        validOrders.map(o => ({
          penjualan_shopee_id: penjualanData.id,
          stok_barang_id: o.produkId,
          no_pesanan: o.no_pesanan,
          no_resi: o.no_resi,
          sku: o.sku,
          qty: o.qty,
          harga_satuan: o.harga_satuan,
          total_pembayaran: o.total_pembayaran,
          tanggal_pesanan: o.tanggal_pesanan,
        }))
      );
      if (errDetail) throw new Error("Gagal simpan detail: " + errDetail.message);

      const tokoNama = tokoList.find(t => t.id === parseInt(tokoId))?.nama || "";
      for (const [produkId, totalKeluar] of qtyPerProduk) {
        const produk = stokBarang.find(s => s.id === produkId);
        if (!produk) continue;
        await supabase.from("stok_barang").update({ jumlah_stok: produk.jumlah_stok - totalKeluar }).eq("id", produkId);
        await supabase.from("mutasi_stok").insert([{
          stok_barang_id: produkId,
          tipe: "Keluar",
          qty: totalKeluar,
          keterangan: `Penjualan Shopee ${tokoNama} — ${validOrders.length} pesanan`,
        }]);
      }

      toast(`✓ ${validOrders.length} pesanan berhasil! Total ${rupiahFmt(totalNominal)}`);
      setStep("done");
    } catch (err: any) {
      toast(err.message || "Gagal simpan", false);
    } finally {
      setSubmitting(false);
    }
  };

  const inp: React.CSSProperties = {
    width: "100%", padding: "10px 14px",
    background: "rgba(255,255,255,0.04)", border: `1.5px solid ${C.border}`,
    borderRadius: 8, color: C.text, fontFamily: C.fontSans, fontSize: 13,
    boxSizing: "border-box", outline: "none",
  };

  return (
    <div style={{ fontFamily: C.fontSans, color: C.text }}>

      {/* Toast */}
      {toastMsg && (
        <div style={{
          position: "fixed", top: 24, right: 24, zIndex: 9999,
          background: "#1a1020", border: `1px solid ${toastMsg.ok ? C.green : C.red}44`,
          color: toastMsg.ok ? C.green : C.red,
          padding: "14px 20px", borderRadius: 12,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          fontFamily: C.fontMono, fontWeight: 600, fontSize: 13, maxWidth: 380,
        }}>{toastMsg.msg}</div>
      )}

      {/* ── STEP 1: Pilih Toko + Upload ── */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, marginBottom: 16 }}>
        <h3 style={{ margin: "0 0 14px", fontFamily: C.fontDisplay, fontSize: 18, color: "#f0eaff", fontWeight: 400 }}>
          Upload File Orderan Shopee
        </h3>

        <div style={{ background: `${C.accent}15`, border: `1px solid ${C.accent}30`, borderRadius: 10, padding: "10px 14px", marginBottom: 20, fontSize: 12, color: C.textMid, lineHeight: 1.7 }}>
          💡 Download file <em>To Ship</em> dari Seller Center per toko → upload keesokan harinya → sistem ambil yang sudah ada No. Resi, skip duplikat otomatis
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>TOKO SHOPEE</label>
            <select value={tokoId} onChange={e => { setTokoId(e.target.value); reset(); }} style={inp}>
              <option value="">— Pilih Toko —</option>
              {tokoList.map(t => <option key={t.id} value={t.id}>{t.nama}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>FILE XLSX SHOPEE</label>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              disabled={!tokoId}
              onChange={handleFileChange}
              style={{ ...inp, cursor: tokoId ? "pointer" : "not-allowed", opacity: tokoId ? 1 : 0.5 }}
            />
            {!tokoId && (
              <div style={{ fontSize: 11, color: C.yellow, marginTop: 4, fontWeight: 600, fontFamily: C.fontMono }}>⚠ Pilih toko dulu</div>
            )}
          </div>
        </div>
      </div>

      {/* ── STEP 2: Preview ── */}
      {step === "preview" && parsedOrders.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, marginBottom: 16 }}>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: "0 0 4px", fontFamily: C.fontDisplay, fontSize: 18, color: "#f0eaff", fontWeight: 400 }}>Preview Pesanan</h3>
              <div style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>
                {fileName} · Toko: <strong style={{ color: C.accent }}>{tokoList.find(t => t.id === parseInt(tokoId))?.nama}</strong>
              </div>
            </div>
            <button onClick={reset} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: C.fontSans }}>
              ✕ Ganti File
            </button>
          </div>

          {/* Badges */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
            <div style={{ background: `${C.green}15`, border: `1px solid ${C.green}30`, borderRadius: 8, padding: "7px 14px", fontSize: 12 }}>
              <span style={{ color: C.green, fontWeight: 700 }}>✓ {validOrders.length} pesanan valid</span>
              <span style={{ color: C.muted, marginLeft: 6, fontFamily: C.fontMono }}>· {totalQty} item · {rupiahFmt(totalNominal)}</span>
            </div>
            {skippedNoResi > 0 && (
              <div style={{ background: `${C.dim}80`, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 14px", fontSize: 12, color: C.muted }}>
                ⏭ {skippedNoResi} belum ada resi (dilewati)
              </div>
            )}
            {dupOrders.length > 0 && (
              <div style={{ background: `${C.yellow}15`, border: `1px solid ${C.yellow}30`, borderRadius: 8, padding: "7px 14px", fontSize: 12, color: C.yellow, fontWeight: 700 }}>
                ⚠ {dupOrders.length} duplikat
              </div>
            )}
            {unknownSkuOrders.length > 0 && (
              <div style={{ background: `${C.red}15`, border: `1px solid ${C.red}30`, borderRadius: 8, padding: "7px 14px", fontSize: 12, color: C.red, fontWeight: 700 }}>
                ❌ {unknownSkuOrders.length} SKU tidak dikenal
              </div>
            )}
          </div>

          {/* Tabel */}
          <div style={{ overflowX: "auto", marginBottom: 16 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {["Status", "No. Pesanan", "Tanggal", "SKU", "Produk", "Qty", "Total Bayar"].map((h, i) => (
                    <th key={h} style={{
                      padding: "8px 12px",
                      textAlign: i === 5 ? "center" : i === 6 ? "right" : "left",
                      fontWeight: 700, color: C.muted, fontSize: 10,
                      letterSpacing: "0.08em", textTransform: "uppercase",
                      borderBottom: `2px solid ${C.border}`, whiteSpace: "nowrap",
                      fontFamily: C.fontMono,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsedOrders.map((o, idx) => {
                  const rowBg = o.isDuplicate
                    ? `${C.yellow}08`
                    : !o.skuDitemukan
                    ? `${C.red}08`
                    : idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)";
                  return (
                    <tr key={o.no_pesanan} style={{ background: rowBg }}>
                      <td style={{ padding: "9px 12px", borderBottom: `1px solid ${C.border}` }}>
                        {o.isDuplicate
                          ? <span style={{ color: C.yellow, fontWeight: 700, fontSize: 11, fontFamily: C.fontMono }}>Duplikat</span>
                          : !o.skuDitemukan
                          ? <span style={{ color: C.red, fontWeight: 700, fontSize: 11, fontFamily: C.fontMono }}>SKU ?</span>
                          : <span style={{ color: C.green, fontWeight: 700 }}>✓</span>
                        }
                      </td>
                      <td style={{ padding: "9px 12px", borderBottom: `1px solid ${C.border}`, fontFamily: C.fontMono, fontSize: 11, color: C.muted }}>{o.no_pesanan}</td>
                      <td style={{ padding: "9px 12px", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", color: C.textMid }}>{tanggalFmt(o.tanggal_pesanan)}</td>
                      <td style={{ padding: "9px 12px", borderBottom: `1px solid ${C.border}`, fontWeight: 700, color: o.skuDitemukan ? C.accent : C.red, fontFamily: C.fontMono }}>{o.sku}</td>
                      <td style={{ padding: "9px 12px", borderBottom: `1px solid ${C.border}`, color: o.skuDitemukan ? C.textMid : C.muted }}>
                        {o.skuDitemukan ? o.produkNama : <em>Tidak ditemukan — isi SKU di Master Produk</em>}
                      </td>
                      <td style={{ padding: "9px 12px", borderBottom: `1px solid ${C.border}`, textAlign: "center", fontWeight: 700, fontFamily: C.fontMono, color: C.text }}>{o.qty}</td>
                      <td style={{ padding: "9px 12px", borderBottom: `1px solid ${C.border}`, textAlign: "right", fontWeight: 700, fontFamily: C.fontMono, color: C.text }}>{rupiahFmt(o.total_pembayaran)}</td>
                    </tr>
                  );
                })}
              </tbody>
              {validOrders.length > 0 && (
                <tfoot>
                  <tr style={{ background: `${C.accent}10` }}>
                    <td colSpan={5} style={{ padding: "10px 12px", fontWeight: 700, fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>
                      TOTAL VALID ({validOrders.length} pesanan)
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 800, fontSize: 13, color: C.text, fontFamily: C.fontMono }}>{totalQty}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 800, fontSize: 13, color: C.accent, fontFamily: C.fontMono }}>{rupiahFmt(totalNominal)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Warning SKU tidak dikenal */}
          {unknownSkuOrders.length > 0 && (
            <div style={{ background: `${C.red}10`, border: `1px solid ${C.red}30`, borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 12, color: C.red, lineHeight: 1.7 }}>
              <strong>❌ SKU tidak dikenal:</strong> <span style={{ fontFamily: C.fontMono }}>{Array.from(new Set(unknownSkuOrders.map(o => o.sku))).join(", ")}</span>
              <br />Buka <strong>Admin → Master Produk</strong> → edit produk → isi kolom <strong>SKU</strong>, lalu upload ulang.
            </div>
          )}

          {validOrders.length > 0 && (
            <button
              onClick={submitPenjualan}
              disabled={submitting}
              style={{
                width: "100%", padding: 13, border: "none", borderRadius: 10,
                background: submitting ? C.dim : `linear-gradient(135deg, #7c3aed, ${C.accent})`,
                color: "#fff", fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer",
                fontFamily: C.fontMono, fontSize: 14,
                boxShadow: submitting ? "none" : `0 4px 16px ${C.accent}33`,
              }}
            >
              {submitting ? "Memproses..." : `✓ Proses ${validOrders.length} Pesanan — Potong Stok & Catat Piutang`}
            </button>
          )}
        </div>
      )}

      {/* ── STEP 3: Selesai ── */}
      {step === "done" && (
        <div style={{ background: `${C.green}10`, border: `1px solid ${C.green}30`, padding: "40px 24px", borderRadius: 14, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
          <div style={{ fontWeight: 700, fontSize: 20, color: C.green, marginBottom: 8, fontFamily: C.fontDisplay }}>
            Berhasil Diproses!
          </div>
          <div style={{ color: C.textMid, fontSize: 14, marginBottom: 24, fontFamily: C.fontMono }}>
            {validOrders.length} pesanan · {totalQty} item · {rupiahFmt(totalNominal)}
          </div>
          <button onClick={reset} style={{ background: C.green, color: "#0a1a12", border: "none", padding: "10px 28px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontFamily: C.fontMono, fontSize: 14 }}>
            + Upload File Toko Lain
          </button>
        </div>
      )}
    </div>
  );
}
