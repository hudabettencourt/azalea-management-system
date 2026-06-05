# AZALEA ERP — OMNICHANNEL SPEC
*Dibuat: 01 Juni 2026 | Referensi: BigSeller Help Center*
*Verdict: ✅ Perlu | ⚡ Perlu + Modifikasi | ⏳ Nanti | ❌ Skip*

---

## FILOSOFI UTAMA AZALEA

> **"Fitur selengkap BigSeller, semudah Shopee Seller Center"**

- Fitur lengkap dan terintegrasi → referensi BigSeller
- UI/UX simpel dan familiar → referensi Shopee Seller Center
- Tidak ada learning curve tinggi untuk staff baru
- Setiap fitur harus bisa dipakai tanpa training panjang
- BigSeller terlalu kompleks untuk pengguna baru — Azalea harus terasa intuitif sejak hari pertama
- Print AWB: HTML `window.print()` via Chrome — sama seperti alur print di Shopee Seller Center, tidak perlu belajar baru
- **"Zero training policy"** — staff baru harus bisa langsung pakai tanpa dijelaskan. Kalau butuh training, berarti UI-nya harus diperbaiki, bukan staff-nya yang harus belajar lebih keras
- Bahasa tombol action-oriented dan jelas → "Print Resi" bukan "Cetak Label Pengiriman"
- Warna + icon intuitif → DROPOFF biru, PICKUP hijau, BELUM CETAK merah
- Flow linear → step 1 jelas, step 2 jelas, tidak ada pilihan membingungkan
- Default filter otomatis ke yang paling sering dipakai
- Setiap halaman maksimal 1-2 aksi utama yang jelas

### Safeguard Wajib di Modul Pesanan (bukan opsional):
- Badge DROPOFF / PICKUP warna beda per pesanan — tidak bisa terlewat
- Checklist status cetak per pesanan (sudah cetak / belum cetak)
- Warning alert kalau ada pesanan READY_TO_SHIP yang belum dicetak resinya
- Counter "X belum dicetak" di header halaman Pesanan

---

## PRINSIP ARSITEKTUR

1. **Platform-agnostic** — semua modul tidak boleh hardcode "Shopee". Gunakan `platform: "shopee" | "tiktok" | "lazada"` dari awal.
2. **API layer terpisah per platform** — `/lib/shopee/`, `/lib/tiktok/`, `/lib/lazada/`
3. **Multi-platform roadmap** — Shopee aktif, TikTok Shop + Lazada menyusul saat modal siap
4. **ERP terintegrasi** — HPP, produksi, gaji, kas terhubung langsung ke omnichannel (keunggulan vs BigSeller)
5. **Shell redesign dulu** — semua modul baru dibangun di IDE-style shell baru, tidak pakai UI lama
6. **Free solutions only** — tidak ada tools/upgrade berbayar

---

## HARDWARE NOTES

| Hardware | Spesifikasi | Dipakai untuk |
|---|---|---|
| Thermal label printer | EPOS EP-9200UB, kertas 100x150mm (A6), USB+Bluetooth | Print AWB resi Shopee |
| Thermal printer Digi RM60 | Kertas struk lebar | Gaji borongan, nota offline sementara |
| Dot matrix printer | ⏳ Beli nanti (rekomendasi Epson LX-310/LX-350), continuous form rangkap | Nota penjualan offline reseller |
| Barcode scanner / kamera HP | Untuk AzaleaPacking Android app | Scan resi saat packing |
| Digi RM60 scale | LAN 10/100M Ethernet + USB, TCP/IP SPEC 017/018/019 | Timbangan borongan |

**CSS Print Notes:**
- AWB Resi: `@page { size: 100mm 150mm; margin: 0; }`
- Nota thermal sementara: sesuaikan lebar kertas struk Digi
- Nota dot matrix nanti: `@page { size: continuous; }` monospace font

---

## ANDROID APPS

### App 1 — AzaleaBorongan (sudah planned)
- **Package:** `com.azalea.borongan`
- **User:** Operator produksi (shared login `produksi@azalea.com`)
- **Fungsi:** Input timbangan, gaji borongan per struk Digi RM60
- **Rule:** Insert only, tidak bisa edit/delete, koreksi via web admin
- **Status:** In progress

### App 2 — AzaleaPacking (baru dicatat)
- **User:** Staff packing online
- **Fungsi:**
  - Scan resi → tampilkan isi pesanan
  - Checklist item per pesanan (verifikasi sebelum bungkus)
  - Scan dan kirim → konfirmasi handover ke kurir
  - Lihat rekap packing harian
  - Alert stok minimum
