"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import api from "@/lib/axios";
import { PrintLoadError, loadErrorKind, type LoadError } from "@/components/print/PrintLoadError";

// The PO document is rendered by the backend (utils/poDocument.ts) — the same HTML the
// vendor receives by email — and shown here in an iframe for printing / Save as PDF.
export default function PrintPurchaseOrderPage() {
  const { id } = useParams<{ id: string }>();
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<LoadError | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const printed = useRef(false);

  const load = useCallback(() => {
    api
      .get(`/purchase-orders/${id}/document`)
      .then(({ data }) => setHtml(data.data.html))
      .catch((err) => setError(loadErrorKind(err)));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Save as PDF names the file after the tab title — use the PO number from the document
  useEffect(() => {
    const poNumber = html?.match(/PO-\d{8}-\d{4}/)?.[0];
    if (!poNumber) return;
    const previous = document.title;
    document.title = `${poNumber} – Purchase Order`;
    return () => {
      document.title = previous;
    };
  }, [html]);

  const print = () => frame.current?.contentWindow?.print();

  if (error)
    return (
      <PrintLoadError
        kind={error}
        what="purchase order"
        onRetry={() => {
          setError(null);
          load();
        }}
      />
    );
  if (!html) return <Loader2 className="m-8 size-6 animate-spin" />;

  return (
    <div className="flex min-h-screen flex-col bg-neutral-100">
      <div className="flex justify-end p-3">
        <Button onClick={print}>
          <Printer className="size-4" /> Print / Save as PDF
        </Button>
      </div>
      {/* sandboxed: no scripts run inside the document (the HTML includes admin-supplied
          content such as the logo); same-origin so this page can call print(), modals so
          the print dialog may open */}
      <iframe
        ref={frame}
        title="Purchase order"
        srcDoc={html}
        sandbox="allow-same-origin allow-modals"
        className="w-full flex-1 border-0"
        style={{ minHeight: "1100px" }}
        onLoad={() => {
          // open the print dialog once, after the document has rendered
          if (!printed.current) {
            printed.current = true;
            setTimeout(print, 300);
          }
        }}
      />
    </div>
  );
}
