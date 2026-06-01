# AZALEA ERP — OMNICHANNEL SPEC
*Dibuat: 01 Juni 2026 | Referensi: BigSeller Help Center*
*Verdict: ✅ Perlu | ⚡ Perlu + Modifikasi | ⏳ Nanti | ❌ Skip*

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

**Fungsi:** Dari semua pesanan yang perlu dikirim, tampilkan total kebutuhan per SKU:

| SKU | Total Qty | Jumlah Pesanan |
|---|---|---|
| SM-500GR | 12 | 10 pesanan |
| SM-1K | 47 | 32 pesanan |
| SM-5K | 12 | 8 pesanan |

- Auto-generate setelah/bersamaan dengan bulk print resi
- Bisa di-print (thermal atau kertas biasa)
- Filter by batch (pagi / siang)

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

### 4B — Pembelian Reseller (sudah ada)
- Reseller order produk jadi ke Azalea
- Terhubung ke piutang offline

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