- **Rule:** Insert only, tidak bisa edit/delete, koreksi via web admin
- **Hardware:** Kamera HP untuk scan barcode resi
- **Status:** ❌ Belum dibangun, masuk backlog

---

## GO-LIVE PLAN (setelah spec + shell selesai)

### Urutan go-live:
1. Bersihkan data dummy → truncate semua tabel test
2. Input master data → produk, bahan, karyawan, supplier, pelanggan
3. Input stok awal → stok fisik yang ada
4. Input saldo kas awal → saldo rekening + cash
5. Input piutang berjalan → reseller yang belum bayar
6. Mulai transaksi baru dari titik ini

### Fase go-live:
- **Fase 1** → ERP (Produksi, Pembelian, Penggajian, Kas, Laporan L/R)
- **Fase 2** → Shopee (setelah shell + bug fix selesai)
- **Fase 3** → Modul baru bertahap

---

## MODUL 1 — PESANAN

### Sub-modul: Proses Pesanan
| Fitur | Verdict | Catatan |
|---|---|---|
| List pesanan semua status | ✅ | Sudah ada, perlu diperkaya |
| Filter lengkap (toko, kurir, COD, waktu, SKU) | ✅ | Belum selengkap BigSeller |
| Tag/label COD per pesanan | ✅ | Mayoritas pesanan COD |
| Bulk action (proses massal) | ✅ | Belum ada |
| Print AWB / resi | ✅ | EPOS EP-9200UB, 100x150mm |
| Print invoice | ✅ | Belum ada |
| Rekap Packing Harian | ✅ | **Prioritas tinggi — ganti kertas manual harian!** |
| Estimated profit per pesanan | ✅ | Dari HPP Azalea — keunggulan utama! |
| Tandai pesanan (flag/mark) | ⚡ | Untuk prioritas packing |
| Pesanan dibatalkan | ✅ | Tampilkan dengan alasan |
| Out of stock warning | ✅ | Terhubung ke stok_barang |
| Sync pesanan manual | ✅ | Sudah ada |
| Blacklist pembeli | ✅ | Medium priority — banyak pembeli nakal |
| 2 batch print per hari | ✅ | Batch pagi (malam-pagi) + batch siang (pagi-12.00) |
| Filter rentang waktu custom | ✅ | Untuk cutoff jam 12.00 |

### Sub-modul: Rekap Packing Harian
> **Pain point nyata** — sekarang masih hitung manual di kertas setiap hari!

**Fungsi:** Dari semua pesanan yang perlu dikirim, tampilkan total kebutuhan per SKU. Format simpel — tidak perlu foto produk atau detail per pesanan seperti BigSeller. Cukup SKU + qty.

**Format print (thermal / kertas biasa):**
```
REKAP PACKING
02 Jun 2026 · Batch Siang (09:00 - 12:00)
AsdaFood + AzaleaFood.id + ErlinFood + RaizelFood
================================
SM-500GR    12 pcs
SM-1K       47 pcs
SM-5K       12 pcs
SM-10K       5 pcs
================================
TOTAL       76 pcs · 43 pesanan
================================
```

**Fitur:**
- Pilih batch: Pagi / Siang / custom rentang waktu
- Pilih toko: semua atau pilih beberapa
- Tombol Print → `window.print()` langsung
- Auto-generate bersamaan dengan bulk print resi
- Bisa print di thermal Digi atau kertas biasa

### Sub-modul: Purna Jual (After Sales)
| Fitur | Verdict | Catatan |
|---|---|---|
| List retur per toko + filter status | ✅ | Rebuild dari nol di shell baru |
| Detail retur (produk, dana, status) | ✅ | |
| Tracking status (Menunggu → Sedang → Sudah) | ✅ | |
| Stok otomatis bertambah saat retur diterima | ✅ | Sudah ada di confirm-return |
| Pengembalian dana | ⚡ | Dicatat sebagai piutang reducer |
| Jenis purna jual (Barang+Dana / Dana saja) | ✅ | |
| Hasil retur distribusi/gudang online | ❌ | Tidak relevan |

### Yang di-skip:
- ❌ POS Retail (model bisnis beda, sudah ada Penjualan Offline)
- ❌ Facebook/Messenger orders
- ❌ Distribution orders
- ❌ Wave management (skala belum butuh)

### Fitur Azalea-only (tidak ada di BigSeller):
- Integrasi HPP otomatis → profit real per pesanan
- Live Session tracking

