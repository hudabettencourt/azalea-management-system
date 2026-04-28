"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import Sidebar from "@/components/Sidebar";

type StatKas = { saldo: number; pemasukan_bulan: number; pengeluaran_bulan: number };
type RecentTrx = { id: number; tipe: string; kategori: string; nominal: number; keterangan: string; created_at: string };
type StokAlert = { id: number; nama: string; stok: number; satuan: string; kategori: string };

const rupiahFmt = (n: number) => `Rp ${(n || 0).toLocaleString("id-ID")}`;
const tanggalFmt = (s: string) =>
  new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });

const C = {
  bg: "#100c16",
  card: "#1a1425",
  border: "#2a1f3d",
  text: "#e2d9f3",
  muted: "#7c6d8a",
  dim: "#5a4f6a",
  accent: "#a78bfa",
  green: "#34d399",
  red: "#f87171",
  yellow: "#fbbf24",
  blue: "#60a5fa",
  orange: "#fb923c",
  fontDisplay: "'DM Serif Display', serif",
  fontMono: "'DM Mono', monospace",
  fontSans: "'DM Sans', sans-serif",
};

export default function DashboardPage() {
  const [kas, setKas] = useState<StatKas>({ saldo: 0, pemasukan_bulan: 0, pengeluaran_bulan: 0 });
  const [recentTrx, setRecentTrx] = useState<RecentTrx[]>([]);
  const [stokAlert, setStokAlert] = useState<StokAlert[]>([]);
  const [hutangTotal, setHutangTotal] = useState(0);
  const [piutangShopee, setPiutangShopee] = useState(0);
  const [piutangOffline, setPiutangOffline] = useState(0);
  const [gajiHariIni, setGajiHariIni] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const now = new Date();
      const bulanMulai = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const hariIni = now.toLocaleDateString("sv", { timeZone: "Asia/Jakarta" }); // YYYY-MM-DD

      const [
        resKas, resKasBulan, resRecentTrx,
        resStok, resHutang,
        resPenjualan, resRetur, resPencairan,
        resPiutangOffline, resGaji,
      ] = await Promise.all([
        supabase.from("kas").select("tipe, nominal"),
        supabase.from("kas").select("tipe, nominal").gte("created_at", bulanMulai),
        supabase.from("kas").select("*").order("created_at", { ascending: false }).limit(8),
        supabase.from("bahan_baku").select("id, nama, stok, satuan, kategori")
          .or("aktif.eq.true,aktif.is.null").lte("stok", 5).order("stok"),
        supabase.from("hutang_supplier_bahan").select("nominal").eq("status", "Belum Lunas"),
        // Piutang Shopee: ambil total_nominal & total_ditarik
        supabase.from("penjualan_shopee").select("total_nominal, total_ditarik"),
        supabase.from("retur_shopee").select("nominal"),
        supabase.from("pencairan_shopee").select("nominal_cair"),
        // Piutang Offline
        supabase.from("piutang").select("nominal").eq("status", "Belum Lunas"),
        // Gaji hari ini (kalau tabel gaji_harian sudah ada)
        supabase.from("gaji_harian").select("nominal").eq("tanggal", hariIni),
      ]);

      // ── Kas ──
      const allKas = resKas.data || [];
      const saldo = allKas.reduce((acc, k) => k.tipe === "Masuk" ? acc + k.nominal : acc - k.nominal, 0);
      const bulanKas = resKasBulan.data || [];
      const pemasukan_bulan = bulanKas.filter(k => k.tipe === "Masuk").reduce((a, k) => a + k.nominal, 0);
      const pengeluaran_bulan = bulanKas.filter(k => k.tipe === "Keluar").reduce((a, k) => a + k.nominal, 0);
      setKas({ saldo, pemasukan_bulan, pengeluaran_bulan });

      setRecentTrx(resRecentTrx.data || []);
      setStokAlert(resStok.data || []);
      setHutangTotal((resHutang.data || []).reduce((a, h) => a + h.nominal, 0));

      // ── Piutang Shopee = total_nominal - total_ditarik - retur ──
      const totalNominal = (resPenjualan.data || []).reduce((a, p) => a + (p.total_nominal || 0), 0);
      const totalDitarik = (resPenjualan.data || []).reduce((a, p) => a + (p.total_ditarik || 0), 0);
      const totalRetur = (resRetur.data || []).reduce((a, r) => a + (r.nominal || 0), 0);
      setPiutangShopee(Math.max(totalNominal - totalDitarik - totalRetur, 0));

      // ── Piutang Offline ──
      setPiutangOffline((resPiutangOffline.data || []).reduce((a, p) => a + p.nominal, 0));

      // ── Gaji hari ini ──
      setGajiHariIni((resGaji.data || []).reduce((a, g) => a + g.nominal, 0));

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const stats = [
    { label: "Saldo Kas",          value: rupiahFmt(kas.saldo),              color: C.accent,  icon: "◈",  sub: "Total kas bersih" },
    { label: "Pemasukan Bulan Ini", value: rupiahFmt(kas.pemasukan_bulan),    color: C.green,   icon: "↑",  sub: "Bulan berjalan" },
    { label: "Pengeluaran Bulan",   value: rupiahFmt(kas.pengeluaran_bulan),  color: C.red,     icon: "↓",  sub: "Bulan berjalan" },
    { label: "Piutang Shopee",      value: rupiahFmt(piutangShopee),          color: C.yellow,  icon: "🛍️", sub: "Belum dicairkan" },
    { label: "Piutang Offline",     value: rupiahFmt(piutangOffline),         color: C.orange,  icon: "📝", sub: "Belum lunas" },
    { label: "Hutang Supplier",     value: rupiahFmt(hutangTotal),            color: C.blue,    icon: "⚠",  sub: "Belum lunas" },
    { label: "Gaji Hari Ini",       value: rupiahFmt(gajiHariIni),            color: "#c084fc", icon: "👥", sub: "Total dibayarkan" },
  ];

  const quickLinks = [
    { label: "Input Penjualan",     href: "/penjualan",       color: C.accent },
    { label: "Input Produksi",      href: "/produksi",        color: C.blue },
    { label: "Input Gaji",          href: "/penggajian",      color: "#c084fc" },
    { label: "Pembelian Bahan",     href: "/pembelian-bahan", color: C.green },
    { label: "Lihat Laporan",       href: "/laporan",         color: C.yellow },
  ];

  return (
    <Sidebar>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; }
      `}</style>

      <div style={{
        fontFamily: C.fontSans,
        background: C.bg,
        minHeight: "100vh",
        padding: "32px 28px",
        color: C.text,
      }}>

        {/* Header */}
        <div style={{ marginBottom: "28px" }}>
          <h1 style={{ margin: 0, fontFamily: C.fontDisplay, fontSize: "28px", color: "#f0eaff", fontWeight: 400 }}>
            Dashboard Azalea
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: "13px", color: C.muted, fontFamily: C.fontMono }}>
            {new Date().toLocaleDateString("id-ID", {
              weekday: "long", day: "2-digit", month: "long", year: "numeric",
              timeZone: "Asia/Jakarta",
            })}
          </p>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: C.muted }}>
            <div style={{ fontSize: "28px", marginBottom: "12px" }}>◈</div>
            <div style={{ fontFamily: C.fontMono, fontSize: "13px" }}>Memuat data...</div>
          </div>
        ) : (
          <>
            {/* Stats Grid */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: "14px",
              marginBottom: "28px",
            }}>
              {stats.map((s, i) => (
                <div key={i} style={{
                  background: C.card,
                  border: `1px solid ${C.border}`,
                  borderRadius: "14px",
                  padding: "18px 20px",
                  position: "relative",
                  overflow: "hidden",
                }}>
                  <div style={{
                    position: "absolute", top: 0, right: 0,
                    width: "70px", height: "70px",
                    background: s.color + "12",
                    borderRadius: "0 14px 0 80px",
                  }} />
                  <div style={{ fontSize: "18px", marginBottom: "8px" }}>{s.icon}</div>
                  <div style={{
                    fontSize: "10px", fontWeight: 600, color: C.muted,
                    letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px",
                  }}>
                    {s.label}
                  </div>
                  <div style={{
                    fontSize: "18px", fontWeight: 700, color: "#f0eaff",
                    fontFamily: C.fontDisplay,
                  }}>
                    {s.value}
                  </div>
                  <div style={{ fontSize: "11px", color: C.dim, marginTop: "4px" }}>{s.sub}</div>
                </div>
              ))}
            </div>

            {/* Two Column: Recent Trx + Stok Alert */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "20px" }}>

              {/* Transaksi Terakhir */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "20px" }}>
                <h3 style={{ margin: "0 0 16px", fontFamily: C.fontDisplay, fontSize: "16px", color: "#f0eaff", fontWeight: 400 }}>
                  Transaksi Terakhir
                </h3>
                {recentTrx.length === 0 ? (
                  <div style={{ color: C.dim, fontSize: "13px", textAlign: "center", padding: "24px 0" }}>Belum ada transaksi</div>
                ) : (
                  recentTrx.map(t => (
                    <div key={t.id} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "10px 0", borderBottom: `1px solid ${C.border}`,
                    }}>
                      <div>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: C.text }}>{t.kategori}</div>
                        <div style={{ fontSize: "11px", color: C.dim, fontFamily: C.fontMono }}>
                          {tanggalFmt(t.created_at)}
                          {t.keterangan && (
                            <span style={{ marginLeft: 6, color: C.muted }}>· {t.keterangan.slice(0, 30)}{t.keterangan.length > 30 ? "…" : ""}</span>
                          )}
                        </div>
                      </div>
                      <div style={{
                        fontWeight: 700, fontSize: "13px",
                        color: t.tipe === "Masuk" ? C.green : C.red,
                        fontFamily: C.fontMono,
                        whiteSpace: "nowrap",
                      }}>
                        {t.tipe === "Masuk" ? "+" : "−"}{rupiahFmt(t.nominal)}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Stok Hampir Habis */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "20px" }}>
                <h3 style={{ margin: "0 0 16px", fontFamily: C.fontDisplay, fontSize: "16px", color: "#f0eaff", fontWeight: 400 }}>
                  ⚠ Stok Hampir Habis
                </h3>
                {stokAlert.length === 0 ? (
                  <div style={{ color: C.green, fontSize: "13px", textAlign: "center", padding: "24px 0" }}>
                    Semua stok aman ✓
                  </div>
                ) : (
                  stokAlert.map(b => (
                    <div key={b.id} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "10px 0", borderBottom: `1px solid ${C.border}`,
                    }}>
                      <div>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: C.text }}>{b.nama}</div>
                        <div style={{ fontSize: "11px", color: C.dim }}>{b.kategori}</div>
                      </div>
                      <div style={{
                        fontWeight: 700, fontSize: "13px",
                        color: b.stok <= 0 ? C.red : C.yellow,
                        fontFamily: C.fontMono,
                      }}>
                        {b.stok} {b.satuan}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Quick Links */}
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {quickLinks.map(link => (
                <a key={link.href} href={link.href} style={{
                  padding: "10px 18px",
                  background: link.color + "15",
                  border: `1px solid ${link.color}40`,
                  borderRadius: "8px",
                  color: link.color,
                  fontWeight: 600,
                  fontSize: "13px",
                  textDecoration: "none",
                  fontFamily: C.fontSans,
                  transition: "all 0.15s",
                }}>
                  {link.label} →
                </a>
              ))}
            </div>
          </>
        )}
      </div>
    </Sidebar>
  );
}
