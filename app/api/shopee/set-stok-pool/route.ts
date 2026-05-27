// app/api/shopee/set-stok-pool/route.ts
// Set anggaran stok virtual untuk satu produk dan distribusikan otomatis
// per toko Shopee aktif berdasarkan histori penjualan 30 hari terakhir.
// Toko tanpa histori mendapat jatah rata-rata dari sisa.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const HISTORY_WINDOW_DAYS = 30;

export async function POST(req: NextRequest) {
  try {
    const { stok_barang_id, total_anggaran } = await req.json();
    if (!stok_barang_id || typeof total_anggaran !== "number" || total_anggaran < 0) {
      return NextResponse.json({ error: "stok_barang_id dan total_anggaran wajib" }, { status: 400 });
    }

    // 1. Validasi produk
    const { data: produk } = await supabase
      .from("stok_barang")
      .select("id, nama_produk, sku")
      .eq("id", stok_barang_id)
      .single();
    if (!produk) return NextResponse.json({ error: "Produk tidak ditemukan" }, { status: 404 });

    // 2. Ambil semua toko Shopee aktif & connected
    const { data: tokoList } = await supabase
      .from("toko_online")
      .select("id, nama")
      .eq("platform", "Shopee")
      .eq("aktif", true)
      .not("shopee_access_token", "is", null);
    if (!tokoList?.length) {
      return NextResponse.json({ error: "Tidak ada toko Shopee aktif yang terhubung" }, { status: 400 });
    }

    // 3. Histori penjualan 30 hari per toko untuk produk ini
    const sinceDate = new Date(Date.now() - HISTORY_WINDOW_DAYS * 24 * 3600 * 1000)
      .toLocaleDateString("sv", { timeZone: "Asia/Jakarta" });
    const { data: histori } = await supabase
      .from("detail_penjualan_online")
      .select("qty, penjualan_online_id, penjualan_online!inner(toko_id)")
      .eq("stok_barang_id", stok_barang_id)
      .gte("tanggal_pesanan", sinceDate);

    const salesByToko = new Map<number, number>();
    (histori || []).forEach((row: any) => {
      const tokoId = row.penjualan_online?.toko_id;
      if (!tokoId) return;
      salesByToko.set(tokoId, (salesByToko.get(tokoId) || 0) + (row.qty || 0));
    });

    // 4. Hitung distribusi
    const tokoWithHistory = tokoList.filter(t => (salesByToko.get(t.id) || 0) > 0);
    const tokoWithoutHistory = tokoList.filter(t => !(salesByToko.get(t.id)! > 0));
    const totalSales = tokoWithHistory.reduce((a, t) => a + (salesByToko.get(t.id) || 0), 0);

    const distribusi: { toko_id: number; nama: string; jumlah: number; persentase: number }[] = [];
    let totalAllocated = 0;
    for (const t of tokoWithHistory) {
      const sales = salesByToko.get(t.id) || 0;
      const persen = totalSales > 0 ? sales / totalSales : 0;
      const jumlah = Math.floor(total_anggaran * persen);
      totalAllocated += jumlah;
      distribusi.push({ toko_id: t.id, nama: t.nama, jumlah, persentase: Math.round(persen * 10000) / 100 });
    }
    const sisa = Math.max(0, total_anggaran - totalAllocated);
    const perTokoSisa = tokoWithoutHistory.length > 0 ? Math.floor(sisa / tokoWithoutHistory.length) : 0;
    for (const t of tokoWithoutHistory) {
      distribusi.push({ toko_id: t.id, nama: t.nama, jumlah: perTokoSisa, persentase: 0 });
    }
    // Rounding remainder ke entry pertama
    if (distribusi.length > 0) {
      const sum = distribusi.reduce((a, r) => a + r.jumlah, 0);
      const diff = total_anggaran - sum;
      if (diff !== 0) distribusi[0].jumlah += diff;
    }

    // 5. Upsert pool
    const { data: pool, error: errPool } = await supabase
      .from("shopee_stok_pool")
      .upsert({
        stok_barang_id,
        total_anggaran,
        updated_at: new Date().toISOString(),
      }, { onConflict: "stok_barang_id" })
      .select("id")
      .single();
    if (errPool || !pool) throw new Error(`Gagal simpan pool: ${errPool?.message}`);

    // 6. Replace distribusi rows (delete + insert)
    await supabase.from("shopee_stok_distribusi").delete().eq("pool_id", pool.id);
    const rows = distribusi.map(d => ({
      pool_id: pool.id,
      toko_id: d.toko_id,
      stok_barang_id,
      jumlah: d.jumlah,
      persentase: d.persentase,
      updated_at: new Date().toISOString(),
    }));
    const { error: errIns } = await supabase.from("shopee_stok_distribusi").insert(rows);
    if (errIns) throw new Error(`Gagal simpan distribusi: ${errIns.message}`);

    return NextResponse.json({
      success: true,
      pool_id: pool.id,
      produk: produk.nama_produk,
      total_anggaran,
      distribusi,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