---

## MODUL 2 — INVENTORY (Stok)

| Fitur | Verdict | Catatan |
|---|---|---|
| Merchant SKU master | ✅ | Sudah ada di `stok_barang` |
| Push stok ke Shopee otomatis | ✅ | Seperti BigSeller — auto push saat stok berubah |
| Push rule per toko | ✅ | Toko A 80%, toko B 20%, dll |
| Push log / riwayat | ✅ | Kapan push, berapa, sukses/gagal |
| Alert stok minimum → notif Telegram | ✅ | Belum ada, perlu segera |
| Stock count / opname | ✅ | Belum ada |
| Shelves / rak gudang | ⚡ | Kalau nanti layout gudang jelas |
| Mutasi stok log | ✅ | Sudah ada `mutasi_stok` |
| Manual stock in/out | ✅ | Sudah ada |
| Inventory batch & expiry | ⚡ | Relevan untuk siomay (kadaluarsa!) |
| Combination SKU / bundling | ⚡ | Bundling produk nanti |
| Reserved stock untuk promosi Shopee | ⚡ | |
| Defective product inventory | ⚡ | Produk reject produksi |
| Transfer antar gudang | ⚡ | Jika ada >1 gudang |
| Multi-unit management | ❌ | SKU sudah terpisah per ukuran |
| 3rd party warehouse | ❌ | Tidak pakai |

### Fitur Azalea-only:
- Stok terhubung langsung ke `produksi_batch` → otomatis bertambah setelah produksi

---

## MODUL 3 — WMS

| Fitur | Verdict | Catatan |
|---|---|---|
| Scan dan Bungkus | ✅ | Scan resi → verifikasi isi paket → bungkus |
| Scan dan Periksa | ✅ | Cegah salah kirim |
| Scan dan Kirim | ✅ | Konfirmasi handover ke kurir |
| Cari Pesanan by SKU | ✅ | Dari rekap packing langsung |
| Peringatan Stok Ulang | ✅ | Alert → notif Telegram |
| Stock opname | ✅ | Rekonsiliasi stok fisik vs sistem |
| Gudang & area gudang | ⚡ | 1 gudang utama dulu |
| Rak/shelves | ⚡ | Setelah layout gudang jelas |
| Stok Rak + Riwayat | ⚡ | Kalau sudah ada rak |
| Wave shipment | ❌ | Skala belum butuh |
| PDA scanning | ❌ | Pakai Android AzaleaPacking |

> **Catatan:** Fitur scan (Scan Bungkus, Scan Periksa, Scan Kirim) **wajib ada di AzaleaPacking Android app** — lebih praktis pakai kamera HP di area packing.

---

## MODUL 4 — PEMBELIAN

> **Catatan:** 3 modul pembelian yang berbeda konteks, tidak tumpang tindih.

### 4A — Pembelian Bahan (sudah ada)
- Beli bahan baku dari supplier untuk produksi
- Terhubung ke HPP produksi

### 4B — Pembelian Produk Jadi (sudah ada, nama lama: "Pembelian Reseller" — perlu di-rename!)
- Beli produk jadi dari supplier untuk dijual kembali: pilus, cuanki, lidah, dll
- Azalea hanya produksi siomay sendiri — produk lain beli jadi
- Perlu rename di: nama modul, UI, dan nama tabel/variabel di codebase

### 4C — Pembelian / Purchase (belum ada)
| Fitur | Verdict | Catatan |
|---|---|---|
| Purchase Order ke supplier | ✅ | PO formal ke supplier bahan |
| Supplier list | ✅ | Sudah ada `supplier` tapi perlu diperkaya |
| Purchase suggestion (reorder alert) | ✅ | Auto-suggest beli saat stok mendekati minimum |
| Purchase plan | ⚡ | Rencana beli berdasarkan forecast produksi |
| Print PO | ✅ | Kirim ke supplier |
| Terima barang (stock in dari PO) | ✅ | Sudah ada alurnya |
| 1688 purchase order | ❌ | Tidak relevan |

---

## MODUL 5 — MARKETING / PROMOSI

