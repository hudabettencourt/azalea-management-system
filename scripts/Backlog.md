# Azalea Management System — Backlog

> File ini adalah sumber kebenaran backlog project. Audit terakhir: 2026-06-18 (via Cursor).
> Setiap selesai mengerjakan task, pindahkan item ke bagian "Selesai" dengan tanggal.

---

## 🔴 Blocking / Butuh Aksi di Luar Cursor

| # | Item | Catatan |
|---|------|---------|
| 1 | Whitelist Shopee API | Ulasan, Performa, pending saldo — perlu approval dari Shopee, bukan bug kode |
| 2 | Connect MarsellaFood & AsdaFood | OTP provider XL bermasalah saat connect toko |

---

## 🟡 Nav Ada, Page Belum Dibuat (404) — 8 link

| # | Halaman | Modul |
|---|---------|-------|
| 1 | Hasil Retur | Retur |
| 2 | Pengembalian Dana | Retur |
| 3 | Live | Produk |
| 4 | Draft | Produk |
| 5 | Naikkan Produk | Produk |
| 6 | Flash Sale | Promosi |
| 7 | Scan & Bungkus | Packing |
| 8 | Scan & Kirim | Packing |

---

## 🟡 Fase 1 Spec — Belum Dibangun (Prioritas Operasional)

| # | Fitur | Catatan |
|---|-------|---------|
| 1 | **Bulk print resi (batch pagi/siang)** | EPOS 100×150mm — 🎯 next |
| 2 | **Alert stok minimum → Telegram** | Cepat, impact besar — 🎯 next |
| 3 | Push stok Shopee otomatis | API sudah ada, trigger belum dihubungkan |

---

## 🟡 Fase 2 — Belum Dibangun

| # | Fitur | Catatan |
|---|-------|---------|
| 1 | Rebuild Retur lengkap | Modul purna jual penuh |
| 2 | Estimated profit per pesanan | Dari HPP — keunggulan vs BigSeller |
| 3 | Print invoice Shopee | |
| 4 | Counter "belum dicetak" di Pesanan | |
| 5 | Blacklist pembeli — integrasi penuh | Page sudah ada, integrasi ke alur pesanan belum |
| 6 | Biaya Packing Online | Tunggu Huda ukur gramasi bubble wrap/tape/kardus |

---

## 🟡 Infrastruktur / Polish

| # | Item | Catatan |
|---|------|---------|
| 1 | Shopee webhook | Ganti polling 30 menit |
| 2 | Fix floating point `stok_barang` | Pakai `ROUND()` di query |
| 3 | Breadcrumb clickable di AppShell | `AppShell_final.tsx` sudah ada, belum di-apply |
| 4 | Rename "Pembelian Reseller" → "Pembelian Produk Jadi" | Codebase + UI |
| 5 | Purchase Order ke supplier | PO formal, print, terima barang |

---

## 🟢 Sudah Di-code, Butuh Test Real-World

| # | Fitur | Catatan |
|---|-------|---------|
| 1 | Print AWB COD production | Single print COD Drop Off masih error "should print first" |
| 2 | Sync Pencairan E2E | Withdraw Seller Center → kas, endpoint sudah ada di sync-finance |
| 3 | Scan Resi di HP Android | Belum dicoba langsung di HP |
| 4 | Atur Pengiriman modal | Perlu test dengan order beneran lebih banyak |

---

## 📱 Android & Hardware — Belum

| # | Item | Status |
|---|------|--------|
| 1 | AzaleaPacking | Belum dibangun |
| 2 | AzaleaBorongan | In progress |
| 3 | Timbangan Digi RM60 | TCP/IP belum dibangun |
| 4 | Dot matrix printer | Beli hardware dulu |
| 5 | Thermal 58mm layout | Deferred — 80mm sudah jadi |

---

## 🌐 Fase 3–4 — Belum Mulai

- Profit report terintegrasi HPP
- WMS basic
- Batch & expiry tracking siomay
- TikTok Shop integration
- Lazada integration
- Shopee Chat API
- Stock opname

---

## ✅ Selesai

| # | Fitur/Bug | Tanggal | Catatan |
|---|-----------|---------|---------|
| 1 | Migrasi `lib/format.ts` ke 11 file | 2026-06-18 | rupiah, tanggalFmt, tanggalJamFmt terpusat |
| 2 | Retur Shopee shows 0 | 2026-06-18 | Filter terlalu ketat + sync-returns diperbaiki |
| 3 | Performa Pelanggan Offline | 2026-06-18 | Tab baru di /laporan |
| 4 | Nota Penjualan Offline 80mm | 2026-06-18 | Format resmi AzaleaFood |
| 5 | Bulk Print Label / AWB (non-COD) | 2026-06-18 | Checkbox multi-select + group per toko |
| 6 | Dashboard Saldo Shopee Rp0 | 2026-06-19 | Fix pakai get_wallet_transaction_list untuk current_balance realtime, tidak perlu whitelist khusus |

---

## 🎯 Urutan Prioritas Sekarang

1. **Bulk print resi batch pagi/siang** — operasional harian
2. **Telegram alert stok minimum** — cepat, impact besar
3. Bangun 1 halaman 404 prioritas — misal Scan & Bungkus
4. Fix print AWB COD production (single print)
5. Test Sync Pencairan E2E

---

## 📝 Key Learnings & Principles

- **Spec before code** — selalu cek `AZALEA_OMNICHANNEL_SPEC.md` sebelum bangun modul baru
- **Full file replacement** — generate file lengkap, bukan partial patch
- **RLS default** — public tables pakai `to public`, karyawan/gaji_harian pakai `to authenticated`
- **Format uang** — selalu pakai `rupiah()` dari `@/lib/format`
- **Fee platform Shopee** = pengurang piutang, bukan kas keluar
- **HPP vs Operasional** — Operator Produksi/Packing/Pencetak masuk HPP; Host Live/Packing Online/Admin/Owner masuk kas keluar
- **Timezone** — selalu Asia/Jakarta (WIB)
