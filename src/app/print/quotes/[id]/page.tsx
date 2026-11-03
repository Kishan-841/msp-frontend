"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import api from "@/lib/axios";
import { formatDateIN } from "@/lib/utils";
import { PrintDocument, type PrintLine } from "@/components/print/PrintDocument";
import { PrintLoadError, loadErrorKind, type LoadError } from "@/components/print/PrintLoadError";
import type { CompanySettings, Quote } from "@/types";

// GET /quotes/:id returns the whole lead; these are the customer fields the document needs
type QuoteLead = {
  companyName: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  customerGstin?: string | null;
  customerState?: string | null;
  billingAddress?: string | null;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** The quote as a customer document — what Sales shares (print / Save as PDF) */
export default function PrintQuotePage() {
  const { id } = useParams<{ id: string }>();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [error, setError] = useState<LoadError | null>(null);

  const load = useCallback(() => {
    Promise.all([api.get(`/quotes/${id}`), api.get("/settings/company")])
      .then(([q, c]) => {
        setQuote(q.data.data);
        setCompany(c.data.data ?? null);
      })
      .catch((err) => setError(loadErrorKind(err)));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error)
    return (
      <PrintLoadError
        kind={error}
        what="quote"
        onRetry={() => {
          setError(null);
          load();
        }}
      />
    );
  if (!quote) return <Loader2 className="m-8 size-6 animate-spin" />;

  const lead = (quote.lead ?? { companyName: "" }) as QuoteLead;

  // One line per item / service, labelled with its requirement (e.g. "Firewall — Fortinet FortiGate 60F")
  const lines: PrintLine[] = quote.items.flatMap((req) => [
    ...req.items.map((it) => ({
      description: `${req.name} — ${it.make}${it.description ? ` ${it.description}` : ""}`,
      hsnCode: it.hsnCode,
      quantity: it.quantity,
      unit: it.unit,
      rate: it.unitPrice,
      gstPercent: it.gstPercent,
      taxableAmount: it.taxableAmount,
      gstAmount: it.gstAmount,
      total: it.total,
    })),
    ...req.services.map((sv) => ({
      description: `${req.name} — ${sv.description}`,
      quantity: 1,
      unit: "Service",
      rate: sv.price,
      gstPercent: sv.gstPercent,
      taxableAmount: sv.taxableAmount,
      gstAmount: sv.gstAmount,
      total: sv.total,
    })),
  ]);

  // CGST+SGST vs IGST once both states are known; otherwise one combined GST column
  const known = !!(company?.state && lead.customerState);
  const gstType = !known ? "GST" : company!.state === lead.customerState ? "INTRA" : "INTER";
  const gst = round2(quote.gstAmount);
  const cgst = round2(lines.reduce((a, l) => a + round2(l.gstAmount / 2), 0));
  const totals = {
    subtotal: quote.subtotal,
    totalAmount: quote.totalAmount,
    ...(gstType === "INTRA"
      ? { cgstAmount: cgst, sgstAmount: round2(gst - cgst), igstAmount: 0 }
      : { cgstAmount: 0, sgstAmount: 0, igstAmount: gst }),
  };

  return (
    <PrintDocument
      docTitle="QUOTATION"
      docName={`${quote.quoteNumber} – ${lead.companyName}`}
      company={company}
      meta={[
        { label: "Quote No", value: quote.quoteNumber },
        { label: "Date", value: formatDateIN(quote.createdAt) },
        { label: "Prepared by", value: quote.createdBy?.name },
      ]}
      parties={[
        {
          title: "Quotation for",
          name: lead.companyName,
          gstin: lead.customerGstin,
          state: lead.customerState,
          address: lead.billingAddress,
          extra: [lead.contactPerson && `Attn: ${lead.contactPerson}`, lead.email, lead.phone].filter(Boolean) as string[],
        },
      ]}
      lines={lines}
      gstType={gstType}
      totals={totals}
      notes={quote.notes}
      footerNote="Prices exclude GST unless stated; GST as shown. This is a computer-generated quotation."
    />
  );
}
