"use client";

import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import Sidebar from "@/components/Sidebar";

type Karyawan = {
  id: number;
  nama: string;
  tipe: string;
  tarif_harian: number;
  tarif_borongan: number;
  gaji_bulanan: number;
  fee_live_sesi: number;
  komisi_live_persen: number;
  status: string;
  catatan: string | null;
};

type GajiHarian = {
  id: number;
  karyawan_id: number;
  tanggal: string;
  nominal: number;
  keterangan: string;
  tipe_beban: string;
  nama_karyawan?: string;
  tipe_karyawan?: string;
};

type Toast = { msg: string; type: "success" | "error" | "info" };

// HPP: terlibat langsung produksi
// Operasional: penjualan & admin
const getTipeBeban = (tipe: string): "HPP" | "Operasional" => {
  const hppKeywords = ["operator produksi", "packing", "pencetak", "produksi"];
  return hppKeywords.some(k => tipe.toLowerCase().includes(k)) ? "HPP" : "Operasional";
};

const getSuggestTarif = (k: Karyawan): number => {
  if (k.tarif_harian > 0) return k.tarif_harian;
  if (k.fee_live_sesi > 0) return k.fee_live_sesi;
  if (k.tarif_borongan > 0) return k.tarif_borongan;
  if (k.gaji_bulanan > 0) return k.gaji_bulanan;
  return 0;
};

const C = {
  bg: "#100c16", card: "#1a1425", border: "#2a1f3d",
  text: "#e2d9f3", textMid: "#c0aed4", muted: "#7c6d8a", dim: "#3d3050",
  accent: "#a78bfa", accentDim: "#a78bfa20",
  green: "#34d399", red: "#f87171", yellow: "#fbbf24", orange: "#fb923c", purple: "#c084fc",
  fontDisplay: "'DM Serif Display', serif",
  fontMono: "'DM Mono', monospace",
  fontSans: "'DM Sans', sans-serif",
};

const rupiahFmt = (n: number) => `Rp ${(n || 0).toLocaleString("id-ID")}`;
const formatIDR = (val: string) => val.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const toAngka = (str: string) => parseInt(str.replace(/\./g, "")) || 0;
const tanggalFmt = (s: string) => new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
const hariIniWIB = () => new Date().toLocaleDateString("sv", { timeZone: "Asia/Jakarta" });

function ToastBar({ toast, onClose }: { toast: Toast | null; onClose: () => void }) {
  if (!toast) return null;
  const colors = { success: C.green, error: C.red, info: C.accent };
  return (
    <div style={{
      position: "fixed", top: 24, right: 24, zIndex: 9999,
      background: "#1a1020", border: `1px solid ${colors[toast.type]}44`,
      color: colors[toast.type], padding: "14px 20px", borderRadius: 12,
      boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", gap: 10,
      fontFamily: C.fontMono, fontWeight: 600, fontSize: 13, maxWidth: 380,
    }}>
      <span style={{ flex: 1 }}>{toast.msg}</span>
      <button onClick={onClose} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 16, opacity: 0.6 }}>×</button>
    </div>
  );
}

