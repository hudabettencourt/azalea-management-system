"use client";

import { useCallback, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

type Toko = { id: number; nama: string };
type StokBarang = { id: number; nama_produk: string; jumlah_stok: number; sku: string | null };

// 1 ParsedOrder = 1 No. Pesanan (sudah di-group, bisa multi-produk)
type ParsedOrder = {
  no_pesanan: string;
  no_resi: string;
  tanggal_pesanan: string; // WIB string dari Shopee
  items: {
    sku: string;
    nama_produk_shopee: string;
    qty: number;
    harga_satuan: number;
    total_pembayaran: number;
    produkId?: number;
    produkNama?: string;
    skuDitemukan: boolean;
  }[];
  biaya_layanan: number; // flat per pesanan dari shopee_config
  isDuplicate: boolean;
  allSkuFound: boolean;
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

// Parse timestamp Shopee → ISO string dengan offset WIB +07:00
// Format Shopee: "2026-04-24 13:58" atau "2026-04-24 13:58:00"
const parseWIB = (s: string): string => {
  if (!s || typeof s !== "string") return new Date().toISOString();
  const cleaned = s.trim();
  // Kalau sudah ada timezone info, return as-is
  if (cleaned.includes("+") || cleaned.includes("Z")) return new Date(cleaned).toISOString();
  // Tambahkan +07:00 supaya Supabase tahu ini WIB bukan UTC
  return new Date(cleaned + "+07:00").toISOString();
};

const tanggalFmt = (s: string) => {
  try {
    return new Date(s).toLocaleDateString("id-ID", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta",
    });
  } catch { return s; }
};

export function ShopeeUploadTab() {
  const [tokoList, setTokoList] = useState<Toko[]>([]);
  const [stokBarang, setStokBarang] = useState<StokBarang[]>([]);
  const [biayaLayanan, setBiayaLayanan] = useState<number>(1250); // default fallback
  const [tokoId, setTokoId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ msg: string; ok: boolean } | null>(null);

  const [fileName, setFileName] = useState("");
  const [parsedOrders, setParsedOrders] = useState<ParsedOrder[]>([]);
  const [skippedNoResi, setSkippedNoResi] = useState(0);
  const [step, setStep] = useState<"upload" | "preview" | "done">("upload");
  const [initialized, setInitialized] = useState(false);
  const [doneStats, setDoneStats] = useState({ count: 0, qty: 0, nominal: 0 });
  const fileRef = useRef<HTMLInputElement>(null);

  const init = useCallback(async () => {
    if (initialized) return;
    setInitialized(true);
    const [resToko, resStok, resConfig] = await Promise.all([
      supabase.from("toko_shopee").select("id, nama").eq("aktif", true).order("nama"),
      supabase.from("stok_barang").select("id, nama_produk, jumlah_stok, sku").order("nama_produk"),
      supabase.from("shopee_config").select("key, value"),
    ]);
    if (resToko.data) setTokoList(resToko.data);
    if (resStok.data) setStokBarang(resStok.data);
    if (resConfig.data) {
      const cfg = resConfig.data.find((c: any) => c.key === "biaya_layanan_per_pesanan");
      if (cfg) setBiayaLayanan(Number(cfg.value));
    }
  }, [initialized]);

  if (!initialized) init();

  const toast = (msg: string, ok = true) => {
    setToastMsg({ msg, ok });
    setTimeout(() => setToastMsg(null), 4500);
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

      // Filter baris yang punya No. Resi
      const withResi = rows.filter(r => {
        const resi = String(r["No. Resi"] || "").trim();
        return resi !== "" && resi !== "-";
      });
      setSkippedNoResi(rows.length - withResi.length);

      if (withResi.length === 0) return toast("Tidak ada pesanan dengan No. Resi di file ini", false);

      // Build SKU map
      const skuMap = new Map<string, StokBarang>();
      stokBarang.forEach(s => { if (s.sku) skuMap.set(s.sku.trim().toUpperCase(), s); });

      // Group by No. Pesanan (1 pesanan bisa multi-baris/produk)
      const groupMap = new Map<string, { rows: any[]; no_resi: string; tanggal: string }>();
      withResi.forEach(r => {
        const noPesanan = String(r["No. Pesanan"] || "").trim();
        if (!noPesanan) return;
        if (!groupMap.has(noPesanan)) {
          groupMap.set(noPesanan, {
            rows: [],
            no_resi: String(r["No. Resi"] || "").trim(),
            tanggal: String(r["Waktu Pesanan Dibuat"] || "").trim(),
          });
        }
        groupMap.get(noPesanan)!.rows.push(r);
      });

      // Cek duplikat by no_pesanan ke penjualan_shopee
      const noPesananList = Array.from(groupMap.keys());
      const { data: existing } = await supabase
        .from("detail_penjualan_shopee")
        .select("no_pesanan")
        .in("no_pesanan", noPesananList);
      const existingSet = new Set((existing || []).map((x: any) => x.no_pesanan));

      // Build ParsedOrder[]
      const parsed: ParsedOrder[] = Array.from(groupMap.entries()).map(([noPesanan, group]) => {
        const items = group.rows.map(r => {
          const sku = String(r["SKU Induk"] || r["Nomor Referensi SKU"] || "").trim().toUpperCase();
          const produk = skuMap.get(sku);
          return {
            sku,
            nama_produk_shopee: String(r["Nama Produk"] || "").slice(0, 100),
            qty: Number(r["Jumlah"]) || 1,
            harga_satuan: Number(r["Harga Setelah Diskon"]) || 0,
            total_pembayaran: Number(r["Total Pembayaran"]) || 0,
            produkId: produk?.id,
            produkNama: produk?.nama_produk,
            skuDitemukan: !!produk,
          };
        });

        return {
          no_pesanan: noPesanan,
          no_resi: group.no_resi,
          tanggal_pesanan: parseWIB(group.tanggal),
          items,
          biaya_layanan: biayaLayanan,
          isDuplicate: existingSet.has(noPesanan),
          allSkuFound: items.every(i => i.skuDitemukan),
        };
      });

      setParsedOrders(parsed);
      setStep("preview");
    } catch (err: any) {
      toast("Gagal baca file: " + (err.message || "Format tidak dikenal"), false);
    }
  };

  const validOrders = parsedOrders.filter(o => !o.isDuplicate && o.allSkuFound);
  const dupOrders = parsedOrders.filter(o => o.isDuplicate);
  const unknownSkuOrders = parsedOrders.filter(o => !o.isDuplicate && !o.allSkuFound);

  const totalQty = validOrders.reduce((a, o) => a + o.items.reduce((b, i) => b + i.qty, 0), 0);
  // total_pembayaran per order = sum dari items (ambil dari baris pertama kalau semua sama, atau sum)
  // Shopee: Total Pembayaran ada di setiap baris tapi itu nilai per baris produk
  const totalOmzet = validOrders.reduce((a, o) =>
    a + o.items.reduce((b, i) => b + i.total_pembayaran, 0), 0);
  const totalBiayaLayanan = validOrders.length * biayaLayanan;

  const submitPenjualan = async () => {
    if (!tokoId) return toast("Pilih toko dulu!", false);
    if (validOrders.length === 0) return toast("Tidak ada pesanan valid untuk diproses", false);

    setSubmitting(true);
    try {
      // Double-check duplikat sebelum insert
      const noPesananList = validOrders.map(o => o.no_pesanan);
      const { data: existingCheck } = await supabase
        .from("detail_penjualan_shopee")
        .select("no_pesanan")
        .in("no_pesanan", noPesananList);
      const alreadySaved = new Set((existingCheck || []).map((x: any) => x.no_pesanan));

      const finalOrders = validOrders.filter(o => !alreadySaved.has(o.no_pesanan));
      if (finalOrders.length === 0) {
        setSubmitting(false);
        return toast("Semua pesanan sudah tersimpan sebelumnya.", false);
      }

      // Hitung qty per produk untuk potong stok
      const qtyPerProduk = new Map<number, number>();
      finalOrders.forEach(o => {
        o.items.forEach(i => {
          if (i.produkId) qtyPerProduk.set(i.produkId, (qtyPerProduk.get(i.produkId) || 0) + i.qty);
        });
      });

      // Validasi stok cukup
      for (const [produkId, totalKeluar] of qtyPerProduk) {
        const produk = stokBarang.find(s => s.id === produkId);
        if (produk && produk.jumlah_stok < totalKeluar)
          throw new Error(`Stok ${produk.nama_produk} tidak cukup! Tersedia: ${produk.jumlah_stok}, butuh: ${totalKeluar}`);
      }

      const tokoNama = tokoList.find(t => t.id === parseInt(tokoId))?.nama || "";
      const totalNominalFinal = finalOrders.reduce((a, o) =>
        a + o.items.reduce((b, i) => b + i.total_pembayaran, 0), 0);
      const totalItemFinal = finalOrders.reduce((a, o) =>
        a + o.items.reduce((b, i) => b + i.qty, 0), 0);

      // Insert header penjualan_shopee (ini juga jadi piutang)
      const { data: penjualanData, error: errHeader } = await supabase
        .from("penjualan_shopee")
        .insert([{
          toko_id: parseInt(tokoId),
          total_item: totalItemFinal,
          total_nominal: Math.round(totalNominalFinal),
          total_ditarik: 0,
          status: "Belum Ditarik",
          tanggal_upload: new Date().toLocaleDateString("sv", { timeZone: "Asia/Jakarta" }), // YYYY-MM-DD WIB
        }])
        .select()
        .single();
      if (errHeader) throw new Error("Gagal simpan header: " + errHeader.message);

      // Insert detail per baris produk per pesanan
      const detailRows = finalOrders.flatMap(o =>
        o.items.map(i => ({
          penjualan_shopee_id: penjualanData.id,
          stok_barang_id: i.produkId,
          no_pesanan: o.no_pesanan,
          no_resi: o.no_resi,
          sku: i.sku,
          qty: i.qty,
          harga_satuan: i.harga_satuan,
          total_pembayaran: i.total_pembayaran,
          tanggal_pesanan: o.tanggal_pesanan,
        }))
      );

      const { error: errDetail } = await supabase
        .from("detail_penjualan_shopee")
        .insert(detailRows);
      if (errDetail) throw new Error("Gagal simpan detail: " + errDetail.message);

      // Potong stok + catat mutasi
      for (const [produkId, totalKeluar] of qtyPerProduk) {
        const produk = stokBarang.find(s => s.id === produkId);
        if (!produk) continue;
        await supabase
          .from("stok_barang")
          .update({ jumlah_stok: produk.jumlah_stok - totalKeluar })
          .eq("id", produkId);
        await supabase.from("mutasi_stok").insert([{
          stok_barang_id: produkId,
          tipe: "Keluar",
          qty: totalKeluar,
          keterangan: `Penjualan Shopee ${tokoNama} — ${finalOrders.length} pesanan`,
        }]);
      }

      setDoneStats({ count: finalOrders.length, qty: totalItemFinal, nominal: totalNominalFinal });
      toast(`✓ ${finalOrders.length} pesanan berhasil! ${rupiahFmt(totalNominalFinal)} dicatat sebagai piutang`);
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
          💡 Download file <em>To Ship</em> dari Seller Center → upload kapan saja → sistem otomatis skip duplikat by No. Pesanan
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
                {fileName} · <strong style={{ color: C.accent }}>{tokoList.find(t => t.id === parseInt(tokoId))?.nama}</strong>
              </div>
            </div>
            <button onClick={reset} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: C.fontSans }}>
              ✕ Ganti File
            </button>
          </div>

          {/* Summary badges */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
            <div style={{ background: `${C.green}15`, border: `1px solid ${C.green}30`, borderRadius: 8, padding: "7px 14px", fontSize: 12 }}>
              <span style={{ color: C.green, fontWeight: 700 }}>✓ {validOrders.length} pesanan valid</span>
              <span style={{ color: C.muted, marginLeft: 6, fontFamily: C.fontMono }}>· {totalQty} item · {rupiahFmt(totalOmzet)}</span>
            </div>
            {skippedNoResi > 0 && (
              <div style={{ background: `${C.dim}80`, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 14px", fontSize: 12, color: C.muted }}>
                ⏭ {skippedNoResi} baris belum ada resi
              </div>
            )}
            {dupOrders.length > 0 && (
              <div style={{ background: `${C.yellow}15`, border: `1px solid ${C.yellow}30`, borderRadius: 8, padding: "7px 14px", fontSize: 12, color: C.yellow, fontWeight: 700 }}>
                ⚠ {dupOrders.length} duplikat (di-skip)
              </div>
            )}
            {unknownSkuOrders.length > 0 && (
              <div style={{ background: `${C.red}15`, border: `1px solid ${C.red}30`, borderRadius: 8, padding: "7px 14px", fontSize: 12, color: C.red, fontWeight: 700 }}>
                ❌ {unknownSkuOrders.length} SKU tidak dikenal
              </div>
            )}
          </div>

          {/* Tabel pesanan */}
          <div style={{ overflowX: "auto", marginBottom: 16 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {["Status", "No. Pesanan", "Tanggal", "Produk", "Qty", "Total Bayar"].map((h, i) => (
                    <th key={h} style={{
                      padding: "8px 12px",
                      textAlign: i >= 4 ? "right" : "left",
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
                    : !o.allSkuFound
                    ? `${C.red}08`
                    : idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)";

                  const orderQty = o.items.reduce((a, i) => a + i.qty, 0);
                  const orderTotal = o.items.reduce((a, i) => a + i.total_pembayaran, 0);

                  // Tampilan produk: kalau multi-item, tampilkan sebagai list
                  const produkDisplay = o.items.map((i, ii) => (
                    <div key={ii} style={{ marginBottom: ii < o.items.length - 1 ? 3 : 0 }}>
                      <span style={{ color: i.skuDitemukan ? C.accent : C.red, fontFamily: C.fontMono, fontSize: 10, marginRight: 6 }}>
                        {i.sku}
                      </span>
                      <span style={{ color: i.skuDitemukan ? C.textMid : C.muted }}>
                        {i.skuDitemukan ? i.produkNama : <em>SKU tidak dikenal</em>}
                      </span>
                    </div>
                  ));

                  return (
                    <tr key={o.no_pesanan} style={{ background: rowBg }}>
                      <td style={{ padding: "9px 12px", borderBottom: `1px solid ${C.border}` }}>
                        {o.isDuplicate
                          ? <span style={{ color: C.yellow, fontWeight: 700, fontSize: 11, fontFamily: C.fontMono }}>Duplikat</span>
                          : !o.allSkuFound
                          ? <span style={{ color: C.red, fontWeight: 700, fontSize: 11, fontFamily: C.fontMono }}>SKU ?</span>
                          : <span style={{ color: C.green, fontWeight: 700 }}>✓</span>
                        }
                      </td>
                      <td style={{ padding: "9px 12px", borderBottom: `1px solid ${C.border}`, fontFamily: C.fontMono, fontSize: 11, color: C.muted, whiteSpace: "nowrap" }}>
                        {o.no_pesanan}
                        {o.items.length > 1 && (
                          <span style={{ marginLeft: 6, background: `${C.accent}20`, color: C.accent, padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
                            {o.items.length} produk
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "9px 12px", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", color: C.textMid, fontSize: 11 }}>
                        {tanggalFmt(o.tanggal_pesanan)}
                      </td>
                      <td style={{ padding: "9px 12px", borderBottom: `1px solid ${C.border}` }}>
                        {produkDisplay}
                      </td>
                      <td style={{ padding: "9px 12px", borderBottom: `1px solid ${C.border}`, textAlign: "right", fontWeight: 700, fontFamily: C.fontMono, color: C.text }}>
                        {orderQty}
                      </td>
                      <td style={{ padding: "9px 12px", borderBottom: `1px solid ${C.border}`, textAlign: "right", fontWeight: 700, fontFamily: C.fontMono, color: C.text, whiteSpace: "nowrap" }}>
                        {rupiahFmt(orderTotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {validOrders.length > 0 && (
                <tfoot>
                  <tr style={{ background: `${C.accent}10` }}>
                    <td colSpan={4} style={{ padding: "10px 12px", fontWeight: 700, fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>
                      TOTAL VALID ({validOrders.length} pesanan)
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 800, fontSize: 13, color: C.text, fontFamily: C.fontMono }}>{totalQty}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 800, fontSize: 13, color: C.accent, fontFamily: C.fontMono, whiteSpace: "nowrap" }}>{rupiahFmt(totalOmzet)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Info biaya layanan */}
          {validOrders.length > 0 && (
            <div style={{ background: `${C.dim}60`, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 12, color: C.textMid, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>🏷️ Biaya layanan Shopee ({validOrders.length} pesanan × {rupiahFmt(biayaLayanan)})</span>
              <span style={{ fontFamily: C.fontMono, fontWeight: 700, color: C.red }}>−{rupiahFmt(totalBiayaLayanan)}</span>
            </div>
          )}

          {/* Warning SKU tidak dikenal */}
          {unknownSkuOrders.length > 0 && (
            <div style={{ background: `${C.red}10`, border: `1px solid ${C.red}30`, borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 12, color: C.red, lineHeight: 1.7 }}>
              <strong>❌ SKU tidak dikenal:</strong>{" "}
              <span style={{ fontFamily: C.fontMono }}>
                {Array.from(new Set(unknownSkuOrders.flatMap(o => o.items.filter(i => !i.skuDitemukan).map(i => i.sku)))).join(", ")}
              </span>
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
          <div style={{ color: C.textMid, fontSize: 14, marginBottom: 4, fontFamily: C.fontMono }}>
            {doneStats.count} pesanan · {doneStats.qty} item · {rupiahFmt(doneStats.nominal)}
          </div>
          <div style={{ color: C.muted, fontSize: 12, marginBottom: 24, fontFamily: C.fontMono }}>
            Omzet dicatat sebagai piutang Shopee · Stok sudah dipotong
          </div>
          <button onClick={reset} style={{ background: C.green, color: "#0a1a12", border: "none", padding: "10px 28px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontFamily: C.fontMono, fontSize: 14 }}>
            + Upload File Toko Lain
          </button>
        </div>
      )}
    </div>
  );
}
