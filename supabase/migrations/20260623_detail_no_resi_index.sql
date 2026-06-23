-- Index lookup resi di detail penjualan (scan & bungkus)
CREATE INDEX IF NOT EXISTS idx_detail_penjualan_online_no_resi
  ON detail_penjualan_online(no_resi)
  WHERE no_resi IS NOT NULL AND no_resi <> '';