| Fitur | Lokasi | Verdict | Catatan |
|---|---|---|---|
| Voucher/Diskon Shopee | Shopee | ✅ | Sudah ada |
| Flash Sale Toko | Shopee | ✅ | Perlu dibangun |
| Pelanggan Shopee (buyer online) | Shopee → Pelanggan | ✅ | Belum ada, perlu dibangun |
| Pelanggan Offline (reseller) | ERP → Pelanggan | ✅ | Sudah ada |
| Blacklist Pembeli | Shopee | ✅ | Medium priority, banyak pembeli nakal |
| Shopee Ads | Shopee | ❌ | Skip, butuh whitelist API |
| Auto-reply ulasan | Shopee | ❌ | Skip, butuh whitelist API |
| Promotion watermark | - | ❌ | Tidak relevan |
| TikTok/Facebook Ads | - | ❌ | Tidak pakai |

---

## MODUL 6 — PRODUK SHOPEE

| Fitur | Verdict | Catatan |
|---|---|---|
| Live (produk aktif di Shopee) | ✅ | List + edit stok/harga |
| Naikkan Produk (boost) | ✅ | Re-boost listing |
| Master Produk (sync ke semua toko) | ⚡ | Push info produk ke 4 toko sekaligus |
| Draf produk | ⚡ | Staging sebelum publish |
| Promo Diskon | ✅ | Sudah ada di Promosi |
| Flash Sale Toko | ✅ | |
| Scrape/salin dari marketplace lain | ❌ | Tidak relevan |
| Pemilihan Produk 1688 | ❌ | Tidak relevan |
| Video Center | ❌ | Skip |
| Kombo Hemat / Paket Diskon | ❌ | Skip dulu |

---

## MODUL 7 — KEUANGAN / REKAP SALDO

### Rekap Saldo (improvement dari yang sudah ada)
| Fitur | Verdict | Catatan |
|---|---|---|
| Auto-sync via API (ganti upload Excel) | ✅ | Gunakan `get_order_list` + `get_escrow_detail` + `get_income_overview` |
| Rekap per toko + total | ✅ | Group by `toko_id` |
| Uang di Jalan (pending semua metode) | ✅ | Semua pesanan dikirim belum cair |
| Estimasi fee per batch | ✅ | Gross - estimasi fee Shopee |
| Risiko COD gagal | ✅ | COD belum konfirmasi terpisah |
| Risiko retur/sengketa | ✅ | |
| Pencairan otomatis tercatat | ✅ | Dari `get_escrow_detail` |
| Platform payment reconciliation | ✅ | Sudah ada, perlu diperkaya |

**Tampilan Uang di Jalan:**
```
Uang di Jalan — Semua Toko
━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL               Rp 12.500.000
  Estimasi fee      Rp    625.000
  Estimasi bersih   Rp 11.875.000
━━━━━━━━━━━━━━━━━━━━━━━━━━━
AzaleaFood.id       Rp  5.200.000  (42 pesanan)
AzaleaSnack         Rp  3.800.000  (31 pesanan)
ErlinFood           Rp  2.100.000  (18 pesanan)
RaizelFood          Rp  1.400.000  (12 pesanan)
━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ COD belum konfirmasi   Rp 4.200.000
⚠️ Retur/sengketa         Rp   350.000
```

### Excel yang diganti API:
| Upload Manual Sekarang | Diganti Endpoint |
|---|---|
| Order All | `get_order_list` auto-sync |
| My Balance → Penghasilan per pesanan | `get_escrow_detail` per order_sn |
| My Balance → Penarikan Dana | `get_income_overview` |
| Saldo Akhir | Kalkulasi kumulatif dari transaksi |

---

## MODUL 8 — LAPORAN

| Fitur | Verdict | Catatan |
|---|---|---|
| Store report (omzet per toko) | ✅ | Ada di Dashboard, perlu diperkaya |
| Order report | ✅ | Belum ada dedicated page |
| Sales report per SKU | ✅ | Belum ada |
| Profit report per pesanan | ✅ | **Keunggulan Azalea** — HPP terintegrasi |
| Profit report per toko | ✅ | Belum ada |
| Invoicing report (mutasi stok) | ✅ | Dari `mutasi_stok` |
| Platform payment reconciliation | ✅ | Sudah ada Rekap Saldo |
| Live Sales Monitor | ⏳ | Hold — tunggu live aktif |
| Shopee store health | ❌ | Skip, butuh whitelist |
| Laporan Lazada/TikTok | ⏳ | Nanti saat platform aktif |

---

## MODUL 9 — PENJUALAN OFFLINE

| Fitur | Verdict | Catatan |
|---|---|---|
| Input penjualan reseller | ✅ | Sudah ada |
| Print nota | ✅ | **Sementara: thermal printer Digi** |
| Print nota dot matrix rangkap | ⏳ | Tunggu beli Epson LX-310/LX-350 |
| Tier reseller (Bronze/Silver/Gold) | ⚡ | By annual omzet |
| Rekap performa pelanggan offline | ✅ | Omzet, trend, frekuensi, favorit |

