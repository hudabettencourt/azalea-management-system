"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import Sidebar from "@/components/Sidebar";
import { useTheme, LIGHT, DARK } from "@/context/ThemeContext";

type Order = {
  id: number;
  no_pesanan: string;
  tanggal_pesanan: string;
  no_resi: string | null;
  sku: string;
  qty: number;
  harga_satuan: number;
  total_pembayaran: number;
  status_shopee: string | null;
  nama_pembeli: string | null;
  jasa_kirim: string | null;
  nama_produk: string;
  nama_toko: string;
  toko_id: number;
};

type Toko = { id: number; nama: string };

const STATUS_TABS = [
  { key: "semua", label: "Semua" },
  { key: "UNPAID", label: "Belum Bayar" },
  { key: "READY_TO_SHIP", label: "Perlu Dikirim" },
  { key: "PROCESSED", label: "Diproses" },
  { key: "SHIPPED", label: "Dikirim" },
  { key: "COMPLETED", label: "Selesai" },
  { key: "CANCELLED", label: "Dibatalkan" },
  { key: "IN_CANCEL", label: "Batal Proses" },
];

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  UNPAID:         { bg: "rgba(251,191,36,0.15)",  color: "#fbbf24" },
  READY_TO_SHIP:  { bg: "rgba(251,146,60,0.15)",  color: "#fb923c" },
  PROCESSED:      { bg: "rgba(96,165,250,0.15)",  color: "#60a5fa" },
  SHIPPED:        { bg: "rgba(45,212,191,0.15)",  color: "#2dd4bf" },
  COMPLETED:      { bg: "rgba(74,222,128,0.15)",  color: "#4ade80" },
  CANCELLED:      { bg: "rgba(248,113,113,0.15)", color: "#f87171" },
  IN_CANCEL:      { bg: "rgba(248,113,113,0.10)", color: "#f87171" },
};

const rupiahFmt = (n: number) => `Rp ${Math.round(n || 0).toLocaleString("id-ID")}`;
const tanggalFmt = (s: string) => {
  if (!s) return "-";
  const d = new Date(s);
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
};

const PAGE_SIZE = 50;

