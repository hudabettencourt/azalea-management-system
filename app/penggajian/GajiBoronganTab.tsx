"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

// ── Types ────────────────────────────────────────────────
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
  // group by tanggal
  byTanggal: Record<string, { rows: GajiRow[]; subtotal: number }>;
}

interface SlipData {
  nama: string;
  tipe: string;
  tanggal: string;
  uangMakan: number;
  rows: { label: string; qty: string; total: number }[];
  totalGaji: number;
  totalDenganMakan: number;
}

// ── Helpers ──────────────────────────────────────────────
const C = {
  bg: "#100c16",
  card: "#17111f",
  border: "#2a1f3d",
  purple: "#a78bfa",
  accentDark: "#7c3aed",
  green: "#34d399",
  yellow: "#fbbf24",
  orange: "#fb923c",
  red: "#f87171",
  blue: "#60a5fa",
  muted: "#6b5d7a",
  dim: "#3d3050",
  text: "#f0eaff",
  textMid: "#c4b5d4",
  fontDisplay: "'DM Serif Display', serif",
  fontMono: "'DM Mono', monospace",
  fontSans: "'DM Sans', sans-serif",
  shadow: "0 4px 24px rgba(0,0,0,0.4)",
};

const rupiahFmt = (n: number) =>
  "Rp " + Math.round(n).toLocaleString("id-ID");

const getTipeBeban = (tipe: string) =>
  ["Operator Produksi", "Packing", "Pencetak"].includes(tipe) ? "HPP" : "Operasional";

// Parse keterangan "Siomay Besar: 5kg, Siomay Kuncup: 2.5kg" jadi rows slip
const parseKeterangan = (ket: string): { label: string; qty: string }[] => {
  if (!ket) return [];
  return ket.split(",").map((part) => {
    const [label, qty] = part.split(":").map((s) => s.trim());
    return { label: label || ket, qty: qty || "" };
  });
};

const formatTanggal = (iso: string) => {
  const d = new Date(iso + "T00:00:00+07:00");
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
};

const formatTanggalPendek = (iso: string) => {
  const d = new Date(iso + "T00:00:00+07:00");
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
};

const hariIniWIB = () => {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return wib.toISOString().slice(0, 10);
};

