"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useTheme, LIGHT, DARK } from "@/context/ThemeContext";

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

const rupiahFmt = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
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

export default function GajiBoronganTab() {
  const { isDark } = useTheme();
  const C = isDark ? DARK : LIGHT;

  const [filterBulan, setFilterBulan] = useState(hariIniWIB().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [rekapList, setRekapList] = useState<KaryawanRekap[]>([]);
  const [expandedKaryawan, setExpandedKaryawan] = useState<number | null>(null);
  const [expandedTanggal, setExpandedTanggal] = useState<string | null>(null);
  const [filterTipe, setFilterTipe] = useState<"semua" | "HPP" | "Operasional">("semua");

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
        .order("tanggal", { ascending: false });
      if (!data) return;
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

  const handlePrintSlip = (k: KaryawanRekap, tanggal: string) => {
    const dayData = k.byTanggal[tanggal];
    const rows = dayData.rows.length === 1
      ? parseKeterangan(dayData.rows[0].keterangan).map((r) => ({
          label: r.label, qty: r.qty, total: dayData.rows[0].nominal,
        }))
      : dayData.rows.map((g) => ({
          label: g.keterangan, qty: "", total: g.nominal,
        }));

    const totalDenganMakan = dayData.subtotal + k.uang_makan;

    const rowsHtml = rows.map(r => `
      <div style="margin-bottom:3px">
        <div>${r.label}</div>
        <div style="display:flex;justify-content:space-between;padding-left:4px">
          <span>${r.qty}</span>
          <span>${Math.round(r.total).toLocaleString("id-ID")}</span>
        </div>
      </div>
    `).join("");

    const uangMakanHtml = k.uang_makan > 0 ? `
      <div style="border-top:1px dashed #000;margin:4px 0"></div>
      <div style="display:flex;justify-content:space-between">
        <span>Uang Makan</span>
        <span>${k.uang_makan.toLocaleString("id-ID")}</span>
      </div>
    ` : "";

    const html = `<!DOCTYPE html><html><head>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Courier New', monospace; font-size: 9pt; width: 57mm; padding: 3mm 2mm; line-height: 1.4; color: #000; }
        @page { size: 57mm auto; margin: 0; }
      </style>
    </head><body>
      <div style="text-align:center;font-weight:bold;font-size:11pt;margin-bottom:2px">AZALEA FOOD</div>
      <div style="text-align:center;font-size:8pt;margin-bottom:4px">SLIP GAJI BORONGAN</div>
      <div style="border-top:1px dashed #000;margin-bottom:4px"></div>
      <div style="margin-bottom:1px"><b>${k.nama}</b></div>
      <div style="margin-bottom:4px;font-size:8pt">${formatTanggal(tanggal)}</div>
      <div style="border-top:1px dashed #000;margin-bottom:4px"></div>
      ${rowsHtml}
      ${uangMakanHtml}
      <div style="border-top:1px solid #000;margin-top:4px;padding-top:4px">
        <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:11pt">
          <span>TOTAL</span>
          <span>${Math.round(totalDenganMakan).toLocaleString("id-ID")}</span>
        </div>
      </div>
      <div style="border-top:1px dashed #000;margin-top:8px;padding-top:6px">
        <div style="font-size:8pt">Tanda Terima :</div>
        <div style="margin-top:20px;border-top:1px solid #000;padding-top:2px;font-size:8pt">( ${k.nama} )</div>
      </div>
    </body></html>`;

    const w = window.open("", "_blank", "width=800,height=700");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.onafterprint = () => w.close();
    setTimeout(() => w.print(), 500);
  };

  const filtered = rekapList.filter((k) =>
    filterTipe === "semua" ? true : getTipeBeban(k.tipe) === filterTipe
  );

  const totalBulan = filtered.reduce((a, k) => a + k.totalNominal + k.totalUangMakan, 0);
  const totalHPP = filtered.filter((k) => getTipeBeban(k.tipe) === "HPP").reduce((a, k) => a + k.totalNominal + k.totalUangMakan, 0);
  const totalOps = filtered.filter((k) => getTipeBeban(k.tipe) === "Operasional").reduce((a, k) => a + k.totalNominal + k.totalUangMakan, 0);

  const inputS: React.CSSProperties = {
    background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
    border: `1.5px solid ${C.border}`, borderRadius: 8,
    padding: "8px 12px", color: C.text, fontSize: 13,
    fontFamily: C.fontMono, outline: "none",
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total Gaji Bulan Ini", value: rupiahFmt(totalBulan), color: C.accent, icon: "💰" },
          { label: "HPP Produksi", value: rupiahFmt(totalHPP), color: C.green, icon: "⚙️" },
          { label: "Beban Operasional", value: rupiahFmt(totalOps), color: C.orange, icon: "📋" },
        ].map((s, i) => (
          <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 20px", position: "relative", overflow: "hidden", boxShadow: C.shadow }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: s.color, borderRadius: "14px 14px 0 0" }} />
            <div style={{ fontSize: 20, marginBottom: 8 }}>{s.icon}</div>
            <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.color, fontFamily: C.fontMono }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Karyawan list */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>
          <div style={{ fontSize: 28, marginBottom: 8, color: C.accent }}>◈</div>Memuat data...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>
          Belum ada data gaji untuk bulan ini
        </div>
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
                      {k.uang_makan > 0 && <span style={{ fontSize: 10, color: C.yellow, fontFamily: C.fontMono }}>🍚 Rp{k.uang_makan.toLocaleString("id-ID")}/hari</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: tipeColor, fontFamily: C.fontMono }}>{rupiahFmt(k.totalNominal + k.totalUangMakan)}</div>
                    {k.uang_makan > 0 && <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono }}>+{rupiahFmt(k.totalUangMakan)} makan</div>}
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
                                <span style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: C.fontMono }}>{rupiahFmt(totalHari)}</span>
                                <button onClick={(e) => { e.stopPropagation(); handlePrintSlip(k, tgl); }}
                                  style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${C.accent}40`, background: `${C.accent}15`, color: C.accent, cursor: "pointer", fontSize: 12, fontFamily: C.fontMono, transition: "all 0.15s" }}>
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
                                    <span style={{ color: tipeColor, fontFamily: C.fontMono, fontWeight: 600, marginLeft: 12 }}>{rupiahFmt(g.nominal)}</span>
                                  </div>
                                ))}
                                {k.uang_makan > 0 && (
                                  <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 12 }}>
                                    <span style={{ color: C.yellow, fontFamily: C.fontMono }}>🍚 Uang Makan</span>
                                    <span style={{ color: C.yellow, fontFamily: C.fontMono, fontWeight: 600 }}>+{rupiahFmt(k.uang_makan)}</span>
                                  </div>
                                )}
                                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 2px", borderTop: `1px solid ${C.border}`, fontSize: 13, fontWeight: 700 }}>
                                  <span style={{ color: C.muted, fontFamily: C.fontMono }}>Total hari ini</span>
                                  <span style={{ color: C.text, fontFamily: C.fontMono }}>{rupiahFmt(totalHari)}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ marginTop: 12, padding: "12px 16px", borderRadius: 10, background: `${tipeColor}08`, border: `1px solid ${tipeColor}20`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>
                        Total {filterBulan} · {k.jumlahHari} hari{k.uang_makan > 0 && ` · +${rupiahFmt(k.totalUangMakan)} makan`}
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: tipeColor, fontFamily: C.fontMono }}>{rupiahFmt(k.totalNominal + k.totalUangMakan)}</div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