export default function OrdersPage() {
  const { isDark } = useTheme();
  const C = isDark ? DARK : LIGHT;

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [tokoList, setTokoList] = useState<Toko[]>([]);
  const [filterStatus, setFilterStatus] = useState("semua");
  const [filterToko, setFilterToko] = useState("semua");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchToko = useCallback(async () => {
    const { data } = await supabase
      .from("toko_online")
      .select("id, nama")
      .eq("platform", "Shopee")
      .eq("aktif", true)
      .not("shopee_access_token", "is", null);
    setTokoList(data || []);
  }, []);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("detail_penjualan_online")
        .select(`
          id, no_pesanan, tanggal_pesanan, no_resi, sku, qty,
          harga_satuan, total_pembayaran, status_shopee,
          nama_pembeli, jasa_kirim,
          stok_barang(nama_produk),
          penjualan_online(toko_id, toko_online(id, nama))
        `, { count: "exact" })
        .order("tanggal_pesanan", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

      if (filterStatus !== "semua") query = query.eq("status_shopee", filterStatus);
      if (search.trim()) {
        query = query.or(`no_pesanan.ilike.%${search}%,nama_pembeli.ilike.%${search}%,no_resi.ilike.%${search}%`);
      }

      const { data, count, error } = await query;
      if (error) throw error;

      const mapped: Order[] = (data || []).map((r: any) => ({
        id: r.id,
        no_pesanan: r.no_pesanan,
        tanggal_pesanan: r.tanggal_pesanan,
        no_resi: r.no_resi,
        sku: r.sku,
        qty: r.qty,
        harga_satuan: r.harga_satuan,
        total_pembayaran: r.total_pembayaran,
        status_shopee: r.status_shopee,
        nama_pembeli: r.nama_pembeli,
        jasa_kirim: r.jasa_kirim,
        nama_produk: r.stok_barang?.nama_produk || r.sku,
        nama_toko: r.penjualan_online?.toko_online?.nama || "-",
        toko_id: r.penjualan_online?.toko_online?.id || 0,
      }));

      // Filter by toko after mapping
      const filtered = filterToko !== "semua"
        ? mapped.filter(o => String(o.toko_id) === filterToko)
        : mapped;

      setOrders(filtered);
      setTotalCount(count || 0);
    } catch (err: any) {
      showToast("Gagal load data: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterToko, search, page]);

  useEffect(() => { fetchToko(); }, [fetchToko]);
  useEffect(() => { setPage(1); }, [filterStatus, filterToko, search]);
  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const handleSyncAll = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/shopee/sync-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        const total = data.results?.reduce((a: number, r: any) => a + (r.new || 0), 0) || 0;
        showToast(`✓ ${total} pesanan baru disync dari semua toko`);
        fetchOrders();
      } else {
        showToast("Gagal sync: " + data.error, "error");
      }
    } catch (err: any) {
      showToast("Gagal sync: " + err.message, "error");
    } finally {
      setSyncing(false);
    }
  };

  const handlePrint = (orderList: Order[]) => {
    const html = generatePrintHTML(orderList);
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 300);
  };

  const generatePrintHTML = (orderList: Order[]) => {
    const rows = orderList.map(o => `
      <tr>
        <td>${o.no_pesanan}</td>
        <td>${tanggalFmt(o.tanggal_pesanan)}</td>
        <td>${o.nama_pembeli || "-"}</td>
        <td>${o.nama_produk}</td>
        <td style="text-align:center">${o.qty}</td>
        <td style="text-align:right">${rupiahFmt(o.total_pembayaran)}</td>
        <td>${o.jasa_kirim || "-"}</td>
        <td>${o.no_resi || "-"}</td>
        <td>${o.nama_toko}</td>
        <td><span style="padding:2px 8px;border-radius:4px;font-size:10px;background:${STATUS_COLORS[o.status_shopee || ""]?.bg || "#eee"};color:${STATUS_COLORS[o.status_shopee || ""]?.color || "#666"}">${o.status_shopee || "-"}</span></td>
      </tr>
    `).join("");

    return `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Pesanan Shopee — Azalea</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 11px; margin: 16px; }
      h2 { font-size: 14px; margin-bottom: 4px; }
      p { font-size: 11px; color: #666; margin-bottom: 12px; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #f3f4f6; padding: 6px 8px; text-align: left; font-size: 10px; border: 1px solid #e5e7eb; }
      td { padding: 5px 8px; border: 1px solid #e5e7eb; vertical-align: top; }
      tr:nth-child(even) { background: #f9fafb; }
      @media print { @page { margin: 1cm; } }
    </style></head><body>
    <h2>Laporan Pesanan Shopee — Azalea Management</h2>
    <p>Dicetak: ${new Date().toLocaleString("id-ID")} · ${orderList.length} pesanan</p>
    <table>
      <thead><tr>
        <th>No. Pesanan</th><th>Tanggal</th><th>Pembeli</th><th>Produk</th>
        <th>Qty</th><th>Total</th><th>Jasa Kirim</th><th>No. Resi</th>
        <th>Toko</th><th>Status</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </body></html>`;
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const statusCounts = STATUS_TABS.reduce((acc, tab) => {
    if (tab.key === "semua") return acc;
    // We'll show counts from what's loaded
    return acc;
  }, {} as Record<string, number>);

  const inputStyle: React.CSSProperties = {
    padding: "8px 12px",
    background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
    border: `1.5px solid ${C.border}`,
    borderRadius: 8,
    color: C.text,
    fontFamily: C.fontSans,
    fontSize: 13,
    outline: "none",
  };

  return (
    <Sidebar pageTitle="Pesanan Shopee" pageSubtitle="Order management semua toko">
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .order-row:hover { background: ${isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)"} !important; }
        .tab-btn:hover { opacity: 0.8; }
        .action-btn:hover { opacity: 0.8; }
        @media print { .no-print { display: none !important; } }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          padding: "12px 20px", borderRadius: 10,
          background: toast.type === "success" ? C.green : C.red,
          color: "#fff", fontSize: 13, fontWeight: 700,
          boxShadow: C.shadowMd, animation: "fadeUp 0.2s ease",
        }}>{toast.msg}</div>
      )}

      <div style={{ padding: "24px 28px", animation: "fadeUp 0.3s ease" }}>
        {/* Header */}
        <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>Pesanan Shopee</h1>
            <p style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono, margin: "4px 0 0" }}>
              {tokoList.length} toko terhubung · total {totalCount.toLocaleString("id-ID")} pesanan
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => handlePrint(orders)}
              style={{ ...inputStyle, cursor: "pointer", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}
            >
              🖨️ Print
            </button>
            <button
              onClick={handleSyncAll}
              disabled={syncing}
              style={{
                padding: "8px 16px",
                background: `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`,
                border: "none", color: "#fff", borderRadius: 8,
                cursor: "pointer", fontSize: 13, fontWeight: 700,
                fontFamily: C.fontSans, opacity: syncing ? 0.7 : 1,
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              {syncing ? "⏳ Syncing..." : "↻ Sync Semua"}
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="no-print" style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          {/* Search */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari no. pesanan, pembeli, resi..."
            style={{ ...inputStyle, width: 280 }}
          />
          {/* Filter Toko */}
          <select
            value={filterToko}
            onChange={e => setFilterToko(e.target.value)}
            style={{ ...inputStyle, cursor: "pointer" }}
          >
            <option value="semua">Semua Toko</option>
            {tokoList.map(t => <option key={t.id} value={String(t.id)}>{t.nama}</option>)}
          </select>
        </div>

        {/* Status Tabs */}
        <div className="no-print" style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
          {STATUS_TABS.map(tab => {
            const active = filterStatus === tab.key;
            const sc = STATUS_COLORS[tab.key];
            return (
              <button
                key={tab.key}
                className="tab-btn"
                onClick={() => setFilterStatus(tab.key)}
                style={{
                  padding: "6px 14px",
                  background: active ? (sc?.bg || `${C.accent}20`) : "transparent",
                  border: `1.5px solid ${active ? (sc?.color || C.accent) : C.border}`,
                  borderRadius: 20,
                  color: active ? (sc?.color || C.accent) : C.muted,
                  cursor: "pointer", fontSize: 12, fontWeight: active ? 700 : 500,
                  fontFamily: C.fontSans, transition: "all 0.15s",
                }}
              >{tab.label}</button>
            );
          })}
        </div>

        {/* Table */}
        <div style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: C.shadow,
        }}>
          {/* Table Header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 100px 130px 140px 60px 110px 130px 130px",
            padding: "10px 16px",
            background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)",
            borderBottom: `1px solid ${C.border}`,
            fontSize: 10, fontWeight: 700, color: C.muted,
            fontFamily: C.fontMono, letterSpacing: 1,
            textTransform: "uppercase",
          }}>
            <span>Pembeli / Pesanan</span>
            <span>Tanggal</span>
            <span>Produk</span>
            <span>Toko</span>
            <span style={{ textAlign: "center" }}>Qty</span>
            <span style={{ textAlign: "right" }}>Total</span>
            <span>Jasa Kirim</span>
            <span>Status</span>
          </div>

          {/* Rows */}
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: C.fontMono }}>
              Memuat...
            </div>
          ) : orders.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: C.fontMono }}>
              Tidak ada pesanan
            </div>
          ) : orders.map(order => {
            const sc = STATUS_COLORS[order.status_shopee || ""];
            return (
              <div
                key={order.id}
                className="order-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 100px 130px 140px 60px 110px 130px 130px",
                  padding: "12px 16px",
                  borderBottom: `1px solid ${C.border}`,
                  alignItems: "center",
                  transition: "background 0.1s",
                }}
              >
                {/* Pembeli */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                    {order.nama_pembeli || "—"}
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, marginTop: 2 }}>
                    {order.no_pesanan}
                  </div>
                  {order.no_resi && (
                    <div style={{ fontSize: 10, color: C.accent, fontFamily: C.fontMono, marginTop: 1 }}>
                      📦 {order.no_resi}
                    </div>
                  )}
                </div>

                {/* Tanggal */}
                <div style={{ fontSize: 12, color: C.textMid, fontFamily: C.fontMono }}>
                  {tanggalFmt(order.tanggal_pesanan)}
                </div>

                {/* Produk */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{order.nama_produk}</div>
                  <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono }}>{order.sku}</div>
                </div>

                {/* Toko */}
                <div style={{ fontSize: 12, color: C.textMid }}>{order.nama_toko}</div>

                {/* Qty */}
                <div style={{ textAlign: "center", fontSize: 13, fontWeight: 700, color: C.text, fontFamily: C.fontMono }}>
                  {order.qty}
                </div>

                {/* Total */}
                <div style={{ textAlign: "right", fontSize: 12, fontWeight: 700, color: C.green, fontFamily: C.fontMono }}>
                  {rupiahFmt(order.total_pembayaran)}
                </div>

                {/* Jasa Kirim */}
                <div style={{ fontSize: 11, color: C.textMid }}>{order.jasa_kirim || "—"}</div>

                {/* Status */}
                <div>
                  <span style={{
                    fontSize: 10, padding: "3px 8px", borderRadius: 12,
                    background: sc?.bg || `${C.border}`,
                    color: sc?.color || C.muted,
                    fontWeight: 700, fontFamily: C.fontMono,
                  }}>
                    {order.status_shopee || "—"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="no-print" style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 20 }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{ ...inputStyle, cursor: page === 1 ? "not-allowed" : "pointer", opacity: page === 1 ? 0.4 : 1 }}
            >← Prev</button>
            <span style={{ padding: "8px 16px", fontFamily: C.fontMono, fontSize: 12, color: C.muted }}>
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              style={{ ...inputStyle, cursor: page === totalPages ? "not-allowed" : "pointer", opacity: page === totalPages ? 0.4 : 1 }}
            >Next →</button>
          </div>
        )}
      </div>
    </Sidebar>
  );
}
