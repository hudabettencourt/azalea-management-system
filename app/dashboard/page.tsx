"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

type Kas = { id: number; tipe: string; kategori: string; nominal: number; keterangan: string; created_at: string };
type Zakat = { id: number; saldo_zakat: number; nominal_belanja: number; created_at: string };
type Produk = { id: number; nama_produk: string; jumlah_stok: number; harga_jual: number; harga_beli_avg: number };
type BahanBaku = { id: number; nama: string; stok: number; stok_minimum: number; satuan: string };
type Pembelian = { id: number; total_bayar: number; created_at: string };
type PembelianBahan = { id: number; total_bayar: number; created_at: string };

const T = {
  bg: "#100c16", bgCard: "rgba(255,255,255,0.02)", sidebar: "#130d1a",
  border: "rgba(232,115,138,0.12)", borderStrong: "rgba(232,115,138,0.28)",
  accent: "#e8738a", accentDim: "rgba(232,115,138,0.12)", accentGlow: "rgba(232,115,138,0.25)",
  text: "#f0e6e9", textMid: "#c0a8b4", textDim: "#7a6880",
  green: "#6fcf97", yellow: "#f2c94c", red: "#eb5757", blue: "#60a5fa",
  fontDisplay: "'DM Serif Display', Georgia, serif",
  fontMono: "'DM Mono', 'Fira Mono', monospace",
  fontSans: "'DM Sans', 'Segoe UI', sans-serif",
};

