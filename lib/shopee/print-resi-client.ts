// lib/shopee/print-resi-client.ts
// Client-side helpers cetak AWB Shopee (EPOS 100×150mm).

export const PRINT_CHUNK_SIZE = 40;

export function orderPrintLabel(orders: { nama_toko: string; no_pesanan: string }[]): string {
  return orders.length > 1
    ? `${orders[0].nama_toko} · ${orders.length} pesanan`
    : `${orders[0].nama_toko} · ${orders[0].no_pesanan}`;
}

export function chunkList<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Buka jendela preview sinkron dari onClick (hindari popup blocker). */
export function openPrintPreviewWindow(title: string): Window | null {
  const w = window.open("", "_blank", "width=920,height=760");
  if (!w) return null;
  w.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>
  body { margin: 0; background: #3d3d3d; color: #fff; font-family: system-ui, sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; }
  .spinner { width: 36px; height: 36px; border: 3px solid rgba(255,255,255,0.2);
    border-top-color: #ee4d2d; border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 16px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  p { font-size: 14px; opacity: 0.85; }
</style></head><body>
  <div class="spinner"></div>
  <p>Memuat label — ${title}</p>
</body></html>`);
  w.document.close();
  return w;
}

function previewHtml(title: string, pdfUrl: string) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #3d3d3d; font-family: system-ui, sans-serif; }
  .toolbar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 10;
    background: #ee4d2d; color: #fff; padding: 12px 20px;
    display: flex; align-items: center; justify-content: space-between;
    font-size: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  }
  .toolbar button {
    background: #fff; color: #ee4d2d; border: none; border-radius: 6px;
    padding: 9px 20px; font-weight: 700; cursor: pointer; font-size: 14px;
  }
  iframe { display: block; width: 100vw; height: calc(100vh - 48px); margin-top: 48px; border: none; }
  @media print {
    @page { size: 100mm 150mm; margin: 0; }
    .toolbar { display: none !important; }
    iframe { margin-top: 0; height: 100vh; }
    body { background: #fff; }
  }
</style></head><body>
  <div class="toolbar">
    <span>Print Resi — ${title}</span>
    <button type="button" onclick="doPrint()">Cetak Dokumen</button>
  </div>
  <iframe id="pdf" src="${pdfUrl}"></iframe>
  <script>
    function doPrint() {
      var f = document.getElementById("pdf");
      try { f.contentWindow.focus(); f.contentWindow.print(); }
      catch (e) { window.print(); }
    }
    document.getElementById("pdf").onload = function() { setTimeout(doPrint, 700); };
  <\/script>
</body></html>`;
}

export function renderPrintPreviewWindow(w: Window, blob: Blob, title: string) {
  const url = URL.createObjectURL(blob);
  w.document.open();
  w.document.write(previewHtml(title, url));
  w.document.close();
  const poll = setInterval(() => {
    if (w.closed) { URL.revokeObjectURL(url); clearInterval(poll); }
  }, 1500);
  setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
}

export function renderPrintPreviewError(w: Window, message: string) {
  w.document.open();
  w.document.write(`<!DOCTYPE html><html><body style="font-family:system-ui;padding:40px;color:#c00">
    <h3>Gagal cetak resi</h3><p>${message}</p></body></html>`);
  w.document.close();
}

export function printViaHiddenIframe(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:none;opacity:0";
  iframe.src = url;
  document.body.appendChild(iframe);
  iframe.onload = () => {
    setTimeout(() => {
      try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); }
      catch { /* silent */ }
      setTimeout(() => {
        document.body.removeChild(iframe);
        URL.revokeObjectURL(url);
      }, 2000);
    }, 600);
  };
}

export async function fetchAirwayBillBlob(tokoId: number, orderSns: string[]): Promise<Blob> {
  const res = await fetch("/api/shopee/get-airway-bill", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Response-Format": "pdf" },
    body: JSON.stringify({ toko_id: tokoId, order_sn_list: orderSns }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Gagal generate label" }));
    throw new Error(err.error || "get-airway-bill gagal");
  }
  const blob = await res.blob();
  if (!blob.size) throw new Error("PDF kosong dari Shopee");
  return blob;
}

export type PrintJob = { tokoId: number; tokoNama: string; orderSns: string[] };

export async function runBulkPrintJobs(
  jobs: PrintJob[],
  onProgress?: (msg: string) => void,
): Promise<{ printed: number; errors: string[] }> {
  let printed = 0;
  const errors: string[] = [];

  for (const job of jobs) {
    const chunks = chunkList(job.orderSns, PRINT_CHUNK_SIZE);
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const suffix = chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : "";
      const title = `${job.tokoNama} · ${chunk.length} resi${suffix}`;
      onProgress?.(`Memuat ${title}…`);
      const previewWin = openPrintPreviewWindow(title);
      try {
        const blob = await fetchAirwayBillBlob(job.tokoId, chunk);
        if (previewWin && !previewWin.closed) renderPrintPreviewWindow(previewWin, blob, title);
        else printViaHiddenIframe(blob);
        printed += chunk.length;
      } catch (err: any) {
        const msg = `${job.tokoNama}: ${err.message || "gagal"}`;
        errors.push(msg);
        if (previewWin && !previewWin.closed) renderPrintPreviewError(previewWin, msg);
      }
    }
  }

  return { printed, errors };
}
