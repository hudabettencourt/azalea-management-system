"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import Sidebar from "@/components/Sidebar";

// ── TYPES ──
type BahanBaku = { id: number; nama: string; satuan: string; kategori: string; stok: number; harga_beli_avg: number };
type StokBarang = { id: number; nama_produk: string; jumlah_stok: number; sku: string | null; berat_kg: number | null; satuan: string };
type PresetKemasan = { bahan_baku_id: number; berat_gram: number; nama_bahan: string; harga_beli_avg: number };

// 1 baris output = 1 varian produk dalam batch ini
type OutputItem = {
  stok_barang_id: string;
  qty: string;           // jumlah unit
  // kemasan — bisa multiple, pre-fill dari preset tapi bisa diedit
  kemasan: KemasamItem[];
};
type KemasamItem = {
  bahan_baku_id: string;
  nama_bahan: string;
  berat_gram: string;    // berat kemasan per unit output (gram)
  harga_beli_avg: number;
};

type BahanPakai = { bahan_id: string; nama: string; qty: string; satuan: string; stok_tersedia: number };
type Toast = { msg: string; type: "success" | "error" | "info" };

// Riwayat batch — header
type BatchRiwayat = {
  id: number;
  total_hpp: number;
  total_kg_output: number;
  gaji_operator: number;
  biaya_gas: number;
  operator: string | null;
  catatan: string | null;
  created_at: string;
};

// Detail output per batch
type OutputRiwayat = {
  id: number;
  batch_id: number;
  stok_barang_id: number;
  qty: number;
  hpp_per_unit: number;
  nama_produk?: string;
  berat_kg?: number | null;
  satuan?: string;
  kemasan?: KemasamRiwayat[];
};
type KemasamRiwayat = {
  id: number;
  output_id: number;
  bahan_baku_id: number;
  berat_gram: number;
  hpp_kemasan: number;
  nama_bahan?: string;
};

// ── HELPERS ──
const formatIDR = (val: string) => val.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const toAngka = (str: string) => parseInt(str.replace(/\./g, "")) || 0;
const rupiahFmt = (n: number) => `Rp ${(n || 0).toLocaleString("id-ID")}`;
const tanggalFmt = (s: string) => new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const PAGE_SIZE = 10;

const C = {
  bg: "#100c16", card: "#1a1425", border: "#2a1f3d",
  text: "#e2d9f3", textMid: "#c0aed4", muted: "#7c6d8a", dim: "#3d3050",
  accent: "#a78bfa", accentDim: "#a78bfa20",
  success: "#34d399", danger: "#f87171", blue: "#60a5fa",
  yellow: "#fbbf24", orange: "#fb923c",
  fontDisplay: "'DM Serif Display', serif",
  fontMono: "'DM Mono', monospace",
  fontSans: "'DM Sans', sans-serif",
};

const emptyOutput = (): OutputItem => ({ stok_barang_id: "", qty: "", kemasan: [] });

