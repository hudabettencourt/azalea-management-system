"use client";

// /shopee/packing/scan-bungkus — Scan resi + checklist isi paket (mobile web)
// Nanti AzaleaPacking Android pakai tabel/API yang sama: shopee_packing_log + /api/packing/*

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTheme, LIGHT, DARK } from "@/context/ThemeContext";
import { useBarcodeScanner } from "@/lib/packing/use-barcode-scanner";
import type { PackingOrderLookup } from "@/lib/packing/types";
import { tanggalJamFmt } from "@/lib/format";

type CheckState = Record<number, boolean>;

export default function ScanBungkusPage() {
  const { isDark } = useTheme();
  const C = isDark ? DARK : LIGHT;

  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<PackingOrderLookup | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [checked, setChecked] = useState<CheckState>({});
  const [packedCount, setPackedCount] = useState(0);
  const [manualCode, setManualCode] = useState("");

  const handleScannedCode = useCallback(async (rawValue: string) => {
    setBusy(true);
    setNotFound(null);
    setOrder(null);
    setChecked({});
    try {
      const res = await fetch("/api/packing/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: rawValue }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setNotFound("Error: Sesi habis — login ulang");
        return;
      }
      if (!res.ok) {
        setNotFound(res.status === 404 ? rawValue : (json.error || "Gagal lookup"));
        return;
      }
      const result = json.order as PackingOrderLookup;
      setOrder(result);
      const init: CheckState = {};
      for (const item of result.items) init[item.detail_id] = false;
      setChecked(init);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal lookup";
      setNotFound(`Error: ${msg}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const {
    videoRef,
    unsupported,
    permError,
    scanning,
    startCamera,
    stopCamera,
  } = useBarcodeScanner(handleScannedCode);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  const allChecked = order
    ? order.items.length > 0 && order.items.every(i => checked[i.detail_id])
    : false;

  const toggleItem = (detailId: number) => {
    setChecked(prev => ({ ...prev, [detailId]: !prev[detailId] }));
  };

  const checkAll = () => {
    if (!order) return;
    const next: CheckState = {};
    for (const item of order.items) next[item.detail_id] = true;
    setChecked(next);
  };

  const confirmPacked = async () => {
    if (!order || !allChecked) return;
    setBusy(true);
    try {
      const items = order.items.map(i => ({
        detail_id: i.detail_id,
        sku: i.sku,
        qty: i.qty,
        checked: true,
      }));
      const res = await fetch("/api/packing/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          no_pesanan: order.no_pesanan,
          no_resi: order.no_resi,
          source: "web",
          items,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) throw new Error("Sesi habis — login ulang");
      if (!res.ok) throw new Error(json.error || "Gagal simpan");

      setPackedCount(c => c + 1);
      setOrder(null);
      setChecked({});
      setTimeout(() => startCamera(), 300);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal simpan";
      setNotFound(`Error: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const scanAnother = () => {
    setOrder(null);
    setNotFound(null);
    setChecked({});
    startCamera();
  };

  const submitManual = async () => {
    if (!manualCode.trim()) return;
    stopCamera();
    await handleScannedCode(manualCode.trim());
    setManualCode("");
  };

  const showScanner = !order && !notFound;

  return (
    <div style={{
      minHeight: "100vh",
      background: C.bgPage,
      display: "flex",
      flexDirection: "column",
      fontFamily: C.fontSans,
      color: C.text,
    }}>
      <div style={{
        padding: "12px 16px",
        background: C.bgNav,
        borderBottom: `1px solid ${C.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <Link href="/shopee/packing" style={{
          color: C.muted, fontSize: 13, fontWeight: 700, textDecoration: "none",
        }}>← Packing</Link>
        <div style={{ fontSize: 14, fontWeight: 800 }}>Scan &amp; Bungkus</div>
        <div style={{ fontSize: 11, color: C.green, fontFamily: C.fontMono, minWidth: 48, textAlign: "right" }}>
          {packedCount > 0 ? `${packedCount} ✓` : ""}
        </div>
      </div>

      <div style={{
        flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 14,
        maxWidth: 520, margin: "0 auto", width: "100%",
      }}>
        {showScanner && (
          <>
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
                  width: "80%", height: "28%",
                  border: `3px solid ${C.green}`, borderRadius: 12,
                  boxShadow: "0 0 0 4000px rgba(0,0,0,0.35)",
                }} />
              </div>
              <div style={{
                position: "absolute", left: 12, bottom: 12, right: 12, textAlign: "center",
                color: "#fff", fontSize: 12, fontFamily: C.fontMono,
                textShadow: "0 1px 4px rgba(0,0,0,0.6)",
              }}>
                {unsupported
                  ? "BarcodeDetector tidak didukung"
                  : scanning
                    ? "Scan resi → cek isi → bungkus"
                    : busy ? "Memuat pesanan..." : "Menyiapkan kamera..."}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={manualCode}
                onChange={e => setManualCode(e.target.value)}
                placeholder="Ketik no. resi / pesanan..."
                style={{
                  flex: 1, padding: "10px 12px",
                  background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
                  border: `1.5px solid ${C.border}`, borderRadius: 10,
                  color: C.text, fontSize: 13, fontFamily: C.fontMono,
                }}
                onKeyDown={e => { if (e.key === "Enter") submitManual(); }}
              />
              <button
                onClick={submitManual}
                disabled={busy || !manualCode.trim()}
                style={{
                  padding: "10px 14px", background: C.accent, border: "none",
                  color: "#fff", borderRadius: 10, fontWeight: 700, fontSize: 12,
                  opacity: busy || !manualCode.trim() ? 0.5 : 1,
                }}
              >Cari</button>
            </div>
          </>
        )}

        {unsupported && (
          <div style={{ padding: 14, background: C.yellowDim, color: C.yellow, borderRadius: 12, fontSize: 13 }}>
            Buka di <b>Chrome Android</b>, atau ketik no. resi manual di bawah.
          </div>
        )}

        {permError && (
          <div style={{ padding: 14, background: C.redDim, color: C.red, borderRadius: 12, fontSize: 13 }}>
            ⚠ {permError}
            <button onClick={startCamera} style={{
              display: "block", marginTop: 10, padding: "8px 14px",
              background: C.red, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700,
            }}>Coba lagi</button>
          </div>
        )}

        {notFound && (
          <div style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 14, padding: 18, boxShadow: C.shadow,
          }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.red }}>Tidak ditemukan</div>
            <div style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono, marginTop: 4 }}>{notFound}</div>
            <button onClick={scanAnother} style={{
              marginTop: 14, width: "100%", padding: "12px",
              background: `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`,
              border: "none", color: "#fff", borderRadius: 10, fontWeight: 700,
            }}>📷 Scan Lagi</button>
          </div>
        )}

        {order && (
          <div style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 14, padding: 18, boxShadow: C.shadow,
          }}>
            {order.already_packed && (
              <div style={{
                padding: "8px 12px", marginBottom: 12, borderRadius: 8,
                background: C.yellowDim, color: C.yellow, fontSize: 12,
              }}>
                ⚠ Sudah pernah dibungkus
                {order.packed_at && ` · ${tanggalJamFmt(order.packed_at)}`}
                {order.packed_by && ` · ${order.packed_by}`}
              </div>
            )}

            <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>Checklist isi paket</div>
            <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4 }}>{order.nama_pembeli || "—"}</div>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, marginTop: 2 }}>
              {order.no_pesanan} · {order.nama_toko}
            </div>
            {order.no_resi && (
              <div style={{
                marginTop: 8, padding: "8px 10px", background: C.accentGlow,
                borderRadius: 8, fontSize: 12, fontFamily: C.fontMono, color: C.accent,
              }}>📦 {order.no_resi}</div>
            )}

            <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.textMid }}>Isi pesanan</div>
              <button onClick={checkAll} style={{
                padding: "4px 10px", background: `${C.green}15`, border: `1px solid ${C.green}40`,
                color: C.green, borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer",
              }}>Centang Semua</button>
            </div>

            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
              {order.items.map(item => {
                const on = !!checked[item.detail_id];
                return (
                  <button
                    key={item.detail_id}
                    type="button"
                    onClick={() => toggleItem(item.detail_id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "12px 14px", textAlign: "left",
                      background: on ? `${C.green}12` : isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                      border: `2px solid ${on ? C.green : C.border}`,
                      borderRadius: 12, cursor: "pointer", width: "100%",
                    }}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                      background: on ? C.green : "transparent",
                      border: `2px solid ${on ? C.green : C.muted}`,
                      color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 16, fontWeight: 800,
                    }}>{on ? "✓" : ""}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{item.nama_produk}</div>
                      <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{item.sku}</div>
                    </div>
                    <div style={{
                      fontSize: 20, fontWeight: 900, color: C.accent, fontFamily: C.fontMono,
                    }}>×{item.qty}</div>
                  </button>
                );
              })}
            </div>

            <button
              onClick={confirmPacked}
              disabled={busy || !allChecked}
              style={{
                marginTop: 16, width: "100%", padding: "14px",
                background: allChecked
                  ? `linear-gradient(135deg, ${C.green}, #16a34a)`
                  : C.border,
                border: "none", color: allChecked ? "#fff" : C.muted,
                borderRadius: 12, fontWeight: 800, fontSize: 15,
                cursor: allChecked && !busy ? "pointer" : "not-allowed",
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? "Menyimpan..." : "✓ Sudah Bungkus"}
            </button>
            <button onClick={scanAnother} disabled={busy} style={{
              marginTop: 8, width: "100%", padding: "12px",
              background: "transparent", border: `1.5px solid ${C.border}`,
              color: C.muted, borderRadius: 12, fontWeight: 700,
            }}>Batal &amp; Scan Lagi</button>
          </div>
        )}

        <p style={{ fontSize: 11, color: C.muted, textAlign: "center", marginTop: "auto", paddingBottom: 8 }}>
          Web mobile — nanti app AzaleaPacking pakai data yang sama
        </p>
      </div>
    </div>
  );
}
