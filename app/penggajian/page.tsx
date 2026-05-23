"use client";

import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import Sidebar from "@/components/Sidebar";
import GajiBoronganTab from "./GajiBoronganTab";
import { useTheme, LIGHT, DARK } from "@/context/ThemeContext";

type Karyawan = {
  id: number; nama: string; tipe: string;
  tarif_harian: number; tarif_borongan: number; gaji_bulanan: number;
  fee_live_sesi: number; komisi_live_persen: number;
  status: string; catatan: string | null;
};

type GajiHarian = {
  id: number; karyawan_id: number; tanggal: string;
  nominal: number; keterangan: string; tipe_beban: string;
  nama_karyawan?: string; tipe_karyawan?: string;
};

type VarianBorongan = {
  id: number; nama: string; tarif_per_kg: number; kategori: string; aktif: boolean;
};

type BoronganRow = {
  varianId: number; varianNama: string; tarifPerKg: number; qty: string; kategori: string;
};

type SlipData = {
  nama: string; tipe: string; tanggal: string;
  rows: { label: string; qty: number; tarif: number; total: number }[];
  totalNominal: number;
};

type Toast = { msg: string; type: "success" | "error" | "info" };

const getTipeBeban = (tipe: string): "HPP" | "Operasional" => {
  if (tipe.toLowerCase() === "packing online") return "Operasional";
  const hppKeywords = ["operator produksi", "packing", "pencetak", "produksi"];
  return hppKeywords.some(k => tipe.toLowerCase().includes(k)) ? "HPP" : "Operasional";
};

const rupiahFmt = (n: number) => `Rp ${(n || 0).toLocaleString("id-ID")}`;
const formatIDR = (val: string) => val.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const toAngka = (str: string) => parseInt(str.replace(/\./g, "")) || 0;
const tanggalFmt = (s: string) => new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
const hariIniWIB = () => new Date().toLocaleDateString("sv", { timeZone: "Asia/Jakarta" });

