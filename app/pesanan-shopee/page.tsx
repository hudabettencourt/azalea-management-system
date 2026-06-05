"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
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
  UNPAID:        { bg: "rgba(251,191,36,0.15)",  color: "#fbbf24" },
  READY_TO_SHIP: { bg: "rgba(251,146,60,0.15)",  color: "#fb923c" },
  PROCESSED:     { bg: "rgba(96,165,250,0.15)",  color: "#60a5fa" },
  SHIPPED:       { bg: "rgba(45,212,191,0.15)",  color: "#2dd4bf" },
  COMPLETED:     { bg: "rgba(74,222,128,0.15)",  color: "#4ade80" },
  CANCELLED:     { bg: "rgba(248,113,113,0.15)", color: "#f87171" },
  IN_CANCEL:     { bg: "rgba(248,113,113,0.10)", color: "#f87171" },
};

const SEARCH_FIELDS = [
  { key: "no_pesanan",   label: "No. Pesanan" },
  { key: "no_resi",      label: "No. Resi" },
  { key: "nama_pembeli", label: "Nama Pembeli" },
];

const rupiahFmt = (n: number) => `Rp ${Math.round(n || 0).toLocaleString("id-ID")}`;
const tanggalFmt = (s: string) => {
  if (!s) return "-";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
};

const PAGE_SIZE = 50;

function PillFilterRow({ label, options, selected, onSelect, C }: {
  label: string;
  options: { key: string; label: string }[];
  selected: string;
  onSelect: (v: string) => void;
  C: any;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, fontFamily: C.fontMono, minWidth: 80 }}>{label}</span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {options.map(opt => {
          const active = selected === opt.key;
          return (
            <button key={opt.key} onClick={() => onSelect(opt.key)} style={{
              padding: "4px 12px",
              background: active ? `${C.accent}20` : "transparent",
              border: `1.5px solid ${active ? C.accent : C.border}`,
              borderRadius: 20, color: active ? C.accent : C.muted,
              cursor: "pointer", fontSize: 12, fontWeight: active ? 700 : 500,
              fontFamily: C.fontSans, transition: "all 0.15s",
            }}>{opt.label}</button>
          );
        })}
      </div>
    </div>
  );
}

