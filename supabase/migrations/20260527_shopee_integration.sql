-- ============================================================
-- Shopee Open API integration migration
-- Tanggal: 2026-05-27
-- Jalankan di Supabase SQL Editor.
-- ============================================================

-- ── 1. Tambah kolom status order Shopee per baris detail ──
-- Menyimpan order_status dari Shopee API (READY_TO_SHIP, SHIPPED,
-- COMPLETED, CANCELLED, IN_CANCEL, UNPAID, PROCESSED). Sumber: API sync.
ALTER TABLE detail_penjualan_online
  ADD COLUMN IF NOT EXISTS status_shopee TEXT;

CREATE INDEX IF NOT EXISTS idx_detail_penjualan_online_no_pesanan
  ON detail_penjualan_online(no_pesanan);

-- ── 2. Dedup pencairan dari Shopee Finance API ──
-- Marker untuk mencegah duplikasi pencairan saat cron berjalan ulang.
ALTER TABLE pencairan_online
  ADD COLUMN IF NOT EXISTS shopee_transaction_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pencairan_online_shopee_txn
  ON pencairan_online(shopee_transaction_id)
  WHERE shopee_transaction_id IS NOT NULL;

-- ── 3. Mapping stok_barang ↔ Shopee item per toko ──
-- Di-cache otomatis saat push-stok pertama kali (resolve via SKU
-- → get_item_base_info). item_id WAJIB; model_id NULL kalau produk
-- tidak punya varian.
CREATE TABLE IF NOT EXISTS shopee_item_mapping (
  id SERIAL PRIMARY KEY,
  toko_id INTEGER NOT NULL REFERENCES toko_online(id) ON DELETE CASCADE,
  stok_barang_id INTEGER NOT NULL REFERENCES stok_barang(id) ON DELETE CASCADE,
  item_id BIGINT NOT NULL,
  model_id BIGINT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(toko_id, stok_barang_id)
);

-- ── 4. Pool stok virtual Shopee ──
-- Anggaran total per produk yang dialokasikan ke semua toko Shopee.
-- TIDAK mengurangi stok_barang.jumlah_stok (terpisah).
CREATE TABLE IF NOT EXISTS shopee_stok_pool (
  id SERIAL PRIMARY KEY,
  stok_barang_id INTEGER NOT NULL UNIQUE REFERENCES stok_barang(id) ON DELETE CASCADE,
  total_anggaran INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 5. Distribusi pool ke tiap toko ──
-- Hasil kalkulasi otomatis berdasarkan histori 30 hari penjualan
-- per toko per produk. last_push_status: "ok" / "error: ..." / NULL.
CREATE TABLE IF NOT EXISTS shopee_stok_distribusi (
  id SERIAL PRIMARY KEY,
  pool_id INTEGER NOT NULL REFERENCES shopee_stok_pool(id) ON DELETE CASCADE,
  toko_id INTEGER NOT NULL REFERENCES toko_online(id) ON DELETE CASCADE,
  stok_barang_id INTEGER NOT NULL REFERENCES stok_barang(id) ON DELETE CASCADE,
  jumlah INTEGER NOT NULL DEFAULT 0,
  persentase NUMERIC(5,2) DEFAULT 0,
  last_pushed_at TIMESTAMPTZ,
  last_push_status TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(pool_id, toko_id)
);
