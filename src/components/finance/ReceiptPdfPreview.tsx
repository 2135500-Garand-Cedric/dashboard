"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { secondaryButton } from "./shared";

export default function ReceiptPdfPreview({ url, label = "Receipt" }: { url: string; label?: string }) {
  const container = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1), [width, setWidth] = useState(300), [error, setError] = useState("");
  const [rendering, setRendering] = useState(true);
  useEffect(() => {
    const observer = new ResizeObserver(entries => setWidth(Math.max(100, Math.floor(entries[0].contentRect.width))));
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let cancelled = false;
    let loading: ReturnType<typeof import("pdfjs-dist").getDocument> | undefined;
    setDocument(null); setPage(1); setError(""); setRendering(true);
    void import("pdfjs-dist").then(pdfjs => {
      if (cancelled) return;
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      loading = pdfjs.getDocument({ url, enableXfa: false, useSystemFonts: true, useWasm: false, maxImageSize: 40000000, canvasMaxAreaInBytes: 32000000 });
      return loading.promise;
    }).then(result => { if (!cancelled && result) setDocument(result); }).catch(error => {
      if (!cancelled) { setError(error?.name === "PasswordException" ? "This PDF is password-protected. Use Open original to view it." : "Could not preview this PDF. You can still open or download the original."); setRendering(false); }
    });
    return () => { cancelled = true; void loading?.destroy().catch(() => {}); };
  }, [url]);
  useEffect(() => {
    if (!document) return;
    let cancelled = false, task: RenderTask | undefined;
    setRendering(true); setError("");
    void document.getPage(page).then(pdfPage => {
      if (cancelled || !canvas.current) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const scale = Math.min(width, 1000) / base.width;
      const density = Math.min(window.devicePixelRatio || 1, 2);
      const safeScale = Math.min(scale * density, Math.sqrt(8000000 / (base.width * base.height)));
      const viewport = pdfPage.getViewport({ scale: safeScale });
      if (viewport.height > 12000 || viewport.width > 4000) throw new Error("Page dimensions exceed the preview limit.");
      canvas.current.width = Math.ceil(viewport.width); canvas.current.height = Math.ceil(viewport.height);
      canvas.current.style.width = "100%"; canvas.current.style.height = "auto";
      task = pdfPage.render({ canvas: canvas.current, viewport });
      return task.promise;
    }).then(() => { if (!cancelled) setRendering(false); }).catch(error => {
      if (!cancelled && error?.name !== "RenderingCancelledException") { setError("Could not render this page. Open or download the original to view it."); setRendering(false); }
    });
    return () => { cancelled = true; task?.cancel(); };
  }, [document, page, width]);
  return <div className="space-y-3" ref={container}>
    {document && <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm">Page {page} of {document.numPages}</p><div className="flex gap-2"><button type="button" className={secondaryButton} disabled={page === 1} onClick={() => setPage(page - 1)}>Previous page</button><button type="button" className={secondaryButton} disabled={page === document.numPages} onClick={() => setPage(page + 1)}>Next page</button></div></div>}
    {rendering && <p role="status" className="text-sm text-gray-400">Loading PDF preview…</p>}{error && <p role="alert" className="text-sm text-amber-500">{error}</p>}
    <canvas ref={canvas} role="img" aria-label={`${label} PDF preview, page ${page}`} hidden={!!error || !document} className="w-full rounded-lg bg-white" />
  </div>;
}
