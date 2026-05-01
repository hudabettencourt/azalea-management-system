"use client";

import { useState } from "react";
import { parseShopeeIncome } from "@/lib/parse-shopee-income";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, CheckCircle2, TrendingUp, Percent } from "lucide-react";

interface ParsedOrder {
  order_id: string;
  gross_amount: number;
  total_fee: number;
}

interface PreviewData {
  orders: ParsedOrder[];
  total_transactions: number;
  total_gross: number;
  total_fee: number;
}

interface ShopeeIncomeUploadProps {
  tokoId: number;
  tokoPlatform: string;
  onSuccess: () => void;
}

export default function ShopeeIncomeUpload({ tokoId, tokoPlatform, onSuccess }: ShopeeIncomeUploadProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [success, setSuccess] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith(".xlsx") && !selectedFile.name.endsWith(".xls")) {
      setError("File harus berformat Excel (.xlsx atau .xls)");
      return;
    }

    setError(null);
    setPreviewData(null);
    setSuccess(false);

    try {
      setLoading(true);
      const arrayBuffer = await selectedFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const parsed = parseShopeeIncome(buffer);

      if (parsed.length === 0) {
        setError("Tidak ada data valid yang ditemukan dalam file Excel");
        return;
      }

      // Group by order_id
      const orderMap = new Map<string, { gross_amount: number; total_fee: number }>();
      parsed.forEach(row => {
        const existing = orderMap.get(row.order_id);
        if (existing) {
          existing.gross_amount += row.gross_amount;
          existing.total_fee += row.total_fee;
        } else {
          orderMap.set(row.order_id, { gross_amount: row.gross_amount, total_fee: row.total_fee });
        }
      });

      const validRows = Array.from(orderMap.entries()).map(([order_id, data]) => ({
        order_id, ...data
      }));

      setPreviewData({
        orders: validRows,
        total_transactions: validRows.length,
        total_gross: validRows.reduce((s, r) => s + r.gross_amount, 0),
        total_fee: validRows.reduce((s, r) => s + r.total_fee, 0),
      });

    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memproses file Excel");
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!previewData) return;
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/fee-platform/upload-shopee-income", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...previewData, tokoId }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal upload data");

      setSuccess(true);
      setPreviewData(null);
      setTimeout(() => { onSuccess(); setSuccess(false); }, 2000);

    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal upload data");
    } finally {
      setLoading(false);
    }
  };

  const feePercentage = previewData && previewData.total_gross > 0
    ? ((previewData.total_fee / previewData.total_gross) * 100).toFixed(2)
    : "0.00";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Upload Shopee Income Report - {tokoPlatform}
        </CardTitle>
        <CardDescription>
          Upload file Excel "Penghasilan Saya" dari Shopee Seller Center
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileChange}
          disabled={loading}
          className="block w-full text-sm text-gray-400
            file:mr-4 file:py-2 file:px-4
            file:rounded-md file:border-0
            file:text-sm file:font-semibold
            file:bg-purple-500/10 file:text-purple-400
            hover:file:bg-purple-500/20
            file:cursor-pointer cursor-pointer"
        />

        {error && (
          <div style={{ background: '#f8717120', border: '1px solid #f8717160', borderRadius: 8, padding: '10px 14px', color: '#f87171', fontSize: 13 }}>
            ⚠ {error}
          </div>
        )}

        {success && (
          <div style={{ background: '#34d39920', border: '1px solid #34d39960', borderRadius: 8, padding: '10px 14px', color: '#34d399', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={16} /> Data berhasil disimpan!
          </div>
        )}

        {previewData && !success && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Total Transaksi", value: previewData.total_transactions.toString(), color: "text-purple-400" },
                { label: "Gross Amount", value: `Rp ${previewData.total_gross.toLocaleString("id-ID")}`, color: "text-green-400", icon: <TrendingUp className="h-3 w-3" /> },
                { label: "Total Fee", value: `Rp ${previewData.total_fee.toLocaleString("id-ID")}`, color: "text-red-400" },
                { label: "Fee %", value: `${feePercentage}%`, color: "text-yellow-400", icon: <Percent className="h-3 w-3" /> },
              ].map((s, i) => (
                <Card key={i} className="bg-[#0d0a14] border-purple-500/20">
                  <CardContent className="pt-6">
                    <div className="text-sm text-gray-400 flex items-center gap-1">{s.icon}{s.label}</div>
                    <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Button onClick={handleUpload} disabled={loading} className="w-full bg-purple-600 hover:bg-purple-700">
              {loading ? "Menyimpan..." : "💾 Simpan ke Database"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
