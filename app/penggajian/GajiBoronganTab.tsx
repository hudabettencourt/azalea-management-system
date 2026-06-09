"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useTheme, LIGHT, DARK } from "@/context/ThemeContext";
import { rupiah, rupiahShort } from "@/lib/format";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface GajiRow {
  id: number;
  karyawan_id: number;
  tanggal: string;
  nominal: number;
  keterangan: string;
  tipe_beban: string;
  foto_url?: string;
  karyawan?: { nama: string; tipe: string; uang_makan?: number };
}

interface KaryawanRekap {
  id: number;
  nama: string;
  tipe: string;
  uang_makan: number;
  totalNominal: number;
  totalUangMakan: number;
  jumlahHari: number;
  rows: GajiRow[];
  byTanggal: Record<string, { rows: GajiRow[]; subtotal: number }>;
}

const getTipeBeban = (tipe: string) =>
  ["Operator Produksi", "Packing", "Pencetak"].includes(tipe) ? "HPP" : "Operasional";

const formatTanggal = (iso: string) =>
  new Date(iso + "T00:00:00+07:00").toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

const formatTanggalPendek = (iso: string) =>
  new Date(iso + "T00:00:00+07:00").toLocaleDateString("id-ID", { day: "numeric", month: "short" });

const hariIniWIB = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);

const parseKeterangan = (ket: string) =>
  ket.split(",").map((part) => {
    const [label, qty] = part.split(":").map((s) => s.trim());
    return { label: label || ket, qty: qty || "" };
  });

const parseKgFromKet = (ket: string): number => {
  const match = ket.match(/(\d+\.?\d*)\s*kg/i);
  return match ? parseFloat(match[1]) : 0;
};