**Format nota thermal sementara:**
```
================================
        AZALEA FOOD
   Penjualan Offline
================================
Tgl: 01/06/2026   No: OFF-001
--------------------------------
SM-1K    x5    Rp  22.117
SM-5K    x2    Rp 102.000
--------------------------------
Total          Rp 314.585
Bayar          Rp 350.000
Kembali        Rp  35.415
================================
Metode: Transfer BCA
================================
```

---

## MULTI-PLATFORM ROADMAP

| Platform | Status | Verdict |
|---|---|---|
| Shopee | ✅ Aktif (4 toko) | Sudah jalan |
| TikTok Shop | ⏳ Rencana | Siapkan struktur, implementasi saat modal siap |
| Lazada | ⏳ Rencana | Siapkan struktur, implementasi saat modal siap |
| Tokopedia | ❓ Belum ada rencana | Hold |

**Aturan coding multi-platform:**
```typescript
// ❌ Jangan hardcode
const fetchShopeeOrders = () => ...

// ✅ Yang benar
const fetchOrders = (platform: "shopee" | "tiktok" | "lazada") => ...
```

---

## FITUR YANG DI-SKIP TOTAL

| Kategori | Alasan |
|---|---|
| Logistic 3PL (EasyParcel, dll) | Shopee handle sendiri |
| Third-party Warehouse | Tidak pakai |
| Accounting Software integration | Azalea punya modul keuangan sendiri |
| Distribution network | Tidak relevan |
| Product Sourcing (Scrape/1688) | Tidak relevan |
| Multi-unit management | SKU sudah terpisah per ukuran |
| Wave management | Skala belum butuh |
| PDA scanning | Pakai Android AzaleaPacking |
| Facebook/Messenger/TEMU orders | Tidak pakai |
| Fitur butuh whitelist API | Skip sampai whitelist approved |

---

## PRIORITAS PENGERJAAN

### Urutan besar (sudah disepakati):
1. ✅ Fix semua bug Shopee yang pending
2. 🔄 Shell redesign (IDE-style 3-level)
3. 🔄 Bangun modul baru di shell baru

### Fase 1 — Operasional harian (paling urgent):
1. **Rekap Packing Harian** — ganti kertas manual harian
2. **Bulk print resi** — EPOS EP-9200UB 100x150mm
3. **Alert stok minimum** → notif Telegram
4. **Rekap Saldo otomatis** — ganti upload Excel manual
5. **Uang di Jalan** per toko + total

### Fase 2 — Operasional penting:
6. Rebuild modul Purna Jual / Retur
7. Print nota penjualan offline (thermal dulu)
8. Purchase suggestion / reorder alert
9. Blacklist pembeli
10. Pelanggan Shopee

### Fase 3 — Growth:
11. Profit report terintegrasi HPP
12. WMS basic (scan bungkus, scan kirim) → AzaleaPacking Android
13. Batch & expiry tracking (siomay kadaluarsa)
14. Tier reseller Bronze/Silver/Gold
15. Master Produk multi-toko

### Fase 4 — Ekspansi:
16. TikTok Shop integration
17. Lazada integration
18. Dot matrix print nota rangkap
19. AzaleaPacking Android app

---

## PAIN POINT OPERASIONAL YANG HARUS DIOTOMASI

| Pain Point | Kondisi Sekarang | Solusi di Azalea |
|---|---|---|
| Rekap kebutuhan packing harian | Tulis tangan di kertas setiap hari | Auto-generate dari pesanan READY_TO_SHIP |
| Rekap saldo Shopee | Download Excel manual per toko | Auto-sync via API |
| Hitung COD pending | Tidak ada tracking | Query pesanan COD belum cair |
| Nota penjualan reseller | Tulis tangan | Print thermal/dot matrix |
| Verifikasi isi paket sebelum kirim | Manual, rawan salah kirim | Scan dan Periksa di AzaleaPacking |

---

## CATATAN TEKNIS PENTING

