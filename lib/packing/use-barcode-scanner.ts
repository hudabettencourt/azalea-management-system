"use client";

import { useCallback, useRef, useState } from "react";

type DetectedBarcode = { rawValue: string; format?: string };
type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
};

export function useBarcodeScanner(onScan: (code: string) => void | Promise<void>) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const scanLoopRef = useRef<number | null>(null);
  const lastScanRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const [unsupported, setUnsupported] = useState(false);
  const [permError, setPermError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

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

  const startCamera = useCallback(async () => {
    setPermError(null);
    setUnsupported(false);

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
          if (codes?.length) {
            const value = codes[0].rawValue?.trim();
            if (value) {
              const now = Date.now();
              if (lastScanRef.current.code === value && now - lastScanRef.current.at < 2000) {
                scanLoopRef.current = requestAnimationFrame(tick);
                return;
              }
              lastScanRef.current = { code: value, at: now };
              stopCamera();
              await onScanRef.current(value);
              return;
            }
          }
        } catch {
          /* frame skip */
        }
        scanLoopRef.current = requestAnimationFrame(tick);
      };
      scanLoopRef.current = requestAnimationFrame(tick);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Tidak bisa akses kamera";
      setPermError(msg);
    }
  }, [stopCamera]);

  return {
    videoRef,
    unsupported,
    permError,
    scanning,
    startCamera,
    stopCamera,
  };
}