export default function PenggajianPage() {
  const [karyawanList, setKaryawanList] = useState<Karyawan[]>([]);
  const [gajiList, setGajiList] = useState<GajiHarian[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [activeTab, setActiveTab] = useState<"input" | "rekap" | "karyawan">("input");

  const [karyawanId, setKaryawanId] = useState("");
  const [nominal, setNominal] = useState("");
  const [tanggal, setTanggal] = useState(hariIniWIB());
  const [keterangan, setKeterangan] = useState("");
  const [filterBulan, setFilterBulan] = useState(hariIniWIB().slice(0, 7));

  const [newNama, setNewNama] = useState("");
  const [newTipe, setNewTipe] = useState("Operator Produksi");
  const [newTarifHarian, setNewTarifHarian] = useState("");
  const [newTarifBorongan, setNewTarifBorongan] = useState("");
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
      const [resKaryawan, resGaji] = await Promise.all([
        supabase.from("karyawan").select("*").order("tipe").order("nama"),
        supabase.from("gaji_harian")
          .select("*, karyawan(nama, tipe)")
          .order("tanggal", { ascending: false })
          .limit(300),
      ]);
      setKaryawanList(resKaryawan.data || []);
      setGajiList((resGaji.data || []).map((g: any) => ({
        ...g,
        nama_karyawan: g.karyawan?.nama,
        tipe_karyawan: g.karyawan?.tipe,
      })));
    } catch (err: any) {
      showToast(err.message || "Gagal memuat data", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const selectedKaryawan = karyawanList.find(k => k.id === parseInt(karyawanId));

  const handlePilihKaryawan = (id: string) => {
    setKaryawanId(id);
    const k = karyawanList.find(x => x.id === parseInt(id));
    if (!k) return;
    const suggest = getSuggestTarif(k);
    if (suggest > 0) setNominal(suggest.toLocaleString("id-ID").replace(/,/g, "."));
    else setNominal("");
  };

  const simpanGaji = async () => {
    if (!karyawanId) return showToast("Pilih karyawan dulu!", "error");
    if (toAngka(nominal) <= 0) return showToast("Isi nominal gaji!", "error");
    const karyawan = karyawanList.find(k => k.id === parseInt(karyawanId));
    if (!karyawan) return;
    const tipeBeban = getTipeBeban(karyawan.tipe);
    const nominalAngka = toAngka(nominal);
    setSubmitting(true);
    try {
      const { error: errGaji } = await supabase.from("gaji_harian").insert([{
        karyawan_id: parseInt(karyawanId),
        tanggal,
        nominal: nominalAngka,
        keterangan: keterangan.trim() || `Gaji ${karyawan.tipe} — ${karyawan.nama}`,
        tipe_beban: tipeBeban,
      }]);
      if (errGaji) throw new Error("Gagal simpan: " + errGaji.message);

      if (tipeBeban === "Operasional") {
        const { error: errKas } = await supabase.from("kas").insert([{
          tipe: "Keluar",
          kategori: "Gaji Operasional",
          nominal: nominalAngka,
          keterangan: `Gaji ${karyawan.nama} (${karyawan.tipe})`,
        }]);
        if (errKas) throw new Error("Gaji tersimpan tapi gagal catat ke kas: " + errKas.message);
      }

      showToast(`✓ Gaji ${karyawan.nama} ${rupiahFmt(nominalAngka)}${tipeBeban === "Operasional" ? " → Kas Keluar" : " → HPP"}`);
      setKaryawanId(""); setNominal(""); setKeterangan(""); setTanggal(hariIniWIB());
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
      nama: newNama.trim(),
      tipe: newTipe.trim(),
      tarif_harian: toAngka(newTarifHarian),
      tarif_borongan: toAngka(newTarifBorongan),
      gaji_bulanan: toAngka(newGajiBulanan),
      fee_live_sesi: toAngka(newFeeLive),
      komisi_live_persen: parseFloat(newKomisiLive) || 0,
      status: "Aktif",
      catatan: newCatatan.trim() || null,
    }]);
    if (error) { showToast("Gagal: " + error.message, "error"); setAddingKaryawan(false); return; }
    showToast(`✓ ${newNama} ditambahkan!`);
    setNewNama(""); setNewTarifHarian(""); setNewTarifBorongan("");
    setNewGajiBulanan(""); setNewFeeLive(""); setNewKomisiLive(""); setNewCatatan("");
    fetchData();
    setAddingKaryawan(false);
  };

  const gajiFiltered = gajiList.filter(g => g.tanggal?.startsWith(filterBulan));
  const totalBulan = gajiFiltered.reduce((a, g) => a + g.nominal, 0);
  const totalHPP = gajiFiltered.filter(g => g.tipe_beban === "HPP").reduce((a, g) => a + g.nominal, 0);
  const totalOperasional = gajiFiltered.filter(g => g.tipe_beban === "Operasional").reduce((a, g) => a + g.nominal, 0);
  const rekapPerKaryawan = karyawanList.map(k => {
    const gajiK = gajiFiltered.filter(g => g.karyawan_id === k.id);
    return { ...k, totalGaji: gajiK.reduce((a, g) => a + g.nominal, 0), jumlahInput: gajiK.length };
  }).filter(k => k.totalGaji > 0);

  const gajiHariIniList = gajiList.filter(g => g.tanggal === tanggal);
  const totalHariIni = gajiHariIniList.reduce((a, g) => a + g.nominal, 0);

  const tipeOptions = ["Operator Produksi", "Packing", "Pencetak Siomay", "Packing Online", "Host Live", "Admin Shopee", "Owner"];

  const inp: React.CSSProperties = {
    width: "100%", padding: "10px 14px", marginBottom: 8,
    background: "rgba(255,255,255,0.04)", border: `1.5px solid ${C.border}`,
    borderRadius: 8, color: C.text, fontFamily: C.fontSans, fontSize: 13,
    boxSizing: "border-box", outline: "none", cursor: "pointer",
  };

  if (loading) return (
    <Sidebar>
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg }}>
        <div style={{ textAlign: "center", color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>◈</div>Memuat data...
        </div>
      </div>
    </Sidebar>
  );

  return (
    <Sidebar>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        input:focus, select:focus { border-color: ${C.accent}80 !important; outline: none; }
        input::placeholder { color: ${C.dim} !important; }
        select option { background: #1a1020; color: ${C.text}; }
        select { appearance: auto; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
      `}</style>

      <ToastBar toast={toast} onClose={() => setToast(null)} />

      <div style={{ background: C.bg, minHeight: "100vh", padding: "32px 28px", fontFamily: C.fontSans, color: C.text }}>

        <div style={{ marginBottom: 28 }}>
          <h1 style={{ margin: 0, fontFamily: C.fontDisplay, fontSize: 28, color: "#f0eaff", fontWeight: 400 }}>Penggajian</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: C.muted, fontFamily: C.fontMono }}>
            Input gaji harian, borongan & per sesi · Auto-catat ke Kas & HPP
          </p>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 28 }}>
          {[
            { label: "Total Gaji Bulan Ini", value: rupiahFmt(totalBulan), color: C.purple, icon: "💰" },
            { label: "Masuk HPP", value: rupiahFmt(totalHPP), color: C.yellow, icon: "⚙️", sub: "Biaya produksi" },
            { label: "Beban Operasional", value: rupiahFmt(totalOperasional), color: C.orange, icon: "📋", sub: "Sudah masuk kas" },
            { label: "Karyawan Aktif", value: `${karyawanList.length} orang`, color: C.accent, icon: "👥" },
          ].map((s, i) => (
            <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 20px", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, right: 0, width: 60, height: 60, background: s.color + "12", borderRadius: "0 14px 0 80px" }} />
              <div style={{ fontSize: 18, marginBottom: 8 }}>{s.icon}</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#f0eaff", fontFamily: C.fontDisplay }}>{s.value}</div>
              {s.sub && <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>{s.sub}</div>}
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          {[{ id: "input", label: "✏️ Input Gaji" }, { id: "rekap", label: "📊 Rekap Bulanan" }, { id: "karyawan", label: "👥 Data Karyawan" }].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} style={{
              padding: "10px 20px", borderRadius: 10, border: "none", cursor: "pointer",
              fontFamily: C.fontSans, fontWeight: 600, fontSize: 13,
              background: activeTab === tab.id ? C.purple : C.card,
              color: activeTab === tab.id ? "#fff" : C.muted, transition: "all 0.15s",
            }}>{tab.label}</button>
          ))}
        </div>

        {/* ── INPUT ── */}
        {activeTab === "input" && (
          <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 20, animation: "fadeUp 0.2s ease" }}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
              <h3 style={{ margin: "0 0 18px", fontFamily: C.fontDisplay, fontSize: 16, color: "#f0eaff", fontWeight: 400 }}>Input Gaji</h3>

              <label style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Karyawan</label>
              <select value={karyawanId} onChange={e => handlePilihKaryawan(e.target.value)} style={inp}>
  <option value="">— Pilih Karyawan —</option>
  {karyawanList.filter(k => getTipeBeban(k.tipe) === "Operasional").map(k => (
    <option key={k.id} value={k.id}>{k.nama} · {k.tipe}</option>
  ))}
</select>
<div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, marginBottom: 10 }}>
  ℹ Gaji Operator Produksi, Packing & Pencetak diinput per batch di modul Produksi
</div>

              {selectedKaryawan && (
                <div style={{
                  background: (getTipeBeban(selectedKaryawan.tipe) === "HPP" ? C.yellow : C.orange) + "15",
                  border: `1px solid ${(getTipeBeban(selectedKaryawan.tipe) === "HPP" ? C.yellow : C.orange)}30`,
                  borderRadius: 8, padding: "10px 12px", marginBottom: 10, fontSize: 12,
                }}>
                  <div style={{ color: getTipeBeban(selectedKaryawan.tipe) === "HPP" ? C.yellow : C.orange, fontWeight: 700, marginBottom: 4 }}>
                    {getTipeBeban(selectedKaryawan.tipe) === "HPP" ? "⚙️ HPP — masuk biaya produksi" : "📋 Operasional — masuk kas keluar"}
                  </div>
                  <div style={{ color: C.muted, fontSize: 11, fontFamily: C.fontMono }}>
                    {selectedKaryawan.tarif_harian > 0 && `Tarif harian: ${rupiahFmt(selectedKaryawan.tarif_harian)}`}
                    {selectedKaryawan.tarif_borongan > 0 && ` · Borongan: ${rupiahFmt(selectedKaryawan.tarif_borongan)}`}
                    {selectedKaryawan.fee_live_sesi > 0 && `Fee live: ${rupiahFmt(selectedKaryawan.fee_live_sesi)}`}
                    {selectedKaryawan.komisi_live_persen > 0 && ` · Komisi: ${selectedKaryawan.komisi_live_persen}%`}
                    {selectedKaryawan.gaji_bulanan > 0 && `Gaji bulanan: ${rupiahFmt(selectedKaryawan.gaji_bulanan)}`}
                  </div>
                </div>
              )}

              <label style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Tanggal</label>
              <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)} style={inp} />

              <label style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Nominal Gaji</label>
              <input type="text" value={nominal} onChange={e => setNominal(formatIDR(e.target.value))} placeholder="Rp 0" style={inp} />
              {nominal && toAngka(nominal) > 0 && (
                <div style={{ fontSize: 12, color: C.purple, fontFamily: C.fontMono, marginBottom: 8, fontWeight: 700 }}>= {rupiahFmt(toAngka(nominal))}</div>
              )}

              <label style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Keterangan (opsional)</label>
              <input type="text" value={keterangan} onChange={e => setKeterangan(e.target.value)} placeholder="Misal: produksi 500 pcs..." style={{ ...inp, marginBottom: 16 }} />

              <button onClick={simpanGaji} disabled={submitting || !karyawanId || toAngka(nominal) <= 0} style={{
                width: "100%", padding: "12px", border: "none", borderRadius: 8,
                background: (!karyawanId || toAngka(nominal) <= 0) ? C.dim : `linear-gradient(135deg, #7c3aed, ${C.purple})`,
                color: (!karyawanId || toAngka(nominal) <= 0) ? C.muted : "#fff",
                fontWeight: 700, cursor: (!karyawanId || toAngka(nominal) <= 0) ? "not-allowed" : "pointer",
                fontFamily: C.fontMono, fontSize: 13,
              }}>
                {submitting ? "Menyimpan..." : "💾 Simpan Gaji"}
              </button>
            </div>

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
              <h3 style={{ margin: "0 0 16px", fontFamily: C.fontDisplay, fontSize: 16, color: "#f0eaff", fontWeight: 400 }}>
                Riwayat — {tanggalFmt(tanggal)}
              </h3>
              <div style={{ maxHeight: 420, overflowY: "auto" }}>
                {gajiHariIniList.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 0", color: C.muted, fontFamily: C.fontMono, fontSize: 12 }}>Belum ada input gaji hari ini</div>
                ) : gajiHariIniList.map(g => (
                  <div key={g.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.textMid }}>{g.nama_karyawan}</div>
                      <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{g.tipe_karyawan} · {g.keterangan?.slice(0, 35)}</div>
                      <span style={{ fontSize: 10, display: "inline-block", marginTop: 2, background: (g.tipe_beban === "HPP" ? C.yellow : C.orange) + "20", color: g.tipe_beban === "HPP" ? C.yellow : C.orange, padding: "1px 6px", borderRadius: 4, fontFamily: C.fontMono, fontWeight: 700 }}>
                        {g.tipe_beban}
                      </span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.purple, fontFamily: C.fontMono }}>{rupiahFmt(g.nominal)}</div>
                  </div>
                ))}
              </div>
              {gajiHariIniList.length > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Total Hari Ini</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: C.purple, fontFamily: C.fontMono }}>{rupiahFmt(totalHariIni)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── REKAP ── */}
        {activeTab === "rekap" && (
          <div style={{ animation: "fadeUp 0.2s ease" }}>
            <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center" }}>
              <label style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>Bulan:</label>
              <input type="month" value={filterBulan} onChange={e => setFilterBulan(e.target.value)} style={{ ...inp, width: "auto", marginBottom: 0, padding: "8px 12px" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
              {[
                { label: "Total Gaji", value: rupiahFmt(totalBulan), color: C.purple },
                { label: "HPP (Produksi)", value: rupiahFmt(totalHPP), color: C.yellow },
                { label: "Beban Operasional", value: rupiahFmt(totalOperasional), color: C.orange },
              ].map((s, i) => (
                <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, fontFamily: C.fontMono, textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: s.color, fontFamily: C.fontDisplay }}>{s.value}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
                <h3 style={{ margin: "0 0 16px", fontFamily: C.fontDisplay, fontSize: 16, color: "#f0eaff", fontWeight: 400 }}>Rekap Per Karyawan</h3>
                {rekapPerKaryawan.length === 0
                  ? <div style={{ textAlign: "center", padding: "40px 0", color: C.muted, fontFamily: C.fontMono, fontSize: 12 }}>Belum ada data</div>
                  : rekapPerKaryawan.map(k => (
                    <div key={k.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.textMid }}>{k.nama}</div>
                        <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>
                          {k.tipe} · {k.jumlahInput}× ·{" "}
                          <span style={{ color: getTipeBeban(k.tipe) === "HPP" ? C.yellow : C.orange }}>{getTipeBeban(k.tipe)}</span>
                        </div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.purple, fontFamily: C.fontMono }}>{rupiahFmt(k.totalGaji)}</div>
                    </div>
                  ))}
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
                <h3 style={{ margin: "0 0 16px", fontFamily: C.fontDisplay, fontSize: 16, color: "#f0eaff", fontWeight: 400 }}>Detail Transaksi</h3>
                <div style={{ maxHeight: 400, overflowY: "auto" }}>
                  {gajiFiltered.length === 0
                    ? <div style={{ textAlign: "center", padding: "40px 0", color: C.muted, fontFamily: C.fontMono, fontSize: 12 }}>Belum ada data</div>
                    : gajiFiltered.map(g => (
                      <div key={g.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: C.textMid }}>{g.nama_karyawan}</div>
                          <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{tanggalFmt(g.tanggal)} · {g.keterangan?.slice(0, 28)}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: C.purple, fontFamily: C.fontMono }}>{rupiahFmt(g.nominal)}</div>
                          <div style={{ fontSize: 10, color: g.tipe_beban === "HPP" ? C.yellow : C.orange, fontFamily: C.fontMono }}>{g.tipe_beban}</div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── KARYAWAN ── */}
        {activeTab === "karyawan" && (
          <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 20, animation: "fadeUp 0.2s ease" }}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
              <h3 style={{ margin: "0 0 18px", fontFamily: C.fontDisplay, fontSize: 16, color: "#f0eaff", fontWeight: 400 }}>Tambah Karyawan</h3>
              <input type="text" value={newNama} onChange={e => setNewNama(e.target.value)} placeholder="Nama karyawan" style={inp} />

              <label style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Tipe / Jabatan</label>
              <select value={newTipe} onChange={e => setNewTipe(e.target.value)} style={inp}>
                {tipeOptions.map(t => <option key={t} value={t}>{t}</option>)}
              </select>

              <div style={{
                background: (getTipeBeban(newTipe) === "HPP" ? C.yellow : C.orange) + "15",
                border: `1px solid ${(getTipeBeban(newTipe) === "HPP" ? C.yellow : C.orange)}30`,
                borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontSize: 11,
                color: getTipeBeban(newTipe) === "HPP" ? C.yellow : C.orange, fontFamily: C.fontMono,
              }}>
                {getTipeBeban(newTipe) === "HPP" ? "⚙️ Gaji masuk HPP" : "📋 Gaji masuk Beban Operasional (kas keluar)"}
              </div>

              {/* Tarif sesuai tipe */}
              {(newTipe.includes("Produksi") || newTipe.includes("Packing") && !newTipe.includes("Online")) && (
                <input type="text" value={newTarifHarian} onChange={e => setNewTarifHarian(formatIDR(e.target.value))} placeholder="Tarif harian (Rp)" style={inp} />
              )}
              {newTipe.includes("Pencetak") && (
                <input type="text" value={newTarifBorongan} onChange={e => setNewTarifBorongan(formatIDR(e.target.value))} placeholder="Tarif borongan per kg/unit (Rp)" style={inp} />
              )}
              {newTipe.includes("Live") && (
                <>
                  <input type="text" value={newFeeLive} onChange={e => setNewFeeLive(formatIDR(e.target.value))} placeholder="Fee per sesi live (Rp)" style={inp} />
                  <input type="number" value={newKomisiLive} onChange={e => setNewKomisiLive(e.target.value)} placeholder="Komisi live (%)" style={inp} min="0" max="100" step="0.5" />
                </>
              )}
              {(newTipe.includes("Admin") || newTipe.includes("Owner")) && (
                <input type="text" value={newGajiBulanan} onChange={e => setNewGajiBulanan(formatIDR(e.target.value))} placeholder="Gaji bulanan (Rp)" style={inp} />
              )}
              {newTipe.includes("Online") && (
                <input type="text" value={newTarifHarian} onChange={e => setNewTarifHarian(formatIDR(e.target.value))} placeholder="Tarif per paket (Rp)" style={inp} />
              )}
              <input type="text" value={newCatatan} onChange={e => setNewCatatan(e.target.value)} placeholder="Catatan (opsional)" style={inp} />

              <button onClick={tambahKaryawan} disabled={addingKaryawan} style={{
                width: "100%", padding: "12px", border: "none", borderRadius: 8, marginTop: 6,
                background: addingKaryawan ? C.dim : `linear-gradient(135deg, #7c3aed, ${C.accent})`,
                color: "#fff", fontWeight: 700, cursor: addingKaryawan ? "not-allowed" : "pointer",
                fontFamily: C.fontMono, fontSize: 13,
              }}>
                {addingKaryawan ? "Menyimpan..." : "+ Tambah Karyawan"}
              </button>
            </div>

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
              <h3 style={{ margin: "0 0 16px", fontFamily: C.fontDisplay, fontSize: 16, color: "#f0eaff", fontWeight: 400 }}>
                Daftar Karyawan <span style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>({karyawanList.length})</span>
              </h3>
              {[{ label: "⚙️ HPP — Produksi", filter: "HPP", color: C.yellow }, { label: "📋 Operasional", filter: "Operasional", color: C.orange }].map(group => (
                <div key={group.filter} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: group.color, fontFamily: C.fontMono, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>{group.label}</div>
                  {karyawanList.filter(k => getTipeBeban(k.tipe) === group.filter).map(k => (
                    <div key={k.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: group.color + "08", borderRadius: 8, marginBottom: 6, border: `1px solid ${group.color}20` }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.textMid }}>{k.nama}</div>
                        <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>
                          {k.tipe}
                          {k.tarif_harian > 0 && ` · ${rupiahFmt(k.tarif_harian)}/hari`}
                          {k.tarif_borongan > 0 && ` · ${rupiahFmt(k.tarif_borongan)}/unit`}
                          {k.fee_live_sesi > 0 && ` · ${rupiahFmt(k.fee_live_sesi)}/sesi`}
                          {k.komisi_live_persen > 0 && ` · ${k.komisi_live_persen}%`}
                          {k.gaji_bulanan > 0 && ` · ${rupiahFmt(k.gaji_bulanan)}/bln`}
                        </div>
                      </div>
                    </div>
                  ))}
                  {karyawanList.filter(k => getTipeBeban(k.tipe) === group.filter).length === 0 && (
                    <div style={{ color: C.dim, fontSize: 12, fontFamily: C.fontMono }}>Belum ada</div>
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
