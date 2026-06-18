"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import { useTheme, LIGHT, DARK } from "@/context/ThemeContext";
import { rupiah, rupiahShort, pctFmt, tanggalFmt } from "@/lib/format";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";

type LaporanData = {
  omzet_shopee: number;
  omzet_offline: number;
  retur_pembatalan: number;
  fee_platform: number;
  total_pendapatan: number;
  hpp_bahan: number;
  hpp_gaji_operator: number;
  hpp_gaji_packing: number;
  total_hpp: number;
  laba_kotor: number;
  margin_kotor: number;
  biaya_gaji: number;
  biaya_transport: number;
  biaya_operasional_lain: number;
  biaya_zakat: number;
  total_biaya_operasional: number;
  laba_bersih: number;
  margin_bersih: number;
};

type ProdukProfit = {
  stok_barang_id: number;
  nama_produk: string;
  qty_terjual: number;
  omzet: number;
  hpp: number;
  profit: number;
  margin: number;
  hpp_per_unit: number;
  harga_jual_avg: number;
};

type ChartDataPoint = { tanggal: string; omzet: number; laba: number; beban: number };
type Toast = { msg: string; type: "success" | "error" | "info" };

type NotaOffline = {
  id: number;
  tanggal: string;
  created_at: string;
  nama_pelanggan: string | null;
  metode_bayar: string;
  total_nominal: number;
  status_bayar: string;
  detail: { nama_produk: string; qty: number; harga_satuan: number; subtotal: number }[];
};

type PelangganPerforma = {
  key: string;
  pelanggan_id: number | null;
  nama: string;
  kontak: string;
  terakhir_order: string | null;
  total_transaksi: number;
  total_omset: number;
  produk_favorit: string;
  piutang_nominal: number;
  piutang_status: string;
  nota_terakhir: NotaOffline | null;
};

function customerKey(pj: { pelanggan_id?: number | null; nama_pelanggan?: string | null }) {
  if (pj.pelanggan_id) return `id:${pj.pelanggan_id}`;
  return `nama:${(pj.nama_pelanggan || "Tanpa Nama").trim().toLowerCase()}`;
}

const tanggalNotaFmt = (s: string) =>
  new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Jakarta" });

