"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import api from "@/lib/axios";
import { formatDateIN } from "@/lib/utils";
import { GST_STATES } from "@/lib/gst";
import { PrintDocument } from "@/components/print/PrintDocument";
import { PrintLoadError, loadErrorKind, type LoadError } from "@/components/print/PrintLoadError";
import type { CompanySettings, SalesInvoice } from "@/types";

type InvoiceDetail = SalesInvoice & {
  company: CompanySettings | null;
  quote?: { quoteNumber: string; customerPoNumber?: string | null; customerPoDate?: string | null };
};

export default function PrintInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const [inv, setInv] = useState<InvoiceDetail | null>(null);
  const [error, setError] = useState<LoadError | null>(null);

  const load = useCallback(() => {
    api
      .get(`/invoices/${id}`)
      .then(({ data }) => setInv(data.data))
      .catch((err) => setError(loadErrorKind(err)));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error)
    return (
      <PrintLoadError
        kind={error}
        what="invoice"
        onRetry={() => {
          setError(null);
          load();
        }}
      />
    );
  if (!inv) return <Loader2 className="m-8 size-6 animate-spin" />;

  const quote = inv.quote;
  const pos = inv.placeOfSupply;
  return (
    <PrintDocument
      docTitle="TAX INVOICE"
      docName={`${inv.invoiceNumber} – ${inv.customerName}`}
      company={inv.company}
      meta={[
        { label: "Invoice No", value: inv.invoiceNumber },
        { label: "Invoice Date", value: formatDateIN(inv.invoiceDate) },
        { label: "Due Date", value: inv.dueDate ? formatDateIN(inv.dueDate) : null },
        { label: "Place of Supply", value: pos ? `${pos} – ${GST_STATES[pos] ?? ""}` : null },
        { label: "Customer PO", value: quote?.customerPoNumber ? `${quote.customerPoNumber}${quote.customerPoDate ? ` dt ${formatDateIN(quote.customerPoDate)}` : ""}` : null },
        { label: "Quote", value: quote?.quoteNumber },
      ]}
      parties={[
        { title: "Bill to", name: inv.customerName, gstin: inv.customerGstin, state: inv.placeOfSupply, address: inv.customerAddress },
      ]}
      lines={inv.items.map((l) => ({ ...l }))}
      gstType={inv.gstType}
      totals={inv}
      notes={inv.notes}
      showBank
      hsnSummary
    />
  );
}