const rupiahFmt = (n: number) => `Rp ${(n || 0).toLocaleString("id-ID")}`;
const rupiahShort = (n: number) => {
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}jt`;
  if (n >= 1_000) return `Rp ${(n / 1_000).toFixed(0)}rb`;
  return `Rp ${n}`;
};

const BULAN = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Ags","Sep","Okt","Nov","Des"];

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.8s ease" }} />
    </div>
  );
}

export default function DashboardPage() {
  const [kas, setKas] = useState<Kas[]>([]);
  const [zakat, setZakat] = useState<Zakat[]>([]);
  const [produk, setProduk] = useState<Produk[]>([]);
  const [bahan, setBahan] = useState<BahanBaku[]>([]);
  const [pembelian, setPembelian] = useState<Pembelian[]>([]);
  const [pembelianBahan, setPembelianBahan] = useState<PembelianBahan[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeNav, setActiveNav] = useState("dashboard");

  const fetchData = useCallback(async () => {
    try {
      const [resKas, resZakat, resProduk, resBahan, resPembelian, resPembelianBahan] = await Promise.all([
        supabase.from("kas").select("*").order("created_at", { ascending: false }),
        supabase.from("data_zakat").select("*").order("created_at", { ascending: false }),
        supabase.from("stok_barang").select("*"),
        supabase.from("bahan_baku").select("*").or("aktif.eq.true,aktif.is.null"),
        supabase.from("pembelian").select("id,total_bayar,created_at").order("created_at", { ascending: true }),
        supabase.from("pembelian_bahan").select("id,total_bayar,created_at").order("created_at", { ascending: true }),
      ]);
      setKas(resKas.data || []);
      setZakat(resZakat.data || []);
      setProduk(resProduk.data || []);
      setBahan(resBahan.data || []);
      setPembelian(resPembelian.data || []);
      setPembelianBahan(resPembelianBahan.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Kalkulasi ──
  const totalKasMasuk = kas.filter(k => k.tipe === "Masuk").reduce((a, b) => a + b.nominal, 0);
  const totalKasKeluar = kas.filter(k => k.tipe === "Keluar").reduce((a, b) => a + b.nominal, 0);
  const saldoKas = totalKasMasuk - totalKasKeluar;
  const saldoZakat = zakat[0]?.saldo_zakat || 0;
  const totalNilaiStok = produk.reduce((a, b) => a + (b.jumlah_stok * (b.harga_beli_avg || 0)), 0);
  const totalPembelian = pembelian.reduce((a, b) => a + b.total_bayar, 0) + pembelianBahan.reduce((a, b) => a + b.total_bayar, 0);

  // Omzet per bulan dari kas masuk
  const omzetPerBulan = Array(12).fill(0);
  const belanjaPerBulan = Array(12).fill(0);
  kas.forEach(k => {
    const bln = new Date(k.created_at).getMonth();
    const thn = new Date(k.created_at).getFullYear();
    if (thn === new Date().getFullYear()) {
      if (k.tipe === "Masuk") omzetPerBulan[bln] += k.nominal;
      else belanjaPerBulan[bln] += k.nominal;
    }
  });

  const maxBar = Math.max(...omzetPerBulan, ...belanjaPerBulan, 1);
  const bulanSekarang = new Date().getMonth();
  const omzetBulanIni = omzetPerBulan[bulanSekarang];
  const belanjaBulanIni = belanjaPerBulan[bulanSekarang];
  const labaBulanIni = omzetBulanIni - belanjaBulanIni;

  // Stok rendah
  const stokRendah = produk.filter(p => p.jumlah_stok < 10);
  const bahanHabis = bahan.filter(b => b.stok <= 0);

  // Breakdown kas keluar per kategori
  const kasKeluarByKategori: Record<string, number> = {};
  kas.filter(k => k.tipe === "Keluar").forEach(k => {
    kasKeluarByKategori[k.kategori] = (kasKeluarByKategori[k.kategori] || 0) + k.nominal;
  });
  const kategoriEntries = Object.entries(kasKeluarByKategori).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxKategori = Math.max(...kategoriEntries.map(e => e[1]), 1);

  // 5 transaksi kas terakhir
  const kasRecent = kas.slice(0, 8);

  const navLinks = [
    { id: "dashboard", label: "Dashboard", icon: "◈", href: "/dashboard" },
    { id: "toko", label: "Operasional", icon: "◎", href: "/" },
    { id: "pembelian", label: "Pembelian Reseller", icon: "⊕", href: "/pembelian" },
    { id: "pembelian-bahan", label: "Bahan Produksi", icon: "🧪", href: "/pembelian-bahan" },
  ];

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.bg }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 12, filter: "drop-shadow(0 0 20px #e8738a88)" }}>◈</div>
        <div style={{ color: T.textDim, fontFamily: T.fontMono, fontSize: 12, letterSpacing: 2 }}>MEMUAT DASHBOARD...</div>
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        body { background: ${T.bg}; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: rgba(232,115,138,0.2); border-radius: 3px; }
        .nav-item:hover { background: rgba(232,115,138,0.06) !important; }
        .bar-item:hover { opacity: 0.8; }
      `}</style>

      <div style={{ display: "flex", minHeight: "100vh", fontFamily: T.fontSans, background: T.bg, color: T.text }}>

        {/* Sidebar */}
        <aside style={{ width: 220, flexShrink: 0, background: T.sidebar, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh" }}>
          <div style={{ padding: "24px 20px 18px", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg, #e8738a, #c94f68)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, boxShadow: `0 0 20px ${T.accentGlow}` }}>✿</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.text, fontFamily: T.fontDisplay }}>Azalea</div>
                <div style={{ fontSize: 9, color: T.accent, letterSpacing: 2, textTransform: "uppercase", fontFamily: T.fontMono }}>ERP System</div>
              </div>
            </div>
          </div>
          <nav style={{ flex: 1, padding: "16px 12px" }}>
            <div style={{ fontSize: 9, color: T.textDim, letterSpacing: 2, textTransform: "uppercase", fontFamily: T.fontMono, padding: "0 8px", marginBottom: 8 }}>Menu</div>
            {navLinks.map(nav => {
              const isActive = activeNav === nav.id;
              return (
                <a key={nav.id} href={nav.href} onClick={() => setActiveNav(nav.id)} className="nav-item" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, cursor: "pointer", marginBottom: 2, background: isActive ? T.accentDim : "transparent", borderLeft: isActive ? `2px solid ${T.accent}` : "2px solid transparent", transition: "all 0.15s", textDecoration: "none", color: "inherit" }}>
                  <span style={{ fontSize: 13 }}>{nav.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 400, color: isActive ? T.text : T.textDim }}>{nav.label}</span>
                </a>
              );
            })}
          </nav>
          <div style={{ padding: "16px 20px", borderTop: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 1, marginBottom: 4 }}>Saldo Kas</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: saldoKas >= 0 ? T.green : T.red, fontFamily: T.fontMono }}>{rupiahShort(saldoKas)}</div>
          </div>
        </aside>

        {/* Main */}
        <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <header style={{ height: 58, padding: "0 28px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${T.border}`, background: "rgba(16,12,22,0.9)", backdropFilter: "blur(8px)", position: "sticky", top: 0, zIndex: 100 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 1 }}>AZALEA /</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: T.text, fontFamily: T.fontDisplay, marginLeft: 4 }}>Dashboard</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {(stokRendah.length > 0 || bahanHabis.length > 0) && (
                <div style={{ background: "rgba(235,87,87,0.1)", border: "1px solid rgba(235,87,87,0.25)", borderRadius: 8, padding: "5px 12px", fontSize: 11, color: T.red, fontFamily: T.fontMono }}>
                  ⚠ {stokRendah.length + bahanHabis.length} item perlu perhatian
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: T.green, boxShadow: `0 0 6px ${T.green}` }} />
                <span style={{ fontSize: 10, color: T.green, fontFamily: T.fontMono }}>Live</span>
              </div>
            </div>
          </header>

          <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>

            {/* KPI Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24, animation: "fadeUp 0.3s ease" }}>
              {[
                { label: "Saldo Kas", nilai: rupiahShort(saldoKas), icon: "💰", accent: T.green, sub: `Masuk ${rupiahShort(totalKasMasuk)}` },
                { label: "Omzet Bulan Ini", nilai: rupiahShort(omzetBulanIni), icon: "📈", accent: T.accent, sub: `Laba ~${rupiahShort(labaBulanIni)}` },
                { label: "Nilai Stok", nilai: rupiahShort(totalNilaiStok), icon: "📦", accent: T.blue, sub: `${produk.length} produk` },
                { label: "Hutang Zakat", nilai: rupiahShort(saldoZakat), icon: "🌙", accent: T.yellow, sub: "tijarah 2.5%" },
              ].map(s => (
                <div key={s.label} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, padding: "18px 20px", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: 0, right: 0, width: 70, height: 70, background: `radial-gradient(circle at top right, ${s.accent}18, transparent 70%)`, borderRadius: "0 14px 0 100%" }} />
                  <div style={{ fontSize: 10, letterSpacing: 2, color: T.textDim, textTransform: "uppercase", fontFamily: T.fontMono, marginBottom: 8 }}>{s.icon} {s.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: T.text, fontFamily: T.fontDisplay, marginBottom: 4 }}>{s.nilai}</div>
                  <div style={{ fontSize: 11, color: s.accent, fontFamily: T.fontMono }}>{s.sub}</div>
                </div>
              ))}
            </div>

            {/* Charts Row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, marginBottom: 20 }}>

              {/* Bar Chart - Omzet vs Belanja */}
              <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, padding: "20px 24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.text, fontFamily: T.fontDisplay }}>Arus Kas {new Date().getFullYear()}</div>
                    <div style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono, marginTop: 2 }}>Masuk vs Keluar per bulan</div>
                  </div>
                  <div style={{ display: "flex", gap: 16, fontSize: 10, fontFamily: T.fontMono }}>
                    {[["Masuk", T.green], ["Keluar", T.red]].map(([k, c]) => (
                      <div key={k} style={{ display: "flex", alignItems: "center", gap: 5, color: T.textDim }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: c as string }} />{k}
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 160 }}>
                  {BULAN.map((bln, i) => {
                    const masuk = omzetPerBulan[i];
                    const keluar = belanjaPerBulan[i];
                    const hMasuk = maxBar > 0 ? (masuk / maxBar) * 140 : 0;
                    const hKeluar = maxBar > 0 ? (keluar / maxBar) * 140 : 0;
                    const isNow = i === bulanSekarang;
                    return (
                      <div key={bln} className="bar-item" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "default" }}
                        title={`${bln}: Masuk ${rupiahShort(masuk)}, Keluar ${rupiahShort(keluar)}`}>
                        <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 140 }}>
                          <div style={{ width: "44%", height: hMasuk, background: isNow ? T.green : "rgba(111,207,151,0.4)", borderRadius: "3px 3px 0 0", transition: "height 0.6s ease", minHeight: masuk > 0 ? 3 : 0 }} />
                          <div style={{ width: "44%", height: hKeluar, background: isNow ? T.red : "rgba(235,87,87,0.4)", borderRadius: "3px 3px 0 0", transition: "height 0.6s ease", minHeight: keluar > 0 ? 3 : 0 }} />
                        </div>
                        <div style={{ fontSize: 9, color: isNow ? T.accent : T.textDim, fontFamily: T.fontMono, fontWeight: isNow ? 700 : 400 }}>{bln}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Breakdown Pengeluaran */}
              <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, padding: "20px 24px" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.text, fontFamily: T.fontDisplay, marginBottom: 4 }}>Breakdown Pengeluaran</div>
                <div style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono, marginBottom: 20 }}>per kategori (semua waktu)</div>
                {kategoriEntries.length === 0 && <div style={{ color: T.textDim, fontSize: 12, fontFamily: T.fontMono }}>Belum ada data</div>}
                {kategoriEntries.map(([kat, nominal]) => (
                  <div key={kat} style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ fontSize: 12, color: T.textMid }}>{kat}</span>
                      <span style={{ fontSize: 12, color: T.accent, fontFamily: T.fontMono, fontWeight: 700 }}>{rupiahShort(nominal)}</span>
                    </div>
                    <MiniBar value={nominal} max={maxKategori} color={T.accent} />
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom Row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>

              {/* Stok Produk */}
              <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden" }}>
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: T.fontDisplay }}>📦 Stok Produk</span>
                  {stokRendah.length > 0 && <span style={{ fontSize: 10, color: T.red, fontFamily: T.fontMono, background: "rgba(235,87,87,0.1)", padding: "2px 8px", borderRadius: 4 }}>⚠ {stokRendah.length} rendah</span>}
                </div>
                <div style={{ maxHeight: 280, overflowY: "auto" }}>
                  {produk.map(p => {
                    const low = p.jumlah_stok < 10;
                    const maxStok = Math.max(...produk.map(x => x.jumlah_stok), 1);
                    return (
                      <div key={p.id} style={{ padding: "10px 20px", borderBottom: `1px solid ${T.border}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                          <span style={{ fontSize: 12, color: T.textMid }}>{p.nama_produk}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: low ? T.red : T.text, fontFamily: T.fontMono }}>{p.jumlah_stok}</span>
                        </div>
                        <MiniBar value={p.jumlah_stok} max={maxStok} color={low ? T.red : T.green} />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Bahan Habis / Rendah */}
              <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden" }}>
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: T.fontDisplay }}>🧪 Bahan Produksi</span>
                  {bahanHabis.length > 0 && <span style={{ fontSize: 10, color: T.red, fontFamily: T.fontMono, background: "rgba(235,87,87,0.1)", padding: "2px 8px", borderRadius: 4 }}>⚠ {bahanHabis.length} habis</span>}
                </div>
                <div style={{ maxHeight: 280, overflowY: "auto" }}>
                  {bahan.length === 0 && <div style={{ color: T.textDim, fontSize: 12, padding: "20px", fontFamily: T.fontMono }}>Belum ada bahan</div>}
                  {bahan.map(b => {
                    const habis = b.stok <= 0;
                    const maxStok = Math.max(...bahan.map(x => x.stok), 1);
                    return (
                      <div key={b.id} style={{ padding: "10px 20px", borderBottom: `1px solid ${T.border}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                          <span style={{ fontSize: 12, color: T.textMid }}>{b.nama}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: habis ? T.red : T.text, fontFamily: T.fontMono }}>{b.stok} {b.satuan}</span>
                        </div>
                        <MiniBar value={b.stok} max={maxStok} color={habis ? T.red : T.yellow} />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Transaksi Terakhir */}
              <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden" }}>
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}` }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: T.fontDisplay }}>💸 Transaksi Terakhir</span>
                </div>
                <div style={{ maxHeight: 280, overflowY: "auto" }}>
                  {kasRecent.map(k => (
                    <div key={k.id} style={{ padding: "10px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 12, color: T.textMid, fontWeight: 600 }}>{k.keterangan || k.kategori}</div>
                        <div style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, marginTop: 2 }}>
                          {new Date(k.created_at).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: k.tipe === "Masuk" ? T.green : T.red, fontFamily: T.fontMono }}>
                        {k.tipe === "Masuk" ? "+" : "-"}{rupiahShort(k.nominal)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </main>
      </div>
    </>
  );
}