export default function ProduksiPage() {
  const [bahan, setBahan] = useState<BahanBaku[]>([]);
  const [stokBarang, setStokBarang] = useState<StokBarang[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [activeTab, setActiveTab] = useState<"input" | "riwayat">("input");

  // ── FORM HEADER BATCH ──
  const [operator, setOperator] = useState("");
  const [gajiOperator, setGajiOperator] = useState("");
  const [biayaGas, setBiayaGas] = useState("");
  const [catatan, setCatatan] = useState("");
  const [bahanPakai, setBahanPakai] = useState<BahanPakai[]>([
    { bahan_id: "", nama: "", qty: "", satuan: "", stok_tersedia: 0 }
  ]);

  // ── FORM OUTPUT (multi varian) ──
  const [outputItems, setOutputItems] = useState<OutputItem[]>([emptyOutput()]);

  // ── RIWAYAT ──
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

  // ── FETCH ──
  const fetchData = useCallback(async () => {
    try {
      const [resBahan, resStok, resBatch] = await Promise.all([
        supabase.from("bahan_baku").select("*").or("aktif.eq.true,aktif.is.null").order("kategori").order("nama"),
        supabase.from("stok_barang").select("id, nama_produk, jumlah_stok, sku, berat_kg, satuan").order("nama_produk"),
        supabase.from("produksi_batch").select("id, total_hpp, total_kg_output, gaji_operator, biaya_gas, operator, catatan, created_at").order("created_at", { ascending: false }).limit(200),
      ]);
      if (resBahan.error) throw new Error("Gagal load bahan: " + resBahan.error.message);
      if (resStok.error) throw new Error("Gagal load stok: " + resStok.error.message);
      if (resBatch.error) throw new Error("Gagal load riwayat: " + resBatch.error.message);
      setBahan(resBahan.data || []);
      setStokBarang(resStok.data || []);
      setRiwayat(resBatch.data || []);
    } catch (err: any) {
      showToast(err.message || "Gagal memuat data", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── FETCH PRESET KEMASAN untuk produk tertentu ──
  const fetchPreset = async (stokBarangId: number): Promise<PresetKemasan[]> => {
    const { data } = await supabase
      .from("produk_kemasan_default")
      .select("bahan_baku_id, berat_gram, bahan_baku(nama, harga_beli_avg)")
      .eq("stok_barang_id", stokBarangId);
    return (data || []).map((r: any) => ({
      bahan_baku_id: r.bahan_baku_id,
      berat_gram: r.berat_gram,
      nama_bahan: r.bahan_baku?.nama || "",
      harga_beli_avg: r.bahan_baku?.harga_beli_avg || 0,
    }));
  };

  // ── BAHAN PAKAI HELPERS ──
  const addBahan = () => setBahanPakai([...bahanPakai, { bahan_id: "", nama: "", qty: "", satuan: "", stok_tersedia: 0 }]);
  const removeBahan = (idx: number) => { if (bahanPakai.length > 1) setBahanPakai(bahanPakai.filter((_, i) => i !== idx)); };
  const updateBahan = (idx: number, field: keyof BahanPakai, value: string) => {
    const items = [...bahanPakai];
    if (field === "bahan_id") {
      const b = bahan.find(x => x.id === parseInt(value));
      items[idx] = { ...items[idx], bahan_id: value, nama: b?.nama || "", satuan: b?.satuan || "", stok_tersedia: b?.stok || 0 };
    } else {
      items[idx] = { ...items[idx], [field]: value };
    }
    setBahanPakai(items);
  };

  // ── OUTPUT HELPERS ──
  const addOutput = () => setOutputItems([...outputItems, emptyOutput()]);
  const removeOutput = (idx: number) => { if (outputItems.length > 1) setOutputItems(outputItems.filter((_, i) => i !== idx)); };

  const updateOutputProduk = async (idx: number, stokBarangId: string) => {
    const items = [...outputItems];
    items[idx] = { ...items[idx], stok_barang_id: stokBarangId, kemasan: [] };
    // Auto-fetch preset kemasan
    if (stokBarangId) {
      const presets = await fetchPreset(parseInt(stokBarangId));
      items[idx].kemasan = presets.map(p => ({
        bahan_baku_id: String(p.bahan_baku_id),
        nama_bahan: p.nama_bahan,
        berat_gram: String(p.berat_gram),
        harga_beli_avg: p.harga_beli_avg,
      }));
    }
    setOutputItems(items);
  };

  const updateOutputQty = (idx: number, qty: string) => {
    const items = [...outputItems];
    items[idx] = { ...items[idx], qty };
    setOutputItems(items);
  };

  const addKemasan = (oIdx: number) => {
    const items = [...outputItems];
    items[oIdx].kemasan = [...items[oIdx].kemasan, { bahan_baku_id: "", nama_bahan: "", berat_gram: "", harga_beli_avg: 0 }];
    setOutputItems(items);
  };

  const removeKemasan = (oIdx: number, kIdx: number) => {
    const items = [...outputItems];
    items[oIdx].kemasan = items[oIdx].kemasan.filter((_, i) => i !== kIdx);
    setOutputItems(items);
  };

  const updateKemasan = (oIdx: number, kIdx: number, field: "bahan_baku_id" | "berat_gram", value: string) => {
    const items = [...outputItems];
    if (field === "bahan_baku_id") {
      const b = bahan.find(x => x.id === parseInt(value));
      items[oIdx].kemasan[kIdx] = { ...items[oIdx].kemasan[kIdx], bahan_baku_id: value, nama_bahan: b?.nama || "", harga_beli_avg: b?.harga_beli_avg || 0 };
    } else {
      items[oIdx].kemasan[kIdx] = { ...items[oIdx].kemasan[kIdx], berat_gram: value };
    }
    setOutputItems(items);
  };

  // ── KALKULASI HPP ──
  const validBahan = bahanPakai.filter(i => i.bahan_id && i.qty && parseFloat(i.qty) > 0);
  const validOutput = outputItems.filter(o => o.stok_barang_id && o.qty && parseFloat(o.qty) > 0);

  const hppBahan = validBahan.reduce((sum, item) => {
    const b = bahan.find(x => x.id === parseInt(item.bahan_id));
    return sum + (parseFloat(item.qty) * (b?.harga_beli_avg || 0));
  }, 0);
  const gajiOp = toAngka(gajiOperator);
  const gasOp = toAngka(biayaGas);
  const totalHPPBatch = hppBahan + gajiOp + gasOp;

  // Total kg output = sum(qty × berat_kg produk)
  const totalKgOutput = validOutput.reduce((sum, o) => {
    const produk = stokBarang.find(s => s.id === parseInt(o.stok_barang_id));
    return sum + (parseFloat(o.qty) * (produk?.berat_kg || 0));
  }, 0);

  const hppPerKg = totalKgOutput > 0 ? totalHPPBatch / totalKgOutput : 0;

  // HPP per unit tiap output
  const calcHppOutput = (o: OutputItem) => {
    const produk = stokBarang.find(s => s.id === parseInt(o.stok_barang_id));
    const beratKg = produk?.berat_kg || 0;
    const hppAdonan = hppPerKg * beratKg;
    const hppKemasan = o.kemasan.reduce((sum, k) => {
      if (!k.bahan_baku_id || !k.berat_gram) return sum;
      const beratKgKemasan = parseFloat(k.berat_gram) / 1000;
      return sum + beratKgKemasan * k.harga_beli_avg;
    }, 0);
    return { hppAdonan, hppKemasan, hppPerUnit: hppAdonan + hppKemasan };
  };

  // Stok warnings
  const stokWarnings = validBahan.filter(i => {
    const b = bahan.find(x => x.id === parseInt(i.bahan_id));
    return b && b.stok < parseFloat(i.qty);
  }).map(i => i.nama);

  // ── SIMPAN BATCH ──
  const simpanBatch = async () => {
    if (validBahan.length === 0) return showToast("Minimal 1 bahan harus diisi!", "error");
    if (validOutput.length === 0) return showToast("Minimal 1 output produk harus diisi!", "error");
    if (stokWarnings.length > 0) return showToast(`Stok tidak cukup: ${stokWarnings.join(", ")}`, "error");
    if (totalKgOutput === 0) return showToast("Total kg output 0 — pastikan semua produk output sudah diisi berat di Master Produk!", "error");

    setSubmitting(true);
    try {
      const timestampWIB = new Date().toISOString().replace("Z", "+07:00");
      const totalHppBulat = Math.round(totalHPPBatch);

      // 1. Insert produksi_batch header
      const { data: batchData, error: errBatch } = await supabase
        .from("produksi_batch")
        .insert([{
          total_hpp: totalHppBulat,
          total_kg_output: Math.round(totalKgOutput * 1000) / 1000,
          gaji_operator: Math.round(gajiOp),
          biaya_gas: Math.round(gasOp),
          operator: operator.trim() || null,
          catatan: catatan.trim() || null,
          created_at: timestampWIB,
        }])
        .select()
        .single();
      if (errBatch) throw new Error("Gagal simpan batch: " + errBatch.message);

      // 2. Insert detail bahan + kurangi stok bahan
      for (const item of validBahan) {
        const qtyBahan = parseFloat(item.qty);
        const bahanId = parseInt(item.bahan_id);
        const b = bahan.find(x => x.id === bahanId);
        await supabase.from("detail_produksi_bahan").insert([{
          produksi_batch_id: batchData.id,
          bahan_baku_id: bahanId,
          qty_pakai: qtyBahan,
          hpp_bahan: Math.round(qtyBahan * (b?.harga_beli_avg || 0)),
        }]);
        const stokBaru = Math.max(0, (b?.stok || 0) - qtyBahan);
        await supabase.from("bahan_baku").update({
          stok: stokBaru,
          total_nilai_stok: Math.round(stokBaru * (b?.harga_beli_avg || 0)),
        }).eq("id", bahanId);
      }

      // 3. Insert output + kemasan + update stok produk
      for (const o of validOutput) {
        const produk = stokBarang.find(s => s.id === parseInt(o.stok_barang_id));
        const qty = parseFloat(o.qty);
        const { hppAdonan, hppKemasan, hppPerUnit } = calcHppOutput(o);
        const hppPerUnitBulat = Math.round(hppPerUnit);

        // Insert detail_produksi_output
        const { data: outputData, error: errOutput } = await supabase
          .from("detail_produksi_output")
          .insert([{
            batch_id: batchData.id,
            stok_barang_id: parseInt(o.stok_barang_id),
            qty,
            hpp_per_unit: hppPerUnitBulat,
          }])
          .select()
          .single();
        if (errOutput) throw new Error("Gagal simpan output: " + errOutput.message);

        // Insert kemasan per output
        for (const k of o.kemasan) {
          if (!k.bahan_baku_id || !k.berat_gram || parseFloat(k.berat_gram) <= 0) continue;
          const beratGram = parseFloat(k.berat_gram);
          const beratKgK = beratGram / 1000;
          const hppKemasanUnit = Math.round(beratKgK * k.harga_beli_avg);
          await supabase.from("detail_produksi_kemasan").insert([{
            output_id: outputData.id,
            bahan_baku_id: parseInt(k.bahan_baku_id),
            berat_gram: beratGram,
            hpp_kemasan: hppKemasanUnit,
          }]);
          // Kurangi stok kemasan (bahan baku) sebesar berat × qty output
          const bK = bahan.find(x => x.id === parseInt(k.bahan_baku_id));
          if (bK) {
            const pakai = beratKgK * qty;
            const stokBaruK = Math.max(0, bK.stok - pakai);
            await supabase.from("bahan_baku").update({
              stok: stokBaruK,
              total_nilai_stok: Math.round(stokBaruK * bK.harga_beli_avg),
            }).eq("id", parseInt(k.bahan_baku_id));
          }
        }

        // Update stok produk jadi (weighted average HPP)
        const stokLama = produk?.jumlah_stok || 0;
        const stokBaru = stokLama + qty;
        const { data: hppLama } = await supabase
          .from("stok_barang")
          .select("hpp_per_unit")
          .eq("id", parseInt(o.stok_barang_id))
          .single();
        const hppLamaVal = hppLama?.hpp_per_unit || hppPerUnitBulat;
        const hppBaru = stokBaru > 0 ? Math.round((stokLama * hppLamaVal + qty * hppPerUnitBulat) / stokBaru) : hppPerUnitBulat;
        await supabase.from("stok_barang").update({ jumlah_stok: stokBaru, hpp_per_unit: hppBaru }).eq("id", parseInt(o.stok_barang_id));

        // Mutasi stok
        await supabase.from("mutasi_stok").insert([{
          stok_barang_id: parseInt(o.stok_barang_id),
          tipe: "Masuk",
          qty,
          keterangan: `Produksi batch #${batchData.id} · HPP ${rupiahFmt(hppPerUnitBulat)}/${produk?.satuan || "unit"}`,
          created_at: timestampWIB,
        }]);
      }

      const outputNames = validOutput.map(o => {
        const p = stokBarang.find(s => s.id === parseInt(o.stok_barang_id));
        return `${p?.nama_produk || "?"} ×${o.qty}`;
      }).join(", ");
      showToast(`✓ Batch #${batchData.id} berhasil!\n${outputNames}\nTotal HPP: ${rupiahFmt(totalHppBulat)}`);

      // Reset form
      setOperator(""); setGajiOperator(""); setBiayaGas(""); setCatatan("");
      setBahanPakai([{ bahan_id: "", nama: "", qty: "", satuan: "", stok_tersedia: 0 }]);
      setOutputItems([emptyOutput()]);
      fetchData();
      setActiveTab("riwayat");
    } catch (err: any) {
      showToast(err.message || "Gagal simpan", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // ── EXPAND RIWAYAT ──
  const toggleBatch = async (id: number) => {
    if (expandedBatch === id) { setExpandedBatch(null); return; }
    setExpandedBatch(id);
    if (outputCache[id]) return;
    // Fetch output + kemasan
    const { data: outputs } = await supabase
      .from("detail_produksi_output")
      .select("id, batch_id, stok_barang_id, qty, hpp_per_unit, stok_barang(nama_produk, berat_kg, satuan)")
      .eq("batch_id", id);
    const enriched: OutputRiwayat[] = await Promise.all(
      (outputs || []).map(async (o: any) => {
        const { data: kem } = await supabase
          .from("detail_produksi_kemasan")
          .select("id, output_id, bahan_baku_id, berat_gram, hpp_kemasan, bahan_baku(nama)")
          .eq("output_id", o.id);
        return {
          ...o,
          nama_produk: o.stok_barang?.nama_produk,
          berat_kg: o.stok_barang?.berat_kg,
          satuan: o.stok_barang?.satuan,
          kemasan: (kem || []).map((k: any) => ({ ...k, nama_bahan: k.bahan_baku?.nama })),
        };
      })
    );
    setOutputCache(prev => ({ ...prev, [id]: enriched }));
  };

  // ── FILTER / PAGINATE RIWAYAT ──
  const riwayatFiltered = useMemo(() => {
    let data = [...riwayat];
    if (filterOp.trim()) data = data.filter(r => (r.operator || "").toLowerCase().includes(filterOp.toLowerCase()));
    data.sort((a, b) => {
      const va = new Date(a.created_at).getTime();
      const vb = new Date(b.created_at).getTime();
      return sortDir === "desc" ? vb - va : va - vb;
    });
    return data;
  }, [riwayat, filterOp, sortDir]);

  const totalPages = Math.ceil(riwayatFiltered.length / PAGE_SIZE);
  const riwayatPage = riwayatFiltered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const inputS: React.CSSProperties = {
    width: "100%", padding: "9px 12px", background: "#0f0b1a",
    border: `1.5px solid ${C.border}`, borderRadius: "8px",
    color: C.text, fontFamily: C.fontSans, fontSize: "13px",
    boxSizing: "border-box", outline: "none",
  };
  const tabBtn = (active: boolean, color: string): React.CSSProperties => ({
    flex: 1, padding: "10px 8px", borderRadius: "8px",
    border: `1px solid ${active ? color + "60" : C.border}`,
    background: active ? color + "20" : "transparent",
    color: active ? color : C.muted,
    fontWeight: 600, cursor: "pointer", fontSize: "13px",
    fontFamily: C.fontSans, transition: "all 0.15s",
  });
  const Lbl = ({ children }: { children: React.ReactNode }) => (
    <div style={{ fontSize: "10px", fontWeight: 700, color: C.muted, letterSpacing: "0.08em", marginBottom: "5px", textTransform: "uppercase" as const }}>{children}</div>
  );

  if (loading) return (
    <Sidebar>
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>◈</div>Memuat data produksi...
        </div>
      </div>
    </Sidebar>
  );

  return (
    <Sidebar>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        input:focus, select:focus, textarea:focus { border-color: #a78bfa80 !important; outline: none; }
        input::placeholder, textarea::placeholder { color: #3d3050 !important; }
        select option { background: #1a1020; color: #e2d9f3; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #2a1f3d; border-radius: 2px; }
      `}</style>

      {toast && (
        <div style={{ position: "fixed", top: 24, right: 24, zIndex: 9999, background: "#1a1020", border: `1px solid ${toast.type === "success" ? C.success : toast.type === "error" ? C.danger : C.blue}44`, color: toast.type === "success" ? C.success : toast.type === "error" ? C.danger : C.blue, padding: "14px 18px", borderRadius: "10px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", display: "flex", alignItems: "center", gap: 10, fontFamily: C.fontMono, fontWeight: 600, fontSize: 13, maxWidth: 400 }}>
          <span style={{ flex: 1, whiteSpace: "pre-line" }}>{toast.msg}</span>
          <button onClick={() => setToast(null)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 16, opacity: 0.6 }}>×</button>
        </div>
      )}

      <div style={{ padding: "28px 24px", fontFamily: C.fontSans, background: C.bg, minHeight: "100vh", maxWidth: "1200px", margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: "28px" }}>
          <h1 style={{ margin: 0, fontFamily: C.fontDisplay, fontSize: "26px", color: "#f0eaff", fontWeight: 400 }}>🏭 Produksi Batch</h1>
          <p style={{ margin: "4px 0 0", fontSize: "12px", color: C.muted, fontFamily: C.fontMono }}>
            1 batch → multi varian output · HPP/kg dibagi rata ke semua output · Kemasan dihitung per unit
          </p>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "14px", marginBottom: "24px" }}>
          {[
            { label: "Total Produk", value: `${stokBarang.length} varian`, color: C.blue },
            { label: "Bahan Aktif", value: `${bahan.length} item`, color: C.accent },
            { label: "Batch Bulan Ini", value: `${riwayat.filter(r => new Date(r.created_at).getMonth() === new Date().getMonth()).length}`, color: C.success },
            { label: "Total Batch", value: `${riwayat.length}`, color: C.yellow },
          ].map((s, i) => (
            <div key={i} style={{ background: C.card, padding: "16px 20px", borderRadius: "14px", borderLeft: `4px solid ${s.color}` }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>{s.label}</div>
              <div style={{ fontSize: "20px", fontWeight: 700, color: "#f0eaff", fontFamily: C.fontDisplay }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          <button onClick={() => setActiveTab("input")} style={tabBtn(activeTab === "input", C.accent)}>⚙️ Input Produksi</button>
          <button onClick={() => setActiveTab("riwayat")} style={tabBtn(activeTab === "riwayat", C.blue)}>📋 Riwayat Batch ({riwayat.length})</button>
        </div>

        {/* ══ TAB INPUT ══ */}
        {activeTab === "input" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* HEADER BATCH: operator, gaji, gas, catatan */}
            <div style={{ background: C.card, padding: "20px 24px", borderRadius: "14px", border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: C.accent, fontFamily: C.fontMono, marginBottom: 14, letterSpacing: 1 }}>📋 INFO BATCH</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
                <div>
                  <Lbl>OPERATOR</Lbl>
                  <input type="text" value={operator} onChange={e => setOperator(e.target.value)} placeholder="Nama operator" style={inputS} />
                </div>
                <div>
                  <Lbl>GAJI HARIAN (Rp)</Lbl>
                  <input type="text" value={gajiOperator} onChange={e => setGajiOperator(formatIDR(e.target.value))} placeholder="150.000" style={inputS} />
                </div>
                <div>
                  <Lbl>BIAYA GAS (Rp)</Lbl>
                  <input type="text" value={biayaGas} onChange={e => setBiayaGas(formatIDR(e.target.value))} placeholder="20.000" style={inputS} />
                </div>
                <div>
                  <Lbl>CATATAN</Lbl>
                  <input type="text" value={catatan} onChange={e => setCatatan(e.target.value)} placeholder="Opsional" style={inputS} />
                </div>
              </div>
            </div>

            {/* BAHAN BAKU */}
            <div style={{ background: C.card, padding: "20px 24px", borderRadius: "14px", border: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: C.accent, fontFamily: C.fontMono, letterSpacing: 1 }}>🥩 BAHAN BAKU DIPAKAI</div>
                <button onClick={addBahan} style={{ background: C.success + "15", border: `1px solid ${C.success}40`, color: C.success, padding: "6px 14px", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}>+ Tambah Bahan</button>
              </div>
              {bahanPakai.map((item, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 44px", gap: 10, marginBottom: 10, padding: "12px", background: "#0f0b1a", borderRadius: "8px", border: `1px solid ${C.border}` }}>
                  <select value={item.bahan_id} onChange={e => updateBahan(idx, "bahan_id", e.target.value)} style={{ ...inputS, background: C.card }}>
                    <option value="">— Pilih Bahan —</option>
                    {bahan.map(b => <option key={b.id} value={b.id}>{b.nama} · stok: {b.stok} {b.satuan}</option>)}
                  </select>
                  <input type="number" value={item.qty} onChange={e => updateBahan(idx, "qty", e.target.value)} placeholder={`Qty (${item.satuan || "satuan"})`} style={inputS} min="0" step="0.01" />
                  <div style={{ display: "flex", alignItems: "center", fontSize: "12px", color: item.bahan_id && item.qty && parseFloat(item.qty) > item.stok_tersedia ? C.danger : C.muted, fontFamily: C.fontMono }}>
                    {item.bahan_id ? `stok: ${item.stok_tersedia} ${item.satuan}` : "—"}
                    {item.bahan_id && item.qty && parseFloat(item.qty) > item.stok_tersedia && <span style={{ marginLeft: 6 }}>⚠</span>}
                  </div>
                  <button onClick={() => removeBahan(idx)} disabled={bahanPakai.length === 1} style={{ background: bahanPakai.length === 1 ? "transparent" : C.danger + "15", border: `1px solid ${bahanPakai.length === 1 ? C.dim : C.danger + "40"}`, color: bahanPakai.length === 1 ? C.dim : C.danger, padding: "8px", borderRadius: "6px", cursor: bahanPakai.length === 1 ? "not-allowed" : "pointer", fontSize: "14px" }}>×</button>
                </div>
              ))}
              {stokWarnings.length > 0 && (
                <div style={{ background: C.danger + "10", border: `1px solid ${C.danger}40`, borderRadius: "8px", padding: "10px 14px", fontSize: "12px", color: C.danger }}>
                  ❌ Stok tidak cukup: {stokWarnings.join(", ")}
                </div>
              )}
            </div>

            {/* OUTPUT PRODUK */}
            <div style={{ background: C.card, padding: "20px 24px", borderRadius: "14px", border: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: C.accent, fontFamily: C.fontMono, letterSpacing: 1 }}>📦 OUTPUT VARIAN PRODUK</div>
                  <div style={{ fontSize: "11px", color: C.muted, marginTop: 3 }}>Tambah semua varian yang dihasilkan dari batch ini</div>
                </div>
                <button onClick={addOutput} style={{ background: C.accent + "15", border: `1px solid ${C.accent}40`, color: C.accent, padding: "6px 14px", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}>+ Tambah Varian</button>
              </div>

              {outputItems.map((o, oIdx) => {
                const produk = stokBarang.find(s => s.id === parseInt(o.stok_barang_id));
                const { hppAdonan, hppKemasan, hppPerUnit } = o.stok_barang_id && o.qty ? calcHppOutput(o) : { hppAdonan: 0, hppKemasan: 0, hppPerUnit: 0 };

                return (
                  <div key={oIdx} style={{ marginBottom: 16, background: "#0f0b1a", borderRadius: "10px", border: `1px solid ${C.border}`, overflow: "hidden" }}>
                    {/* Baris produk + qty */}
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 44px", gap: 10, padding: "14px 16px", alignItems: "end" }}>
                      <div>
                        <Lbl>PRODUK OUTPUT {oIdx + 1}</Lbl>
                        <select value={o.stok_barang_id} onChange={e => updateOutputProduk(oIdx, e.target.value)} style={{ ...inputS, background: C.card }}>
                          <option value="">— Pilih Produk —</option>
                          {stokBarang.map(s => (
                            <option key={s.id} value={s.id}>
                              {s.nama_produk} {s.sku ? `(${s.sku})` : ""} · {s.berat_kg ? `${s.berat_kg}kg` : "⚠ berat belum diset"} · stok: {s.jumlah_stok}
                            </option>
                          ))}
                        </select>
                        {produk && !produk.berat_kg && (
                          <div style={{ fontSize: "11px", color: C.danger, marginTop: 4, fontFamily: C.fontMono }}>⚠ Produk ini belum punya berat — set di Admin → Master Produk</div>
                        )}
                      </div>
                      <div>
                        <Lbl>QTY ({produk?.satuan || "unit"})</Lbl>
                        <input type="number" value={o.qty} onChange={e => updateOutputQty(oIdx, e.target.value)} placeholder="Jumlah" style={inputS} min="1" />
                      </div>
                      <button onClick={() => removeOutput(oIdx)} disabled={outputItems.length === 1} style={{ background: outputItems.length === 1 ? "transparent" : C.danger + "15", border: `1px solid ${outputItems.length === 1 ? C.dim : C.danger + "40"}`, color: outputItems.length === 1 ? C.dim : C.danger, padding: "8px", borderRadius: "6px", cursor: outputItems.length === 1 ? "not-allowed" : "pointer", fontSize: "14px", marginTop: 20 }}>×</button>
                    </div>

                    {/* Preview HPP output ini */}
                    {o.stok_barang_id && o.qty && hppPerKg > 0 && (
                      <div style={{ padding: "10px 16px", background: C.accent + "08", borderTop: `1px solid ${C.border}`, display: "flex", gap: 20, fontSize: "11px", fontFamily: C.fontMono }}>
                        <span style={{ color: C.muted }}>HPP adonan: <strong style={{ color: C.textMid }}>{rupiahFmt(Math.round(hppAdonan))}</strong></span>
                        <span style={{ color: C.muted }}>+kemasan: <strong style={{ color: C.orange }}>{rupiahFmt(Math.round(hppKemasan))}</strong></span>
                        <span style={{ color: C.muted }}>= HPP/{produk?.satuan || "unit"}: <strong style={{ color: C.accent, fontSize: "13px" }}>{rupiahFmt(Math.round(hppPerUnit))}</strong></span>
                        {o.qty && <span style={{ color: C.muted }}>× {o.qty} = <strong style={{ color: C.success }}>{rupiahFmt(Math.round(hppPerUnit * parseFloat(o.qty)))}</strong></span>}
                      </div>
                    )}

                    {/* Kemasan per output ini */}
                    <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.border}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <div style={{ fontSize: "10px", fontWeight: 700, color: C.orange, fontFamily: C.fontMono, letterSpacing: 1 }}>
                          🎁 KEMASAN {o.kemasan.length > 0 ? `(${o.kemasan.length} jenis)` : "— belum ada"}
                          {o.stok_barang_id && o.kemasan.length === 0 && <span style={{ color: C.muted, fontWeight: 400, marginLeft: 6 }}>preset kosong, tambah manual jika perlu</span>}
                        </div>
                        <button onClick={() => addKemasan(oIdx)} style={{ background: C.orange + "15", border: `1px solid ${C.orange}40`, color: C.orange, padding: "4px 10px", borderRadius: "5px", cursor: "pointer", fontSize: "11px", fontWeight: 600 }}>+ Kemasan</button>
                      </div>
                      {o.kemasan.map((k, kIdx) => (
                        <div key={kIdx} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 44px", gap: 8, marginBottom: 8 }}>
                          <select value={k.bahan_baku_id} onChange={e => updateKemasan(oIdx, kIdx, "bahan_baku_id", e.target.value)} style={{ ...inputS, fontSize: "12px", background: C.card }}>
                            <option value="">— Pilih Bahan Kemasan —</option>
                            {bahan.map(b => <option key={b.id} value={b.id}>{b.nama} ({b.satuan})</option>)}
                          </select>
                          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                            <input type="number" value={k.berat_gram} onChange={e => updateKemasan(oIdx, kIdx, "berat_gram", e.target.value)} placeholder="gram" min="0" step="0.1" style={{ ...inputS, fontSize: "12px" }} />
                            <span style={{ fontSize: "11px", color: C.muted, whiteSpace: "nowrap", fontFamily: C.fontMono }}>gr</span>
                          </div>
                          <button onClick={() => removeKemasan(oIdx, kIdx)} style={{ background: C.danger + "15", border: `1px solid ${C.danger}40`, color: C.danger, padding: "8px", borderRadius: "6px", cursor: "pointer", fontSize: "14px" }}>×</button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* PREVIEW TOTAL BATCH */}
            {validBahan.length > 0 && validOutput.length > 0 && totalKgOutput > 0 && (
              <div style={{ background: C.accentDim, border: `1px solid ${C.accent}40`, borderRadius: "12px", padding: "18px 20px" }}>
                <div style={{ fontSize: "12px", color: C.textMid, marginBottom: 12, fontWeight: 600 }}>📊 Ringkasan Batch</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                  {[
                    { label: "HPP Bahan", val: rupiahFmt(Math.round(hppBahan)), color: C.textMid },
                    { label: "Gaji Operator", val: rupiahFmt(gajiOp), color: C.textMid },
                    { label: "Biaya Gas", val: rupiahFmt(gasOp), color: C.textMid },
                    { label: "Total HPP Batch", val: rupiahFmt(Math.round(totalHPPBatch)), color: C.accent },
                  ].map((s, i) => (
                    <div key={i}>
                      <div style={{ fontSize: "10px", color: C.muted, marginBottom: 3 }}>{s.label}</div>
                      <div style={{ fontSize: "14px", fontWeight: 700, color: s.color, fontFamily: C.fontMono }}>{s.val}</div>
                    </div>
                  ))}
                </div>
                <div style={{ borderTop: `1px dashed ${C.accent}40`, paddingTop: 12, display: "flex", gap: 20, fontSize: "12px", fontFamily: C.fontMono }}>
                  <span style={{ color: C.muted }}>Total kg output: <strong style={{ color: C.text }}>{totalKgOutput.toFixed(3)} kg</strong></span>
                  <span style={{ color: C.muted }}>HPP/kg adonan: <strong style={{ color: C.accent, fontSize: "14px" }}>{rupiahFmt(Math.round(hppPerKg))}/kg</strong></span>
                </div>
                {/* Per varian */}
                <div style={{ marginTop: 12, borderTop: `1px dashed ${C.accent}40`, paddingTop: 12 }}>
                  <div style={{ fontSize: "10px", color: C.muted, marginBottom: 8, fontFamily: C.fontMono, letterSpacing: 1 }}>HPP PER VARIAN:</div>
                  <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8 }}>
                    {validOutput.map((o, i) => {
                      const produk = stokBarang.find(s => s.id === parseInt(o.stok_barang_id));
                      const { hppPerUnit } = calcHppOutput(o);
                      return (
                        <div key={i} style={{ background: C.card, borderRadius: 8, padding: "8px 14px", border: `1px solid ${C.border}`, fontSize: "12px" }}>
                          <span style={{ color: C.textMid, fontWeight: 600 }}>{produk?.nama_produk || "?"}</span>
                          <span style={{ color: C.accent, fontFamily: C.fontMono, marginLeft: 8, fontWeight: 700 }}>{rupiahFmt(Math.round(hppPerUnit))}/{produk?.satuan || "unit"}</span>
                          <span style={{ color: C.muted, fontSize: "10px", marginLeft: 6 }}>×{o.qty}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {totalKgOutput === 0 && validOutput.length > 0 && validOutput.some(o => o.stok_barang_id) && (
              <div style={{ background: C.danger + "10", border: `1px solid ${C.danger}40`, borderRadius: "10px", padding: "12px 16px", fontSize: "13px", color: C.danger }}>
                ⚠ Total kg output = 0. Pastikan semua produk output sudah diisi <strong>berat (kg)</strong> di Admin → Master Produk.
              </div>
            )}

            {/* TOMBOL SIMPAN */}
            <button
              onClick={simpanBatch}
              disabled={submitting || stokWarnings.length > 0 || validOutput.length === 0 || validBahan.length === 0 || totalKgOutput === 0}
              style={{
                width: "100%", padding: "14px", borderRadius: "10px",
                background: (submitting || stokWarnings.length > 0 || totalKgOutput === 0) ? "transparent" : C.accent + "25",
                border: `1px solid ${(submitting || stokWarnings.length > 0 || totalKgOutput === 0) ? C.dim : C.accent + "60"}`,
                color: (submitting || stokWarnings.length > 0 || totalKgOutput === 0) ? C.dim : C.accent,
                fontWeight: 700, cursor: "pointer", fontFamily: C.fontSans, fontSize: "15px",
              }}
            >
              {submitting ? "Menyimpan batch..." : `✓ Simpan Batch Produksi${validOutput.length > 0 ? ` — ${validOutput.length} varian output` : ""}`}
            </button>
          </div>
        )}

        {/* ══ TAB RIWAYAT ══ */}
        {activeTab === "riwayat" && (
          <div style={{ background: C.card, padding: "20px", borderRadius: "14px", border: `1px solid ${C.border}` }}>
            <h3 style={{ margin: "0 0 16px", fontFamily: C.fontDisplay, color: C.text, fontWeight: 400 }}>Riwayat Batch Produksi</h3>

            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <input type="text" value={filterOp} placeholder="🔍 Cari operator..." onChange={e => { setFilterOp(e.target.value); setCurrentPage(1); }} style={{ ...inputS, flex: 1, padding: "8px 12px" }} />
              <button onClick={() => setSortDir(d => d === "desc" ? "asc" : "desc")} style={{ background: C.blue + "15", border: `1px solid ${C.blue}40`, color: C.blue, padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}>
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
                {/* Header baris */}
                <div
                  onClick={() => toggleBatch(r.id)}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", background: expandedBatch === r.id ? C.accentDim : "#0f0b1a", border: `1px solid ${expandedBatch === r.id ? C.accent + "40" : C.border}`, borderRadius: expandedBatch === r.id ? "10px 10px 0 0" : "10px", cursor: "pointer", transition: "all 0.15s" }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: "14px", color: C.text, marginBottom: 4 }}>
                      Batch #{r.id}
                      {r.operator && <span style={{ fontSize: "12px", color: C.muted, marginLeft: 10, fontWeight: 400 }}>· {r.operator}</span>}
                    </div>
                    <div style={{ fontSize: "11px", color: C.muted, fontFamily: C.fontMono }}>
                      {tanggalFmt(r.created_at)}
                      {r.total_kg_output > 0 && <span style={{ marginLeft: 8 }}>· {r.total_kg_output} kg output</span>}
                      {r.gaji_operator > 0 && <span style={{ color: C.success, marginLeft: 8 }}>· gaji {rupiahFmt(r.gaji_operator)}</span>}
                      {r.biaya_gas > 0 && <span style={{ color: C.orange, marginLeft: 8 }}>· gas {rupiahFmt(r.biaya_gas)}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: C.accent, fontFamily: C.fontMono }}>{rupiahFmt(r.total_hpp)}</div>
                    <div style={{ fontSize: "10px", color: C.muted, marginTop: 2 }}>Total HPP Batch · {expandedBatch === r.id ? "▲" : "▼"}</div>
                  </div>
                </div>

                {/* Detail output per varian */}
                {expandedBatch === r.id && (
                  <div style={{ background: "#0f0b1a", border: `1px solid ${C.border}`, borderTop: "none", borderRadius: "0 0 10px 10px", padding: "14px 18px" }}>
                    {!outputCache[r.id] ? (
                      <div style={{ color: C.muted, fontFamily: C.fontMono, fontSize: 12 }}>Memuat detail...</div>
                    ) : outputCache[r.id].length === 0 ? (
                      <div style={{ color: C.muted, fontFamily: C.fontMono, fontSize: 12, fontStyle: "italic" }}>Tidak ada data output (batch lama)</div>
                    ) : (
                      <>
                        <div style={{ fontSize: "10px", color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 10, fontWeight: 700 }}>OUTPUT VARIAN:</div>
                        {outputCache[r.id].map((o, i) => (
                          <div key={o.id} style={{ marginBottom: 12, padding: "12px 14px", background: C.card, borderRadius: 8, border: `1px solid ${C.border}` }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: o.kemasan && o.kemasan.length > 0 ? 8 : 0 }}>
                              <div>
                                <span style={{ fontSize: "13px", fontWeight: 700, color: C.textMid }}>{o.nama_produk || `Produk #${o.stok_barang_id}`}</span>
                                <span style={{ fontSize: "11px", color: C.muted, marginLeft: 8, fontFamily: C.fontMono }}>
                                  ×{o.qty} {o.satuan || "unit"} · {o.berat_kg ? `${o.berat_kg}kg/unit` : ""}
                                </span>
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: "14px", fontWeight: 700, color: C.accent, fontFamily: C.fontMono }}>{rupiahFmt(o.hpp_per_unit)}/{o.satuan || "unit"}</div>
                                <div style={{ fontSize: "10px", color: C.muted }}>× {o.qty} = {rupiahFmt(o.hpp_per_unit * o.qty)}</div>
                              </div>
                            </div>
                            {o.kemasan && o.kemasan.length > 0 && (
                              <div style={{ borderTop: `1px dashed ${C.border}`, paddingTop: 8 }}>
                                <div style={{ fontSize: "10px", color: C.orange, fontFamily: C.fontMono, marginBottom: 4, fontWeight: 700 }}>KEMASAN:</div>
                                {o.kemasan.map((k, ki) => (
                                  <div key={ki} style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: C.muted, padding: "2px 0", fontFamily: C.fontMono }}>
                                    <span>{k.nama_bahan || `Bahan #${k.bahan_baku_id}`}</span>
                                    <span>{k.berat_gram}gr · {rupiahFmt(k.hpp_kemasan)}/unit</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </>
                    )}

                    {/* Bahan baku batch ini (dari detail_produksi_bahan) */}
                    <BahanDetail batchId={r.id} />

                    {r.catatan && (
                      <div style={{ fontSize: "11px", color: C.muted, marginTop: 8, fontStyle: "italic" }}>📝 {r.catatan}</div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {totalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 20 }}>
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} style={{ padding: "8px 16px", borderRadius: "8px", background: currentPage === 1 ? "transparent" : C.accent + "15", border: `1px solid ${currentPage === 1 ? C.dim : C.accent + "40"}`, color: currentPage === 1 ? C.dim : C.accent, cursor: currentPage === 1 ? "not-allowed" : "pointer", fontWeight: 600, fontSize: "12px" }}>← Prev</button>
                <div style={{ padding: "8px 16px", color: C.textMid, fontSize: "12px", fontFamily: C.fontMono }}>{currentPage} / {totalPages}</div>
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} style={{ padding: "8px 16px", borderRadius: "8px", background: currentPage === totalPages ? "transparent" : C.accent + "15", border: `1px solid ${currentPage === totalPages ? C.dim : C.accent + "40"}`, color: currentPage === totalPages ? C.dim : C.accent, cursor: currentPage === totalPages ? "not-allowed" : "pointer", fontWeight: 600, fontSize: "12px" }}>Next →</button>
              </div>
            )}
          </div>
        )}
      </div>
    </Sidebar>
  );
}

// Sub-komponen: load & tampilkan bahan baku dari batch
function BahanDetail({ batchId }: { batchId: number }) {
  const [data, setData] = useState<any[] | null>(null);
  useEffect(() => {
    supabase
      .from("detail_produksi_bahan")
      .select("qty_pakai, hpp_bahan, bahan_baku(nama, satuan)")
      .eq("produksi_batch_id", batchId)
      .then(({ data }) => setData(data || []));
  }, [batchId]);

  if (!data) return null;
  if (data.length === 0) return null;

  return (
    <div style={{ marginTop: 8, borderTop: `1px dashed #2a1f3d`, paddingTop: 8 }}>
      <div style={{ fontSize: "10px", color: "#7c6d8a", fontFamily: "'DM Mono', monospace", letterSpacing: 1, marginBottom: 6, fontWeight: 700 }}>BAHAN BAKU:</div>
      {data.map((d: any, i: number) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#c0aed4", padding: "2px 0", fontFamily: "'DM Mono', monospace" }}>
          <span>{d.bahan_baku?.nama || "—"}</span>
          <span>{d.qty_pakai} {d.bahan_baku?.satuan || ""} · Rp {(d.hpp_bahan || 0).toLocaleString("id-ID")}</span>
        </div>
      ))}
    </div>
  );
}