export default function OrdersPage() {
  const { isDark } = useTheme();
  const C = isDark ? DARK : LIGHT;

  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [tokoList, setTokoList] = useState<Toko[]>([]);
  const [jasaKirimList, setJasaKirimList] = useState<string[]>([]);

  const [filterStatus, setFilterStatus] = useState("semua");
  const [filterToko, setFilterToko] = useState("semua");
  const [filterJasaKirim, setFilterJasaKirim] = useState("semua");
  const [searchField, setSearchField] = useState("no_pesanan");
  const [searchVal, setSearchVal] = useState("");
  const [page, setPage] = useState(1);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch toko dan orders sekaligus
      const [tokoRes, ordersRes, penjualanRes] = await Promise.all([
        supabase.from("toko_online").select("id, nama").eq("platform", "Shopee").eq("aktif", true).not("shopee_access_token", "is", null).order("id"),
        supabase.from("detail_penjualan_online").select("id, no_pesanan, tanggal_pesanan, no_resi, sku, qty, harga_satuan, total_pembayaran, status_shopee, nama_pembeli, jasa_kirim, penjualan_online_id, stok_barang(nama_produk)").order("tanggal_pesanan", { ascending: false }).limit(2000),
        supabase.from("penjualan_online").select("id, toko_id"),
      ]);

      const tokoData: Toko[] = tokoRes.data || [];
      setTokoList(tokoData);

      // Build lookup maps
      const tokoMap = new Map<number, string>(tokoData.map(t => [t.id, t.nama]));
      const penjualanMap = new Map<number, number>((penjualanRes.data || []).map((p: any) => [p.id, p.toko_id]));

      const mapped: Order[] = (ordersRes.data || []).map((r: any) => {
        const tokoId = penjualanMap.get(r.penjualan_online_id) || 0;
        return {
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
          nama_produk: (r.stok_barang as any)?.nama_produk || r.sku,
          nama_toko: tokoMap.get(tokoId) || "-",
          toko_id: tokoId,
        };
      });

      setAllOrders(mapped);
      const jk = [...new Set(mapped.map(o => o.jasa_kirim).filter(Boolean) as string[])].sort();
      setJasaKirimList(jk);
    } catch (err: any) {
      showToast("Gagal load data: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { setPage(1); }, [filterStatus, filterToko, filterJasaKirim, searchVal]);

  const filtered = allOrders.filter(o => {
    if (filterStatus !== "semua" && o.status_shopee !== filterStatus) return false;
    if (filterToko !== "semua" && String(o.toko_id) !== filterToko) return false;
    if (filterJasaKirim !== "semua" && o.jasa_kirim !== filterJasaKirim) return false;
    if (searchVal.trim()) {
      const val = searchVal.toLowerCase();
      if (searchField === "no_pesanan" && !o.no_pesanan?.toLowerCase().includes(val)) return false;
      if (searchField === "no_resi" && !o.no_resi?.toLowerCase().includes(val)) return false;
      if (searchField === "nama_pembeli" && !o.nama_pembeli?.toLowerCase().includes(val)) return false;
    }
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSyncAll = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/shopee/sync-orders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        const total = data.results?.reduce((a: number, r: any) => a + (r.new || 0), 0) || 0;
        showToast(`✓ ${total} pesanan baru disync`);
        fetchAll();
      } else showToast("Gagal sync: " + data.error, "error");
    } catch (err: any) {
      showToast("Gagal sync: " + err.message, "error");
    } finally { setSyncing(false); }
  };

  const handlePrint = () => {
    const rows = paginated.map(o => `<tr>
      <td>${o.no_pesanan}</td><td>${tanggalFmt(o.tanggal_pesanan)}</td>
      <td>${o.nama_pembeli||"-"}</td><td>${o.nama_produk}</td>
      <td style="text-align:center">${o.qty}</td>
      <td style="text-align:right">${rupiahFmt(o.total_pembayaran)}</td>
      <td>${o.jasa_kirim||"-"}</td><td>${o.no_resi||"-"}</td>
      <td>${o.nama_toko}</td><td>${o.status_shopee||"-"}</td>
    </tr>`).join("");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Pesanan Shopee</title>
    <style>body{font-family:Arial,sans-serif;font-size:11px;margin:16px}table{width:100%;border-collapse:collapse}
    th{background:#f3f4f6;padding:6px 8px;font-size:10px;border:1px solid #e5e7eb;text-align:left}
    td{padding:5px 8px;border:1px solid #e5e7eb}tr:nth-child(even){background:#f9fafb}
    @media print{@page{margin:1cm}}</style></head><body>
    <h2 style="font-size:14px;margin-bottom:4px">Pesanan Shopee — Azalea</h2>
    <p style="font-size:11px;color:#666;margin-bottom:12px">Dicetak: ${new Date().toLocaleString("id-ID")} · ${paginated.length} pesanan</p>
    <table><thead><tr><th>No. Pesanan</th><th>Tanggal</th><th>Pembeli</th><th>Produk</th>
    <th>Qty</th><th>Total</th><th>Jasa Kirim</th><th>No. Resi</th><th>Toko</th><th>Status</th>
    </tr></thead><tbody>${rows}</tbody></table></body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const inputStyle: React.CSSProperties = {
    padding: "8px 12px",
    background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
    border: `1.5px solid ${C.border}`, borderRadius: 8,
    color: C.text, fontFamily: C.fontSans, fontSize: 13, outline: "none",
  };

  return (
    <AppShell>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .order-row:hover{background:${isDark?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.02)"}!important}
        @media print{.no-print{display:none!important}}
      `}</style>

      {toast && (
        <div style={{position:"fixed",top:20,right:20,zIndex:9999,padding:"12px 20px",borderRadius:10,
          background:toast.type==="success"?C.green:C.red,color:"#fff",fontSize:13,fontWeight:700,
          boxShadow:C.shadowMd,animation:"fadeUp 0.2s ease"}}>{toast.msg}</div>
      )}

      <div style={{ padding: "24px 28px", animation: "fadeUp 0.3s ease" }}>
        {/* Header */}
        <div className="no-print" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
          <div>
            <h1 style={{fontSize:22,fontWeight:800,color:C.text,margin:0}}>Pesanan Shopee</h1>
            <p style={{fontSize:12,color:C.muted,fontFamily:C.fontMono,margin:"4px 0 0"}}>
              {tokoList.length} toko · {filtered.length.toLocaleString("id-ID")} pesanan
            </p>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={handlePrint} style={{...inputStyle,cursor:"pointer",fontWeight:700}}>🖨️ Print</button>
            <button onClick={handleSyncAll} disabled={syncing} style={{
              padding:"8px 16px",background:`linear-gradient(135deg,${C.accentDark},${C.accent})`,
              border:"none",color:"#fff",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:700,
              fontFamily:C.fontSans,opacity:syncing?0.7:1,
            }}>{syncing?"⏳ Syncing...":"↻ Sync Semua"}</button>
          </div>
        </div>

        {/* Search */}
        <div className="no-print" style={{display:"flex",gap:8,marginBottom:14,alignItems:"center"}}>
          <select value={searchField} onChange={e=>setSearchField(e.target.value)}
            style={{...inputStyle,cursor:"pointer",minWidth:140}}>
            {SEARCH_FIELDS.map(f=><option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <input value={searchVal} onChange={e=>setSearchVal(e.target.value)}
            placeholder={`Cari ${SEARCH_FIELDS.find(f=>f.key===searchField)?.label}...`}
            style={{...inputStyle,width:280}} />
          {searchVal && <button onClick={()=>setSearchVal("")} style={{...inputStyle,cursor:"pointer",color:C.muted}}>✕</button>}
        </div>

        {/* Filter berlapis */}
        <div className="no-print" style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",marginBottom:20}}>
          <PillFilterRow label="Toko"
            options={[{key:"semua",label:"Semua"},...tokoList.map(t=>({key:String(t.id),label:t.nama}))]}
            selected={filterToko} onSelect={setFilterToko} C={C} />
          <PillFilterRow label="Jasa Kirim"
            options={[{key:"semua",label:"Semua"},...jasaKirimList.map(j=>({key:j,label:j}))]}
            selected={filterJasaKirim} onSelect={setFilterJasaKirim} C={C} />
          <PillFilterRow label="Status" options={STATUS_TABS}
            selected={filterStatus} onSelect={setFilterStatus} C={C} />
        </div>

        {/* Table */}
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,overflow:"hidden",boxShadow:C.shadow}}>
          <div style={{
            display:"grid",gridTemplateColumns:"1fr 100px 140px 130px 60px 110px 130px 120px",
            padding:"10px 16px",background:isDark?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.03)",
            borderBottom:`1px solid ${C.border}`,fontSize:10,fontWeight:700,color:C.muted,
            fontFamily:C.fontMono,letterSpacing:1,textTransform:"uppercase" as const,
          }}>
            <span>Pembeli / Pesanan</span><span>Tanggal</span><span>Produk</span><span>Toko</span>
            <span style={{textAlign:"center"}}>Qty</span><span style={{textAlign:"right"}}>Total</span>
            <span>Jasa Kirim</span><span>Status</span>
          </div>

          {loading ? (
            <div style={{padding:40,textAlign:"center",color:C.muted,fontFamily:C.fontMono}}>Memuat...</div>
          ) : paginated.length===0 ? (
            <div style={{padding:40,textAlign:"center",color:C.muted,fontFamily:C.fontMono}}>Tidak ada pesanan</div>
          ) : paginated.map(order => {
            const sc = STATUS_COLORS[order.status_shopee||""];
            return (
              <div key={order.id} className="order-row" style={{
                display:"grid",gridTemplateColumns:"1fr 100px 140px 130px 60px 110px 130px 120px",
                padding:"12px 16px",borderBottom:`1px solid ${C.border}`,
                alignItems:"center",transition:"background 0.1s",
              }}>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:C.text}}>{order.nama_pembeli||"—"}</div>
                  <div style={{fontSize:10,color:C.muted,fontFamily:C.fontMono,marginTop:2}}>{order.no_pesanan}</div>
                  {order.no_resi&&<div style={{fontSize:10,color:C.accent,fontFamily:C.fontMono,marginTop:1}}>📦 {order.no_resi}</div>}
                </div>
                <div style={{fontSize:12,color:C.textMid,fontFamily:C.fontMono}}>{tanggalFmt(order.tanggal_pesanan)}</div>
                <div>
                  <div style={{fontSize:12,fontWeight:600,color:C.text}}>{order.nama_produk}</div>
                  <div style={{fontSize:10,color:C.muted,fontFamily:C.fontMono}}>{order.sku}</div>
                </div>
                <div style={{fontSize:12,color:C.textMid}}>{order.nama_toko}</div>
                <div style={{textAlign:"center",fontSize:13,fontWeight:700,color:C.text,fontFamily:C.fontMono}}>{order.qty}</div>
                <div style={{textAlign:"right",fontSize:12,fontWeight:700,color:C.green,fontFamily:C.fontMono}}>{rupiahFmt(order.total_pembayaran)}</div>
                <div style={{fontSize:11,color:C.textMid}}>{order.jasa_kirim||"—"}</div>
                <div>
                  <span style={{fontSize:10,padding:"3px 8px",borderRadius:12,
                    background:sc?.bg||C.border,color:sc?.color||C.muted,
                    fontWeight:700,fontFamily:C.fontMono,
                  }}>{order.status_shopee||"—"}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        {totalPages>1&&(
          <div className="no-print" style={{display:"flex",justifyContent:"center",gap:6,marginTop:20,alignItems:"center"}}>
            <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}
              style={{...inputStyle,cursor:page===1?"not-allowed":"pointer",opacity:page===1?0.4:1}}>← Prev</button>
            <span style={{padding:"8px 16px",fontFamily:C.fontMono,fontSize:12,color:C.muted}}>{page} / {totalPages}</span>
            <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}
              style={{...inputStyle,cursor:page===totalPages?"not-allowed":"pointer",opacity:page===totalPages?0.4:1}}>Next →</button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
