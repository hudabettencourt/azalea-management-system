-- Log scan & bungkus — dipakai web (/shopee/packing/scan-bungkus) dan nanti AzaleaPacking Android
-- Satu baris per no_pesanan (upsert saat konfirmasi ulang)

CREATE TABLE IF NOT EXISTS shopee_packing_log (
  id BIGSERIAL PRIMARY KEY,
  no_pesanan TEXT NOT NULL UNIQUE,
  no_resi TEXT,
  packed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  packed_by TEXT,
  source TEXT NOT NULL DEFAULT 'web',
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shopee_packing_log_no_resi
  ON shopee_packing_log(no_resi);

CREATE INDEX IF NOT EXISTS idx_shopee_packing_log_packed_at
  ON shopee_packing_log(packed_at DESC);

ALTER TABLE shopee_packing_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shopee_packing_log_authenticated" ON shopee_packing_log;
CREATE POLICY "shopee_packing_log_authenticated" ON shopee_packing_log
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