export default function GajiBoronganTab() {
  const { isDark } = useTheme();
  const C = isDark ? DARK : LIGHT;

  const [filterBulan, setFilterBulan] = useState(hariIniWIB().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [rekapList, setRekapList] = useState<KaryawanRekap[]>([]);
  const [allRows, setAllRows] = useState<GajiRow[]>([]);
  const [expandedKaryawan, setExpandedKaryawan] = useState<number | null>(null);
  const [expandedTanggal, setExpandedTanggal] = useState<string | null>(null);
  const [filterTipe, setFilterTipe] = useState<"semua" | "HPP" | "Operasional">("semua");
  const [activeView, setActiveView] = useState<"rekap" | "grafik">("rekap");

  const fetchRekap = useCallback(async () => {
    setLoading(true);
    try {
      const [tahun, bulan] = filterBulan.split("-");
      const mulai = `${tahun}-${bulan}-01`;
      const akhir = new Date(parseInt(tahun), parseInt(bulan), 0).toISOString().slice(0, 10);
      const { data } = await supabase
        .from("gaji_harian")
        .select("*, karyawan(nama, tipe, uang_makan)")
        .gte("tanggal", mulai)
        .lte("tanggal", akhir)
        .order("tanggal", { ascending: true });
      if (!data) return;
      setAllRows(data);
      const map: Record<number, KaryawanRekap> = {};
      data.forEach((g: GajiRow) => {
        const k = g.karyawan;
        if (!k) return;
        if (!map[g.karyawan_id]) {
          map[g.karyawan_id] = {
            id: g.karyawan_id, nama: k.nama, tipe: k.tipe,
            uang_makan: k.uang_makan || 0,
            totalNominal: 0, totalUangMakan: 0, jumlahHari: 0,
            rows: [], byTanggal: {},
          };
        }
        const rec = map[g.karyawan_id];
        rec.rows.push(g);
        rec.totalNominal += g.nominal;
        if (!rec.byTanggal[g.tanggal]) {
          rec.byTanggal[g.tanggal] = { rows: [], subtotal: 0 };
          rec.jumlahHari++;
          rec.totalUangMakan += rec.uang_makan;
        }
        rec.byTanggal[g.tanggal].rows.push(g);
        rec.byTanggal[g.tanggal].subtotal += g.nominal;
      });
      setRekapList(Object.values(map).sort((a, b) => b.totalNominal - a.totalNominal));
    } finally {
      setLoading(false);
    }
  }, [filterBulan]);

  useEffect(() => { fetchRekap(); }, [fetchRekap]);

  const hariIni = hariIniWIB();
  const totalHariIni = allRows.filter(g => g.tanggal === hariIni).reduce((a, g) => a + g.nominal, 0);

  const filtered = rekapList.filter((k) =>
    filterTipe === "semua" ? true : getTipeBeban(k.tipe) === filterTipe
  );

  const totalBulan = filtered.reduce((a, k) => a + k.totalNominal + k.totalUangMakan, 0);
  const totalHPP = filtered.filter((k) => getTipeBeban(k.tipe) === "HPP").reduce((a, k) => a + k.totalNominal + k.totalUangMakan, 0);
  const totalOps = filtered.filter((k) => getTipeBeban(k.tipe) === "Operasional").reduce((a, k) => a + k.totalNominal + k.totalUangMakan, 0);

  const jumlahHariAktif = useMemo(() => {
    const tglSet = new Set(allRows.map(g => g.tanggal));
    return tglSet.size;
  }, [allRows]);

  const rataRataHarian = jumlahHariAktif > 0 ? totalBulan / jumlahHariAktif : 0;

  const totalKgBulan = useMemo(() => {
    return allRows.filter(g => g.karyawan && getTipeBeban(g.karyawan.tipe) === "HPP")
      .reduce((a, g) => a + parseKgFromKet(g.keterangan), 0);
  }, [allRows]);

  const chartData = useMemo(() => {
    const byTgl: Record<string, number> = {};
    allRows.forEach(g => { byTgl[g.tanggal] = (byTgl[g.tanggal] || 0) + g.nominal; });
    return Object.entries(byTgl)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([tgl, total]) => ({
        tgl: new Date(tgl + "T00:00:00+07:00").toLocaleDateString("id-ID", { day: "numeric", month: "short" }),
        total,
        isToday: tgl === hariIni,
      }));
  }, [allRows, hariIni]);

  const ranking = useMemo(() => {
    return [...filtered]
      .sort((a, b) => (b.totalNominal + b.totalUangMakan) - (a.totalNominal + a.totalUangMakan))
      .slice(0, 5);
  }, [filtered]);

  const handlePrintSlip = (k: KaryawanRekap, tanggal: string) => {
    const dayData = k.byTanggal[tanggal];
    const rows = dayData.rows.length === 1
      ? parseKeterangan(dayData.rows[0].keterangan).map((r) => ({ label: r.label, qty: r.qty, total: dayData.rows[0].nominal }))
      : dayData.rows.map((g) => ({ label: g.keterangan, qty: "", total: g.nominal }));
    const totalDenganMakan = dayData.subtotal + k.uang_makan;
    const rowsHtml = rows.map(r => `
      <div style="margin-bottom:3px">
        <div>${r.label}</div>
        <div style="display:flex;justify-content:space-between;padding-left:4px">
          <span>${r.qty}</span><span>${Math.round(r.total).toLocaleString("id-ID")}</span>
        </div>
      </div>`).join("");
    const uangMakanHtml = k.uang_makan > 0 ? `
      <div style="border-top:1px dashed #000;margin:4px 0"></div>
      <div style="display:flex;justify-content:space-between">
        <span>Uang Makan</span><span>${k.uang_makan.toLocaleString("id-ID")}</span>
      </div>` : "";
    const html = `<!DOCTYPE html><html><head>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family:'Courier New',monospace; font-size:9pt; width:57mm; padding:3mm 2mm; line-height:1.4; color:#000; }
        @page { size:57mm auto; margin:0; }
      </style></head><body>
      <div style="text-align:center;font-weight:bold;font-size:11pt;margin-bottom:2px">AZALEA FOOD</div>
      <div style="text-align:center;font-size:8pt;margin-bottom:4px">SLIP GAJI BORONGAN</div>
      <div style="border-top:1px dashed #000;margin-bottom:4px"></div>
      <div style="margin-bottom:1px"><b>${k.nama}</b></div>
      <div style="margin-bottom:4px;font-size:8pt">${formatTanggal(tanggal)}</div>
      <div style="border-top:1px dashed #000;margin-bottom:4px"></div>
      ${rowsHtml}${uangMakanHtml}
      <div style="border-top:1px solid #000;margin-top:4px;padding-top:4px">
        <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:11pt">
          <span>TOTAL</span><span>${Math.round(totalDenganMakan).toLocaleString("id-ID")}</span>
        </div>
      </div>
      <div style="border-top:1px dashed #000;margin-top:8px;padding-top:6px">
        <div style="font-size:8pt">Tanda Terima :</div>
        <div style="margin-top:20px;border-top:1px solid #000;padding-top:2px;font-size:8pt">( ${k.nama} )</div>
      </div></body></html>`;
    const w = window.open("", "_blank", "width=800,height=700");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.onafterprint = () => w.close();
    setTimeout(() => w.print(), 500);
  };

  const inputS: React.CSSProperties = {
    background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
    border: `1.5px solid ${C.border}`, borderRadius: 8,
    padding: "8px 12px", color: C.text, fontSize: 13,
    fontFamily: C.fontMono, outline: "none",
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 12, fontFamily: C.fontMono, color: C.text }}>
        <div style={{ color: C.muted, marginBottom: 2 }}>{payload[0]?.payload?.tgl}</div>
        <div style={{ color: C.accent, fontWeight: 700 }}>{rupiah(payload[0]?.value)}</div>
      </div>
    );
  };

  return (
    <div style={{ animation: "fadeUp 0.2s ease" }}>

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>Bulan:</label>
          <input type="month" value={filterBulan} onChange={(e) => setFilterBulan(e.target.value)}
            style={{ ...inputS, colorScheme: isDark ? "dark" : "light" }} />
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {(["semua", "HPP", "Operasional"] as const).map((t) => (
            <button key={t} onClick={() => setFilterTipe(t)} style={{
              padding: "7px 14px", borderRadius: 8,
              border: `1px solid ${filterTipe === t ? (t === "HPP" ? C.green : t === "Operasional" ? C.orange : C.accent) + "60" : C.border}`,
              background: filterTipe === t ? (t === "HPP" ? C.green : t === "Operasional" ? C.orange : C.accent) + "20" : "transparent",
              color: filterTipe === t ? (t === "HPP" ? C.green : t === "Operasional" ? C.orange : C.accent) : C.muted,
              cursor: "pointer", fontFamily: C.fontMono, fontSize: 11, fontWeight: 600, transition: "all 0.15s",
            }}>{t === "semua" ? "Semua" : t}</button>
          ))}
        </div>
        <button onClick={fetchRekap} style={{ marginLeft: "auto", padding: "7px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, cursor: "pointer", fontSize: 12, fontFamily: C.fontMono }}>↻ Refresh</button>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Gaji Hari Ini", value: rupiah(totalHariIni), color: C.blue, icon: "📅", sub: "hari ini" },
          { label: "Total Bulan Ini", value: rupiah(totalBulan), color: C.accent, icon: "💰", sub: `${jumlahHariAktif} hari aktif` },
          { label: "Rata-rata/Hari", value: rupiah(rataRataHarian), color: C.yellow, icon: "📊", sub: "per hari kerja" },
          { label: "Total Kg Produksi", value: `${totalKgBulan.toFixed(1)} kg`, color: C.green, icon: "⚖️", sub: "borongan pencetak" },
        ].map((s, i) => (
          <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", position: "relative", overflow: "hidden", boxShadow: C.shadow }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: s.color, borderRadius: "14px 14px 0 0" }} />
            <div style={{ fontSize: 18, marginBottom: 6 }}>{s.icon}</div>
            <div style={{ fontSize: 9, color: C.muted, fontFamily: C.fontMono, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: s.color, fontFamily: C.fontMono }}>{s.value}</div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* HPP vs Ops */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
        {[
          { label: "HPP Produksi", value: rupiah(totalHPP), color: C.green, icon: "⚙️", pct: totalBulan > 0 ? Math.round(totalHPP / totalBulan * 100) : 0 },
          { label: "Beban Operasional", value: rupiah(totalOps), color: C.orange, icon: "📋", pct: totalBulan > 0 ? Math.round(totalOps / totalBulan * 100) : 0 },
        ].map((s, i) => (
          <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 20px", boxShadow: C.shadow }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{s.icon} {s.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: s.color, fontFamily: C.fontMono }}>{s.value}</div>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color + "60", fontFamily: C.fontMono }}>{s.pct}%</div>
            </div>
            <div style={{ marginTop: 10, height: 4, background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", borderRadius: 2 }}>
              <div style={{ height: "100%", width: `${s.pct}%`, background: s.color, borderRadius: 2, transition: "width 0.5s ease" }} />
            </div>
          </div>
        ))}
      </div>

      {/* View toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[{ id: "rekap", label: "📋 Rekap Karyawan" }, { id: "grafik", label: "📈 Grafik & Ranking" }].map(v => (
          <button key={v.id} onClick={() => setActiveView(v.id as any)} style={{
            padding: "8px 18px", borderRadius: 8, cursor: "pointer",
            border: `1px solid ${activeView === v.id ? C.accent + "60" : C.border}`,
            background: activeView === v.id ? `${C.accent}20` : "transparent",
            color: activeView === v.id ? C.accent : C.muted,
            fontFamily: C.fontMono, fontSize: 12, fontWeight: 600, transition: "all 0.15s",
          }}>{v.label}</button>
        ))}
      </div>

      {/* ── VIEW: GRAFIK ── */}
      {activeView === "grafik" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16 }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px 24px", boxShadow: C.shadow }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }}>Gaji Per Hari</div>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, marginBottom: 16 }}>{filterBulan}</div>
            {chartData.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: C.muted, fontFamily: C.fontMono, fontSize: 12 }}>Belum ada data</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} barSize={20}>
                  <XAxis dataKey="tgl" tick={{ fontSize: 10, fill: C.muted, fontFamily: C.fontMono }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={rupiahShort} tick={{ fontSize: 10, fill: C.muted, fontFamily: C.fontMono }} axisLine={false} tickLine={false} width={50} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" }} />
                  <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.isToday ? C.accent : isDark ? "#a78bfa40" : "#7c3aed30"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px 24px", boxShadow: C.shadow }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }}>🏆 Ranking Produktivitas</div>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, marginBottom: 16 }}>Bulan ini</div>
            {ranking.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: C.muted, fontFamily: C.fontMono, fontSize: 12 }}>Belum ada data</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {ranking.map((k, i) => {
                  const isHPP = getTipeBeban(k.tipe) === "HPP";
                  const tipeColor = isHPP ? C.green : C.orange;
                  const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
                  const maxTotal = ranking[0]?.totalNominal + ranking[0]?.totalUangMakan || 1;
                  const pct = Math.round((k.totalNominal + k.totalUangMakan) / maxTotal * 100);
                  return (
                    <div key={k.id}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 16 }}>{medals[i]}</span>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{k.nama}</div>
                            <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono }}>{k.jumlahHari} hari</div>
                          </div>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: tipeColor, fontFamily: C.fontMono }}>{rupiah(k.totalNominal + k.totalUangMakan)}</div>
                      </div>
                      <div style={{ height: 4, background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", borderRadius: 2 }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: tipeColor, borderRadius: 2, transition: "width 0.5s ease" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── VIEW: REKAP ── */}
      {activeView === "rekap" && (
        loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>
            <div style={{ fontSize: 28, marginBottom: 8, color: C.accent }}>◈</div>Memuat data...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>Belum ada data gaji untuk bulan ini</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map((k) => {
              const isExpanded = expandedKaryawan === k.id;
              const isHPP = getTipeBeban(k.tipe) === "HPP";
              const tipeColor = isHPP ? C.green : C.orange;
              const tanggalList = Object.keys(k.byTanggal).sort((a, b) => b.localeCompare(a));
              return (
                <div key={k.id} style={{ background: C.card, border: `1px solid ${isExpanded ? C.accent + "60" : C.border}`, borderRadius: 14, overflow: "hidden", transition: "border-color 0.2s", boxShadow: C.shadow }}>
                  <div onClick={() => { setExpandedKaryawan(isExpanded ? null : k.id); setExpandedTanggal(null); }}
                    style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", cursor: "pointer", background: isExpanded ? isDark ? "rgba(167,139,250,0.06)" : "rgba(167,139,250,0.04)" : "transparent", transition: "background 0.2s" }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: `${tipeColor}20`, border: `1px solid ${tipeColor}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: tipeColor, fontFamily: C.fontMono }}>
                      {k.nama.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 3 }}>{k.nama}</div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: `${tipeColor}20`, color: tipeColor, fontFamily: C.fontMono, fontWeight: 600 }}>{k.tipe}</span>
                        <span style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{k.jumlahHari} hari kerja</span>
                        <span style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>~{rupiah(k.jumlahHari > 0 ? (k.totalNominal + k.totalUangMakan) / k.jumlahHari : 0)}/hari</span>
                        {k.uang_makan > 0 && <span style={{ fontSize: 10, color: C.yellow, fontFamily: C.fontMono }}>🍚 Rp{k.uang_makan.toLocaleString("id-ID")}/hari</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: tipeColor, fontFamily: C.fontMono }}>{rupiah(k.totalNominal + k.totalUangMakan)}</div>
                      {k.uang_makan > 0 && <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono }}>+{rupiah(k.totalUangMakan)} makan</div>}
                    </div>
                    <div style={{ fontSize: 12, color: C.muted, marginLeft: 8, transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>▼</div>
                  </div>
                  {isExpanded && (
                    <div style={{ borderTop: `1px solid ${C.border}`, padding: "12px 20px" }}>
                      <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, marginBottom: 10, letterSpacing: "0.06em", textTransform: "uppercase" }}>Detail Per Hari</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {tanggalList.map((tgl) => {
                          const dayData = k.byTanggal[tgl];
                          const isExpandedTgl = expandedTanggal === `${k.id}-${tgl}`;
                          const totalHari = dayData.subtotal + k.uang_makan;
                          return (
                            <div key={tgl} style={{ background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", borderRadius: 10, border: `1px solid ${isExpandedTgl ? C.accent + "40" : C.border}`, overflow: "hidden" }}>
                              <div onClick={() => setExpandedTanggal(isExpandedTgl ? null : `${k.id}-${tgl}`)}
                                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", cursor: "pointer" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: tipeColor, flexShrink: 0 }} />
                                  <span style={{ fontSize: 13, color: C.textMid, fontFamily: C.fontMono }}>{formatTanggalPendek(tgl)}</span>
                                  <span style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{dayData.rows.length} entri</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <span style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: C.fontMono }}>{rupiah(totalHari)}</span>
                                  <button onClick={(e) => { e.stopPropagation(); handlePrintSlip(k, tgl); }}
                                    style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${C.accent}40`, background: `${C.accent}15`, color: C.accent, cursor: "pointer", fontSize: 12, fontFamily: C.fontMono }}>
                                    🖨 Print
                                  </button>
                                  <span style={{ fontSize: 11, color: C.muted, display: "inline-block", transition: "transform 0.2s", transform: isExpandedTgl ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
                                </div>
                              </div>
                              {isExpandedTgl && (
                                <div style={{ borderTop: `1px solid ${C.border}`, padding: "10px 14px" }}>
                                  {dayData.rows.map((g) => (
                                    <div key={g.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
                                      <span style={{ color: C.textMid, fontFamily: C.fontMono, flex: 1 }}>{g.keterangan}</span>
                                      <span style={{ color: tipeColor, fontFamily: C.fontMono, fontWeight: 600, marginLeft: 12 }}>{rupiah(g.nominal)}</span>
                                    </div>
                                  ))}
                                  {k.uang_makan > 0 && (
                                    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 12 }}>
                                      <span style={{ color: C.yellow, fontFamily: C.fontMono }}>🍚 Uang Makan</span>
                                      <span style={{ color: C.yellow, fontFamily: C.fontMono, fontWeight: 600 }}>+{rupiah(k.uang_makan)}</span>
                                    </div>
                                  )}
                                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 2px", borderTop: `1px solid ${C.border}`, fontSize: 13, fontWeight: 700 }}>
                                    <span style={{ color: C.muted, fontFamily: C.fontMono }}>Total hari ini</span>
                                    <span style={{ color: C.text, fontFamily: C.fontMono }}>{rupiah(totalHari)}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ marginTop: 12, padding: "12px 16px", borderRadius: 10, background: `${tipeColor}08`, border: `1px solid ${tipeColor}20`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>
                          Total {filterBulan} · {k.jumlahHari} hari{k.uang_makan > 0 && ` · +${rupiah(k.totalUangMakan)} makan`}
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: tipeColor, fontFamily: C.fontMono }}>{rupiah(k.totalNominal + k.totalUangMakan)}</div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