- **Indonesian number formatting:** selalu `toLocaleString("id-ID")`
- **Timezone:** semua timestamp WIB (Asia/Jakarta)
- **RLS:** selalu enabled + authenticated policy di setiap tabel baru
- **Fee platform:** AR reducer, bukan kas keluar
- **Weighted average costing:** untuk HPP bahan baku
- **Shopee whitelist pending:** Ulasan, Performa, Saldo endpoint — sembunyikan dari sidebar
- **Excel parsing:** gunakan `parseExcelNumber()` helper untuk angka dengan titik (186.000 = 186000)
- **Cloudinary:** foto struk/receipt, auto-expiry 3 bulan
- **Telegram bot:** `@azalea_notif_bot`, chat ID `1551520964` — untuk notif stok + transaksi penting

---

## SHELL REDESIGN — AppShell.tsx

### File yang terlibat:
- `components/AppShell.tsx` ← **baru, mengganti Sidebar.tsx**
- `config/navigation.ts` ← **baru, navigasi config terpisah**
- `context/ThemeContext.tsx` ← tetap dipakai, tidak diubah
- `app/layout.tsx` ← tetap dipakai, tidak diubah

### File lama yang akan deprecated:
- `components/Sidebar.tsx` ← diganti AppShell, jangan hapus dulu sampai semua halaman migrasi

### Layout (sudah disetujui via wireframe v2):
```
┌────┬──────────────┬─────────────────────────────────┐
│ 56 │     210      │         flex (main)              │
│    │              │ [topbar 44px]                    │
│act │   sidebar    │ [content]                        │
│bar │ (contextual) │                                  │
│    │              │                                  │
├────┴──────────────┴─────────────────────────────────┤
│              status bar 28px (hijau)                 │
└──────────────────────────────────────────────────────┘
```