// ── Print Slip Component (hidden, for @media print) ──────
function PrintSlip({ slip }: { slip: SlipData }) {
  return (
    <div id="print-slip" style={{ display: "none" }}>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #print-slip, #print-slip * { visibility: visible !important; }
          #print-slip {
            display: block !important;
            position: fixed !important;
            top: 0; left: 0;
            width: 57mm;
            font-family: 'Courier New', monospace;
            font-size: 9pt;
            color: #000;
            background: #fff;
            padding: 3mm 2mm;
            line-height: 1.4;
          }
          @page {
            size: 57mm auto;
            margin: 0;
          }
        }
      `}</style>
      <div style={{ fontFamily: "'Courier New', monospace", fontSize: 9, color: "#000", lineHeight: 1.4 }}>
        {/* Header */}
        <div style={{ textAlign: "center", fontWeight: "bold", fontSize: 11, marginBottom: 2 }}>AZALEA FOOD</div>
        <div style={{ textAlign: "center", fontSize: 8, marginBottom: 4 }}>SLIP GAJI BORONGAN</div>
        <div style={{ borderTop: "1px dashed #000", marginBottom: 4 }} />

        {/* Info karyawan */}
        <div style={{ marginBottom: 1 }}><b>{slip.nama}</b></div>
        <div style={{ marginBottom: 4, fontSize: 8 }}>{formatTanggal(slip.tanggal)}</div>
        <div style={{ borderTop: "1px dashed #000", marginBottom: 4 }} />

        {/* Rows produksi */}
        {slip.rows.map((r, i) => (
          <div key={i} style={{ marginBottom: 3 }}>
            <div>{r.label}</div>
            <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: 4 }}>
              <span>{r.qty}</span>
              <span>{Math.round(r.total).toLocaleString("id-ID")}</span>
            </div>
          </div>
        ))}

        {/* Uang makan */}
        {slip.uangMakan > 0 && (
          <>
            <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Uang Makan</span>
              <span>{slip.uangMakan.toLocaleString("id-ID")}</span>
            </div>
          </>
        )}

        {/* Total */}
        <div style={{ borderTop: "1px solid #000", marginTop: 4, paddingTop: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", fontSize: 11 }}>
            <span>TOTAL</span>
            <span>{Math.round(slip.totalDenganMakan).toLocaleString("id-ID")}</span>
          </div>
        </div>

        {/* TTD */}
        <div style={{ borderTop: "1px dashed #000", marginTop: 8, paddingTop: 6 }}>
          <div style={{ fontSize: 8 }}>Tanda Terima :</div>
          <div style={{ marginTop: 20, borderTop: "1px solid #000", paddingTop: 2, fontSize: 8 }}>
            ( {slip.nama} )
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────
export default function RekapBulananTab() {
  const [filterBulan, setFilterBulan] = useState(hariIniWIB().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [rekapList, setRekapList] = useState<KaryawanRekap[]>([]);
  const [expandedKaryawan, setExpandedKaryawan] = useState<number | null>(null);
  const [expandedTanggal, setExpandedTanggal] = useState<string | null>(null);
  const [printSlip, setPrintSlip] = useState<SlipData | null>(null);
  const [filterTipe, setFilterTipe] = useState<"semua" | "HPP" | "Operasional">("semua");

  const fetchRekap = useCallback(async () => {
    setLoading(true);
    try {
      const [tahun, bulan] = filterBulan.split("-");
      const mulai = `${tahun}-${bulan}-01`;
      const akhir = new Date(parseInt(tahun), parseInt(bulan), 0)
        .toISOString()
        .slice(0, 10);

      const { data } = await supabase
        .from("gaji_harian")
        .select("*, karyawan(nama, tipe, uang_makan)")
        .gte("tanggal", mulai)
        .lte("tanggal", akhir)
        .order("tanggal", { ascending: false });

      if (!data) return;

      // Group by karyawan
      const map: Record<number, KaryawanRekap> = {};
      data.forEach((g: GajiRow) => {
        const k = g.karyawan;
        if (!k) return;
        if (!map[g.karyawan_id]) {
          map[g.karyawan_id] = {
            id: g.karyawan_id,
            nama: k.nama,
            tipe: k.tipe,
            uang_makan: k.uang_makan || 0,
            totalNominal: 0,
            totalUangMakan: 0,
            jumlahHari: 0,
            rows: [],
            byTanggal: {},
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

      setRekapList(
        Object.values(map).sort((a, b) => b.totalNominal - a.totalNominal)
      );
    } finally {
      setLoading(false);
    }
  }, [filterBulan]);

  useEffect(() => {
    fetchRekap();
  }, [fetchRekap]);

  // Trigger print setelah slip ter-set
  useEffect(() => {
    if (printSlip) {
      setTimeout(() => window.print(), 100);
    }
  }, [printSlip]);

  const handlePrintSlip = (k: KaryawanRekap, tanggal: string) => {
    const dayData = k.byTanggal[tanggal];
    const rows = dayData.rows.flatMap((g) =>
      parseKeterangan(g.keterangan).map((r) => ({
        label: r.label,
        qty: r.qty,
        total: g.nominal / parseKeterangan(g.keterangan).length,
      }))
    );
    // Kalau hanya 1 row, pakai nominal penuh
    const finalRows =
      dayData.rows.length === 1
        ? parseKeterangan(dayData.rows[0].keterangan).map((r) => ({
            label: r.label,
            qty: r.qty,
            total: dayData.rows[0].nominal,
          }))
        : rows;

    const slip: SlipData = {
      nama: k.nama,
      tipe: k.tipe,
      tanggal,
      uangMakan: k.uang_makan,
      rows: finalRows.length > 0
        ? finalRows
        : [{ label: dayData.rows[0]?.keterangan || "-", qty: "", total: dayData.subtotal }],
      totalGaji: dayData.subtotal,
      totalDenganMakan: dayData.subtotal + k.uang_makan,
    };
    setPrintSlip(slip);
  };

  const filtered = rekapList.filter((k) => {
    if (filterTipe === "semua") return true;
    return getTipeBeban(k.tipe) === filterTipe;
  });

  const totalBulan = filtered.reduce((a, k) => a + k.totalNominal + k.totalUangMakan, 0);
  const totalHPP = filtered.filter((k) => getTipeBeban(k.tipe) === "HPP")
    .reduce((a, k) => a + k.totalNominal + k.totalUangMakan, 0);
  const totalOps = filtered.filter((k) => getTipeBeban(k.tipe) === "Operasional")
    .reduce((a, k) => a + k.totalNominal + k.totalUangMakan, 0);

  const inp: React.CSSProperties = {
    background: "#0d0a14",
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "8px 12px",
    color: C.text,
    fontSize: 13,
    fontFamily: C.fontMono,
    outline: "none",
    width: "100%",
  };

  return (
    <>
      {/* Hidden print slip */}
      {printSlip && <PrintSlip slip={printSlip} />}

      <div style={{ animation: "fadeUp 0.2s ease" }}>

        {/* ── Filter bar ── */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>Bulan:</label>
            <input
              type="month"
              value={filterBulan}
              onChange={(e) => setFilterBulan(e.target.value)}
              style={{ ...inp, width: "auto", padding: "8px 12px" }}
            />
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {(["semua", "HPP", "Operasional"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilterTipe(t)}
                style={{
                  padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                  fontFamily: C.fontMono, fontSize: 11, fontWeight: 600,
                  background: filterTipe === t
                    ? t === "HPP" ? C.green : t === "Operasional" ? C.orange : C.purple
                    : C.dim,
                  color: filterTipe === t ? "#000" : C.muted,
                  transition: "all 0.15s",
                }}
              >
                {t === "semua" ? "Semua" : t}
              </button>
            ))}
          </div>
          <button
            onClick={fetchRekap}
            style={{ marginLeft: "auto", padding: "7px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, cursor: "pointer", fontSize: 12, fontFamily: C.fontMono }}
          >
            ↻ Refresh
          </button>
        </div>

        {/* ── Summary cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Total Gaji Bulan Ini", value: rupiahFmt(totalBulan), color: C.purple, icon: "💰" },
            { label: "HPP Produksi", value: rupiahFmt(totalHPP), color: C.green, icon: "⚙️" },
            { label: "Beban Operasional", value: rupiahFmt(totalOps), color: C.orange, icon: "📋" },
          ].map((s, i) => (
            <div key={i} style={{
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
              padding: "18px 20px", position: "relative", overflow: "hidden",
            }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: s.color, borderRadius: "14px 14px 0 0" }} />
              <div style={{ fontSize: 18, marginBottom: 8 }}>{s.icon}</div>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.color, fontFamily: C.fontDisplay }}>{s.value}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4, fontFamily: C.fontMono }}>
                {filtered.filter((k) =>
                  s.label === "Total Gaji Bulan Ini" ? true :
                  s.label === "HPP Produksi" ? getTipeBeban(k.tipe) === "HPP" :
                  getTipeBeban(k.tipe) === "Operasional"
                ).length} karyawan
              </div>
            </div>
          ))}
        </div>

        {/* ── Karyawan list ── */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>
            <div style={{ fontSize: 28, marginBottom: 8, animation: "pulse 1.5s infinite", color: C.purple }}>◈</div>
            Memuat data...
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
                <div key={k.id} style={{
                  background: C.card, border: `1px solid ${isExpanded ? C.purple + "60" : C.border}`,
                  borderRadius: 14, overflow: "hidden", transition: "border-color 0.2s",
                }}>
                  {/* ── Karyawan header row (clickable) ── */}
                  <div
                    onClick={() => {
                      setExpandedKaryawan(isExpanded ? null : k.id);
                      setExpandedTanggal(null);
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 14,
                      padding: "14px 20px", cursor: "pointer",
                      background: isExpanded ? `${C.purple}08` : "transparent",
                      transition: "background 0.2s",
                    }}
                  >
                    {/* Avatar */}
                    <div style={{
                      width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                      background: `${tipeColor}20`, border: `1px solid ${tipeColor}40`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 16, fontWeight: 700, color: tipeColor, fontFamily: C.fontMono,
                    }}>
                      {k.nama.charAt(0).toUpperCase()}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 3 }}>
                        {k.nama}
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{
                          fontSize: 10, padding: "2px 8px", borderRadius: 4,
                          background: `${tipeColor}20`, color: tipeColor,
                          fontFamily: C.fontMono, fontWeight: 600,
                        }}>
                          {k.tipe}
                        </span>
                        <span style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>
                          {k.jumlahHari} hari kerja
                        </span>
                        {k.uang_makan > 0 && (
                          <span style={{ fontSize: 10, color: C.yellow, fontFamily: C.fontMono }}>
                            🍚 Uang makan Rp{k.uang_makan.toLocaleString("id-ID")}/hari
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Total + chevron */}
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: tipeColor, fontFamily: C.fontDisplay }}>
                        {rupiahFmt(k.totalNominal + k.totalUangMakan)}
                      </div>
                      {k.uang_makan > 0 && (
                        <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono }}>
                          +{rupiahFmt(k.totalUangMakan)} makan
                        </div>
                      )}
                    </div>
                    <div style={{
                      fontSize: 14, color: C.muted, transition: "transform 0.2s",
                      transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                      marginLeft: 8,
                    }}>▼</div>
                  </div>

                  {/* ── Expanded: detail per tanggal ── */}
                  {isExpanded && (
                    <div style={{ borderTop: `1px solid ${C.border}`, padding: "12px 20px" }}>
                      <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, marginBottom: 10, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                        Detail Per Hari
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {tanggalList.map((tgl) => {
                          const dayData = k.byTanggal[tgl];
                          const isExpandedTgl = expandedTanggal === `${k.id}-${tgl}`;
                          const totalHari = dayData.subtotal + k.uang_makan;

                          return (
                            <div key={tgl} style={{
                              background: "#0d0a14", borderRadius: 10,
                              border: `1px solid ${isExpandedTgl ? C.purple + "40" : C.border}`,
                              overflow: "hidden",
                            }}>
                              {/* Tanggal row */}
                              <div
                                onClick={() => setExpandedTanggal(isExpandedTgl ? null : `${k.id}-${tgl}`)}
                                style={{
                                  display: "flex", alignItems: "center", justifyContent: "space-between",
                                  padding: "10px 14px", cursor: "pointer",
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <div style={{
                                    width: 6, height: 6, borderRadius: "50%",
                                    background: tipeColor, flexShrink: 0,
                                  }} />
                                  <span style={{ fontSize: 13, color: C.textMid, fontFamily: C.fontMono }}>
                                    {formatTanggalPendek(tgl)}
                                  </span>
                                  <span style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>
                                    {dayData.rows.length} entri
                                  </span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <span style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: C.fontMono }}>
                                    {rupiahFmt(totalHari)}
                                  </span>
                                  {/* Tombol print */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handlePrintSlip(k, tgl);
                                    }}
                                    title="Print slip gaji"
                                    style={{
                                      padding: "5px 10px", borderRadius: 6, border: `1px solid ${C.purple}40`,
                                      background: `${C.purple}15`, color: C.purple,
                                      cursor: "pointer", fontSize: 12, fontFamily: C.fontMono,
                                      transition: "all 0.15s",
                                    }}
                                    onMouseEnter={(e) => {
                                      (e.target as HTMLElement).style.background = `${C.purple}30`;
                                    }}
                                    onMouseLeave={(e) => {
                                      (e.target as HTMLElement).style.background = `${C.purple}15`;
                                    }}
                                  >
                                    🖨 Print
                                  </button>
                                  <span style={{
                                    fontSize: 11, color: C.muted, transition: "transform 0.2s",
                                    transform: isExpandedTgl ? "rotate(180deg)" : "rotate(0deg)",
                                    display: "inline-block",
                                  }}>▾</span>
                                </div>
                              </div>

                              {/* Detail rows */}
                              {isExpandedTgl && (
                                <div style={{ borderTop: `1px solid ${C.border}`, padding: "10px 14px" }}>
                                  {dayData.rows.map((g) => (
                                    <div key={g.id} style={{
                                      display: "flex", justifyContent: "space-between",
                                      padding: "5px 0", borderBottom: `1px solid ${C.border}`,
                                      fontSize: 12,
                                    }}>
                                      <span style={{ color: C.textMid, fontFamily: C.fontMono, flex: 1 }}>
                                        {g.keterangan}
                                      </span>
                                      <span style={{ color: tipeColor, fontFamily: C.fontMono, fontWeight: 600, marginLeft: 12 }}>
                                        {rupiahFmt(g.nominal)}
                                      </span>
                                    </div>
                                  ))}
                                  {k.uang_makan > 0 && (
                                    <div style={{
                                      display: "flex", justifyContent: "space-between",
                                      padding: "5px 0", fontSize: 12,
                                    }}>
                                      <span style={{ color: C.yellow, fontFamily: C.fontMono }}>
                                        🍚 Uang Makan
                                      </span>
                                      <span style={{ color: C.yellow, fontFamily: C.fontMono, fontWeight: 600 }}>
                                        +{rupiahFmt(k.uang_makan)}
                                      </span>
                                    </div>
                                  )}
                                  <div style={{
                                    display: "flex", justifyContent: "space-between",
                                    padding: "8px 0 2px", borderTop: `1px solid ${C.border}`,
                                    fontSize: 13, fontWeight: 700,
                                  }}>
                                    <span style={{ color: C.muted, fontFamily: C.fontMono }}>Total hari ini</span>
                                    <span style={{ color: C.text, fontFamily: C.fontMono }}>{rupiahFmt(totalHari)}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Ringkasan bawah */}
                      <div style={{
                        marginTop: 12, padding: "12px 16px", borderRadius: 10,
                        background: `${tipeColor}08`, border: `1px solid ${tipeColor}20`,
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                      }}>
                        <div style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>
                          Total {filterBulan} · {k.jumlahHari} hari
                          {k.uang_makan > 0 && ` · +${rupiahFmt(k.totalUangMakan)} uang makan`}
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: tipeColor, fontFamily: C.fontDisplay }}>
                          {rupiahFmt(k.totalNominal + k.totalUangMakan)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
