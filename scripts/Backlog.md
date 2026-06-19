# Azalea Management System — Backlog

> File ini adalah sumber kebenaran backlog project. Setiap selesai mengerjakan task,
> pindahkan item ke bagian "Selesai" dengan tanggal. Jangan hapus history yang sudah selesai.

---

## 🐛 Bug Aktif (Shopee)

| # | Bug | Detail | Priority |
|---|-----|--------|----------|
| 1 | Print AWB COD Drop Off error | Error "The package should print first" untuk pesanan COD Drop Off yang PROCESSED. Di Seller Center bisa cetak normal. Contoh: 260617BVJ8W2G9 | 🔴 |
| 2 | Dashboard saldo Rp0 | Saldo Shopee tidak muncul di dashboard utama | 🔴 |
| 3 | Saldo `error_not_found` | Endpoint get-wallet-balance error untuk beberapa toko | 🟡 |
| 4 | Ulasan 0 reviews | API ulasan tidak return data, kemungkinan butuh whitelist Shopee | 🟡 |
| 5 | Performa fails | Endpoint performa toko gagal, kemungkinan butuh whitelist | 🟡 |
| 6 | MarsellaFood & AsdaFood OTP blocked | Tidak bisa connect toko karena OTP provider XL bermasalah | 🔴 |
| 7 | Scan Resi belum teruji di mobile | Perlu testing di HP Android | 🟡 |
| 8 | Atur Pengiriman modal belum teruji penuh | Perlu lebih banyak testing real order | 🟡 |

---

## 🔄 Sedang Dikerjakan

| # | Task | Catatan |
|---|------|---------|
| 1 | Sync Pencairan Otomatis | Endpoint `sync-finance/route.ts` sudah ada logic-nya, perlu cek apakah sudah terhubung ke trigger/cron atau masih perlu dipanggil manual |

---

## ✅ Selesai

| # | Fitur/Bug | Tanggal | Catatan |
|---|-----------|---------|---------|
| 1 | Migrasi `lib/format.ts` ke 11 file | 2026-06-18 | rupiah, tanggalFmt, tanggalJamFmt terpusat |
| 2 | Retur Shopee shows 0 | 2026-06-18 | Filter terlalu ketat + sync-returns diperbaiki |
| 3 | Performa Pelanggan Offline | 2026-06-18 | Tab baru di /laporan — terakhir order, TRX, omset, produk favorit, piutang, nota |
| 4 | Nota Penjualan Offline 80mm | 2026-06-18 | Format resmi AzaleaFood dengan logo, header 2 kolom, tanda tangan |

---

## 🚀 Antrian Fitur — Prioritas Tinggi

| # | Fitur | Catatan |
|---|-------|---------|
| 1 | Rekap Packing Harian | Ganti kertas manual — auto-generate dari pesanan READY_TO_SHIP per SKU |
| 2 | Sync Pencairan Otomatis | Hubungkan sync-finance ke cron/tombol, hilangkan input manual satu-satu |
| 3 | Uang di Jalan per toko | Piutang Shopee yang belum cair, breakdown per toko |
| 4 | Biaya Packing Online | Gramasi bubble wrap/tape/kardus per SKU — tunggu Huda ukur dulu |

---

## ⚙️ Antrian Fitur — Prioritas Menengah

| # | Fitur | Catatan |
|---|-------|---------|
| 1 | Rebuild modul Retur | Purna jual, pengembalian dana |
| 2 | Rename "Pembelian Reseller" → "Pembelian Produk Jadi" | Codebase + UI |
| 3 | Purchase Order ke supplier | PO formal, print, terima barang |
| 4 | Shopee webhook real-time | Ganti polling 30 menit jadi real-time |
| 5 | Fix floating point `stok_barang` | Pakai `ROUND()` di query |
| 6 | AppShell redesign — fix breadcrumb | `AppShell_final.tsx` sudah dibuat, breadcrumb belum clickable |

---

## 📱 Android Apps

| # | App | Status |
|---|-----|--------|
| 1 | AzaleaBorongan | In progress — Kotlin, package com.azalea.borongan, Supabase BOM 3.0.2 |
| 2 | AzaleaPacking | Belum dibangun — scan resi, checklist packing, scan kirim |

---

## 🔌 Hardware Integration

| # | Hardware | Status |
|---|----------|--------|
| 1 | Digi RM60 (timbangan) | TCP/IP, SPEC 017/018/019 — belum dibangun |
| 2 | Thermal 58mm layout | Nota offline sudah 80mm, 58mm di-deferred |
| 3 | Dot matrix Epson LX-310/LX-350 | Nota rangkap resmi — beli printer dulu |

---

## 📈 Fase 3 — Growth (belum mulai)

- Profit report terintegrasi HPP
- WMS basic (scan bungkus, scan kirim)
- Batch & expiry tracking siomay
- Tier reseller (dibatalkan — diganti Performa Pelanggan) ✅ sudah ada solusinya
- Master produk multi-toko
- Shopee Chat API (tunggu whitelist)

---

## 🌐 Fase 4 — Ekspansi (belum mulai)

- TikTok Shop integration
- Lazada integration

---

## 📝 Key Learnings & Principles

- **Spec before code** — selalu cek `AZALEA_OMNICHANNEL_SPEC.md` sebelum bangun modul baru
- **Full file replacement** — generate file lengkap, bukan partial patch
- **RLS default** — public tables pakai `to public`, karyawan/gaji_harian pakai `to authenticated`
- **Format uang** — selalu pakai `rupiah()` dari `@/lib/format`, full Rp format tidak disingkat
- **Fee platform Shopee** = pengurang piutang, bukan kas keluar
- **HPP vs Operasional** — Operator Produksi/Packing/Pencetak masuk HPP; Host Live/Packing Online/Admin/Owner masuk kas keluar
- **Timezone** — selalu Asia/Jakarta (WIB)
