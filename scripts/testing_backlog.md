# Testing Backlog — Azalea ERP

Backlog untuk AI-as-QA testing menggunakan Playwright MCP di Cursor.
Terakhir diupdate: 19 Juni 2026

---

## ✅ Selesai

- [x] Setup Playwright MCP server di Cursor (`.cursor/mcp.json`)
- [x] Install browser binaries (Chromium, Firefox, WebKit)
- [x] Verifikasi koneksi MCP (23 tools enabled, status hijau)
- [x] Tes pertama berhasil — snapshot Dashboard, detect 52 elemen interaktif

---

## 🔜 Prioritas 1 — Testing Modul yang Sudah Jadi

Urutan disusun berdasarkan tingkat risiko (modul yang langsung bersinggungan dengan uang/data kritis duluan).

- [ ] **Penjualan** (prioritas tertinggi — multi-item cart, Shopee + offline)
  - [ ] Tambah transaksi baru, cek kalkulasi total benar
  - [ ] Cek stok terbagi otomatis ke gudang yang benar setelah transaksi
  - [ ] Cek validasi form (input kosong/invalid ditolak dengan benar)
- [ ] **Produksi**
- [ ] **Pembelian Reseller**
- [ ] **Pembelian Bahan**
- [ ] **Admin**

---

## 🔜 Prioritas 2 — Efisiensi Testing

- [ ] Convert hasil testing manual via Composer menjadi script Playwright biasa (`.spec.ts`)
- [ ] Tentukan kapan pakai AI-QA penuh (setelah deploy fitur besar) vs script biasa untuk regression check rutin
- [ ] Evaluasi token cost setelah beberapa kali pemakaian, sesuaikan scope instruksi biar tidak boros round-trip

---

## 🔜 Prioritas 3 — Belum Dibahas Detail, Relevan ke Depan

- [ ] Setup error monitoring (Sentry) untuk Next.js — sempat disinggung, belum diimplementasi
- [ ] Testing modul yang masih dalam pengembangan begitu selesai:
  - [ ] Modal Mitra (capital tracking partner Serang)
  - [ ] Borongan payroll (integrasi dengan Azalea Borongan Android app)
  - [ ] Shopee API integration (OAuth, stock sync, auto order pull)
- [ ] Testing di environment Vercel (live), bukan hanya local

---

## Catatan Teknis

- MCP config: `.cursor/mcp.json` di root project
- Script hasil testing tersimpan otomatis di `scripts/` (contoh: `snapshot-localhost.mjs`, `snapshot-localhost-output.json`)
- Playwright MCP tidak menggunakan vision model — berbasis accessibility tree (teks), jadi lebih hemat token dibanding screenshot-based testing
- Windows-specific: kalau MCP gagal connect dengan `"command": "npx"`, ganti ke path lengkap `C:\\Program Files\\nodejs\\npx.cmd`