export default function PenggajianPage() {
  const { isDark } = useTheme();
  const C = isDark ? DARK : LIGHT;

  const [karyawanList, setKaryawanList] = useState<Karyawan[]>([]);
  const [gajiList, setGajiList] = useState<GajiHarian[]>([]);
  const [varianList, setVarianList] = useState<VarianBorongan[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [activeTab, setActiveTab] = useState<"input" | "borongan" | "rekap" | "karyawan">("input");

  // Form input gaji
  const [karyawanId, setKaryawanId] = useState("");
  const [nominal, setNominal] = useState("");
  const [tanggal, setTanggal] = useState(hariIniWIB());
  const [keterangan, setKeterangan] = useState("");
  const [qtyKecil, setQtyKecil] = useState("");
  const [qtyBesar, setQtyBesar] = useState("");

  // Tab Borongan
  const [boronganKaryawanId, setBoronganKaryawanId] = useState("");
  const [boronganTanggal, setBoronganTanggal] = useState(hariIniWIB());
  const [boronganKet, setBoronganKet] = useState("");
  const [boronganRows, setBoronganRows] = useState<BoronganRow[]>([]);
  const [lastSlip, setLastSlip] = useState<SlipData | null>(null);
  const [showPrintBtn, setShowPrintBtn] = useState(false);

  // Tambah karyawan
  const [newNama, setNewNama] = useState("");
  const [newTipe, setNewTipe] = useState("Operator Produksi");
  const [newGajiBulanan, setNewGajiBulanan] = useState("");
  const [newFeeLive, setNewFeeLive] = useState("");
  const [newKomisiLive, setNewKomisiLive] = useState("");
  const [newCatatan, setNewCatatan] = useState("");
  const [addingKaryawan, setAddingKaryawan] = useState(false);

  const showToast = (msg: string, type: Toast["type"] = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchData = useCallback(async () => {
    try {
      const [resKaryawan, resGaji, resVarian] = await Promise.all([
        supabase.from("karyawan").select("*").eq("status", "Aktif").order("tipe").order("nama"),
        supabase.from("gaji_harian").select("*, karyawan(nama, tipe)").order("tanggal", { ascending: false }).limit(300),
        supabase.from("varian_borongan").select("*").eq("aktif", true).order("kategori").order("nama"),
      ]);
      setKaryawanList(resKaryawan.data || []);
      setGajiList((resGaji.data || []).map((g: any) => ({
        ...g, nama_karyawan: g.karyawan?.nama, tipe_karyawan: g.karyawan?.tipe,
      })));
      setVarianList(resVarian.data || []);
    } catch (err: any) {
      showToast(err.message || "Gagal memuat data", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const varianPackingOnline = varianList.filter(v => v.kategori === "Packing Online");
  const tarifKecil = varianPackingOnline.find(v => v.nama.toLowerCase().includes("kecil"))?.tarif_per_kg || 0;
  const tarifBesar = varianPackingOnline.find(v => v.nama.toLowerCase().includes("besar"))?.tarif_per_kg || 0;
  const selectedKaryawan = karyawanList.find(k => k.id === parseInt(karyawanId));
  const isPackingOnline = selectedKaryawan?.tipe === "Packing Online";

  useEffect(() => {
    if (!isPackingOnline) return;
    const total = (parseInt(qtyKecil) || 0) * tarifKecil + (parseInt(qtyBesar) || 0) * tarifBesar;
    setNominal(total > 0 ? total.toLocaleString("id-ID").replace(/,/g, ".") : "");
  }, [qtyKecil, qtyBesar, tarifKecil, tarifBesar, isPackingOnline]);

  const handlePilihBoronganKaryawan = (id: string) => {
    setBoronganKaryawanId(id);
    setShowPrintBtn(false); setLastSlip(null);
    if (!id) { setBoronganRows([]); return; }
    const k = karyawanList.find(x => x.id === parseInt(id));
    if (!k) return;
    const kat = k.tipe === "Pencetak" ? "Pencetak" : "Packing Online";
    setBoronganRows(varianList.filter(v => v.kategori === kat).map(v => ({
      varianId: v.id, varianNama: v.nama, tarifPerKg: v.tarif_per_kg, qty: "", kategori: kat,
    })));
  };

  const updateBoronganQty = (idx: number, val: string) =>
    setBoronganRows(prev => prev.map((r, i) => i === idx ? { ...r, qty: val } : r));

  const boronganTotal = boronganRows.reduce((acc, r) => acc + (parseFloat(r.qty) || 0) * r.tarifPerKg, 0);
  const boronganKaryawan = karyawanList.find(k => k.id === parseInt(boronganKaryawanId));

  const printSlipBorongan = (slip: SlipData) => {
    const isKg = slip.tipe === "Pencetak";
    const rowsHtml = slip.rows.map(r => `
      <tr>
        <td>${r.label}</td>
        <td style="text-align:right">${r.qty}</td>
        <td style="text-align:right">${r.tarif.toLocaleString("id-ID")}</td>
        <td style="text-align:right">${r.total.toLocaleString("id-ID")}</td>
      </tr>
    `).join("");
    const html = `<!DOCTYPE html><html><head>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family:'Courier New',monospace; font-size:10pt; width:80mm; padding:4mm; color:#000; line-height:1.5; }
        @page { size:80mm auto; margin:0; }
        .center { text-align:center; }
        .bold { font-weight:bold; }
        .divider { border-top:1px dashed #000; margin:4px 0; }
        table { width:100%; font-size:9pt; border-collapse:collapse; }
        th { font-weight:bold; border-bottom:1px dashed #000; padding:2px 0; font-size:9pt; }
        td { padding:2px 0; }
      </style>
    </head><body>
      <div class="center bold" style="font-size:13pt">AZALEA FOOD</div>
      <div class="center" style="font-size:10pt;margin-bottom:4px">Slip Gaji Borongan</div>
      <div class="divider"></div>
      <div>Nama &nbsp;&nbsp;&nbsp;: <b>${slip.nama}</b></div>
      <div>Tipe &nbsp;&nbsp;&nbsp;&nbsp;: ${slip.tipe}</div>
      <div>Tanggal : ${tanggalFmt(slip.tanggal)}</div>
      <div class="divider"></div>
      <table>
        <thead><tr>
          <th style="text-align:left">Varian</th>
          <th style="text-align:right">${isKg ? "Kg" : "Qty"}</th>
          <th style="text-align:right">Tarif</th>
          <th style="text-align:right">Total</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div class="divider"></div>
      <div class="bold" style="display:flex;justify-content:space-between;font-size:11pt">
        <span>TOTAL</span><span>Rp ${slip.totalNominal.toLocaleString("id-ID")}</span>
      </div>
      <div class="divider" style="margin-top:12px"></div>
      <div style="font-size:9pt;margin-top:6px">Tanda Terima :</div>
      <div style="margin-top:28px;border-top:1px solid #000;width:110px;font-size:9pt">( ${slip.nama} )</div>
    </body></html>`;
    const w = window.open("", "_blank", "width=350,height=550");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.onafterprint = () => w.close();
    w.print();
  };

  const simpanBorongan = async () => {
    if (!boronganKaryawanId) return showToast("Pilih karyawan!", "error");
    if (boronganTotal <= 0) return showToast("Input minimal 1 varian!", "error");
    if (!boronganKaryawan) return;
    const tipeBeban = getTipeBeban(boronganKaryawan.tipe);
    const isKg = boronganKaryawan.tipe === "Pencetak";
    const detailParts = boronganRows.filter(r => parseFloat(r.qty) > 0).map(r => `${r.varianNama}: ${r.qty}${isKg ? "kg" : " pkt"}`);
    const ket = boronganKet.trim() || detailParts.join(", ");
    setSubmitting(true);
    try {
      const { error: errGaji } = await supabase.from("gaji_harian").insert([{
        karyawan_id: parseInt(boronganKaryawanId), tanggal: boronganTanggal,
        nominal: Math.round(boronganTotal), keterangan: ket, tipe_beban: tipeBeban,
      }]);
      if (errGaji) throw new Error("Gagal simpan: " + errGaji.message);
      if (tipeBeban === "Operasional") {
        const { error: errKas } = await supabase.from("kas").insert([{
          tipe: "Keluar", kategori: "Gaji Operasional", nominal: Math.round(boronganTotal),
          keterangan: `Gaji ${boronganKaryawan.nama} (${boronganKaryawan.tipe})`,
        }]);
        if (errKas) throw new Error("Tersimpan tapi gagal catat kas: " + errKas.message);
      }
      const slip: SlipData = {
        nama: boronganKaryawan.nama, tipe: boronganKaryawan.tipe, tanggal: boronganTanggal,
        rows: boronganRows.filter(r => parseFloat(r.qty) > 0).map(r => ({
          label: r.varianNama, qty: parseFloat(r.qty),
          tarif: r.tarifPerKg, total: Math.round((parseFloat(r.qty) || 0) * r.tarifPerKg),
        })),
        totalNominal: Math.round(boronganTotal),
      };
      setLastSlip(slip);
      setShowPrintBtn(true);
      showToast(`✓ Gaji ${boronganKaryawan.nama} ${rupiahFmt(boronganTotal)} tersimpan!`);
      setBoronganRows(prev => prev.map(r => ({ ...r, qty: "" })));
      setBoronganKet("");
      fetchData();
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePilihKaryawan = (id: string) => {
    setKaryawanId(id); setNominal(""); setQtyKecil(""); setQtyBesar("");
    const k = karyawanList.find(x => x.id === parseInt(id));
    if (!k) return;
    if (k.tipe !== "Packing Online") {
      if (k.gaji_bulanan > 0) setNominal(k.gaji_bulanan.toLocaleString("id-ID").replace(/,/g, "."));
      else if (k.tarif_harian > 0) setNominal(k.tarif_harian.toLocaleString("id-ID").replace(/,/g, "."));
      else if (k.fee_live_sesi > 0) setNominal(k.fee_live_sesi.toLocaleString("id-ID").replace(/,/g, "."));
    }
  };

  const simpanGaji = async () => {
    if (!karyawanId) return showToast("Pilih karyawan dulu!", "error");
    if (toAngka(nominal) <= 0) return showToast("Isi nominal gaji!", "error");
    const karyawan = karyawanList.find(k => k.id === parseInt(karyawanId));
    if (!karyawan) return;
    const tipeBeban = getTipeBeban(karyawan.tipe);
    const nominalAngka = toAngka(nominal);
    let ket = keterangan.trim();
    if (!ket && isPackingOnline) {
      const parts = [];
      if (parseInt(qtyKecil) > 0) parts.push(`${qtyKecil} paket kecil`);
      if (parseInt(qtyBesar) > 0) parts.push(`${qtyBesar} paket besar`);
      ket = `Packing Online — ${parts.join(", ")}`;
    }
    if (!ket) ket = `Gaji ${karyawan.tipe} — ${karyawan.nama}`;
    setSubmitting(true);
    try {
      const { error: errGaji } = await supabase.from("gaji_harian").insert([{
        karyawan_id: parseInt(karyawanId), tanggal, nominal: nominalAngka, keterangan: ket, tipe_beban: tipeBeban,
      }]);
      if (errGaji) throw new Error("Gagal simpan: " + errGaji.message);
      if (tipeBeban === "Operasional") {
        const { error: errKas } = await supabase.from("kas").insert([{
          tipe: "Keluar", kategori: "Gaji Operasional", nominal: nominalAngka,
          keterangan: `Gaji ${karyawan.nama} (${karyawan.tipe})`,
        }]);
        if (errKas) throw new Error("Gaji tersimpan tapi gagal catat ke kas: " + errKas.message);
      }
      showToast(`✓ Gaji ${karyawan.nama} ${rupiahFmt(nominalAngka)}${tipeBeban === "Operasional" ? " → Kas Keluar" : " → HPP"}`);
      setKaryawanId(""); setNominal(""); setKeterangan(""); setTanggal(hariIniWIB());
      setQtyKecil(""); setQtyBesar("");
      fetchData();
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const tambahKaryawan = async () => {
    if (!newNama.trim()) return showToast("Isi nama!", "error");
    setAddingKaryawan(true);
    const { error } = await supabase.from("karyawan").insert([{
      nama: newNama.trim(), tipe: newTipe, gaji_bulanan: toAngka(newGajiBulanan),
      fee_live_sesi: toAngka(newFeeLive), komisi_live_persen: parseFloat(newKomisiLive) || 0,
      status: "Aktif", catatan: newCatatan.trim() || null,
    }]);
    if (error) { showToast("Gagal: " + error.message, "error"); setAddingKaryawan(false); return; }
    showToast(`✓ ${newNama} ditambahkan!`);
    setNewNama(""); setNewGajiBulanan(""); setNewFeeLive(""); setNewKomisiLive(""); setNewCatatan("");
    fetchData(); setAddingKaryawan(false);
  };

  const gajiFiltered = gajiList.filter(g => g.tanggal?.startsWith(new Date().toLocaleDateString("sv", { timeZone: "Asia/Jakarta" }).slice(0, 7)));
  const totalBulan = gajiFiltered.reduce((a, g) => a + g.nominal, 0);
  const totalHPP = gajiFiltered.filter(g => g.tipe_beban === "HPP").reduce((a, g) => a + g.nominal, 0);
  const totalOperasional = gajiFiltered.filter(g => g.tipe_beban === "Operasional").reduce((a, g) => a + g.nominal, 0);
  const gajiHariIniList = gajiList.filter(g => g.tanggal === tanggal);
  const totalHariIni = gajiHariIniList.reduce((a, g) => a + g.nominal, 0);
  const tipeOptions = ["Operator Produksi", "Packing", "Pencetak", "Packing Online", "Host Live", "Admin Shopee", "Owner"];

  const inp: React.CSSProperties = {
    width: "100%", padding: "10px 14px", marginBottom: 8,
    background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
    border: `1.5px solid ${C.border}`, borderRadius: 8,
    color: C.text, fontFamily: C.fontSans, fontSize: 13,
    boxSizing: "border-box", outline: "none",
  };

  if (loading) return (
    <Sidebar>
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg }}>
        <div style={{ textAlign: "center", color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>
          <div style={{ fontSize: 28, marginBottom: 12, color: C.accent }}>◈</div>Memuat data...
        </div>
      </div>
    </Sidebar>
  );

  return (
    <Sidebar>
      <style>{`
        * { box-sizing: border-box; }
        input:focus, select:focus { border-color: ${C.accent}80 !important; outline: none; }
        input::placeholder { color: ${C.muted} !important; }
        select option { background: ${C.card}; color: ${C.text}; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 24, right: 24, zIndex: 9999, background: C.card, border: `1px solid ${toast.type === "success" ? C.green : toast.type === "error" ? C.red : C.blue}44`, color: toast.type === "success" ? C.green : toast.type === "error" ? C.red : C.blue, padding: "14px 20px", borderRadius: 12, boxShadow: C.shadowMd, fontFamily: C.fontMono, fontWeight: 600, fontSize: 13, maxWidth: 380, animation: "fadeUp 0.2s ease", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ flex: 1 }}>{toast.msg}</span>
          <button onClick={() => setToast(null)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 16, opacity: 0.6 }}>×</button>
        </div>
      )}

      <div style={{ background: C.bg, minHeight: "100vh", padding: "32px 28px", fontFamily: C.fontSans, color: C.text }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: C.text }}>👥 Penggajian</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: C.muted, fontFamily: C.fontMono }}>Input gaji harian, borongan & per sesi · Auto-catat ke Kas & HPP</p>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 28 }}>
          {[
            { label: "Total Gaji Bulan Ini", value: rupiahFmt(totalBulan), color: C.accent, icon: "💰" },
            { label: "Masuk HPP", value: rupiahFmt(totalHPP), color: C.green, icon: "⚙️", sub: "Biaya produksi" },
            { label: "Beban Operasional", value: rupiahFmt(totalOperasional), color: C.orange, icon: "📋", sub: "Sudah masuk kas" },
            { label: "Karyawan Aktif", value: `${karyawanList.length} orang`, color: C.blue, icon: "👥" },
          ].map((s, i) => (
            <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 20px", position: "relative", overflow: "hidden", boxShadow: C.shadow }}>
              <div style={{ position: "absolute", top: 0, right: 0, width: 60, height: 60, background: s.color + "15", borderRadius: "0 14px 0 80px" }} />
              <div style={{ fontSize: 18, marginBottom: 8 }}>{s.icon}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: s.color, fontFamily: C.fontMono }}>{s.value}</div>
              {s.sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{s.sub}</div>}
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
          {[
            { id: "input", label: "✏️ Input Gaji" },
            { id: "borongan", label: "⚖ Input Borongan" },
            { id: "rekap", label: "📊 Gaji Borongan" },
            { id: "karyawan", label: "👥 Data Karyawan" },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} style={{
              padding: "10px 20px", borderRadius: 10, cursor: "pointer",
              fontFamily: C.fontSans, fontWeight: 600, fontSize: 13, transition: "all 0.15s",
              border: `1px solid ${activeTab === tab.id ? C.accent + "60" : C.border}`,
              background: activeTab === tab.id ? `${C.accent}20` : "transparent",
              color: activeTab === tab.id ? C.accent : C.muted,
            }}>{tab.label}</button>
          ))}
        </div>

        {/* ── INPUT GAJI ── */}
        {activeTab === "input" && (
          <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 20, animation: "fadeUp 0.2s ease" }}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, boxShadow: C.shadow }}>
              <h3 style={{ margin: "0 0 18px", fontSize: 16, fontWeight: 800, color: C.text }}>Input Gaji Operasional</h3>
              <label style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Karyawan</label>
              <select value={karyawanId} onChange={e => handlePilihKaryawan(e.target.value)} style={inp}>
                <option value="">— Pilih Karyawan —</option>
                {karyawanList.filter(k => getTipeBeban(k.tipe) === "Operasional").map(k => (
                  <option key={k.id} value={k.id}>{k.nama} · {k.tipe}</option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, marginBottom: 12 }}>
                ℹ Gaji Pencetak & Packing Online → tab ⚖ Input Borongan
              </div>
              {selectedKaryawan && (
                <div style={{ background: `${C.orange}15`, border: `1px solid ${C.orange}30`, borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontSize: 12 }}>
                  <div style={{ color: C.orange, fontWeight: 700, marginBottom: 4 }}>📋 Operasional — masuk kas keluar</div>
                  <div style={{ color: C.muted, fontSize: 11, fontFamily: C.fontMono }}>
                    {selectedKaryawan.tipe === "Packing Online" && tarifKecil > 0 && `Paket Kecil: ${rupiahFmt(tarifKecil)} · Paket Besar: ${rupiahFmt(tarifBesar)}`}
                    {selectedKaryawan.gaji_bulanan > 0 && `Gaji bulanan: ${rupiahFmt(selectedKaryawan.gaji_bulanan)}`}
                    {selectedKaryawan.fee_live_sesi > 0 && `Fee live: ${rupiahFmt(selectedKaryawan.fee_live_sesi)}`}
                  </div>
                </div>
              )}
              <label style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Tanggal</label>
              <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)} style={{ ...inp, colorScheme: isDark ? "dark" : "light" }} />
              {isPackingOnline ? (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ padding: "10px 14px", background: `${C.blue}10`, border: `1px solid ${C.blue}25`, borderRadius: 8, marginBottom: 12, fontSize: 12, color: C.blue, fontFamily: C.fontMono }}>
                    📦 Input qty paket → nominal dihitung otomatis
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 }}>
                    {[
                      { label: `PAKET KECIL`, tarif: tarifKecil, val: qtyKecil, set: setQtyKecil },
                      { label: `PAKET BESAR`, tarif: tarifBesar, val: qtyBesar, set: setQtyBesar },
                    ].map((p, i) => (
                      <div key={i}>
                        <label style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                          {p.label} {p.tarif > 0 && <span style={{ color: C.blue }}>{rupiahFmt(p.tarif)}/pkt</span>}
                        </label>
                        <input type="number" min="0" value={p.val} onChange={e => p.set(e.target.value)} placeholder="0" style={{ ...inp, fontFamily: C.fontMono, marginBottom: 0 }} />
                      </div>
                    ))}
                  </div>
                  {(parseInt(qtyKecil) > 0 || parseInt(qtyBesar) > 0) && (
                    <div style={{ background: `${C.blue}08`, border: `1px solid ${C.blue}20`, borderRadius: 8, padding: "10px 12px", marginBottom: 8, fontSize: 12, fontFamily: C.fontMono }}>
                      {parseInt(qtyKecil) > 0 && <div style={{ color: C.muted, marginBottom: 2 }}>{qtyKecil} × {rupiahFmt(tarifKecil)} = <span style={{ color: C.blue }}>{rupiahFmt((parseInt(qtyKecil) || 0) * tarifKecil)}</span></div>}
                      {parseInt(qtyBesar) > 0 && <div style={{ color: C.muted, marginBottom: 2 }}>{qtyBesar} × {rupiahFmt(tarifBesar)} = <span style={{ color: C.blue }}>{rupiahFmt((parseInt(qtyBesar) || 0) * tarifBesar)}</span></div>}
                      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 6, marginTop: 4, color: C.text, fontWeight: 700 }}>Total: <span style={{ color: C.accent }}>{rupiahFmt(toAngka(nominal))}</span></div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <label style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Nominal Gaji</label>
                  <input type="text" value={nominal} onChange={e => setNominal(formatIDR(e.target.value))} placeholder="Rp 0" style={{ ...inp, fontFamily: C.fontMono, fontWeight: 700 }} />
                  {nominal && toAngka(nominal) > 0 && <div style={{ fontSize: 12, color: C.accent, fontFamily: C.fontMono, marginBottom: 8, fontWeight: 700 }}>= {rupiahFmt(toAngka(nominal))}</div>}
                </>
              )}
              <label style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Keterangan (opsional)</label>
              <input type="text" value={keterangan} onChange={e => setKeterangan(e.target.value)} placeholder="Opsional" style={{ ...inp, marginBottom: 16 }} />
              <button onClick={simpanGaji} disabled={submitting || !karyawanId || toAngka(nominal) <= 0} style={{
                width: "100%", padding: "12px", border: "none", borderRadius: 10,
                background: (!karyawanId || toAngka(nominal) <= 0) ? isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" : `linear-gradient(135deg, #7c3aed, ${C.accent})`,
                color: (!karyawanId || toAngka(nominal) <= 0) ? C.muted : "#fff",
                fontWeight: 700, cursor: (!karyawanId || toAngka(nominal) <= 0) ? "not-allowed" : "pointer",
                fontFamily: C.fontMono, fontSize: 13,
              }}>{submitting ? "Menyimpan..." : "💾 Simpan Gaji"}</button>
            </div>

            {/* Riwayat hari ini */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, boxShadow: C.shadow }}>
              <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 800, color: C.text }}>Riwayat — {tanggalFmt(tanggal)}</h3>
              <div style={{ maxHeight: 420, overflowY: "auto" }}>
                {gajiHariIniList.length === 0
                  ? <div style={{ textAlign: "center", padding: "40px 0", color: C.muted, fontFamily: C.fontMono, fontSize: 12 }}>Belum ada input gaji hari ini</div>
                  : gajiHariIniList.map(g => (
                    <div key={g.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{g.nama_karyawan}</div>
                        <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{g.tipe_karyawan} · {g.keterangan?.slice(0, 40)}</div>
                        <span style={{ fontSize: 10, display: "inline-block", marginTop: 2, background: (g.tipe_beban === "HPP" ? C.green : C.orange) + "20", color: g.tipe_beban === "HPP" ? C.green : C.orange, padding: "1px 6px", borderRadius: 4, fontFamily: C.fontMono, fontWeight: 700 }}>{g.tipe_beban}</span>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.accent, fontFamily: C.fontMono }}>{rupiahFmt(g.nominal)}</div>
                    </div>
                  ))}
              </div>
              {gajiHariIniList.length > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Total Hari Ini</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: C.accent, fontFamily: C.fontMono }}>{rupiahFmt(totalHariIni)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── INPUT BORONGAN ── */}
        {activeTab === "borongan" && (
          <div style={{ display: "grid", gridTemplateColumns: "420px 1fr", gap: 20, animation: "fadeUp 0.2s ease" }}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, boxShadow: C.shadow }}>
              <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 800, color: C.text }}>Input Borongan</h3>
              <p style={{ margin: "0 0 18px", fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>Pencetak (kg/varian) & Packing Online (paket)</p>
              <label style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Karyawan</label>
              <select value={boronganKaryawanId} onChange={e => handlePilihBoronganKaryawan(e.target.value)} style={inp}>
                <option value="">— Pilih Karyawan —</option>
                <optgroup label="Pencetak">
                  {karyawanList.filter(k => k.tipe === "Pencetak").map(k => <option key={k.id} value={k.id}>{k.nama}</option>)}
                </optgroup>
                <optgroup label="Packing Online">
                  {karyawanList.filter(k => k.tipe === "Packing Online").map(k => <option key={k.id} value={k.id}>{k.nama}</option>)}
                </optgroup>
              </select>
              <label style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Tanggal</label>
              <input type="date" value={boronganTanggal} onChange={e => setBoronganTanggal(e.target.value)} style={{ ...inp, colorScheme: isDark ? "dark" : "light" }} />
              {boronganRows.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
                    {boronganKaryawan?.tipe === "Pencetak" ? "KG PER VARIAN" : "QTY PAKET"}
                  </div>
                  {boronganRows.map((r, idx) => (
                    <div key={r.varianId} style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 8, marginBottom: 8, alignItems: "center" }}>
                      <div style={{ background: `${C.accent}08`, border: `1px solid ${C.accent}20`, borderRadius: 8, padding: "10px 12px" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{r.varianNama}</div>
                        <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{rupiahFmt(r.tarifPerKg)}/{boronganKaryawan?.tipe === "Pencetak" ? "kg" : "pkt"}</div>
                      </div>
                      <input type="number" min="0" step={boronganKaryawan?.tipe === "Pencetak" ? "0.1" : "1"} value={r.qty} onChange={e => updateBoronganQty(idx, e.target.value)} placeholder="0"
                        style={{ ...inp, fontFamily: C.fontMono, fontWeight: 700, marginBottom: 0, textAlign: "right" }} />
                    </div>
                  ))}
                </div>
              )}
              {boronganTotal > 0 && (
                <div style={{ background: `${C.green}10`, border: `1px solid ${C.green}25`, borderRadius: 10, padding: "12px 16px", marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, marginBottom: 4 }}>TOTAL GAJI</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: C.green, fontFamily: C.fontMono }}>{rupiahFmt(boronganTotal)}</div>
                  <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, marginTop: 4 }}>
                    {boronganKaryawan?.tipe === "Pencetak" ? "⚙ HPP → biaya produksi" : "📋 Operasional → kas keluar"}
                  </div>
                </div>
              )}
              <label style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Keterangan (opsional)</label>
              <input type="text" value={boronganKet} onChange={e => setBoronganKet(e.target.value)} placeholder="Otomatis dari varian" style={{ ...inp, marginBottom: 16 }} />
              <button onClick={simpanBorongan} disabled={submitting || !boronganKaryawanId || boronganTotal <= 0} style={{
                width: "100%", padding: "12px", border: "none", borderRadius: 10, marginBottom: 10,
                background: (!boronganKaryawanId || boronganTotal <= 0) ? isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" : `linear-gradient(135deg, #059669, ${C.green})`,
                color: (!boronganKaryawanId || boronganTotal <= 0) ? C.muted : "#000",
                fontWeight: 700, cursor: (!boronganKaryawanId || boronganTotal <= 0) ? "not-allowed" : "pointer",
                fontFamily: C.fontMono, fontSize: 13,
              }}>{submitting ? "Menyimpan..." : "💾 Simpan & Siapkan Slip"}</button>
              {showPrintBtn && lastSlip && (
                <button onClick={() => printSlipBorongan(lastSlip)} style={{
                  width: "100%", padding: "12px", borderRadius: 10,
                  border: `1px solid ${C.accent}40`, background: `${C.accent}15`, color: C.accent,
                  fontWeight: 700, cursor: "pointer", fontFamily: C.fontMono, fontSize: 13,
                }}>🖨 Print Slip — {lastSlip.nama}</button>
              )}
            </div>

            {/* Preview slip */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, boxShadow: C.shadow }}>
              <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 800, color: C.text }}>Preview Slip</h3>
              {!lastSlip ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: C.muted, fontFamily: C.fontMono, fontSize: 12 }}>
                  Input & simpan borongan untuk preview slip
                </div>
              ) : (
                <div style={{ background: "#fff", color: "#000", borderRadius: 8, padding: "16px 20px", fontFamily: "'Courier New', monospace", fontSize: 13, maxWidth: 320, margin: "0 auto", border: "1px solid #e5e7eb" }}>
                  <div style={{ textAlign: "center", fontWeight: 700, fontSize: 15, marginBottom: 2 }}>AZALEA FOOD</div>
                  <div style={{ textAlign: "center", fontSize: 12, marginBottom: 8 }}>Slip Gaji Borongan</div>
                  <div style={{ borderTop: "1px dashed #000", borderBottom: "1px dashed #000", padding: "6px 0", marginBottom: 8, fontSize: 12 }}>
                    <div>Nama &nbsp;&nbsp;&nbsp;: <b>{lastSlip.nama}</b></div>
                    <div>Tipe &nbsp;&nbsp;&nbsp;&nbsp;: {lastSlip.tipe}</div>
                    <div>Tanggal : {tanggalFmt(lastSlip.tanggal)}</div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontWeight: 700, marginBottom: 4, borderBottom: "1px solid #ccc", paddingBottom: 4 }}>
                    <span style={{ flex: 2 }}>Varian</span>
                    <span style={{ flex: 1, textAlign: "right" }}>{lastSlip.tipe === "Pencetak" ? "Kg" : "Qty"}</span>
                    <span style={{ flex: 1, textAlign: "right" }}>Tarif</span>
                    <span style={{ flex: 1, textAlign: "right" }}>Total</span>
                  </div>
                  {lastSlip.rows.map((r, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                      <span style={{ flex: 2 }}>{r.label}</span>
                      <span style={{ flex: 1, textAlign: "right" }}>{r.qty}</span>
                      <span style={{ flex: 1, textAlign: "right" }}>{r.tarif.toLocaleString("id-ID")}</span>
                      <span style={{ flex: 1, textAlign: "right" }}>{r.total.toLocaleString("id-ID")}</span>
                    </div>
                  ))}
                  <div style={{ borderTop: "1px dashed #000", marginTop: 6, paddingTop: 6, display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                    <span>TOTAL</span><span>Rp {lastSlip.totalNominal.toLocaleString("id-ID")}</span>
                  </div>
                  <div style={{ borderTop: "1px dashed #000", marginTop: 10, paddingTop: 8, fontSize: 11 }}>
                    <div>Tanda Terima :</div>
                    <div style={{ marginTop: 28, borderTop: "1px solid #000", width: 100, fontSize: 11 }}>( {lastSlip.nama} )</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── REKAP (GajiBoronganTab) ── */}
        {activeTab === "rekap" && <GajiBoronganTab />}

        {/* ── KARYAWAN ── */}
        {activeTab === "karyawan" && (
          <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 20, animation: "fadeUp 0.2s ease" }}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, boxShadow: C.shadow }}>
              <h3 style={{ margin: "0 0 18px", fontSize: 16, fontWeight: 800, color: C.text }}>Tambah Karyawan</h3>
              <div style={{ padding: "10px 14px", background: `${C.blue}10`, border: `1px solid ${C.blue}25`, borderRadius: 8, marginBottom: 14, fontSize: 11, color: C.blue, fontFamily: C.fontMono }}>
                💡 Lebih lengkap via <strong>Admin → Master Karyawan</strong>
              </div>
              <input type="text" value={newNama} onChange={e => setNewNama(e.target.value)} placeholder="Nama karyawan" style={inp} />
              <label style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Tipe</label>
              <select value={newTipe} onChange={e => setNewTipe(e.target.value)} style={inp}>
                {tipeOptions.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <div style={{ background: (getTipeBeban(newTipe) === "HPP" ? C.green : C.orange) + "15", border: `1px solid ${(getTipeBeban(newTipe) === "HPP" ? C.green : C.orange)}30`, borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontSize: 11, color: getTipeBeban(newTipe) === "HPP" ? C.green : C.orange, fontFamily: C.fontMono }}>
                {getTipeBeban(newTipe) === "HPP" ? "⚙️ Gaji masuk HPP" : "📋 Gaji masuk Beban Operasional"}
              </div>
              {(newTipe.includes("Admin") || newTipe.includes("Owner")) && (
                <input type="text" value={newGajiBulanan} onChange={e => setNewGajiBulanan(formatIDR(e.target.value))} placeholder="Gaji bulanan (Rp)" style={inp} />
              )}
              {newTipe.includes("Live") && (
                <>
                  <input type="text" value={newFeeLive} onChange={e => setNewFeeLive(formatIDR(e.target.value))} placeholder="Fee per sesi live (Rp)" style={inp} />
                  <input type="number" value={newKomisiLive} onChange={e => setNewKomisiLive(e.target.value)} placeholder="Komisi live (%)" style={inp} min="0" max="100" step="0.5" />
                </>
              )}
              <input type="text" value={newCatatan} onChange={e => setNewCatatan(e.target.value)} placeholder="Catatan (opsional)" style={inp} />
              <button onClick={tambahKaryawan} disabled={addingKaryawan} style={{
                width: "100%", padding: "12px", border: "none", borderRadius: 10, marginTop: 6,
                background: addingKaryawan ? isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" : `linear-gradient(135deg, #7c3aed, ${C.accent})`,
                color: addingKaryawan ? C.muted : "#fff",
                fontWeight: 700, cursor: addingKaryawan ? "not-allowed" : "pointer",
                fontFamily: C.fontMono, fontSize: 13,
              }}>{addingKaryawan ? "Menyimpan..." : "+ Tambah Karyawan"}</button>
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, boxShadow: C.shadow }}>
              <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 800, color: C.text }}>
                Daftar Karyawan <span style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>({karyawanList.length})</span>
              </h3>
              {[{ label: "⚙️ HPP — Produksi", filter: "HPP", color: C.green }, { label: "📋 Operasional", filter: "Operasional", color: C.orange }].map(group => (
                <div key={group.filter} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: group.color, fontFamily: C.fontMono, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>{group.label}</div>
                  {karyawanList.filter(k => getTipeBeban(k.tipe) === group.filter).map(k => (
                    <div key={k.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: group.color + "08", borderRadius: 8, marginBottom: 6, border: `1px solid ${group.color}20` }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{k.nama}</div>
                        <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>
                          {k.tipe}
                          {k.gaji_bulanan > 0 && ` · ${rupiahFmt(k.gaji_bulanan)}/bln`}
                          {k.fee_live_sesi > 0 && ` · ${rupiahFmt(k.fee_live_sesi)}/sesi`}
                        </div>
                      </div>
                    </div>
                  ))}
                  {karyawanList.filter(k => getTipeBeban(k.tipe) === group.filter).length === 0 && (
                    <div style={{ color: C.muted, fontSize: 12, fontFamily: C.fontMono }}>Belum ada</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Sidebar>
  );
}
