"use client";

import { useState } from "react";
import { parseShopeeIncome } from "@/lib/parse-shopee-income";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, AlertCircle, CheckCircle2, TrendingUp, Percent } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

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

export default function ShopeeIncomeUpload() {
  const [file, setFile] = useState<File | null>(null);
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

    setFile(selectedFile);
    setError(null);
    setPreviewData(null);
    setSuccess(false);

    try {
      setLoading(true);
      const arrayBuffer = await selectedFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const parsed = parseShopeeIncomeExcel(buffer);

      if (parsed.length === 0) {
        setError("Tidak ada data valid yang ditemukan dalam file Excel");
        return;
      }

      // Check for zero fees
      const zeroFeeCount = parsed.filter(row => row.total_fee === 0).length;
      if (zeroFeeCount > 0) {
        setError(`❌ CRITICAL: ${zeroFeeCount} transaksi memiliki total fee = 0! Parser tidak membaca kolom fee dengan benar.`);
        console.error("Zero fee rows detected:", parsed.filter(row => row.total_fee === 0));
      }

      // Group by order_id and sum amounts
      const orderMap = new Map<string, { gross_amount: number; total_fee: number }>();

      parsed.forEach(row => {
        const existing = orderMap.get(row.order_id);
        if (existing) {
          existing.gross_amount += row.gross_amount;
          existing.total_fee += row.total_fee;
        } else {
          orderMap.set(row.order_id, {
            gross_amount: row.gross_amount,
            total_fee: row.total_fee
          });
        }
      });

      const validRows = Array.from(orderMap.entries()).map(([order_id, data]) => ({
        order_id,
        gross_amount: data.gross_amount,
        total_fee: data.total_fee
      }));

      // ✅ FIXED: Removed FeeUploadResult type
      const result = {
        orders: validRows.map(row => ({
          order_id: row.order_id,
          gross_amount: row.gross_amount,
          total_fee: row.total_fee
        })),
        total_transactions: validRows.length,
        total_gross: validRows.reduce((sum, r) => sum + r.gross_amount, 0),
        total_fee: validRows.reduce((sum, r) => sum + r.total_fee, 0)
      };

      setPreviewData(result);

    } catch (err) {
      console.error("Parse error:", err);
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
        body: JSON.stringify(previewData)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Gagal upload data");
      }

      setSuccess(true);
      setFile(null);
      setPreviewData(null);

      setTimeout(() => {
        window.location.reload();
      }, 2000);

    } catch (err) {
      console.error("Upload error:", err);
      setError(err instanceof Error ? err.message : "Gagal upload data");
    } finally {
      setLoading(false);
    }
  };

  const feePercentage = previewData
    ? ((previewData.total_fee / previewData.total_gross) * 100).toFixed(2)
    : "0.00";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Upload Shopee Income Report
        </CardTitle>
        <CardDescription>
          Upload file Excel "Penghasilan Saya" dari Shopee Seller Center
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* File Input */}
        <div>
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
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Success Alert */}
        {success && (
          <Alert className="border-green-500/50 bg-green-500/10">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <AlertDescription className="text-green-500">
              ✅ Data berhasil disimpan! Halaman akan refresh otomatis...
            </AlertDescription>
          </Alert>
        )}

        {/* Preview Data */}
        {previewData && !success && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="bg-[#0d0a14] border-purple-500/20">
                <CardContent className="pt-6">
                  <div className="text-sm text-gray-400">Total Transaksi</div>
                  <div className="text-2xl font-bold text-purple-400">
                    {previewData.total_transactions}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-[#0d0a14] border-purple-500/20">
                <CardContent className="pt-6">
                  <div className="text-sm text-gray-400 flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    Gross Amount
                  </div>
                  <div className="text-2xl font-bold text-green-400">
                    Rp {previewData.total_gross.toLocaleString("id-ID")}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-[#0d0a14] border-purple-500/20">
                <CardContent className="pt-6">
                  <div className="text-sm text-gray-400">Total Fee</div>
                  <div className="text-2xl font-bold text-red-400">
                    Rp {previewData.total_fee.toLocaleString("id-ID")}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-[#0d0a14] border-purple-500/20">
                <CardContent className="pt-6">
                  <div className="text-sm text-gray-400 flex items-center gap-1">
                    <Percent className="h-3 w-3" />
                    Fee Percentage
                  </div>
                  <div className="text-2xl font-bold text-yellow-400">
                    {feePercentage}%
                  </div>
                </CardContent>
              </Card>
            </div>

            <Button
              onClick={handleUpload}
              disabled={loading}
              className="w-full bg-purple-600 hover:bg-purple-700"
            >
              {loading ? "Menyimpan..." : "💾 Simpan ke Database"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