### Komponen:
1. **Activity Bar** (56px, kiri) — icon + label per modul utama
2. **Contextual Sidebar** (210px, collapsible) — sub-menu sesuai modul aktif, grup collapsible
3. **Top Bar** (44px) — auto breadcrumb + page-specific action buttons + notif + darkmode + avatar
4. **Status Bar** (28px, bawah, hijau #1a7f64) — Shopee sync info + toko aktif

### Modul di Activity Bar (urutan):
1. Shopee (ti-shopping-bag)
2. Produksi (ti-tool)
3. Pembelian (ti-truck)
4. Penggajian (ti-users)
5. Keuangan (ti-wallet)
6. Laporan (ti-chart-bar)
7. [spacer]
8. Admin (ti-settings) ← di bawah

### Navigasi Shopee (lengkap):
```
Shopee
├── Pesanan
│   ├── Menunggu Diproses
│   ├── Menunggu Dicetak
│   ├── Menunggu Pickup
│   ├── Pesanan Dikirim
│   ├── Pesanan Selesai
│   ├── Pesanan Dibatalkan
│   └── Semua Pesanan
├── Purna Jual
│   ├── Proses Retur
│   ├── Hasil Retur
│   └── Pengembalian Dana
├── Produk
│   ├── Live
│   ├── Draft
│   └── Naikkan Produk
├── Promosi
│   ├── Voucher & Diskon
│   └── Flash Sale
├── Packing & WMS
│   ├── Rekap Packing
│   ├── Scan & Bungkus
│   └── Scan & Kirim
├── Keuangan
│   ├── Rekap Saldo
│   ├── Uang di Jalan
│   └── Pencairan
├── Laporan Shopee
│   ├── Laporan Pesanan
│   ├── Laporan per SKU
│   └── Laporan per Toko
└── Pelanggan
    ├── Pelanggan Shopee
    └── Blacklist
```

### Navigasi ERP:
```
Produksi
├── Produksi → Batch Produksi, HPP per Batch, Bahan Baku
└── Timbangan → Input Borongan, Rekap Borongan

Pembelian
├── Bahan Baku → Daftar Pembelian, Purchase Order, Supplier Bahan
├── Produk Jadi → Daftar Pembelian, Purchase Order, Supplier Produk
└── Reorder Alert → Saran Pembelian

Penggajian
├── Gaji → Gaji Harian, Gaji Borongan, Rekap Penggajian
└── Karyawan → Data Karyawan

Keuangan
├── Kas → Kas Masuk, Kas Keluar, Rekap Kas
└── Piutang → Piutang Offline, Piutang Online

Laporan
├── Keuangan → Laba Rugi, Laporan Toko Online, Laporan Offline
└── Operasional → Laporan Produksi, Laporan Stok, Rekap Pelanggan

Admin
├── Master Data → Produk, Bahan Baku, Supplier, Pelanggan Offline, Karyawan
├── Integrasi → Toko Shopee, TikTok Shop (soon), Lazada (soon)
└── Sistem → Users, PLU Borongan, Varian Borongan
```

### Catatan teknis:
- Gunakan Tabler Icons outline webfont (`<i class="ti ti-...">`) — sudah dipakai di wireframe
- ThemeContext tetap dipakai (LIGHT/DARK palette sudah bagus)
- Notifikasi bell pindah ke top bar (sudah ada logikanya di Sidebar.tsx lama)
- Dark mode toggle pindah ke top bar
- Avatar tetap di top bar kanan
- Status bar pakai warna hijau fixed #1a7f64 (bukan dari theme)
- Platform filter (Shopee/TikTok/Lazada) muncul sebagai pill di dalam halaman, bukan menu utama

---

## STRUKTUR HPP (Harga Pokok Penjualan)

### HPP Offline (produk siomay dijual ke reseller/offline):
Komponen:
1. Bahan baku (terigu, ikan, dll) — weighted average
2. Bahan packing offline (plastik, lakban, staples)
3. Gaji produksi
4. Gaji packing offline
5. Gaji borongan
6. Gas
7. Uang makan

### HPP Online (produk siomay dijual via Shopee/marketplace):
= HPP Offline + tambahan packing online:
1. Semua komponen HPP Offline di atas
2. Packing online: kardus, lakban, bubble wrap, kertas resi
3. Gaji packing online

### Metode costing harga bahan dinamis:
- **Weighted Average (Rata-rata Tertimbang)** — sudah dipakai, metode yang benar
- Contoh: terigu beli 10kg @ Rp10.000 + 10kg @ Rp11.000 → rata-rata Rp10.500/kg
- Setiap produksi pakai harga rata-rata stok saat itu
- Syarat: pembelian SELALU diinput sebelum produksi (sudah jadi alur Azalea)
- Berlaku untuk semua bahan baku DAN bahan packing yang harganya fluktuatif

### Catatan implementasi:
- Bahan packing (plastik, kardus, lakban, bubble, kertas resi, staples) harus masuk sebagai item di `bahan_baku` atau tabel terpisah dengan weighted average costing
- HPP per batch produksi harus bisa pisahkan komponen offline vs tambahan online
- Margin/laba dihitung: Harga Jual − HPP (offline atau online sesuai channel)

---

## KALKULASI PROFIT PER PESANAN SHOPEE

> Ini keunggulan terbesar Azalea vs BigSeller — BigSeller tidak tau HPP produksi, Azalea tau semua komponen dari dalam sehingga profit per pesanan bisa benar-benar akurat.

### Formula:
```
Harga Jual Pembeli
− Biaya packing online per pesanan (kardus/bubble/resi) ← per pesanan
− Fee Shopee (% dari harga jual, beda tiap kategori)
− Biaya pengiriman (kalau ditanggung seller)
− Voucher/diskon seller (bukan yang ditanggung Shopee)
− Biaya COD (kalau ada, ada biaya tambahan)
────────────────────────────────────────────
= Pendapatan Bersih per Pesanan
− HPP Offline (porsi per produk dari batch produksi)
────────────────────────────────────────────
= PROFIT BERSIH per Pesanan
```

### Yang bikin kompleks (harus ditangani):
- Fee Shopee beda per kategori produk
- Voucher Shopee vs voucher seller — yang nanggung berbeda
- Ongkir: kadang subsidi Shopee, kadang seller
- COD ada biaya tambahan vs non-COD
- Flash sale margin beda dengan harga normal
- Fee beda per toko (tergantung program Shopee yang diikuti)

### Catatan implementasi:
- HPP Offline per produk = total HPP batch ÷ total output batch (sudah ada di `produksi_batch`)
- Packing online dihitung per pesanan, bukan per batch
- Fee Shopee diambil dari `fee_platform` yang sudah ada
- Voucher seller dicatat sebagai pengurang pendapatan
- Hasil akhir tampil di modul Laporan → Profit Report per Pesanan
- Bisa drill-down per toko, per SKU, per periode

---

## BLIND SPOT — FITUR YANG BELUM KEPIKIRAN

### 1. Expired & Shelf Life Tracking 🕐
- Siomay adalah produk makanan — ada kadaluarsa
- Setiap batch produksi harus dicatat tanggal produksi + tanggal kadaluarsa
- Alert otomatis ke Telegram kalau ada stok mendekati expired
- Stok expired tidak boleh dijual → harus dicatat sebagai kerugian/disposal
- Tampil di modul Inventory: stok normal vs stok mau expired vs stok expired
- **Implementasi:** tambah kolom `tgl_produksi` + `tgl_expired` di `stok_barang` atau tabel batch stok

### 2. Reject Produksi 🗑️ ← BELUM KEPIKIRAN, PENTING!
- Setiap batch produksi pasti ada produk reject/gagal (bentuk cacat, gosong, dll)
- Sekarang tidak dicatat → HPP tidak akurat!
- Contoh dampak:
  ```
  Bahan batch:       Rp 500.000
  Output normal:     50 bungkus
  Output reject:      5 bungkus
  HPP salah:  500.000 ÷ 55 = Rp 9.090/bungkus
  HPP benar:  500.000 ÷ 50 = Rp 10.000/bungkus
  ```
- Reject tidak masuk stok tapi biayanya tetap terhitung di HPP
- Bisa monitor trend reject per batch — kalau naik ada masalah produksi
- **Implementasi:** tambah field `output_reject` + `alasan_reject` di `produksi_batch`

### 3. Yield Rate Produksi 📊
- Yield = output produk jadi ÷ input bahan baku (dalam kg)
- Misal: masuk 10kg bahan → keluar 8kg produk = yield 80%
- Kalau yield tiba-tiba turun → ada masalah di proses produksi
- Monitor trend yield per batch, per operator, per periode
- **Implementasi:** hitung otomatis dari data batch yang sudah ada + tambah kolom `total_kg_input`

### 4. Forecast & Perencanaan Produksi 📅
- Berdasarkan historis pesanan → prediksi kebutuhan produksi minggu depan
- Otomatis saran: "minggu depan estimasi butuh X batch, beli bahan Y kg"
- Terhubung ke Purchase Suggestion (reorder alert) di modul Pembelian
- Mencegah kehabisan stok mendadak atau overstock
- **Implementasi:** analisa `penjualan_online` + `penjualan_offline` historis → generate forecast

### 5. Tracking Retur COD yang Belum Kembali 📦
- Paket COD ditolak pembeli → proses retur bisa 1-2 minggu
- Selama itu stok "hilang" di logistik — tidak di gudang, tidak terjual
- Harus ada status: Terkirim → Ditolak → Dalam Perjalanan Balik → Diterima Kembali
- Stok baru bertambah kembali setelah paket benar-benar diterima
- Terhubung ke modul Purna Jual + Inventory
- **Implementasi:** tambah status retur COD di `retur_online`, update stok hanya saat konfirmasi diterima

---

## CATATAN TAMBAHAN PRODUKSI

### Input per batch yang harus ada:
- Output normal (layak jual) per SKU
- Output reject (tidak layak jual) + alasan
- Total kg input bahan
- Yield rate (auto-hitung)
- Tanggal produksi + tanggal expired output

### HPP yang benar:
```
Total biaya batch
÷ Output NORMAL saja (reject tidak dihitung)
= HPP per unit yang akurat
```

---

## RESPONSIVE DESIGN — AppShell Mobile

> Wajib bagus di HP Chrome — bukan hanya desktop. Owner harus bisa pantau bisnis dari HP kapan saja, bahkan saat Android app down/error.

### Breakpoint:
- **Desktop** (≥768px) → IDE-style penuh (activity bar + sidebar + content)
- **Mobile** (<768px) → layout mobile-friendly

### Layout Mobile:
```
┌─────────────────────────────┐
│ ☰  Azalea          🔔  H   │  ← top bar simpel
├─────────────────────────────┤
│                             │
│         KONTEN              │  ← full width
│                             │
└─────────────────────────────┘
│ 🛍 Shopee  ⚙️ Prod  💰 Kas │  ← bottom nav bar
└─────────────────────────────┘
```

### Aturan mobile:
- Activity bar → pindah ke **bottom navigation bar** (seperti app Shopee)
- Sidebar → muncul sebagai **drawer** saat hamburger ☰ diklik
- Card dashboard → **2 kolom**, font lebih kecil
- Tabel → **scroll horizontal** atau tampilan list card
- Tombol → lebih besar, mudah diklik jari
- Font size → lebih kecil dari desktop
- Padding → lebih kecil biar konten muat

### Kenapa perlu:
- Owner pantau bisnis dari HP kapan saja
- Backup saat Android app (AzaleaBorongan/AzaleaPacking) down atau error
- Tidak perlu buka laptop hanya untuk cek dashboard/laporan
- Responsive = standard web modern, bukan fitur tambahan

### Catatan:
- Android native app (AzaleaBorongan, AzaleaPacking) tetap untuk staff operasional
- HP Chrome → khusus owner untuk monitoring, bukan operasional harian
