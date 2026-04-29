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

export async function POST(request: NextRequest) {
  try {
    const body: UploadRequest = await request.json();
    
    const { tokoId, orders, total_gross, total_fee } = body;

    if (!tokoId || !orders || orders.length === 0) {
      return NextResponse.json(
        { error: 'Data tidak valid' },
        { status: 400 }
      );
    }

    // Calculate periode from orders
    const dates = orders.map(o => {
      // Extract date from order_id if possible, or use current date
      // Format order_id biasanya: 241121xxxxx (YYMMDD...)
      const dateStr = o.order_id.substring(0, 6);
      const year = 2000 + parseInt(dateStr.substring(0, 2));
      const month = parseInt(dateStr.substring(2, 4)) - 1;
      const day = parseInt(dateStr.substring(4, 6));
      return new Date(year, month, day);
    });

    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));

    // Calculate fee breakdown (simplified - distribute proportionally)
    // In real scenario, you'd get this from Excel columns
    const biaya_komisi = total_fee * 0.40; // 40% komisi
    const biaya_administrasi = total_fee * 0.20; // 20% admin
    const biaya_layanan = total_fee * 0.30; // 30% layanan
    const biaya_proses_pesanan = total_fee * 0.10; // 10% proses

    const persentase_fee = (total_fee / total_gross) * 100;

    // Insert to fee_platform table
    const { data, error } = await supabase
      .from('fee_platform')
      .insert({
        toko_id: tokoId,
        periode_start: minDate.toISOString().split('T')[0],
        periode_end: maxDate.toISOString().split('T')[0],
        total_penjualan_gross: total_gross,
        total_fee: total_fee,
        persentase_fee: persentase_fee,
        biaya_komisi: biaya_komisi,
        biaya_administrasi: biaya_administrasi,
        biaya_layanan: biaya_layanan,
        biaya_proses_pesanan: biaya_proses_pesanan
      })
      .select();

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json(
        { error: 'Gagal menyimpan data ke database: ' + error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Berhasil menyimpan ${orders.length} transaksi`,
      data: data
    });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Terjadi kesalahan server' },
      { status: 500 }
    );
  }
}
