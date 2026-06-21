# Azalea Management System — Backlog

> File ini adalah sumber kebenaran backlog project. Audit terakhir: 2026-06-20 (via Cursor).
> Setiap selesai mengerjakan task, pindahkan item ke bagian "Selesai" dengan tanggal.

---

## 🔴 Blocking / Butuh Aksi di Luar Cursor

| # | Item | Catatan |
|---|------|---------|
| 1 | Whitelist Shopee API | Ulasan, Performa, pending saldo — perlu approval dari Shopee, bukan bug kode |
| 2 | Connect MarsellaFood & AsdaFood | OTP provider XL bermasalah saat connect toko |

---

## 🟡 Nav Ada, Page Belum Dibuat (404) — 7 link

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

~~Stok Shopee~~ → **Selesai** di `/shopee/stok` + sidebar navigation

---

## 🟡 Fase 1 Spec — Belum Dibangun (Prioritas Operasional)

| # | Fitur | Catatan |
|---|-------|---------|
| 1 | **Alert stok minimum → Telegram** | Cepat, impact besar — 🎯 next |
| 2 | Push stok Shopee otomatis | API sudah ada, trigger belum dihubungkan |

~~Print Resi Massal~~ → **Selesai** `/shopee/pesanan/print-resi` + `/shopee/stok` manual input ✓

---

## 🟡 Fase 2 — Belum Dibangun

| # | Fitur | Catatan |
|---|-------|---------|
| 1 | Rebuild Retur lengkap | Modul purna jual penuh |
| 2 | Estimated profit per pesanan | Dari HPP — keunggulan vs BigSeller |
| 3 | Print invoice Shopee | |
| 4 | Blacklist pembeli — integrasi penuh | Page sudah ada, integrasi ke alur pesanan belum |
| 5 | Biaya Packing Online | Tunggu Huda ukur gramasi bubble wrap/tape/kardus |

~~Counter belum dicetak~~ → **Selesai** header pesanan + link Print Resi Massal ✓

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
| 1 | Print AWB COD production | Single print COD Drop Off — test production |
| 2 | Sync Pencairan E2E | Withdraw Seller Center → kas |
| 3 | Scan Resi di HP Android | Belum dicoba langsung di HP |
| 4 | Atur Pengiriman modal | Perlu test dengan order beneran lebih banyak |
| 5 | Bulk print resi EPOS | `/shopee/pesanan/print-resi` — test printer 100×150mm |

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
| 6 | Dashboard Saldo Shopee Rp0 | 2026-06-19 | Fix pakai get_wallet_transaction_list untuk current_balance realtime |
| 7 | **Bulk print resi batch pagi/siang** | 2026-06-19 | `/shopee/pesanan/print-resi` — batch, per toko, chunk, EPOS 100×150mm |
| 8 | **Counter belum dicetak + nav status filter** | 2026-06-19 | Header pesanan + `?status=to_print` dll. |
| 9 | **Stok Shopee — manual input + fix histori** | 2026-06-20 | Toggle otomatis/manual, query histori fix, `/shopee/stok` + sidebar nav |

---

## 🎯 Urutan Prioritas Sekarang

1. **Telegram alert stok minimum** — cepat, impact besar
2. Test bulk print resi di printer EPOS production
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
