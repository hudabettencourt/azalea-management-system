"use client";

// /app/shopee/pelanggan/page.tsx
// Pelanggan Shopee — list buyer dari detail_penjualan_online

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import { useTheme, LIGHT, DARK } from "@/context/ThemeContext";
import { rupiah, rupiahShort, tanggalFmt } from "@/lib/format";

type Pelanggan = {
  username: string;
  total_pesanan: number;
  total_belanja: number;
  last_order: string;
  toko_list: string[];
};

type DetailPesanan = {
  no_pesanan: string;
  tanggal_pesanan: string;
  nama_produk: string;
  qty: number;
  total_pembayaran: number;
  status_shopee: string;
  nama_toko: string;
};

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: "#22c55e", SHIPPED: "#2dd4bf", TO_CONFIRM_RECEIVE: "#60a5fa",
  PROCESSED: "#a78bfa", CANCELLED: "#f87171", IN_CANCEL: "#f87171",
};

export default function PelangganShopeePage() {
  const { isDark } = useTheme();
  const C = isDark ? DARK : LIGHT;

  const [pelangganList, setPelangganList] = useState<Pelanggan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"total_belanja" | "total_pesanan" | "last_order">("total_belanja");
  const [expandedUsername, setExpandedUsername] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, DetailPesanan[]>>({});
  const [loadingDetail, setLoadingDetail] = useState(false);

  const inputStyle: React.CSSProperties = {
    padding: "8px 12px",
    background: isDark ? "rgba(255,255,255,0.05)" : "#f8fffe",
    border: `1.5px solid ${C.border}`, borderRadius: 10,
    color: C.text, fontFamily: C.fontSans, fontSize: 13,
    outline: "none", boxSizing: "border-box" as const,
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: tokoData } = await supabase.from("toko_online").select("id, nama").eq("platform", "Shopee").eq("aktif", true);
      const tokoMap = new Map((tokoData || []).map((t: any) => [t.id, t.nama]));

      const { data: penjualanData } = await supabase.from("penjualan_online").select("id, toko_id");
      const penjualanTokoMap = new Map((penjualanData || []).map((p: any) => [p.id, p.toko_id]));

      const { data: detailData } = await supabase
        .from("detail_penjualan_online")
        .select("nama_pembeli, no_pesanan, total_pembayaran, tanggal_pesanan, status_shopee, penjualan_online_id")
        .not("nama_pembeli", "is", null)
        .not("status_shopee", "in", '("CANCELLED","IN_CANCEL")')
        .order("tanggal_pesanan", { ascending: false });

      const map = new Map<string, { total_pesanan: number; total_belanja: number; last_order: string; toko_set: Set<string> }>();
      const seenPesanan = new Set<string>();

      for (const d of detailData || []) {
        const username = d.nama_pembeli;
        if (!username) continue;
        if (seenPesanan.has(d.no_pesanan)) continue;
        seenPesanan.add(d.no_pesanan);

        const tokoId = penjualanTokoMap.get(d.penjualan_online_id);
        const namaToko = tokoMap.get(tokoId) as string || "-";

        if (!map.has(username)) {
          map.set(username, { total_pesanan: 0, total_belanja: 0, last_order: d.tanggal_pesanan, toko_set: new Set() });
        }
        const entry = map.get(username)!;
        entry.total_pesanan++;
        entry.total_belanja += d.total_pembayaran || 0;
        if (d.tanggal_pesanan > entry.last_order) entry.last_order = d.tanggal_pesanan;
        entry.toko_set.add(namaToko);
      }

      const result: Pelanggan[] = Array.from(map.entries()).map(([username, v]) => ({
        username,
        total_pesanan: v.total_pesanan,
        total_belanja: v.total_belanja,
        last_order: v.last_order,
        toko_list: Array.from(v.toko_set),
      }));

      setPelangganList(result);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const loadDetail = async (username: string) => {
    if (detailCache[username]) return;
    setLoadingDetail(true);
    try {
      const { data: tokoData } = await supabase.from("toko_online").select("id, nama");
      const tokoMap = new Map((tokoData || []).map((t: any) => [t.id, t.nama]));
      const { data: penjualanData } = await supabase.from("penjualan_online").select("id, toko_id");
      const penjualanTokoMap = new Map((penjualanData || []).map((p: any) => [p.id, p.toko_id]));

      const { data } = await supabase
        .from("detail_penjualan_online")
        .select("no_pesanan, tanggal_pesanan, qty, total_pembayaran, status_shopee, penjualan_online_id, stok_barang(nama_produk)")
        .eq("nama_pembeli", username)
        .order("tanggal_pesanan", { ascending: false })
        .limit(20);

      const details: DetailPesanan[] = (data || []).map((d: any) => ({
        no_pesanan: d.no_pesanan,
        tanggal_pesanan: d.tanggal_pesanan,
        nama_produk: d.stok_barang?.nama_produk || d.no_pesanan,
        qty: d.qty,
        total_pembayaran: d.total_pembayaran,
        status_shopee: d.status_shopee,
        nama_toko: tokoMap.get(penjualanTokoMap.get(d.penjualan_online_id)) as string || "-",
      }));

      setDetailCache(prev => ({ ...prev, [username]: details }));
    } finally { setLoadingDetail(false); }
  };

  const toggleExpand = async (username: string) => {
    if (expandedUsername === username) { setExpandedUsername(null); return; }
    setExpandedUsername(username);
    await loadDetail(username);
  };

  const filtered = pelangganList
    .filter(p => search === "" || p.username.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "total_belanja") return b.total_belanja - a.total_belanja;
      if (sortBy === "total_pesanan") return b.total_pesanan - a.total_pesanan;
      return b.last_order.localeCompare(a.last_order);
    });

  const totalPelanggan = pelangganList.length;
  const totalOmzet = pelangganList.reduce((a, p) => a + p.total_belanja, 0);
  const repeatBuyer = pelangganList.filter(p => p.total_pesanan > 1).length;

  return (
    <AppShell>
      <style>{`@keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      <div style={{ padding: "24px 28px", animation: "fadeUp 0.3s ease" }}>

        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>Pelanggan Shopee</h1>
          <p style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono, margin: "4px 0 0" }}>
            Buyer dari semua toko Shopee — klik untuk lihat riwayat pesanan
          </p>
        </div>

        {/* Summary */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Total Pelanggan", value: totalPelanggan, color: C.accent, icon: "👥", sub: "unique buyer" },
            { label: "Total Omzet", value: rupiahShort(totalOmzet), color: C.green, icon: "💰", sub: "dari semua pesanan" },
            { label: "Repeat Buyer", value: repeatBuyer, color: C.blue, icon: "🔄", sub: "beli lebih dari 1x" },
          ].map((s, i) => (
            <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px", boxShadow: C.shadow }}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>{s.icon}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: s.color, fontFamily: C.fontMono }}>{s.value}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Filter & Sort */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Cari username..." style={{ ...inputStyle, width: 240 }} />
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { key: "total_belanja", label: "💰 Terbesar" },
              { key: "total_pesanan", label: "📦 Terbanyak" },
              { key: "last_order", label: "🕐 Terbaru" },
            ].map(s => (
              <button key={s.key} onClick={() => setSortBy(s.key as any)} style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${sortBy === s.key ? C.accent : C.border}`, background: sortBy === s.key ? `${C.accent}15` : "transparent", color: sortBy === s.key ? C.accent : C.muted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                {s.label}
              </button>
            ))}
          </div>
          <div style={{ marginLeft: "auto", fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>{filtered.length} pelanggan</div>
        </div>

        {/* List */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", boxShadow: C.shadow }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 0.8fr 1.2fr 1fr 1fr", gap: 8, padding: "10px 20px", background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 700, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, textTransform: "uppercase" as const }}>
            <span>Username</span><span>Pesanan</span><span>Total Belanja</span><span>Terakhir Order</span><span>Toko</span>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: C.fontMono }}>Memuat...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 60, textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>👥</div>
              <div style={{ fontSize: 14, color: C.muted }}>Belum ada data pelanggan</div>
            </div>
          ) : filtered.map(p => (
            <div key={p.username}>
              <div onClick={() => toggleExpand(p.username)} style={{ display: "grid", gridTemplateColumns: "2fr 0.8fr 1.2fr 1fr 1fr", gap: 8, padding: "12px 20px", borderBottom: `1px solid ${expandedUsername === p.username ? C.accent + "30" : C.border}`, alignItems: "center", cursor: "pointer", transition: "background 0.1s", background: expandedUsername === p.username ? `${C.accent}05` : "transparent" }}
                onMouseEnter={e => { if (expandedUsername !== p.username) (e.currentTarget as HTMLElement).style.background = isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)"; }}
                onMouseLeave={e => { if (expandedUsername !== p.username) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: `${C.accent}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: C.accent, flexShrink: 0 }}>
                    {p.username[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{p.username}</div>
                    {p.total_pesanan > 1 && <span style={{ fontSize: 10, background: `${C.blue}15`, color: C.blue, padding: "1px 6px", borderRadius: 4, fontFamily: C.fontMono }}>repeat buyer</span>}
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: C.fontMono }}>{p.total_pesanan}x</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.green, fontFamily: C.fontMono }}>{rupiahShort(p.total_belanja)}</div>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{tanggalFmt(p.last_order)}</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
                  {p.toko_list.slice(0, 2).map(t => (
                    <span key={t} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: `${C.accent}10`, color: C.accent }}>{t}</span>
                  ))}
                  {p.toko_list.length > 2 && <span style={{ fontSize: 10, color: C.muted }}>+{p.toko_list.length - 2}</span>}
                </div>
              </div>

              {expandedUsername === p.username && (
                <div style={{ background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", borderBottom: `1px solid ${C.border}`, padding: "12px 20px 16px 60px" }}>
                  {loadingDetail && !detailCache[p.username] ? (
                    <div style={{ color: C.muted, fontSize: 12, fontFamily: C.fontMono }}>Memuat riwayat...</div>
                  ) : (detailCache[p.username] || []).length === 0 ? (
                    <div style={{ color: C.muted, fontSize: 12, fontFamily: C.fontMono }}>Tidak ada data</div>
                  ) : (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 8, textTransform: "uppercase" as const }}>Riwayat Pesanan (20 terakhir)</div>
                      {detailCache[p.username].map((d, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{d.nama_produk} <span style={{ color: C.muted, fontWeight: 400 }}>×{d.qty}</span></div>
                            <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono }}>{d.no_pesanan} · {tanggalFmt(d.tanggal_pesanan)} · {d.nama_toko}</div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: C.fontMono }}>{rupiah(d.total_pembayaran)}</span>
                            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: `${STATUS_COLORS[d.status_shopee] || C.muted}20`, color: STATUS_COLORS[d.status_shopee] || C.muted, fontFamily: C.fontMono, fontWeight: 700 }}>{d.status_shopee}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
