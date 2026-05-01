import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ✅ Gunakan service role key untuk bypass RLS di server-side
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

export async function POST(request: NextRequest) {
  try {
    const body: UploadRequest = await request.json();
    const { tokoId, orders, total_gross, total_fee } = body;

    if (!tokoId || !orders || orders.length === 0) {
      return NextResponse.json({ error: 'Data tidak valid' }, { status: 400 });
    }

    // Parse periode dari order_id
    let periodeStart = new Date().toISOString().split('T')[0];
    let periodeEnd   = new Date().toISOString().split('T')[0];

    if (orders.length === 1 && orders[0].order_id.startsWith("SUMMARY_")) {
      // Format: "SUMMARY_2026-04-13_2026-04-19"
      const match = orders[0].order_id.match(/(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})/);
      if (match) {
        periodeStart = match[1];
        periodeEnd   = match[2];
      }
    } else {
      // Format per pesanan: "260414SGF6A560" → YYMMDD
      const dates = orders.map(o => {
        const ds = o.order_id.substring(0, 6);
        const y = 2000 + parseInt(ds.substring(0, 2));
        const m = parseInt(ds.substring(2, 4)) - 1;
        const d = parseInt(ds.substring(4, 6));
        const dt = new Date(y, m, d);
        return isNaN(dt.getTime()) ? new Date() : dt;
      });
      const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
      periodeStart = minDate.toISOString().split('T')[0];
      periodeEnd   = maxDate.toISOString().split('T')[0];
    }

    // Fee breakdown proporsional
    const biaya_komisi         = Math.round(total_fee * 0.40);
    const biaya_administrasi   = Math.round(total_fee * 0.20);
    const biaya_layanan        = Math.round(total_fee * 0.30);
    const biaya_proses_pesanan = Math.round(total_fee * 0.10);

    const { data, error } = await supabaseAdmin
      .from('fee_platform')
      .insert({
        toko_id: tokoId,
        periode_start: periodeStart,
        periode_end: periodeEnd,
        total_penjualan_gross: total_gross,
        total_fee: total_fee,
        biaya_komisi,
        biaya_administrasi,
        biaya_layanan,
        biaya_proses_pesanan,
      })
      .select();

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: 'Gagal menyimpan: ' + error.message }, { status: 500 });
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
