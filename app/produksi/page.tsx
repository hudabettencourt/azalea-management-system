"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import { useTheme, LIGHT, DARK } from "@/context/ThemeContext";
import { rupiah, tanggalJamFmt } from "@/lib/format";

// ── TYPES ──
type BahanBaku = { id: number; nama: string; satuan: string; kategori: string; stok: number; harga_beli_avg: number };
type StokBarang = { id: number; nama_produk: string; jumlah_stok: number; sku: string | null; berat_kg: number | null; satuan: string };
type PresetKemasan = { bahan_baku_id: number; berat_gram: number; nama_bahan: string; harga_beli_avg: number };

type OutputItem = { stok_barang_id: string; qty: string; kemasan: KemasamItem[] };
type KemasamItem = { bahan_baku_id: string; nama_bahan: string; berat_gram: string; harga_beli_avg: number };
type BahanPakai = { bahan_id: string; nama: string; qty: string; satuan: string; stok_tersedia: number };
type Toast = { msg: string; type: "success" | "error" | "info" };

type BatchRiwayat = {
  id: number; total_hpp: number; total_kg_output: number;
  gaji_operator: number; gaji_packing: number; gaji_borongan: number;
  biaya_gas: number; operator: string | null; catatan: string | null; created_at: string;
};

type OutputRiwayat = {
  id: number; batch_id: number; stok_barang_id: number; qty: number; hpp_per_unit: number;
  nama_produk?: string; berat_kg?: number | null; satuan?: string; kemasan?: KemasamRiwayat[];
};
type KemasamRiwayat = { id: number; output_id: number; bahan_baku_id: number; berat_gram: number; hpp_kemasan: number; nama_bahan?: string };

// ── HELPERS ──
const formatIDR = (val: string) => val.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const toAngka = (str: string) => parseInt(str.replace(/\./g, "")) || 0;
const PAGE_SIZE = 10;

const emptyOutput = (): OutputItem => ({ stok_barang_id: "", qty: "", kemasan: [] });

