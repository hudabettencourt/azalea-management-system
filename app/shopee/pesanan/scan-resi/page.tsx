"use client";

// /shopee/pesanan/scan-resi — mobile barcode scanner.
// Uses the browser BarcodeDetector API (Chromium-based browsers, incl. Chrome
// for Android). Renders fullscreen with no sidebar so it's usable on phones.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useTheme, LIGHT, DARK } from "@/context/ThemeContext";

type FoundOrder = {
  id: number;
  no_pesanan: string;
  no_resi: string | null;
  sku: string;
  qty: number;
  total_pembayaran: number;
  status_shopee: string | null;
  nama_pembeli: string | null;
  jasa_kirim: string | null;
  nama_produk: string;
};

const rupiah = (n: number) => `Rp ${Math.round(n || 0).toLocaleString("id-ID")}`;

// BarcodeDetector isn't in lib.dom.d.ts on all TS versions, so declare a
// minimal local shape and feature-detect at runtime.
type DetectedBarcode = { rawValue: string; format?: string };
type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
};

export default function ScanResiPage() {
  const { isDark } = useTheme();
  const C = isDark ? DARK : LIGHT;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const scanLoopRef = useRef<number | null>(null);
  const lastScanRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  const [unsupported, setUnsupported] = useState(false);
  const [permError, setPermError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<FoundOrder | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [confirmedCount, setConfirmedCount] = useState(0);

  const stopCamera = useCallback(() => {
    if (scanLoopRef.current !== null) {
      cancelAnimationFrame(scanLoopRef.current);
      scanLoopRef.current = null;
    }
    const s = streamRef.current;
    if (s) {
      for (const track of s.getTracks()) track.stop();
      streamRef.current = null;
    }
    setScanning(false);
  }, []);

  const handleScannedCode = useCallback(async (rawValue: string) => {
    // Debounce repeated detections of the same code within 2s.
    const now = Date.now();
    if (lastScanRef.current.code === rawValue && now - lastScanRef.current.at < 2000) return;
    lastScanRef.current = { code: rawValue, at: now };

    stopCamera();
    setBusy(true);
    setNotFound(null);
    setOrder(null);
    try {
      const { data, error } = await supabase
        .from("detail_penjualan_online")
        .select("id, no_pesanan, no_resi, sku, qty, total_pembayaran, status_shopee, nama_pembeli, jasa_kirim, stok_barang(nama_produk)")
        .eq("no_resi", rawValue)
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) {
        setNotFound(rawValue);
        return;
      }
      setOrder({
        id: data.id,
        no_pesanan: data.no_pesanan,
        no_resi: data.no_resi,
        sku: data.sku,
        qty: data.qty,
        total_pembayaran: data.total_pembayaran,
        status_shopee: data.status_shopee,
        nama_pembeli: data.nama_pembeli,
        jasa_kirim: data.jasa_kirim,
        nama_produk: (data.stok_barang as any)?.nama_produk || data.sku,
      });
    } catch (err: any) {
      setNotFound(`Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }, [stopCamera]);

  const startCamera = useCallback(async () => {
    setPermError(null);
    setNotFound(null);
    setOrder(null);

    const BarcodeDetectorCtor = (typeof window !== "undefined" && (window as any).BarcodeDetector) as
      | (new (opts?: { formats?: string[] }) => BarcodeDetectorLike)
      | undefined;
    if (!BarcodeDetectorCtor) {
      setUnsupported(true);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      detectorRef.current = new BarcodeDetectorCtor({
        formats: ["code_128", "code_39", "ean_13", "ean_8", "itf", "qr_code", "pdf417"],
      });
      setScanning(true);

      const tick = async () => {
        if (!videoRef.current || !detectorRef.current) return;
        try {
          const codes = await detectorRef.current.detect(videoRef.current);
          if (codes && codes.length > 0) {
            const value = codes[0].rawValue?.trim();
            if (value) {
              await handleScannedCode(value);
              return;
            }
          }
        } catch (err) {
          // Detector hiccups happen during low-light frames; just keep going.
        }
        scanLoopRef.current = requestAnimationFrame(tick);
      };
      scanLoopRef.current = requestAnimationFrame(tick);
    } catch (err: any) {
      setPermError(err.message || "Tidak bisa akses kamera");
    }
  }, [handleScannedCode]);

  // Auto-start on mount; clean up on unmount.
  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  const confirmLabelPrinted = async () => {
    if (!order || !order.no_resi) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("detail_penjualan_online")
        .update({ status_shopee: "LABEL_PRINTED" })
        .eq("no_resi", order.no_resi);
      if (error) throw new Error(error.message);
      setConfirmedCount(c => c + 1);
      setOrder(null);
      setTimeout(() => startCamera(), 200);
    } catch (err: any) {
      setPermError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const scanAnother = () => {
    setOrder(null);
    setNotFound(null);
    startCamera();
  };

  return (
    <div style={{
      minHeight: "100vh", background: C.bgPage,
      display: "flex", flexDirection: "column",
      fontFamily: C.fontSans, color: C.text,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; }
        body { font-family: 'Nunito', sans-serif; }
      `}</style>

      {/* Top bar */}
      <div style={{
        padding: "12px 16px", background: C.bgNav,
        borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <Link href="/shopee/pesanan" style={{
          color: C.muted, fontSize: 13, fontWeight: 700, textDecoration: "none",
          padding: "6px 10px", borderRadius: 8, background: "transparent",
        }}>← Kembali</Link>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Scan Resi</div>
        <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, minWidth: 60, textAlign: "right" }}>
          {confirmedCount > 0 ? `${confirmedCount} ✓` : ""}
        </div>
      </div>

      <div style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 16, maxWidth: 520, margin: "0 auto", width: "100%" }}>

        {/* Camera preview / scanner */}
        {!order && !notFound && (
          <div style={{
            position: "relative", background: "#000",
            borderRadius: 14, overflow: "hidden", aspectRatio: "3/4",
          }}>
            <video ref={videoRef} playsInline muted style={{
              width: "100%", height: "100%", objectFit: "cover",
            }} />
            <div style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <div style={{
                width: "80%", height: "30%",
                border: `3px solid ${C.accent}`, borderRadius: 12,
                boxShadow: `0 0 0 4000px rgba(0,0,0,0.35)`,
              }} />
            </div>
            <div style={{
              position: "absolute", left: 12, bottom: 12, right: 12, textAlign: "center",
              color: "#fff", fontSize: 12, fontFamily: C.fontMono, textShadow: "0 1px 4px rgba(0,0,0,0.6)",
            }}>
              {unsupported
                ? "BarcodeDetector tidak didukung di browser ini"
                : scanning
                  ? "Arahkan kamera ke barcode resi"
                  : busy ? "Mencari pesanan..." : "Menyiapkan kamera..."}
            </div>
          </div>
        )}

        {unsupported && (
          <div style={{
            padding: 14, background: C.yellowDim, color: C.yellow,
            borderRadius: 12, fontSize: 13, lineHeight: 1.5,
          }}>
            Browser tidak mendukung <code>BarcodeDetector</code>. Buka halaman ini di Chrome di Android,
            atau pakai input manual di halaman Pesanan.
          </div>
        )}

        {permError && (
          <div style={{
            padding: 14, background: C.redDim, color: C.red,
            borderRadius: 12, fontSize: 13, lineHeight: 1.5,
          }}>
            ⚠ {permError}
            <button onClick={startCamera} style={{
              display: "block", marginTop: 10, padding: "8px 14px",
              background: C.red, color: "#fff", border: "none", borderRadius: 8,
              fontWeight: 700, cursor: "pointer", fontSize: 13,
            }}>Coba lagi</button>
          </div>
        )}

        {notFound && (
          <div style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 14, padding: 18, boxShadow: C.shadow,
          }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.red, fontFamily: C.fontSans }}>Resi tidak ditemukan</div>
            <div style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono, marginTop: 4 }}>{notFound}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 10 }}>
              Mungkin pesanan belum ter-sync dari Shopee, atau barcode-nya bukan no. resi.
            </div>
            <button onClick={scanAnother} style={{
              marginTop: 14, padding: "10px 16px",
              background: `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`,
              border: "none", color: "#fff", borderRadius: 10,
              fontWeight: 700, cursor: "pointer", fontSize: 13, width: "100%",
            }}>📷 Scan Lagi</button>
          </div>
        )}

        {order && (
          <div style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 14, padding: 20, boxShadow: C.shadow,
          }}>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>Pesanan ditemukan</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginTop: 4 }}>
              {order.nama_produk} <span style={{ color: C.muted, fontWeight: 500, fontSize: 14 }}>×{order.qty}</span>
            </div>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, marginTop: 2 }}>
              {order.no_pesanan} · {order.sku}
            </div>

            <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Cell label="Pembeli" value={order.nama_pembeli || "—"} C={C} />
              <Cell label="Total" value={rupiah(order.total_pembayaran)} C={C} bold />
              <Cell label="Jasa Kirim" value={order.jasa_kirim || "—"} C={C} />
              <Cell label="Status" value={order.status_shopee || "—"} C={C} />
            </div>

            <div style={{ marginTop: 12, padding: 10, background: C.accentGlow, borderRadius: 10, fontSize: 12, color: C.accent, fontFamily: C.fontMono }}>
              📦 {order.no_resi}
            </div>

            <button onClick={confirmLabelPrinted} disabled={busy} style={{
              marginTop: 16, width: "100%", padding: "14px 18px",
              background: `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`,
              border: "none", color: "#fff", borderRadius: 12,
              fontWeight: 800, cursor: busy ? "not-allowed" : "pointer",
              fontSize: 14, opacity: busy ? 0.6 : 1,
            }}>
              {busy ? "Menyimpan..." : "✓ Konfirmasi Sudah Ditempel"}
            </button>
            <button onClick={scanAnother} disabled={busy} style={{
              marginTop: 8, width: "100%", padding: "12px 18px",
              background: "transparent", border: `1.5px solid ${C.border}`,
              color: C.muted, borderRadius: 12, fontWeight: 700,
              cursor: "pointer", fontSize: 13,
            }}>Batal &amp; Scan Lagi</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Cell({ label, value, C, bold }: { label: string; value: string; C: any; bold?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: bold ? 800 : 600, color: C.text }}>{value}</div>
    </div>
  );
}