function printNotaOffline(pj: NotaOffline) {
  const w = window.open("", "_blank", "width=800,height=700,left=200,top=50");
  if (!w) return;
  const lines = (pj.detail || []).map(d =>
    `<div class="row"><span>${d.nama_produk} x${d.qty}</span><span>${rupiah(d.subtotal)}</span></div>`
  ).join("");
  w.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        @page { size: 58mm 200mm; margin: 2mm; }
        body { font-family: monospace; font-size: 11px; color: black; width: 52mm; margin: 0; padding: 0; }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .divider { border-top: 1px dashed #000; margin: 4px 0; }
        .row { display: flex; justify-content: space-between; padding: 2px 0; border-bottom: 1px dashed #ccc; }
        .total-row { display: flex; justify-content: space-between; padding: 4px 0; font-weight: bold; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="center bold" style="font-size:13px">AZALEA FOOD</div>
      <div class="center">Penjualan Offline</div>
      <div class="divider"></div>
      <div style="display:flex;justify-content:space-between">
        <span>Tgl: ${tanggalNotaFmt(pj.tanggal || pj.created_at)}</span>
        <span>No: OFF-${String(pj.id).padStart(3, "0")}</span>
      </div>
      ${pj.nama_pelanggan ? `<div>Pembeli: ${pj.nama_pelanggan}</div>` : ""}
      <div class="divider"></div>
      ${lines}
      <div class="divider"></div>
      <div class="total-row"><span>TOTAL</span><span>${rupiah(pj.total_nominal)}</span></div>
      <div style="font-size:10px">Metode: ${pj.metode_bayar}</div>
      <div style="font-size:10px">Status: ${pj.status_bayar}</div>
      <div class="divider"></div>
      <div class="center" style="font-size:10px">Terima kasih!</div>
    </body>
    </html>
  `);
  w.document.close();
  setTimeout(() => { w.print(); w.onafterprint = () => w.close(); }, 500);
}

export default function LaporanPage() {
  const { isDark } = useTheme();
  const C = isDark ? DARK : LIGHT;
  const searchParams = useSearchParams();
  const router = useRouter();

  const CC = {
    blue:    { bg: isDark ? "rgba(96,165,250,0.12)"  : "#dbeafe", color: "#3b82f6",  border: isDark ? "rgba(96,165,250,0.25)"  : "#bfdbfe" },
    red:     { bg: isDark ? "rgba(239,68,68,0.12)"   : "#fee2e2", color: "#ef4444",  border: isDark ? "rgba(239,68,68,0.25)"   : "#fecaca" },
    green:   { bg: isDark ? "rgba(34,197,94,0.12)"   : "#dcfce7", color: "#22c55e",  border: isDark ? "rgba(34,197,94,0.25)"   : "#bbf7d0" },
    yellow:  { bg: isDark ? "rgba(245,158,11,0.12)"  : "#fef9c3", color: "#f59e0b",  border: isDark ? "rgba(245,158,11,0.25)"  : "#fde68a" },
    purple:  { bg: isDark ? "rgba(168,85,247,0.12)"  : "#ede9fe", color: "#a855f7",  border: isDark ? "rgba(168,85,247,0.25)"  : "#ddd6fe" },
    teal:    { bg: isDark ? "rgba(45,212,191,0.12)"  : "#ccfbf1", color: "#0f9e8a",  border: isDark ? "rgba(45,212,191,0.25)"  : "#99f6e4" },
    orange:  { bg: isDark ? "rgba(249,115,22,0.12)"  : "#ffedd5", color: "#f97316",  border: isDark ? "rgba(249,115,22,0.25)"  : "#fed7aa" },
  };

  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);
  const [laporan, setLaporan] = useState<LaporanData | null>(null);
  const [produkProfit, setProdukProfit] = useState<ProdukProfit[]>([]);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [activeTab, setActiveTab] = useState<"summary" | "produk" | "pelanggan">("summary");
  const [pelangganPerforma, setPelangganPerforma] = useState<PelangganPerforma[]>([]);
  const [filterMode, setFilterMode] = useState<"bulan" | "custom">("bulan");
  const [bulanTerpilih, setBulanTerpilih] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [tanggalMulai, setTanggalMulai] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [tanggalSelesai, setTanggalSelesai] = useState(() =>
    new Date().toLocaleDateString("sv", { timeZone: "Asia/Jakarta" })
  );
  const [periodeLabel, setPeriodeLabel] = useState("");

  const showToast = (msg: string, type: Toast["type"] = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const daftarBulan = useMemo(() => {
    const result = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
      result.push({ key, label });
    }
    return result;
  }, []);

  const { startDate, endDate, startDateStr, endDateStr } = useMemo(() => {
    let sd: string, ed: string;
    if (filterMode === "bulan") {
      const [year, month] = bulanTerpilih.split("-").map(Number);
      sd = new Date(year, month - 1, 1).toISOString();
      ed = new Date(year, month, 0, 23, 59, 59).toISOString();
    } else {
      sd = new Date(tanggalMulai + "T00:00:00+07:00").toISOString();
      ed = new Date(tanggalSelesai + "T23:59:59+07:00").toISOString();
    }
    const sStr = new Date(new Date(sd).getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const eStr = new Date(new Date(ed).getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return { startDate: sd, endDate: ed, startDateStr: sStr, endDateStr: eStr };
  }, [filterMode, bulanTerpilih, tanggalMulai, tanggalSelesai]);

  useEffect(() => {
    if (filterMode === "bulan") {
      const found = daftarBulan.find(b => b.key === bulanTerpilih);
      setPeriodeLabel(found?.label || bulanTerpilih);
    } else {
      setPeriodeLabel(`${tanggalMulai} s/d ${tanggalSelesai}`);
    }
  }, [filterMode, bulanTerpilih, tanggalMulai, tanggalSelesai, daftarBulan]);

  const fetchLaporan = useCallback(async () => {
    setLoading(true);
    try {
      const [
        shopeeRes, offlineRes, returRes, produksiRes, feeRes,
        gajiRes, transportRes, opsRes, zakatRes, gajiHarianRes,
        detailPenjualanRes, detailProduksiRes,
        pelangganRes, penjualanOfflineRes, piutangOfflineRes,
      ] = await Promise.all([
        supabase.from("penjualan_online").select("total_nominal").gte("created_at", startDate).lte("created_at", endDate),
        supabase.from("kas").select("nominal").eq("tipe", "Masuk").eq("kategori", "Offline").gte("created_at", startDate).lte("created_at", endDate),
        supabase.from("retur_online").select("nominal").gte("created_at", startDate).lte("created_at", endDate),
        supabase.from("produksi_batch").select("total_hpp, gaji_operator, gaji_packing, gaji_borongan").gte("created_at", startDate).lte("created_at", endDate),
        supabase.from("fee_platform").select("total_fee").gte("periode_end", startDateStr).lte("periode_start", endDateStr),
        supabase.from("kas").select("nominal").eq("tipe", "Keluar").eq("kategori", "Gaji").gte("created_at", startDate).lte("created_at", endDate),
        supabase.from("kas").select("nominal").eq("tipe", "Keluar").eq("kategori", "Transport").gte("created_at", startDate).lte("created_at", endDate),
        supabase.from("kas").select("nominal").eq("tipe", "Keluar").in("kategori", ["Operasional", "Lain-lain"]).gte("created_at", startDate).lte("created_at", endDate),
        supabase.from("data_zakat").select("zakat_keluar").gte("created_at", startDate).lte("created_at", endDate),
        supabase.from("gaji_harian").select("nominal").eq("tipe_beban", "Operasional").gte("tanggal", startDateStr).lte("tanggal", endDateStr),
        supabase.from("detail_penjualan_online")
          .select("stok_barang_id, qty, harga_satuan, total_pembayaran, penjualan_online_id, stok_barang(nama_produk)")
          .gte("tanggal_pesanan", startDateStr)
          .lte("tanggal_pesanan", endDateStr)
          .not("stok_barang_id", "is", null),
        supabase.from("detail_produksi_output")
          .select("stok_barang_id, qty, hpp_per_unit, stok_barang(nama_produk)")
          .not("stok_barang_id", "is", null),
        supabase.from("pelanggan_offline").select("id, nama, telepon, alamat"),
        supabase.from("penjualan_offline")
          .select("*, detail_penjualan_offline(*)")
          .gte("created_at", startDate)
          .lte("created_at", endDate)
          .order("created_at", { ascending: false }),
        supabase.from("penjualan_offline")
          .select("id, pelanggan_id, nama_pelanggan, total_nominal, status_bayar, metode_bayar")
          .eq("metode_bayar", "Piutang")
          .eq("status_bayar", "Belum Lunas"),
      ]);

      const sum = (data: any[], field = "nominal") => (data || []).reduce((s: number, r: any) => s + (r[field] || 0), 0);

      const omzet_shopee = sum(shopeeRes.data || [], "total_nominal");
      const omzet_offline = sum(offlineRes.data || []);
      const retur_pembatalan = sum(returRes.data || []);
      const fee_platform = sum(feeRes.data || [], "total_fee");

      let hpp_bahan = 0, hpp_gaji_operator = 0, hpp_gaji_packing = 0;
      (produksiRes.data || []).forEach((p: any) => {
        const gaji_op = p.gaji_operator || 0;
        const gaji_pack = (p.gaji_packing || 0) + (p.gaji_borongan || 0);
        const hpp_total = p.total_hpp || 0;
        hpp_gaji_operator += gaji_op;
        hpp_gaji_packing += gaji_pack;
        hpp_bahan += hpp_total - gaji_op - gaji_pack;
      });

      const hppPerUnitMap: Record<number, { hpp: number; count: number; nama: string }> = {};
      (detailProduksiRes.data || []).forEach((d: any) => {
        const id = d.stok_barang_id;
        const nama = d.stok_barang?.nama_produk || `Produk #${id}`;
        if (!hppPerUnitMap[id]) hppPerUnitMap[id] = { hpp: 0, count: 0, nama };
        hppPerUnitMap[id].hpp += d.hpp_per_unit || 0;
        hppPerUnitMap[id].count += 1;
      });
      const hppAvgMap: Record<number, { hpp_per_unit: number; nama: string }> = {};
      Object.entries(hppPerUnitMap).forEach(([id, v]) => {
        hppAvgMap[Number(id)] = { hpp_per_unit: v.count > 0 ? v.hpp / v.count : 0, nama: v.nama };
      });

      const penjualanMap: Record<number, { qty: number; omzet: number; nama: string }> = {};
      (detailPenjualanRes.data || []).forEach((d: any) => {
        const id = d.stok_barang_id;
        const nama = d.stok_barang?.nama_produk || `Produk #${id}`;
        if (!penjualanMap[id]) penjualanMap[id] = { qty: 0, omzet: 0, nama };
        penjualanMap[id].qty += Number(d.qty) || 0;
        penjualanMap[id].omzet += Number(d.total_pembayaran) || (Number(d.qty) * Number(d.harga_satuan)) || 0;
      });

      const produkProfitList: ProdukProfit[] = Object.entries(penjualanMap).map(([idStr, penjualan]) => {
        const id = Number(idStr);
        const hppData = hppAvgMap[id];
        const hpp_per_unit = hppData?.hpp_per_unit || 0;
        const hpp_total = hpp_per_unit * penjualan.qty;
        const profit = penjualan.omzet - hpp_total;
        const margin = penjualan.omzet > 0 ? (profit / penjualan.omzet) * 100 : 0;
        const harga_jual_avg = penjualan.qty > 0 ? penjualan.omzet / penjualan.qty : 0;
        return {
          stok_barang_id: id,
          nama_produk: hppData?.nama || penjualan.nama,
          qty_terjual: penjualan.qty,
          omzet: penjualan.omzet,
          hpp: hpp_total,
          profit,
          margin,
          hpp_per_unit,
          harga_jual_avg,
        };
      }).sort((a, b) => b.omzet - a.omzet);

      setProdukProfit(produkProfitList);

      const pelangganMap = new Map(
        (pelangganRes.data || []).map((p: any) => [p.id, p])
      );
      const piutangByCustomer = new Map<string, number>();
      for (const p of piutangOfflineRes.data || []) {
        const key = customerKey(p);
        piutangByCustomer.set(key, (piutangByCustomer.get(key) || 0) + (p.total_nominal || 0));
      }

      type Agg = {
        pelanggan_id: number | null;
        nama: string;
        kontak: string;
        total_transaksi: number;
        total_omset: number;
        terakhir_order: string | null;
        produkQty: Record<string, number>;
        nota_terakhir: NotaOffline | null;
      };
      const aggMap = new Map<string, Agg>();

      for (const pj of penjualanOfflineRes.data || []) {
        const key = customerKey(pj);
        let agg = aggMap.get(key);
        if (!agg) {
          const master = pj.pelanggan_id ? pelangganMap.get(pj.pelanggan_id) : null;
          const kontak = master?.telepon || master?.alamat || "—";
          agg = {
            pelanggan_id: pj.pelanggan_id ?? null,
            nama: master?.nama || pj.nama_pelanggan || "Tanpa Nama",
            kontak,
            total_transaksi: 0,
            total_omset: 0,
            terakhir_order: null,
            produkQty: {},
            nota_terakhir: null,
          };
          aggMap.set(key, agg);
        }
        agg.total_transaksi += 1;
        agg.total_omset += Number(pj.total_nominal) || 0;
        const orderDate = pj.tanggal || pj.created_at;
        if (!agg.terakhir_order || orderDate > agg.terakhir_order) {
          agg.terakhir_order = orderDate;
          agg.nota_terakhir = {
            id: pj.id,
            tanggal: pj.tanggal,
            created_at: pj.created_at,
            nama_pelanggan: pj.nama_pelanggan,
            metode_bayar: pj.metode_bayar,
            total_nominal: pj.total_nominal,
            status_bayar: pj.status_bayar,
            detail: (pj.detail_penjualan_offline || []).map((d: any) => ({
              nama_produk: d.nama_produk,
              qty: d.qty,
              harga_satuan: d.harga_satuan,
              subtotal: d.subtotal,
            })),
          };
        }
        for (const d of pj.detail_penjualan_offline || []) {
          const pname = d.nama_produk || "Produk";
          agg.produkQty[pname] = (agg.produkQty[pname] || 0) + (Number(d.qty) || 0);
        }
      }

      const performaList: PelangganPerforma[] = Array.from(aggMap.entries()).map(([key, agg]) => {
        const fav = Object.entries(agg.produkQty).sort((a, b) => b[1] - a[1])[0];
        const piutang = piutangByCustomer.get(key) || 0;
        return {
          key,
          pelanggan_id: agg.pelanggan_id,
          nama: agg.nama,
          kontak: agg.kontak,
          terakhir_order: agg.terakhir_order,
          total_transaksi: agg.total_transaksi,
          total_omset: agg.total_omset,
          produk_favorit: fav ? `${fav[0]} (×${fav[1]})` : "—",
          piutang_nominal: piutang,
          piutang_status: piutang > 0 ? "Belum Lunas" : "Lunas",
          nota_terakhir: agg.nota_terakhir,
        };
      }).sort((a, b) => b.total_omset - a.total_omset);

      setPelangganPerforma(performaList);

      const biaya_gaji = sum(gajiRes.data || []) + sum(gajiHarianRes.data || []);
      const biaya_transport = sum(transportRes.data || []);
      const biaya_operasional_lain = sum(opsRes.data || []);
      const biaya_zakat = sum(zakatRes.data || [], "zakat_keluar");

      const total_pendapatan = omzet_shopee + omzet_offline - retur_pembatalan - fee_platform;
      const total_hpp = hpp_bahan + hpp_gaji_operator + hpp_gaji_packing;
      const laba_kotor = total_pendapatan - total_hpp;
      const margin_kotor = total_pendapatan > 0 ? (laba_kotor / total_pendapatan) * 100 : 0;
      const total_biaya_operasional = biaya_gaji + biaya_transport + biaya_operasional_lain + biaya_zakat;
      const laba_bersih = laba_kotor - total_biaya_operasional;
      const margin_bersih = total_pendapatan > 0 ? (laba_bersih / total_pendapatan) * 100 : 0;

      setLaporan({ omzet_shopee, omzet_offline, retur_pembatalan, fee_platform, total_pendapatan, hpp_bahan, hpp_gaji_operator, hpp_gaji_packing, total_hpp, laba_kotor, margin_kotor, biaya_gaji, biaya_transport, biaya_operasional_lain, biaya_zakat, total_biaya_operasional, laba_bersih, margin_bersih });

      const [shopeeChartRes, offlineChartRes, returChartRes, produksiChartRes, kasKeluarChartRes] = await Promise.all([
        supabase.from("penjualan_online").select("total_nominal, created_at").gte("created_at", startDate).lte("created_at", endDate),
        supabase.from("kas").select("nominal, created_at").eq("tipe", "Masuk").eq("kategori", "Offline").gte("created_at", startDate).lte("created_at", endDate),
        supabase.from("retur_online").select("nominal, created_at").gte("created_at", startDate).lte("created_at", endDate),
        supabase.from("produksi_batch").select("total_hpp, created_at").gte("created_at", startDate).lte("created_at", endDate),
        supabase.from("kas").select("nominal, created_at").eq("tipe", "Keluar").gte("created_at", startDate).lte("created_at", endDate),
      ]);

      const map: Record<string, { omzet: number; beban: number }> = {};
      const addChart = (dateStr: string, field: "omzet" | "beban", val: number) => {
        const k = new Date(dateStr).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
        if (!map[k]) map[k] = { omzet: 0, beban: 0 };
        map[k][field] += val;
      };
      (shopeeChartRes.data || []).forEach((r: any) => addChart(r.created_at, "omzet", r.total_nominal || 0));
      (offlineChartRes.data || []).forEach((r: any) => addChart(r.created_at, "omzet", r.nominal || 0));
      (returChartRes.data || []).forEach((r: any) => addChart(r.created_at, "omzet", -(r.nominal || 0)));
      (produksiChartRes.data || []).forEach((r: any) => addChart(r.created_at, "beban", r.total_hpp || 0));
      (kasKeluarChartRes.data || []).forEach((r: any) => addChart(r.created_at, "beban", r.nominal || 0));

      setChartData(Object.entries(map).map(([tanggal, d]) => ({ tanggal, omzet: d.omzet, beban: d.beban, laba: d.omzet - d.beban })));

    } catch (err: any) {
      showToast(err.message || "Gagal memuat laporan", "error");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, startDateStr, endDateStr]);

  useEffect(() => { fetchLaporan(); }, [fetchLaporan]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "pelanggan" || tab === "produk" || tab === "summary") {
      setActiveTab(tab);
    } else if (!tab) {
      setActiveTab("summary");
    }
  }, [searchParams]);

  const goTab = (tab: "summary" | "produk" | "pelanggan") => {
    setActiveTab(tab);
    if (tab === "summary") router.replace("/laporan");
    else router.replace(`/laporan?tab=${tab}`);
  };

  const inputS: React.CSSProperties = {
    padding: "8px 12px",
    background: isDark ? "rgba(255,255,255,0.05)" : "#f8fffe",
    border: `1.5px solid ${C.border}`,
    borderRadius: 10, color: C.text,
    fontFamily: C.fontSans, fontSize: 13,
    outline: "none", boxSizing: "border-box", width: "100%",
  };

  const tabStyle = (active: boolean, col: typeof CC.blue): React.CSSProperties => ({
    flex: 1, padding: "10px 8px", borderRadius: 10,
    border: `1.5px solid ${active ? col.color + "60" : C.border}`,
    background: active ? col.bg : "transparent",
    color: active ? col.color : C.muted,
    fontWeight: 700, cursor: "pointer", fontSize: 13,
    fontFamily: C.fontSans, transition: "all 0.15s",
  });

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: C.card, border: `1px solid ${C.borderStrong}`, padding: "10px 14px", borderRadius: 10, boxShadow: C.shadowMd }}>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, fontFamily: C.fontMono }}>{payload[0].payload.tanggal}</div>
        {payload.map((entry: any, i: number) => (
          <div key={i} style={{ fontSize: 12, color: entry.color, marginBottom: 3, fontFamily: C.fontMono, fontWeight: 600 }}>
            {entry.name}: {rupiahShort(entry.value)}
          </div>
        ))}
      </div>
    );
  };

  const barData = laporan ? [
    { kategori: "Pendapatan", nilai: laporan.total_pendapatan,          color: CC.blue.color },
    { kategori: "HPP",        nilai: -laporan.total_hpp,                color: CC.red.color },
    { kategori: "Biaya Ops",  nilai: -laporan.total_biaya_operasional,  color: CC.yellow.color },
    { kategori: "Laba Bersih",nilai: laporan.laba_bersih,               color: CC.green.color },
  ] : [];

  const totalOmzetProduk  = produkProfit.reduce((a, p) => a + p.omzet, 0);
  const totalHppProduk    = produkProfit.reduce((a, p) => a + p.hpp, 0);
  const totalProfitProduk = produkProfit.reduce((a, p) => a + p.profit, 0);
  const totalOmzetPelanggan = pelangganPerforma.reduce((a, p) => a + p.total_omset, 0);

  if (loading) return (
    <AppShell>
      <div style={{ minHeight: "100vh", background: C.bgPage, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: C.fontSans }}>
        <div style={{ textAlign: "center", color: C.muted }}>
          <div style={{ fontSize: 28, marginBottom: 12, color: CC.blue.color }}>📊</div>
          <div style={{ fontSize: 13 }}>Memuat laporan laba rugi...</div>
        </div>
      </div>
    </AppShell>
  );

  return (
    <AppShell>
      <style>{`
        input:focus, select:focus { border-color: ${CC.blue.color} !important; outline: none; }
        select option { background: ${isDark ? "#172218" : "#fff"}; color: ${C.text}; }
        .row-hover:hover { background: ${isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)"} !important; }
        @media print {
          @page { size: A4 portrait; margin: 15mm 12mm; }
          nav, aside, .no-print { display: none !important; }
          * { background: white !important; color: black !important; box-shadow: none !important; }
          .print-show { display: block !important; }
        }
      `}</style>

      {toast && (
        <div style={{ position: "fixed", top: 24, right: 24, zIndex: 9999, background: toast.type === "success" ? CC.green.color : toast.type === "error" ? CC.red.color : CC.blue.color, color: "#fff", padding: "12px 20px", borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.2)", fontFamily: C.fontSans, fontWeight: 700, fontSize: 14 }} className="no-print">
          {toast.msg}
        </div>
      )}

      <div style={{ padding: 24, fontFamily: C.fontSans, background: C.bgPage, minHeight: "100vh" }}>

        {/* Filter */}
        <div style={{ background: C.card, padding: 20, borderRadius: 16, border: `1px solid ${C.border}`, marginBottom: 20, boxShadow: C.shadow }} className="no-print">
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: "0.08em", marginBottom: 12, textTransform: "uppercase" }}>Filter Periode</div>
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            {["bulan", "custom"].map(mode => (
              <button key={mode} onClick={() => setFilterMode(mode as any)} style={tabStyle(filterMode === mode, CC.blue)}>
                {mode === "bulan" ? "Per Bulan" : "Custom Range"}
              </button>
            ))}
          </div>
          {filterMode === "bulan" ? (
            <select value={bulanTerpilih} onChange={e => setBulanTerpilih(e.target.value)} style={inputS}>
              {daftarBulan.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
            </select>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 4 }}>Dari</label>
                <input type="date" value={tanggalMulai} onChange={e => setTanggalMulai(e.target.value)} style={inputS} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 4 }}>Sampai</label>
                <input type="date" value={tanggalSelesai} onChange={e => setTanggalSelesai(e.target.value)} style={inputS} />
              </div>
            </div>
          )}
        </div>

        {laporan && (
          <>
            {/* Summary Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
              {[
                { label: "Omzet Netto",  value: laporan.total_pendapatan,        col: CC.blue,   pct: null },
                { label: "HPP",          value: laporan.total_hpp,               col: CC.red,    pct: null },
                { label: "Laba Kotor",   value: laporan.laba_kotor,              col: CC.green,  pct: laporan.margin_kotor },
                { label: "Biaya Ops",    value: laporan.total_biaya_operasional, col: CC.yellow, pct: null },
                { label: "Laba Bersih",  value: laporan.laba_bersih,             col: CC.purple, pct: laporan.margin_bersih },
              ].map((s, i) => (
                <div key={i} style={{ background: s.col.bg, border: `1px solid ${s.col.border}`, borderRadius: 14, padding: "16px 18px", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: s.col.color, borderRadius: "14px 14px 0 0" }} />
                  <div style={{ fontSize: 10, fontWeight: 700, color: s.col.color, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6, marginTop: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: s.col.color, letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: s.pct !== null ? 3 : 0 }}>{rupiah(s.value)}</div>
                  {s.pct !== null && <div style={{ fontSize: 12, color: s.col.color, fontWeight: 700, fontFamily: C.fontMono }}>{pctFmt(s.pct)}</div>}
                </div>
              ))}
            </div>

            {/* Charts */}
            {chartData.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }} className="no-print">
                <div style={{ background: C.card, padding: 20, borderRadius: 14, border: `1px solid ${C.border}`, boxShadow: C.shadow }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 16 }}>Omzet & Laba</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.dim} vertical={false} />
                      <XAxis dataKey="tanggal" stroke={C.muted} style={{ fontSize: 10, fontFamily: C.fontMono }} />
                      <YAxis stroke={C.muted} style={{ fontSize: 10, fontFamily: C.fontMono }} tickFormatter={rupiahShort} width={55} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12, fontFamily: C.fontSans }} />
                      <Line type="monotone" dataKey="omzet" stroke={CC.blue.color}  strokeWidth={2} name="Omzet" dot={false} />
                      <Line type="monotone" dataKey="laba"  stroke={CC.green.color} strokeWidth={2} name="Laba"  dot={false} />
                      <Line type="monotone" dataKey="beban" stroke={CC.red.color}   strokeWidth={2} name="Beban" dot={false} strokeDasharray="4 3" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ background: C.card, padding: 20, borderRadius: 14, border: `1px solid ${C.border}`, boxShadow: C.shadow }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 16 }}>Laba Rugi Ringkas</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={barData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.dim} vertical={false} />
                      <XAxis dataKey="kategori" stroke={C.muted} style={{ fontSize: 11, fontFamily: C.fontMono }} />
                      <YAxis stroke={C.muted} style={{ fontSize: 10, fontFamily: C.fontMono }} tickFormatter={rupiahShort} width={55} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="nilai" radius={[4, 4, 0, 0]}>
                        {barData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Tabs */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }} className="no-print">
              <button onClick={() => goTab("summary")} style={tabStyle(activeTab === "summary", CC.blue)}>📋 Summary L/R</button>
              <button onClick={() => goTab("produk")}  style={tabStyle(activeTab === "produk",  CC.green)}>📦 HPP per Produk</button>
              <button onClick={() => goTab("pelanggan")} style={tabStyle(activeTab === "pelanggan", CC.teal)}>👥 Performa Pelanggan</button>
            </div>

            {/* ── TAB SUMMARY ── */}
            {activeTab === "summary" && (
              <div style={{ background: C.card, padding: 24, borderRadius: 16, border: `1px solid ${C.border}`, boxShadow: C.shadow }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 20 }}>
                  Detail Laporan L/R — {periodeLabel}
                </div>

                {[
                  {
                    title: "PENDAPATAN", col: CC.blue,
                    items: [
                      { label: "Penjualan Online (Shopee, dll)", value: laporan.omzet_shopee, neg: false },
                      { label: "Penjualan Offline", value: laporan.omzet_offline, neg: false },
                      { label: "Retur / Pembatalan", value: laporan.retur_pembatalan, neg: true },
                      { label: "Fee Platform (Komisi, Ongkir, Ads)", value: laporan.fee_platform, neg: true },
                    ],
                    total: laporan.total_pendapatan, totalLabel: "TOTAL PENDAPATAN NETTO",
                  },
                  {
                    title: "HARGA POKOK PENJUALAN (HPP)", col: CC.red,
                    items: [
                      { label: "Bahan Baku & Packaging", value: laporan.hpp_bahan, neg: false },
                      { label: "Gaji Operator Produksi", value: laporan.hpp_gaji_operator, neg: false },
                      { label: "Gaji Tim Packing & Borongan", value: laporan.hpp_gaji_packing, neg: false },
                    ],
                    total: laporan.total_hpp, totalLabel: "TOTAL HPP",
                  },
                ].map((section, si) => (
                  <div key={si} style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: section.col.color, marginBottom: 10, letterSpacing: "0.05em", textTransform: "uppercase" }}>{section.title}</div>
                    {section.items.map((item, i) => (
                      <div key={i} className="row-hover" style={{ display: "flex", justifyContent: "space-between", padding: "9px 12px", borderBottom: `1px solid ${C.border}`, borderRadius: 6 }}>
                        <span style={{ fontSize: 13, color: item.neg ? CC.orange.color : C.textMid }}>{item.label}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: item.neg ? CC.orange.color : C.text, fontFamily: C.fontMono }}>
                          {item.neg && item.value > 0 ? `(${rupiah(item.value)})` : rupiah(item.value)}
                        </span>
                      </div>
                    ))}
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 14px", background: section.col.bg, marginTop: 4, borderRadius: 10, border: `1px solid ${section.col.border}` }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: section.col.color }}>{section.totalLabel}</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: section.col.color, fontFamily: C.fontMono }}>{rupiah(section.total)}</span>
                    </div>
                  </div>
                ))}

                {/* Laba Kotor */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 18px", background: CC.green.bg, borderRadius: 12, border: `1px solid ${CC.green.border}`, marginBottom: 20 }}>
                  <div>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>Laba Kotor (Gross Profit)</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: CC.green.color }}>{rupiah(laporan.laba_kotor)}</div>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: CC.green.color, fontFamily: C.fontMono }}>{pctFmt(laporan.margin_kotor)}</div>
                </div>

                {/* Biaya Operasional */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: CC.yellow.color, marginBottom: 10, letterSpacing: "0.05em", textTransform: "uppercase" }}>BIAYA OPERASIONAL</div>
                  {[
                    { label: "Gaji (Admin, Host Live, CS, dll)", value: laporan.biaya_gaji },
                    { label: "Transport & Delivery", value: laporan.biaya_transport },
                    { label: "Operasional Lain-lain", value: laporan.biaya_operasional_lain },
                    { label: "Zakat (2.5% otomatis)", value: laporan.biaya_zakat },
                  ].map((item, i) => (
                    <div key={i} className="row-hover" style={{ display: "flex", justifyContent: "space-between", padding: "9px 12px", borderBottom: `1px solid ${C.border}`, borderRadius: 6 }}>
                      <span style={{ fontSize: 13, color: C.textMid }}>{item.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.text, fontFamily: C.fontMono }}>{rupiah(item.value)}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 14px", background: CC.yellow.bg, marginTop: 4, borderRadius: 10, border: `1px solid ${CC.yellow.border}` }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: CC.yellow.color }}>TOTAL BIAYA OPERASIONAL</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: CC.yellow.color, fontFamily: C.fontMono }}>{rupiah(laporan.total_biaya_operasional)}</span>
                  </div>
                </div>

                {/* Laba Bersih */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", background: CC.purple.bg, borderRadius: 14, border: `2px solid ${CC.purple.border}` }}>
                  <div>
                    <div style={{ fontSize: 12, color: C.muted, marginBottom: 6, letterSpacing: "0.08em", textTransform: "uppercase" }}>Laba Bersih (Net Profit)</div>
                    <div style={{ fontSize: 28, fontWeight: 900, color: CC.purple.color }}>{rupiah(laporan.laba_bersih)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>Margin</div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: CC.purple.color, fontFamily: C.fontMono }}>{pctFmt(laporan.margin_bersih)}</div>
                  </div>
                </div>

                <button onClick={() => window.print()} className="no-print" style={{ width: "100%", marginTop: 20, padding: 12, borderRadius: 12, background: CC.teal.bg, border: `1px solid ${CC.teal.border}`, color: CC.teal.color, fontWeight: 700, cursor: "pointer", fontSize: 14, transition: "all 0.15s" }}>
                  🖨️ Print Laporan
                </button>
              </div>
            )}

            {/* ── TAB PERFORMA PELANGGAN ── */}
            {activeTab === "pelanggan" && (
              <div style={{ background: C.card, padding: 24, borderRadius: 16, border: `1px solid ${C.border}`, boxShadow: C.shadow }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 4 }}>Performa Pelanggan Offline</div>
                    <div style={{ fontSize: 12, color: C.muted }}>Periode: {periodeLabel} · {pelangganPerforma.length} pelanggan aktif</div>
                  </div>
                  <div style={{ textAlign: "right", padding: "8px 14px", background: CC.teal.bg, borderRadius: 10, border: `1px solid ${CC.teal.border}` }}>
                    <div style={{ fontSize: 10, color: CC.teal.color, fontWeight: 700, textTransform: "uppercase" }}>Total Omset Offline</div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: CC.teal.color }}>{rupiah(totalOmzetPelanggan)}</div>
                  </div>
                </div>

                {pelangganPerforma.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 40, color: C.muted, fontSize: 13, fontFamily: C.fontMono }}>
                    Belum ada transaksi offline untuk periode ini
                  </div>
                ) : (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 0.9fr 0.7fr 1fr 1.2fr 1fr 0.9fr", gap: 8, padding: "8px 14px", background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", borderRadius: 8, marginBottom: 4 }}>
                      {["PELANGGAN", "KONTAK", "TERAKHIR ORDER", "TRX", "OMZET", "PRODUK FAVORIT", "PIUTANG", "NOTA"].map(h => (
                        <div key={h} style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.06em", textTransform: "uppercase" }}>{h}</div>
                      ))}
                    </div>

                    {pelangganPerforma.map((p) => {
                      const piutangCol = p.piutang_nominal > 0 ? CC.red : CC.green;
                      return (
                        <div key={p.key} className="row-hover" style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 0.9fr 0.7fr 1fr 1.2fr 1fr 0.9fr", gap: 8, padding: "12px 14px", borderBottom: `1px solid ${C.border}`, borderRadius: 8, alignItems: "center" }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{p.nama}</div>
                            {p.pelanggan_id && (
                              <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, marginTop: 2 }}>ID #{p.pelanggan_id}</div>
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: C.textMid, fontFamily: C.fontMono }}>{p.kontak}</div>
                          <div style={{ fontSize: 12, color: C.textMid, fontFamily: C.fontMono }}>
                            {p.terakhir_order ? tanggalFmt(p.terakhir_order) : "—"}
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: C.fontMono }}>{p.total_transaksi}</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: CC.teal.color, fontFamily: C.fontMono }}>{rupiah(p.total_omset)}</div>
                          <div style={{ fontSize: 12, color: C.textMid }}>{p.produk_favorit}</div>
                          <div>
                            <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 800, background: piutangCol.bg, color: piutangCol.color, border: `1px solid ${piutangCol.border}`, fontFamily: C.fontMono }}>
                              {p.piutang_status}
                            </span>
                            {p.piutang_nominal > 0 && (
                              <div style={{ fontSize: 10, color: CC.red.color, fontFamily: C.fontMono, marginTop: 4 }}>{rupiah(p.piutang_nominal)}</div>
                            )}
                          </div>
                          <div>
                            {p.nota_terakhir ? (
                              <button
                                onClick={() => printNotaOffline(p.nota_terakhir!)}
                                style={{
                                  padding: "6px 10px", borderRadius: 8, cursor: "pointer",
                                  background: CC.teal.bg, border: `1px solid ${CC.teal.border}`,
                                  color: CC.teal.color, fontSize: 11, fontWeight: 700,
                                  fontFamily: C.fontSans, whiteSpace: "nowrap",
                                }}
                              >
                                🧾 Nota
                              </button>
                            ) : (
                              <span style={{ fontSize: 11, color: C.muted }}>—</span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 0.9fr 0.7fr 1fr 1.2fr 1fr 0.9fr", gap: 8, padding: "12px 14px", background: CC.teal.bg, borderRadius: 10, marginTop: 4, border: `1px solid ${CC.teal.border}` }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: CC.teal.color }}>TOTAL</div>
                      <div />
                      <div />
                      <div style={{ fontSize: 13, fontWeight: 800, color: CC.teal.color, fontFamily: C.fontMono }}>
                        {pelangganPerforma.reduce((a, x) => a + x.total_transaksi, 0)}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: CC.teal.color, fontFamily: C.fontMono }}>{rupiah(totalOmzetPelanggan)}</div>
                      <div />
                      <div style={{ fontSize: 12, fontWeight: 700, color: CC.teal.color, fontFamily: C.fontMono }}>
                        {rupiah(pelangganPerforma.reduce((a, x) => a + x.piutang_nominal, 0))}
                      </div>
                      <div />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── TAB HPP PER PRODUK ── */}
            {activeTab === "produk" && (
              <div style={{ background: C.card, padding: 24, borderRadius: 16, border: `1px solid ${C.border}`, boxShadow: C.shadow }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 4 }}>HPP & Profitabilitas per Produk</div>
                    <div style={{ fontSize: 12, color: C.muted }}>Data real dari penjualan × HPP per unit produksi</div>
                  </div>
                  <div style={{ textAlign: "right", padding: "8px 14px", background: CC.green.bg, borderRadius: 10, border: `1px solid ${CC.green.border}` }}>
                    <div style={{ fontSize: 10, color: CC.green.color, fontWeight: 700, textTransform: "uppercase" }}>Total Profit</div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: CC.green.color }}>{rupiah(totalProfitProduk)}</div>
                  </div>
                </div>

                {produkProfit.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 40, color: C.muted, fontSize: 13, fontFamily: C.fontMono }}>Belum ada data penjualan untuk periode ini</div>
                ) : (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 0.8fr 1.2fr 1.2fr 1.2fr 0.8fr 0.8fr", gap: 8, padding: "8px 14px", background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", borderRadius: 8, marginBottom: 4 }}>
                      {["PRODUK", "QTY", "OMZET", "HPP TOTAL", "PROFIT", "MARGIN", "HPP/UNIT"].map(h => (
                        <div key={h} style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.06em", textTransform: "uppercase" }}>{h}</div>
                      ))}
                    </div>

                    {produkProfit.map((p, i) => {
                      const isProfit = p.profit >= 0;
                      const profitCol = isProfit ? CC.green : CC.red;
                      const marginPct = Math.min(Math.max(p.margin, 0), 100);
                      return (
                        <div key={i} className="row-hover" style={{ display: "grid", gridTemplateColumns: "2fr 0.8fr 1.2fr 1.2fr 1.2fr 0.8fr 0.8fr", gap: 8, padding: "12px 14px", borderBottom: `1px solid ${C.border}`, borderRadius: 8, alignItems: "center" }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }}>{p.nama_produk}</div>
                            <div style={{ height: 3, borderRadius: 2, background: C.dim, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${marginPct}%`, background: isProfit ? CC.green.color : CC.red.color, borderRadius: 2, transition: "width 0.5s ease" }} />
                            </div>
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.textMid, fontFamily: C.fontMono }}>{p.qty_terjual}</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: CC.blue.color, fontFamily: C.fontMono }}>{rupiah(p.omzet)}</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: CC.red.color, fontFamily: C.fontMono }}>{rupiah(p.hpp)}</div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: profitCol.color, fontFamily: C.fontMono }}>{rupiah(p.profit)}</div>
                          <div>
                            <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 800, background: profitCol.bg, color: profitCol.color, border: `1px solid ${profitCol.border}` }}>
                              {pctFmt(p.margin)}
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{rupiahShort(p.hpp_per_unit)}/unit</div>
                        </div>
                      );
                    })}

                    <div style={{ display: "grid", gridTemplateColumns: "2fr 0.8fr 1.2fr 1.2fr 1.2fr 0.8fr 0.8fr", gap: 8, padding: "12px 14px", background: CC.green.bg, borderRadius: 10, marginTop: 4, border: `1px solid ${CC.green.border}` }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: CC.green.color }}>TOTAL</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: CC.green.color, fontFamily: C.fontMono }}>{produkProfit.reduce((a, p) => a + p.qty_terjual, 0)}</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: CC.green.color, fontFamily: C.fontMono }}>{rupiah(totalOmzetProduk)}</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: CC.green.color, fontFamily: C.fontMono }}>{rupiah(totalHppProduk)}</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: CC.green.color, fontFamily: C.fontMono }}>{rupiah(totalProfitProduk)}</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: CC.green.color, fontFamily: C.fontMono }}>{pctFmt(totalOmzetProduk > 0 ? (totalProfitProduk / totalOmzetProduk) * 100 : 0)}</div>
                      <div />
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
