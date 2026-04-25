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

export default function DashboardPage() {
  const [kas, setKas] = useState<StatKas>({ saldo: 0, pemasukan_bulan: 0, pengeluaran_bulan: 0 });
  const [recentTrx, setRecentTrx] = useState<RecentTrx[]>([]);
  const [stokAlert, setStokAlert] = useState<StokAlert[]>([]);
  const [hutangTotal, setHutangTotal] = useState(0);
  const [totalBahan, setTotalBahan] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const now = new Date();
      const bulanMulai = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [resKas, resKasBulan, resRecentTrx, resStok, resHutang, resBahan] = await Promise.all([
        supabase.from("kas").select("tipe, nominal"),
        supabase.from("kas").select("tipe, nominal").gte("created_at", bulanMulai),
        supabase.from("kas").select("*").order("created_at", { ascending: false }).limit(8),
        supabase.from("bahan_baku").select("id, nama, stok, satuan, kategori").or("aktif.eq.true,aktif.is.null").lte("stok", 5).order("stok"),
        supabase.from("hutang_supplier_bahan").select("nominal").eq("status", "Belum Lunas"),
        supabase.from("bahan_baku").select("id", { count: "exact" }).or("aktif.eq.true,aktif.is.null"),
      ]);

      const allKas = resKas.data || [];
      const saldo = allKas.reduce((acc, k) => k.tipe === "Masuk" ? acc + k.nominal : acc - k.nominal, 0);

      const bulanKas = resKasBulan.data || [];
      const pemasukan_bulan = bulanKas.filter(k => k.tipe === "Masuk").reduce((a, k) => a + k.nominal, 0);
      const pengeluaran_bulan = bulanKas.filter(k => k.tipe === "Keluar").reduce((a, k) => a + k.nominal, 0);

      setKas({ saldo, pemasukan_bulan, pengeluaran_bulan });
      setRecentTrx(resRecentTrx.data || []);
      setStokAlert(resStok.data || []);
      setHutangTotal((resHutang.data || []).reduce((a, h) => a + h.nominal, 0));
      setTotalBahan(resBahan.count || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const menuItems = [
    { label: "Dashboard", href: "/dashboard", icon: "◈" },
    { label: "Pembelian Reseller", href: "/pembelian", icon: "🛍" },
    { label: "Pembelian Bahan", href: "/pembelian-bahan", icon: "🧪" },
    { label: "Produksi", href: "/produksi", icon: "⚙️" },
    { label: "Admin", href: "/admin", icon: "🔐", adminOnly: true },
  ];

  return (
    <Sidebar>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; }
      `}</style>

      <div style={{
        fontFamily: "'DM Sans', sans-serif",
        background: "#100c16",
        minHeight: "100vh",
        padding: "32px 28px",
        color: "#e2d9f3",
      }}>
 {/* Header */}
        <div style={{ marginBottom: "32px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <h1 style={{
              margin: 0, fontFamily: "'DM Serif Display', serif",
              fontSize: "28px", color: "#f0eaff",
              fontWeight: 400,
            }}>
              Dashboard Azalea
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#7c6d8a", fontFamily: "'DM Mono', monospace" }}>
              {new Date().toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
            </p>
          </div>
          <a href="/" style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 16px",
            background: "#a78bfa15",
            border: "1px solid #a78bfa40",
            borderRadius: "8px",
            color: "#a78bfa",
            fontWeight: 600,
            fontSize: "13px",
            textDecoration: "none",
            fontFamily: "'DM Sans', sans-serif",
            whiteSpace: "nowrap",
          }}>
            🏠 Home
          </a>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#7c6d8a" }}>
            <div style={{ fontSize: "28px", marginBottom: "12px" }}>◈</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "13px" }}>Memuat data...</div>
          </div>
        ) : (
          <>
            {/* Stats Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "28px" }}>
              {[
                { label: "Saldo Kas", value: rupiahFmt(kas.saldo), color: "#a78bfa", icon: "◈", sub: "Total kas bersih" },
                { label: "Pemasukan Bulan Ini", value: rupiahFmt(kas.pemasukan_bulan), color: "#34d399", icon: "↑", sub: "Bulan berjalan" },
                { label: "Pengeluaran Bulan Ini", value: rupiahFmt(kas.pengeluaran_bulan), color: "#f87171", icon: "↓", sub: "Bulan berjalan" },
                { label: "Hutang Supplier", value: rupiahFmt(hutangTotal), color: "#fbbf24", icon: "⚠", sub: "Belum lunas" },
                { label: "Total Bahan", value: `${totalBahan} item`, color: "#60a5fa", icon: "⬡", sub: "Aktif di master" },
              ].map((s, i) => (
                <div key={i} style={{
                  background: "#1a1425",
                  border: "1px solid #2a1f3d",
                  borderRadius: "14px",
                  padding: "20px",
                  position: "relative",
                  overflow: "hidden",
                }}>
                  <div style={{
                    position: "absolute", top: "0", right: "0",
                    width: "80px", height: "80px",
                    background: s.color + "10",
                    borderRadius: "0 14px 0 80px",
                  }} />
                  <div style={{ fontSize: "18px", marginBottom: "8px", color: s.color }}>{s.icon}</div>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: "#7c6d8a", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>
                    {s.label}
                  </div>
                  <div style={{
                    fontSize: "20px", fontWeight: 700, color: "#f0eaff",
                    fontFamily: "'DM Serif Display', serif", letterSpacing: "-0.02em",
                  }}>
                    {s.value}
                  </div>
                  <div style={{ fontSize: "11px", color: "#5a4f6a", marginTop: "4px" }}>{s.sub}</div>
                </div>
              ))}
            </div>

            {/* Two Column: Recent Trx + Stok Alert */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
              {/* Transaksi Terakhir */}
              <div style={{ background: "#1a1425", border: "1px solid #2a1f3d", borderRadius: "14px", padding: "20px" }}>
                <h3 style={{ margin: "0 0 16px", fontFamily: "'DM Serif Display', serif", fontSize: "16px", color: "#f0eaff", fontWeight: 400 }}>
                  Transaksi Terakhir
                </h3>
                {recentTrx.length === 0 ? (
                  <div style={{ color: "#5a4f6a", fontSize: "13px", textAlign: "center", padding: "24px 0" }}>Belum ada transaksi</div>
                ) : (
                  recentTrx.map(t => (
                    <div key={t.id} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "10px 0", borderBottom: "1px solid #2a1f3d",
                    }}>
                      <div>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "#e2d9f3" }}>{t.kategori}</div>
                        <div style={{ fontSize: "11px", color: "#5a4f6a", fontFamily: "'DM Mono', monospace" }}>
                          {tanggalFmt(t.created_at)}
                        </div>
                      </div>
                      <div style={{
                        fontWeight: 700, fontSize: "13px",
                        color: t.tipe === "Masuk" ? "#34d399" : "#f87171",
                        fontFamily: "'DM Mono', monospace",
                      }}>
                        {t.tipe === "Masuk" ? "+" : "−"}{rupiahFmt(t.nominal)}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Stok Hampir Habis */}
              <div style={{ background: "#1a1425", border: "1px solid #2a1f3d", borderRadius: "14px", padding: "20px" }}>
                <h3 style={{ margin: "0 0 16px", fontFamily: "'DM Serif Display', serif", fontSize: "16px", color: "#f0eaff", fontWeight: 400 }}>
                  ⚠ Stok Hampir Habis
                </h3>
                {stokAlert.length === 0 ? (
                  <div style={{ color: "#34d399", fontSize: "13px", textAlign: "center", padding: "24px 0" }}>
                    Semua stok aman ✓
                  </div>
                ) : (
                  stokAlert.map(b => (
                    <div key={b.id} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "10px 0", borderBottom: "1px solid #2a1f3d",
                    }}>
                      <div>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "#e2d9f3" }}>{b.nama}</div>
                        <div style={{ fontSize: "11px", color: "#5a4f6a" }}>{b.kategori}</div>
                      </div>
                      <div style={{
                        fontWeight: 700, fontSize: "13px",
                        color: b.stok <= 0 ? "#f87171" : "#fbbf24",
                        fontFamily: "'DM Mono', monospace",
                      }}>
                        {b.stok} {b.satuan}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Quick Links */}
            <div style={{ marginTop: "20px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
              {[
                { label: "Input Pembelian Bahan", href: "/pembelian-bahan", color: "#a78bfa" },
                { label: "Input Pembelian Reseller", href: "/pembelian", color: "#34d399" },
                { label: "Input Produksi", href: "/produksi", color: "#60a5fa" },
              ].map(link => (
                <a key={link.href} href={link.href} style={{
                  padding: "10px 20px",
                  background: link.color + "15",
                  border: `1px solid ${link.color}40`,
                  borderRadius: "8px",
                  color: link.color,
                  fontWeight: 600,
                  fontSize: "13px",
                  textDecoration: "none",
                  fontFamily: "'DM Sans', sans-serif",
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