export default function ProduksiPage() {
  const { isDark } = useTheme();
  const C = isDark ? DARK : LIGHT;
  const rowBg = isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)";

  const [bahan, setBahan] = useState<BahanBaku[]>([]);
  const [stokBarang, setStokBarang] = useState<StokBarang[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [activeTab, setActiveTab] = useState<"input" | "riwayat">("input");

  const [operator, setOperator] = useState("");
  const [gajiOperator, setGajiOperator] = useState("");
  const [gajiPacking, setGajiPacking] = useState("");
  const [gajiBorongan, setGajiBorongan] = useState("");
  const [biayaGas, setBiayaGas] = useState("");
  const [catatan, setCatatan] = useState("");
  const [bahanPakai, setBahanPakai] = useState<BahanPakai[]>([{ bahan_id: "", nama: "", qty: "", satuan: "", stok_tersedia: 0 }]);
  const [outputItems, setOutputItems] = useState<OutputItem[]>([emptyOutput()]);

  const [riwayat, setRiwayat] = useState<BatchRiwayat[]>([]);
  const [expandedBatch, setExpandedBatch] = useState<number | null>(null);
  const [outputCache, setOutputCache] = useState<Record<number, OutputRiwayat[]>>({});
  const [filterOp, setFilterOp] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);

  const showToast = (msg: string, type: Toast["type"] = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchData = useCallback(async () => {
    try {
      const [resBahan, resStok, resBatch] = await Promise.all([
        supabase.from("bahan_baku").select("*").or("aktif.eq.true,aktif.is.null").order("kategori").order("nama"),
        supabase.from("stok_barang").select("id, nama_produk, jumlah_stok, sku, berat_kg, satuan").order("nama_produk"),
        supabase.from("produksi_batch").select("id, total_hpp, total_kg_output, gaji_operator, gaji_packing, gaji_borongan, biaya_gas, operator, catatan, created_at").order("created_at", { ascending: false }).limit(200),
      ]);
      if (resBahan.error) throw new Error("Gagal load bahan: " + resBahan.error.message);
      if (resStok.error) throw new Error("Gagal load stok: " + resStok.error.message);
      if (resBatch.error) throw new Error("Gagal load riwayat: " + resBatch.error.message);
      setBahan(resBahan.data || []);
      setStokBarang(resStok.data || []);
      setRiwayat(resBatch.data || []);
    } catch (err: any) { showToast(err.message || "Gagal memuat data", "error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchPreset = async (stokBarangId: number): Promise<PresetKemasan[]> => {
    const { data } = await supabase.from("produk_kemasan_default").select("bahan_baku_id, berat_gram, bahan_baku(nama, harga_beli_avg)").eq("stok_barang_id", stokBarangId);
    return (data || []).map((r: any) => ({ bahan_baku_id: r.bahan_baku_id, berat_gram: r.berat_gram, nama_bahan: r.bahan_baku?.nama || "", harga_beli_avg: r.bahan_baku?.harga_beli_avg || 0 }));
  };

  const addBahan = () => setBahanPakai([...bahanPakai, { bahan_id: "", nama: "", qty: "", satuan: "", stok_tersedia: 0 }]);
  const removeBahan = (idx: number) => { if (bahanPakai.length > 1) setBahanPakai(bahanPakai.filter((_, i) => i !== idx)); };
  const updateBahan = (idx: number, field: keyof BahanPakai, value: string) => {
    const items = [...bahanPakai];
    if (field === "bahan_id") { const b = bahan.find(x => x.id === parseInt(value)); items[idx] = { ...items[idx], bahan_id: value, nama: b?.nama || "", satuan: b?.satuan || "", stok_tersedia: b?.stok || 0 }; }
    else items[idx] = { ...items[idx], [field]: value };
    setBahanPakai(items);
  };

  const addOutput = () => setOutputItems([...outputItems, emptyOutput()]);
  const removeOutput = (idx: number) => { if (outputItems.length > 1) setOutputItems(outputItems.filter((_, i) => i !== idx)); };

  const updateOutputProduk = async (idx: number, stokBarangId: string) => {
    const items = [...outputItems];
    items[idx] = { ...items[idx], stok_barang_id: stokBarangId, kemasan: [] };
    if (stokBarangId) {
      const presets = await fetchPreset(parseInt(stokBarangId));
      items[idx].kemasan = presets.map(p => ({ bahan_baku_id: String(p.bahan_baku_id), nama_bahan: p.nama_bahan, berat_gram: String(p.berat_gram), harga_beli_avg: p.harga_beli_avg }));
    }
    setOutputItems(items);
  };

  const updateOutputQty = (idx: number, qty: string) => { const items = [...outputItems]; items[idx] = { ...items[idx], qty }; setOutputItems(items); };

  const addKemasan = (oIdx: number) => { const items = [...outputItems]; items[oIdx].kemasan = [...items[oIdx].kemasan, { bahan_baku_id: "", nama_bahan: "", berat_gram: "", harga_beli_avg: 0 }]; setOutputItems(items); };
  const removeKemasan = (oIdx: number, kIdx: number) => { const items = [...outputItems]; items[oIdx].kemasan = items[oIdx].kemasan.filter((_, i) => i !== kIdx); setOutputItems(items); };

  const updateKemasan = (oIdx: number, kIdx: number, field: "bahan_baku_id" | "berat_gram", value: string) => {
    const items = [...outputItems];
    if (field === "bahan_baku_id") { const b = bahan.find(x => x.id === parseInt(value)); items[oIdx].kemasan[kIdx] = { ...items[oIdx].kemasan[kIdx], bahan_baku_id: value, nama_bahan: b?.nama || "", harga_beli_avg: b?.harga_beli_avg || 0 }; }
    else items[oIdx].kemasan[kIdx] = { ...items[oIdx].kemasan[kIdx], berat_gram: value };
    setOutputItems(items);
  };

  const validBahan = bahanPakai.filter(i => i.bahan_id && i.qty && parseFloat(i.qty) > 0);
  const validOutput = outputItems.filter(o => o.stok_barang_id && o.qty && parseFloat(o.qty) > 0);

  const hppBahan = validBahan.reduce((sum, item) => {
    const b = bahan.find(x => x.id === parseInt(item.bahan_id));
    return sum + (parseFloat(item.qty) * (b?.harga_beli_avg || 0));
  }, 0);

  const gajiOp = toAngka(gajiOperator);
  const gajiPack = toAngka(gajiPacking);
  const gajiBor = toAngka(gajiBorongan);
  const gasOp = toAngka(biayaGas);
  const totalGaji = gajiOp + gajiPack + gajiBor;
  const totalHPPBatch = hppBahan + totalGaji + gasOp;

  const totalKgOutput = validOutput.reduce((sum, o) => {
    const produk = stokBarang.find(s => s.id === parseInt(o.stok_barang_id));
    return sum + (parseFloat(o.qty) * (produk?.berat_kg || 0));
  }, 0);

  const hppPerKg = totalKgOutput > 0 ? totalHPPBatch / totalKgOutput : 0;

  const calcHppOutput = (o: OutputItem) => {
    const produk = stokBarang.find(s => s.id === parseInt(o.stok_barang_id));
    const beratKg = produk?.berat_kg || 0;
    const hppAdonan = hppPerKg * beratKg;
    const hppKemasan = o.kemasan.reduce((sum, k) => {
      if (!k.bahan_baku_id || !k.berat_gram) return sum;
      return sum + (parseFloat(k.berat_gram) / 1000) * k.harga_beli_avg;
    }, 0);
    return { hppAdonan, hppKemasan, hppPerUnit: hppAdonan + hppKemasan };
  };

  const stokWarnings = validBahan.filter(i => { const b = bahan.find(x => x.id === parseInt(i.bahan_id)); return b && b.stok < parseFloat(i.qty); }).map(i => i.nama);

  const simpanBatch = async () => {
    if (validBahan.length === 0) return showToast("Minimal 1 bahan harus diisi!", "error");
    if (validOutput.length === 0) return showToast("Minimal 1 output produk harus diisi!", "error");
    if (stokWarnings.length > 0) return showToast(`Stok tidak cukup: ${stokWarnings.join(", ")}`, "error");
    if (totalKgOutput === 0) return showToast("Total kg output 0 — pastikan semua produk output sudah diisi berat di Master Produk!", "error");

    setSubmitting(true);
    try {
      const timestampWIB = new Date().toISOString().replace("Z", "+07:00");
      const totalHppBulat = Math.round(totalHPPBatch);

      const { data: batchData, error: errBatch } = await supabase.from("produksi_batch").insert([{ total_hpp: totalHppBulat, total_kg_output: Math.round(totalKgOutput * 1000) / 1000, gaji_operator: Math.round(gajiOp), gaji_packing: Math.round(gajiPack), gaji_borongan: Math.round(gajiBor), biaya_gas: Math.round(gasOp), operator: operator.trim() || null, catatan: catatan.trim() || null, created_at: timestampWIB }]).select().single();
      if (errBatch) throw new Error("Gagal simpan batch: " + errBatch.message);

      for (const item of validBahan) {
        const qtyBahan = parseFloat(item.qty);
        const bahanId = parseInt(item.bahan_id);
        const b = bahan.find(x => x.id === bahanId);
        await supabase.from("detail_produksi_bahan").insert([{ produksi_batch_id: batchData.id, bahan_baku_id: bahanId, qty_pakai: qtyBahan, hpp_bahan: Math.round(qtyBahan * (b?.harga_beli_avg || 0)) }]);
        const stokBaru = Math.max(0, (b?.stok || 0) - qtyBahan);
        await supabase.from("bahan_baku").update({ stok: stokBaru, total_nilai_stok: Math.round(stokBaru * (b?.harga_beli_avg || 0)) }).eq("id", bahanId);
      }

      for (const o of validOutput) {
        const produk = stokBarang.find(s => s.id === parseInt(o.stok_barang_id));
        const qty = parseFloat(o.qty);
        const { hppKemasan, hppPerUnit } = calcHppOutput(o);
        const hppPerUnitBulat = Math.round(hppPerUnit);

        const { data: outputData, error: errOutput } = await supabase.from("detail_produksi_output").insert([{ batch_id: batchData.id, stok_barang_id: parseInt(o.stok_barang_id), qty, hpp_per_unit: hppPerUnitBulat }]).select().single();
        if (errOutput) throw new Error("Gagal simpan output: " + errOutput.message);

        for (const k of o.kemasan) {
          if (!k.bahan_baku_id || !k.berat_gram || parseFloat(k.berat_gram) <= 0) continue;
          const beratGram = parseFloat(k.berat_gram);
          const beratKgK = beratGram / 1000;
          const hppKemasanUnit = Math.round(beratKgK * k.harga_beli_avg);
          await supabase.from("detail_produksi_kemasan").insert([{ output_id: outputData.id, bahan_baku_id: parseInt(k.bahan_baku_id), berat_gram: beratGram, hpp_kemasan: hppKemasanUnit }]);
          const bK = bahan.find(x => x.id === parseInt(k.bahan_baku_id));
          if (bK) { const pakai = beratKgK * qty; const stokBaruK = Math.max(0, bK.stok - pakai); await supabase.from("bahan_baku").update({ stok: stokBaruK, total_nilai_stok: Math.round(stokBaruK * bK.harga_beli_avg) }).eq("id", parseInt(k.bahan_baku_id)); }
        }

        const stokLama = produk?.jumlah_stok || 0;
        const stokBaru = stokLama + qty;
        const { data: hppLama } = await supabase.from("stok_barang").select("hpp_per_unit").eq("id", parseInt(o.stok_barang_id)).single();
        const hppLamaVal = hppLama?.hpp_per_unit || hppPerUnitBulat;
        const hppBaru = stokBaru > 0 ? Math.round((stokLama * hppLamaVal + qty * hppPerUnitBulat) / stokBaru) : hppPerUnitBulat;
        await supabase.from("stok_barang").update({ jumlah_stok: stokBaru, hpp_per_unit: hppBaru }).eq("id", parseInt(o.stok_barang_id));
        await supabase.from("mutasi_stok").insert([{ stok_barang_id: parseInt(o.stok_barang_id), tipe: "Masuk", qty, keterangan: `Produksi batch #${batchData.id} · HPP ${rupiah(hppPerUnitBulat)}/${produk?.satuan || "unit"}`, created_at: timestampWIB }]);
      }

      const tanggalHari = new Date().toISOString().split("T")[0];
      const gajiEntries = [
        { label: "Operator Produksi", nominal: gajiOp, tipe: "HPP" },
        { label: "Packing", nominal: gajiPack, tipe: "HPP" },
        { label: "Borongan Pencetak", nominal: gajiBor, tipe: "HPP" },
      ].filter(g => g.nominal > 0);

      for (const g of gajiEntries) {
        await supabase.from("gaji_harian").insert([{ tanggal: tanggalHari, nominal: g.nominal, keterangan: `${g.label} · Batch #${batchData.id}${operator.trim() ? ` · ${operator.trim()}` : ""}`, tipe_beban: g.tipe }]);
      }

      const outputNames = validOutput.map(o => { const p = stokBarang.find(s => s.id === parseInt(o.stok_barang_id)); return `${p?.nama_produk || "?"} ×${o.qty}`; }).join(", ");
      showToast(`✓ Batch #${batchData.id} berhasil!\n${outputNames}\nTotal HPP: ${rupiah(totalHppBulat)}`);

      setOperator(""); setGajiOperator(""); setGajiPacking(""); setGajiBorongan(""); setBiayaGas(""); setCatatan("");
      setBahanPakai([{ bahan_id: "", nama: "", qty: "", satuan: "", stok_tersedia: 0 }]);
      setOutputItems([emptyOutput()]);
      fetchData(); setActiveTab("riwayat");
    } catch (err: any) { showToast(err.message || "Gagal simpan", "error"); }
    finally { setSubmitting(false); }
  };

  const toggleBatch = async (id: number) => {
    if (expandedBatch === id) { setExpandedBatch(null); return; }
    setExpandedBatch(id);
    if (outputCache[id]) return;
    const { data: outputs } = await supabase.from("detail_produksi_output").select("id, batch_id, stok_barang_id, qty, hpp_per_unit, stok_barang(nama_produk, berat_kg, satuan)").eq("batch_id", id);
    const enriched: OutputRiwayat[] = await Promise.all(
      (outputs || []).map(async (o: any) => {
        const { data: kem } = await supabase.from("detail_produksi_kemasan").select("id, output_id, bahan_baku_id, berat_gram, hpp_kemasan, bahan_baku(nama)").eq("output_id", o.id);
        return { ...o, nama_produk: o.stok_barang?.nama_produk, berat_kg: o.stok_barang?.berat_kg, satuan: o.stok_barang?.satuan, kemasan: (kem || []).map((k: any) => ({ ...k, nama_bahan: k.bahan_baku?.nama })) };
      })
    );
    setOutputCache(prev => ({ ...prev, [id]: enriched }));
  };

  const riwayatFiltered = useMemo(() => {
    let data = [...riwayat];
    if (filterOp.trim()) data = data.filter(r => (r.operator || "").toLowerCase().includes(filterOp.toLowerCase()));
    data.sort((a, b) => { const va = new Date(a.created_at).getTime(); const vb = new Date(b.created_at).getTime(); return sortDir === "desc" ? vb - va : va - vb; });
    return data;
  }, [riwayat, filterOp, sortDir]);

  const totalPages = Math.ceil(riwayatFiltered.length / PAGE_SIZE);
  const riwayatPage = riwayatFiltered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const inputS: React.CSSProperties = {
    width: "100%", padding: "9px 12px",
    background: isDark ? "rgba(255,255,255,0.05)" : "#f8fffe",
    border: `1.5px solid ${C.border}`, borderRadius: 10,
    color: C.text, fontFamily: C.fontSans, fontSize: 13,
    outline: "none", boxSizing: "border-box",
  };

  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: "10px 18px", borderRadius: 10, border: "none", cursor: "pointer",
    fontWeight: 700, fontSize: 13, fontFamily: C.fontSans, transition: "all 0.15s",
    background: active
      ? `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`
      : (isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)"),
    color: active ? "#fff" : C.muted,
  });

  const btnAdd = (color: string): React.CSSProperties => ({
    background: `${color}15`, border: `1px solid ${color}40`, color,
    padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700,
  });

  const btnRemove = (disabled: boolean): React.CSSProperties => ({
    background: disabled ? "transparent" : `${C.red}15`,
    border: `1px solid ${disabled ? C.dim : `${C.red}40`}`,
    color: disabled ? C.dim : C.red,
    padding: 8, borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer", fontSize: 14,
  });

  const Lbl = ({ children }: { children: React.ReactNode }) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.08em", marginBottom: 5, textTransform: "uppercase" as const }}>
      {children}
    </div>
  );

  const sectionTitle = (icon: string, title: string) => (
    <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
      <span>{icon}</span> {title}
    </div>
  );

  if (loading) return (
    <AppShell>
      <div style={{ padding: 48, textAlign: "center", color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>
        Memuat data produksi...
      </div>
    </AppShell>
  );

  return (
    <AppShell>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .prod-row:hover { background: ${isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)"} !important; }
      `}</style>

      {toast && (
        <div style={{
          position: "fixed", top: 24, right: 24, zIndex: 9999,
          background: toast.type === "success" ? C.accent : toast.type === "error" ? C.red : C.blue,
          color: "#fff", padding: "12px 20px", borderRadius: 12,
          boxShadow: C.shadowMd, fontFamily: C.fontSans, fontWeight: 700, fontSize: 14,
          maxWidth: 400, whiteSpace: "pre-line" as const,
        }}>
          {toast.msg}
        </div>
      )}

      <div style={{ padding: "24px 28px", maxWidth: 1100, fontFamily: C.fontSans, animation: "fadeUp 0.3s ease" }}>

        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text }}>Produksi Batch</h1>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: C.muted }}>
            1 batch → multi varian output · HPP/kg dibagi rata · Kemasan per unit
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Total Produk", value: `${stokBarang.length} varian`, accent: C.blue, bg: C.cardBlue },
            { label: "Bahan Aktif", value: `${bahan.length} item`, accent: C.teal, bg: C.cardTeal },
            { label: "Batch Bulan Ini", value: `${riwayat.filter(r => new Date(r.created_at).getMonth() === new Date().getMonth()).length}`, accent: C.green, bg: C.cardGreen },
            { label: "Total Batch", value: `${riwayat.length}`, accent: C.yellow, bg: C.cardYellow },
          ].map((s, i) => (
            <div key={i} style={{
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
              padding: "16px 18px", boxShadow: C.shadow, position: "relative", overflow: "hidden",
            }}>
              <div style={{
                position: "absolute", top: 0, right: 0, width: 60, height: 60,
                background: `radial-gradient(circle at top right, ${s.accent}18, transparent 70%)`,
              }} />
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
                {s.label}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{s.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" as const }}>
          <button onClick={() => setActiveTab("input")} style={tabBtn(activeTab === "input")}>Input Produksi</button>
          <button onClick={() => setActiveTab("riwayat")} style={tabBtn(activeTab === "riwayat")}>
            Riwayat Batch ({riwayat.length})
          </button>
        </div>

        {/* ══ TAB INPUT ══ */}
        {activeTab === "input" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* INFO BATCH */}
            <div style={{ background: C.card, padding: "20px 24px", borderRadius: 14, border: `1px solid ${C.border}`, boxShadow: C.shadow }}>
              {sectionTitle("📋", "Info Batch")}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div><Lbl>Operator</Lbl><input type="text" value={operator} onChange={e => setOperator(e.target.value)} placeholder="Nama operator / penanggung jawab" style={inputS} /></div>
                <div><Lbl>Biaya Gas (Rp)</Lbl><input type="text" value={biayaGas} onChange={e => setBiayaGas(formatIDR(e.target.value))} placeholder="20.000" style={inputS} /></div>
              </div>
              <div style={{ background: rowBg, borderRadius: 12, border: `1px solid ${C.border}`, padding: "14px 16px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.yellow, marginBottom: 12 }}>
                  Gaji Produksi
                  {(gajiOp + gajiPack + gajiBor) > 0 && <span style={{ color: C.green, marginLeft: 10, fontWeight: 600, fontFamily: C.fontMono }}>Total: {rupiah(gajiOp + gajiPack + gajiBor)}</span>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                  <div><Lbl>Gaji Operator (3 orang)</Lbl><input type="text" value={gajiOperator} onChange={e => setGajiOperator(formatIDR(e.target.value))} placeholder="0" style={inputS} />{gajiOp > 0 && <div style={{ fontSize: 10, color: C.green, marginTop: 3, fontFamily: C.fontMono }}>{rupiah(gajiOp)}</div>}</div>
                  <div><Lbl>Gaji Packing</Lbl><input type="text" value={gajiPacking} onChange={e => setGajiPacking(formatIDR(e.target.value))} placeholder="0" style={inputS} />{gajiPack > 0 && <div style={{ fontSize: 10, color: C.green, marginTop: 3, fontFamily: C.fontMono }}>{rupiah(gajiPack)}</div>}</div>
                  <div><Lbl>Gaji Borongan Pencetak</Lbl><input type="text" value={gajiBorongan} onChange={e => setGajiBorongan(formatIDR(e.target.value))} placeholder="0 (nanti dari timbangan)" style={inputS} />{gajiBor > 0 && <div style={{ fontSize: 10, color: C.green, marginTop: 3, fontFamily: C.fontMono }}>{rupiah(gajiBor)}</div>}</div>
                </div>
              </div>
              <div style={{ marginTop: 12 }}><Lbl>Catatan</Lbl><input type="text" value={catatan} onChange={e => setCatatan(e.target.value)} placeholder="Opsional" style={inputS} /></div>
            </div>

            {/* BAHAN BAKU */}
            <div style={{ background: C.card, padding: "20px 24px", borderRadius: 14, border: `1px solid ${C.border}`, boxShadow: C.shadow }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.text, display: "flex", alignItems: "center", gap: 8 }}>
                  <span>🥩</span> Bahan Baku Dipakai
                </div>
                <button onClick={addBahan} style={btnAdd(C.green)}>+ Tambah Bahan</button>
              </div>
              {bahanPakai.map((item, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 44px", gap: 10, marginBottom: 10, padding: 12, background: rowBg, borderRadius: 10, border: `1px solid ${C.border}` }}>
                  <select value={item.bahan_id} onChange={e => updateBahan(idx, "bahan_id", e.target.value)} style={inputS}>
                    <option value="">— Pilih Bahan —</option>
                    {bahan.map(b => <option key={b.id} value={b.id}>{b.nama} · stok: {b.stok} {b.satuan}</option>)}
                  </select>
                  <input type="number" value={item.qty} onChange={e => updateBahan(idx, "qty", e.target.value)} placeholder={`Qty (${item.satuan || "satuan"})`} style={inputS} min="0" step="0.01" />
                  <div style={{ display: "flex", alignItems: "center", fontSize: 12, color: item.bahan_id && item.qty && parseFloat(item.qty) > item.stok_tersedia ? C.red : C.muted, fontFamily: C.fontMono }}>
                    {item.bahan_id ? `stok: ${item.stok_tersedia} ${item.satuan}` : "—"}
                    {item.bahan_id && item.qty && parseFloat(item.qty) > item.stok_tersedia && <span style={{ marginLeft: 6 }}>⚠</span>}
                  </div>
                  <button onClick={() => removeBahan(idx)} disabled={bahanPakai.length === 1} style={btnRemove(bahanPakai.length === 1)}>×</button>
                </div>
              ))}
              {stokWarnings.length > 0 && <div style={{ background: C.redDim, border: `1px solid ${C.red}40`, borderRadius: 10, padding: "10px 14px", fontSize: 12, color: C.red }}>Stok tidak cukup: {stokWarnings.join(", ")}</div>}
            </div>

            {/* OUTPUT PRODUK */}
            <div style={{ background: C.card, padding: "20px 24px", borderRadius: 14, border: `1px solid ${C.border}`, boxShadow: C.shadow }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, gap: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.text, display: "flex", alignItems: "center", gap: 8 }}>
                    <span>📦</span> Output Varian Produk
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Tambah semua varian yang dihasilkan dari batch ini</div>
                </div>
                <button onClick={addOutput} style={btnAdd(C.accent)}>+ Tambah Varian</button>
              </div>

              {outputItems.map((o, oIdx) => {
                const produk = stokBarang.find(s => s.id === parseInt(o.stok_barang_id));
                const { hppAdonan, hppKemasan, hppPerUnit } = o.stok_barang_id && o.qty ? calcHppOutput(o) : { hppAdonan: 0, hppKemasan: 0, hppPerUnit: 0 };
                return (
                  <div key={oIdx} style={{ marginBottom: 16, background: rowBg, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 44px", gap: 10, padding: "14px 16px", alignItems: "end" }}>
                      <div>
                        <Lbl>Produk Output {oIdx + 1}</Lbl>
                        <select value={o.stok_barang_id} onChange={e => updateOutputProduk(oIdx, e.target.value)} style={inputS}>
                          <option value="">— Pilih Produk —</option>
                          {stokBarang.map(s => <option key={s.id} value={s.id}>{s.nama_produk} {s.sku ? `(${s.sku})` : ""} · {s.berat_kg ? `${s.berat_kg}kg` : "⚠ berat belum diset"} · stok: {s.jumlah_stok}</option>)}
                        </select>
                        {produk && !produk.berat_kg && <div style={{ fontSize: 11, color: C.red, marginTop: 4, fontFamily: C.fontMono }}>⚠ Set berat di Admin → Master Produk</div>}
                      </div>
                      <div><Lbl>Qty ({produk?.satuan || "unit"})</Lbl><input type="number" value={o.qty} onChange={e => updateOutputQty(oIdx, e.target.value)} placeholder="Jumlah" style={inputS} min="1" /></div>
                      <button onClick={() => removeOutput(oIdx)} disabled={outputItems.length === 1} style={{ ...btnRemove(outputItems.length === 1), marginTop: 20 }}>×</button>
                    </div>

                    {o.stok_barang_id && o.qty && hppPerKg > 0 && (
                      <div style={{ padding: "10px 16px", background: C.accentGlow, borderTop: `1px solid ${C.border}`, display: "flex", flexWrap: "wrap" as const, gap: 16, fontSize: 11, fontFamily: C.fontMono }}>
                        <span style={{ color: C.muted }}>HPP adonan: <strong style={{ color: C.textMid }}>{rupiah(Math.round(hppAdonan))}</strong></span>
                        <span style={{ color: C.muted }}>+kemasan: <strong style={{ color: C.orange }}>{rupiah(Math.round(hppKemasan))}</strong></span>
                        <span style={{ color: C.muted }}>= HPP/{produk?.satuan || "unit"}: <strong style={{ color: C.accent, fontSize: 13 }}>{rupiah(Math.round(hppPerUnit))}</strong></span>
                        {o.qty && <span style={{ color: C.muted }}>× {o.qty} = <strong style={{ color: C.green }}>{rupiah(Math.round(hppPerUnit * parseFloat(o.qty)))}</strong></span>}
                      </div>
                    )}

                    <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.border}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.orange }}>
                          Kemasan {o.kemasan.length > 0 ? `(${o.kemasan.length} jenis)` : "— belum ada"}
                          {o.stok_barang_id && o.kemasan.length === 0 && <span style={{ color: C.muted, fontWeight: 400, marginLeft: 6 }}>preset kosong</span>}
                        </div>
                        <button onClick={() => addKemasan(oIdx)} style={btnAdd(C.orange)}>+ Kemasan</button>
                      </div>
                      {o.kemasan.map((k, kIdx) => (
                        <div key={kIdx} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 44px", gap: 8, marginBottom: 8 }}>
                          <select value={k.bahan_baku_id} onChange={e => updateKemasan(oIdx, kIdx, "bahan_baku_id", e.target.value)} style={{ ...inputS, fontSize: 12 }}>
                            <option value="">— Pilih Bahan Kemasan —</option>
                            {bahan.map(b => <option key={b.id} value={b.id}>{b.nama} ({b.satuan})</option>)}
                          </select>
                          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                            <input type="number" value={k.berat_gram} onChange={e => updateKemasan(oIdx, kIdx, "berat_gram", e.target.value)} placeholder="gram" min="0" step="0.1" style={{ ...inputS, fontSize: 12 }} />
                            <span style={{ fontSize: 11, color: C.muted, whiteSpace: "nowrap", fontFamily: C.fontMono }}>gr</span>
                          </div>
                          <button onClick={() => removeKemasan(oIdx, kIdx)} style={btnRemove(false)}>×</button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* PREVIEW TOTAL */}
            {validBahan.length > 0 && validOutput.length > 0 && totalKgOutput > 0 && (
              <div style={{ background: C.accentGlow, border: `1px solid ${C.accent}30`, borderRadius: 14, padding: "18px 20px" }}>
                <div style={{ fontSize: 13, color: C.textMid, marginBottom: 12, fontWeight: 700 }}>Ringkasan Batch</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
                  {[
                    { label: "HPP Bahan", val: rupiah(Math.round(hppBahan)), color: C.textMid },
                    { label: "Gaji Operator", val: rupiah(gajiOp), color: C.textMid },
                    { label: "Gaji Packing", val: rupiah(gajiPack), color: C.textMid },
                    { label: "Gaji Borongan", val: rupiah(gajiBor), color: C.textMid },
                    { label: "Biaya Gas", val: rupiah(gasOp), color: C.textMid },
                    { label: "Total HPP Batch", val: rupiah(Math.round(totalHPPBatch)), color: C.accent },
                  ].map((s, i) => (
                    <div key={i}><div style={{ fontSize: "10px", color: C.muted, marginBottom: 3 }}>{s.label}</div><div style={{ fontSize: "13px", fontWeight: 700, color: s.color, fontFamily: C.fontMono }}>{s.val}</div></div>
                  ))}
                </div>
                <div style={{ borderTop: `1px dashed ${C.accent}40`, paddingTop: 12, display: "flex", gap: 20, fontSize: "12px", fontFamily: C.fontMono }}>
                  <span style={{ color: C.muted }}>Total kg output: <strong style={{ color: C.text }}>{totalKgOutput.toFixed(3)} kg</strong></span>
                  <span style={{ color: C.muted }}>HPP/kg adonan: <strong style={{ color: C.accent, fontSize: "14px" }}>{rupiah(Math.round(hppPerKg))}/kg</strong></span>
                </div>
                <div style={{ marginTop: 12, borderTop: `1px dashed ${C.accent}40`, paddingTop: 12 }}>
                  <div style={{ fontSize: "10px", color: C.muted, marginBottom: 8, fontFamily: C.fontMono, letterSpacing: 1 }}>HPP PER VARIAN:</div>
                  <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8 }}>
                    {validOutput.map((o, i) => {
                      const produk = stokBarang.find(s => s.id === parseInt(o.stok_barang_id));
                      const { hppPerUnit } = calcHppOutput(o);
                      return (
                        <div key={i} style={{ background: C.card, borderRadius: 8, padding: "8px 14px", border: `1px solid ${C.border}`, fontSize: "12px" }}>
                          <span style={{ color: C.textMid, fontWeight: 600 }}>{produk?.nama_produk || "?"}</span>
                          <span style={{ color: C.accent, fontFamily: C.fontMono, marginLeft: 8, fontWeight: 700 }}>{rupiah(Math.round(hppPerUnit))}/{produk?.satuan || "unit"}</span>
                          <span style={{ color: C.muted, fontSize: "10px", marginLeft: 6 }}>×{o.qty}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {totalKgOutput === 0 && validOutput.length > 0 && validOutput.some(o => o.stok_barang_id) && (
              <div style={{ background: C.redDim, border: `1px solid ${C.red}40`, borderRadius: 10, padding: "12px 16px", fontSize: 13, color: C.red }}>
                Total kg output = 0. Pastikan semua produk output sudah diisi <strong>berat (kg)</strong> di Admin → Master Produk.
              </div>
            )}

            <button
              onClick={simpanBatch}
              disabled={submitting || stokWarnings.length > 0 || validOutput.length === 0 || validBahan.length === 0 || totalKgOutput === 0}
              style={{
                width: "100%", padding: 14, borderRadius: 12, border: "none", fontWeight: 800, fontSize: 15,
                cursor: (submitting || stokWarnings.length > 0 || totalKgOutput === 0) ? "not-allowed" : "pointer",
                background: (submitting || stokWarnings.length > 0 || totalKgOutput === 0)
                  ? C.dim
                  : `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`,
                color: (submitting || stokWarnings.length > 0 || totalKgOutput === 0) ? C.muted : "#fff",
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? "Menyimpan batch..." : `Simpan Batch Produksi${validOutput.length > 0 ? ` — ${validOutput.length} varian` : ""}`}
            </button>
          </div>
        )}

        {/* ══ TAB RIWAYAT ══ */}
        {activeTab === "riwayat" && (
          <div style={{ background: C.card, padding: "20px 24px", borderRadius: 14, border: `1px solid ${C.border}`, boxShadow: C.shadow }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 800, color: C.text }}>Riwayat Batch Produksi</h3>
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" as const }}>
              <input type="text" value={filterOp} placeholder="Cari operator..." onChange={e => { setFilterOp(e.target.value); setCurrentPage(1); }} style={{ ...inputS, flex: 1, minWidth: 180 }} />
              <button onClick={() => setSortDir(d => d === "desc" ? "asc" : "desc")} style={btnAdd(C.blue)}>
                {sortDir === "desc" ? "↓ Terbaru" : "↑ Terlama"}
              </button>
            </div>

            {riwayatPage.length === 0 && (
              <div style={{ textAlign: "center", color: C.muted, padding: 40, fontFamily: C.fontMono, fontSize: 13 }}>
                {filterOp ? "Tidak ada hasil" : "Belum ada riwayat produksi"}
              </div>
            )}

            {riwayatPage.map(r => (
              <div key={r.id} style={{ marginBottom: 10 }}>
                <div
                  onClick={() => toggleBatch(r.id)}
                  className="prod-row"
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "14px 18px",
                    background: expandedBatch === r.id ? C.accentGlow : rowBg,
                    border: `1px solid ${expandedBatch === r.id ? `${C.accent}40` : C.border}`,
                    borderRadius: expandedBatch === r.id ? "12px 12px 0 0" : 12,
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: "14px", color: C.text, marginBottom: 4 }}>
                      Batch #{r.id}
                      {r.operator && <span style={{ fontSize: "12px", color: C.muted, marginLeft: 10, fontWeight: 400 }}>· {r.operator}</span>}
                    </div>
                    <div style={{ fontSize: "11px", color: C.muted, fontFamily: C.fontMono, display: "flex", flexWrap: "wrap", gap: "0 12px" }}>
                      <span>{tanggalJamFmt(r.created_at)}</span>
                      {r.total_kg_output > 0 && <span>· {r.total_kg_output} kg output</span>}
                      {r.gaji_operator > 0 && <span style={{ color: C.green }}>· op: {rupiah(r.gaji_operator)}</span>}
                      {r.gaji_packing > 0 && <span style={{ color: C.green }}>· packing: {rupiah(r.gaji_packing)}</span>}
                      {r.gaji_borongan > 0 && <span style={{ color: C.yellow }}>· borongan: {rupiah(r.gaji_borongan)}</span>}
                      {r.biaya_gas > 0 && <span style={{ color: C.orange }}>· gas: {rupiah(r.biaya_gas)}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: C.accent, fontFamily: C.fontMono }}>{rupiah(r.total_hpp)}</div>
                    <div style={{ fontSize: "10px", color: C.muted, marginTop: 2 }}>Total HPP Batch · {expandedBatch === r.id ? "▲" : "▼"}</div>
                  </div>
                </div>

                {expandedBatch === r.id && (
                  <div style={{ background: rowBg, border: `1px solid ${C.border}`, borderTop: "none", borderRadius: "0 0 12px 12px", padding: "14px 18px" }}>
                    {!outputCache[r.id] ? <div style={{ color: C.muted, fontFamily: C.fontMono, fontSize: 12 }}>Memuat detail...</div>
                      : outputCache[r.id].length === 0 ? <div style={{ color: C.muted, fontFamily: C.fontMono, fontSize: 12, fontStyle: "italic" }}>Tidak ada data output</div>
                      : (
                        <>
                          <div style={{ fontSize: "10px", color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 10, fontWeight: 700 }}>OUTPUT VARIAN:</div>
                          {outputCache[r.id].map(o => (
                            <div key={o.id} style={{ marginBottom: 12, padding: "12px 14px", background: C.card, borderRadius: 8, border: `1px solid ${C.border}` }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: o.kemasan && o.kemasan.length > 0 ? 8 : 0 }}>
                                <div>
                                  <span style={{ fontSize: "13px", fontWeight: 700, color: C.textMid }}>{o.nama_produk || `Produk #${o.stok_barang_id}`}</span>
                                  <span style={{ fontSize: "11px", color: C.muted, marginLeft: 8, fontFamily: C.fontMono }}>×{o.qty} {o.satuan || "unit"} · {o.berat_kg ? `${o.berat_kg}kg/unit` : ""}</span>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                  <div style={{ fontSize: "14px", fontWeight: 700, color: C.accent, fontFamily: C.fontMono }}>{rupiah(o.hpp_per_unit)}/{o.satuan || "unit"}</div>
                                  <div style={{ fontSize: "10px", color: C.muted }}>× {o.qty} = {rupiah(o.hpp_per_unit * o.qty)}</div>
                                </div>
                              </div>
                              {o.kemasan && o.kemasan.length > 0 && (
                                <div style={{ borderTop: `1px dashed ${C.border}`, paddingTop: 8 }}>
                                  <div style={{ fontSize: "10px", color: C.orange, fontFamily: C.fontMono, marginBottom: 4, fontWeight: 700 }}>KEMASAN:</div>
                                  {o.kemasan.map((k, ki) => (
                                    <div key={ki} style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: C.muted, padding: "2px 0", fontFamily: C.fontMono }}>
                                      <span>{k.nama_bahan || `Bahan #${k.bahan_baku_id}`}</span>
                                      <span>{k.berat_gram}gr · {rupiah(k.hpp_kemasan)}/unit</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </>
                      )}
                    <BahanDetail batchId={r.id} />
                    {r.catatan && <div style={{ fontSize: "11px", color: C.muted, marginTop: 8, fontStyle: "italic" }}>📝 {r.catatan}</div>}
                  </div>
                )}
              </div>
            ))}

            {totalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 20, alignItems: "center" }}>
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} style={{ ...btnAdd(C.accent), opacity: currentPage === 1 ? 0.4 : 1, cursor: currentPage === 1 ? "not-allowed" : "pointer" }}>← Prev</button>
                <div style={{ padding: "8px 16px", color: C.textMid, fontSize: 12, fontFamily: C.fontMono }}>{currentPage} / {totalPages}</div>
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} style={{ ...btnAdd(C.accent), opacity: currentPage === totalPages ? 0.4 : 1, cursor: currentPage === totalPages ? "not-allowed" : "pointer" }}>Next →</button>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function BahanDetail({ batchId }: { batchId: number }) {
  const { isDark } = useTheme();
  const C = isDark ? DARK : LIGHT;
  const [data, setData] = useState<any[] | null>(null);
  useEffect(() => {
    supabase.from("detail_produksi_bahan").select("qty_pakai, hpp_bahan, bahan_baku(nama, satuan)").eq("produksi_batch_id", batchId).then(({ data }) => setData(data || []));
  }, [batchId]);
  if (!data || data.length === 0) return null;
  return (
    <div style={{ marginTop: 8, borderTop: `1px dashed ${C.border}`, paddingTop: 8 }}>
      <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 6, fontWeight: 700 }}>BAHAN BAKU:</div>
      {data.map((d: any, i: number) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.textMid, padding: "2px 0", fontFamily: C.fontMono }}>
          <span>{d.bahan_baku?.nama || "—"}</span>
          <span>{d.qty_pakai} {d.bahan_baku?.satuan || ""} · {rupiah(d.hpp_bahan || 0)}</span>
        </div>
      ))}
    </div>
  );
}
