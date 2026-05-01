import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

interface Order {
  order_id: string;
  gross_amount: number;
  total_fee: number;
}

interface UploadRequest {
  tokoId: number;
  orders: Order[];
  total_transactions: number;
  total_gross: number;
  total_fee: number;
}

const parseOrderDate = (order_id: string): Date | null => {
  // Format Summary: "SUMMARY_2026-04-13_2026-04-19"
  if (order_id.startsWith("SUMMARY_")) {
    const parts = order_id.split("_");
    // parts[1] = "2026-04-13"
    if (parts[1]) {
      const d = new Date(parts[1]);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  }

  // Format pesanan Shopee: "260414SGF6A560" → YYMMDD
  const dateStr = order_id.substring(0, 6);
  const year  = 2000 + parseInt(dateStr.substring(0, 2));
  const month = parseInt(dateStr.substring(2, 4)) - 1;
  const day   = parseInt(dateStr.substring(4, 6));
  const d = new Date(year, month, day);
  return isNaN(d.getTime()) ? new Date() : d;
};

export async function POST(request: NextRequest) {
  try {
    const body: UploadRequest = await request.json();
    const { tokoId, orders, total_gross, total_fee } = body;

    if (!tokoId || !orders || orders.length === 0) {
      return NextResponse.json({ error: 'Data tidak valid' }, { status: 400 });
    }

    // Parse tanggal dari order_id
    const dates = orders
      .map(o => parseOrderDate(o.order_id))
      .filter((d): d is Date => d !== null);

    const today = new Date();
    const minDate = dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : today;
    const maxDate = dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : today;

    // Untuk format Summary, ambil periode dari order_id langsung
    let periodeStart = minDate.toISOString().split('T')[0];
    let periodeEnd   = maxDate.toISOString().split('T')[0];

    if (orders.length === 1 && orders[0].order_id.startsWith("SUMMARY_")) {
      const parts = orders[0].order_id.split("_");
      if (parts[1]) periodeStart = parts[1];
      if (parts[2]) periodeEnd   = parts[2];
    }


    // Fee breakdown proporsional (fallback — idealnya dari Excel langsung)
    const biaya_komisi          = Math.round(total_fee * 0.40);
    const biaya_administrasi    = Math.round(total_fee * 0.20);
    const biaya_layanan         = Math.round(total_fee * 0.30);
    const biaya_proses_pesanan  = Math.round(total_fee * 0.10);

    const { data, error } = await supabase
      .from('fee_platform')
      .insert({
        toko_id: tokoId,
        periode_start: periodeStart,
        periode_end: periodeEnd,
        total_penjualan_gross: total_gross,
        total_fee: total_fee,
        // persentase_fee: generated column, dihitung otomatis DB
        biaya_komisi,
        biaya_administrasi,
        biaya_layanan,
        biaya_proses_pesanan,
      })
      .select();

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json(
        { error: 'Gagal menyimpan: ' + error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Berhasil menyimpan data fee periode ${periodeStart} s/d ${periodeEnd}`,
      data,
    });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
