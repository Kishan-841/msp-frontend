"use client";

import { useEffect, useRef } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateIN } from "@/lib/utils";
import { GST_STATES } from "@/lib/gst";

import { amountInWords } from "@/lib/amountInWords";
import type { CompanySettings, GstType } from "@/types";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
/** Same rule as the backend (utils/poCalc lineGstSplit): CGST = half rounded, SGST = the rest */
const lineGstSplit = (gst: number) => {
  const cgst = round2(gst / 2);
  return { cgst, sgst: round2(gst - cgst) };
};

export interface PrintLine {
  description: string;
  hsnCode?: string;
  quantity: number;
  unit: string;
  rate: number;
  gstPercent: number;
  taxableAmount: number;
  gstAmount: number;
  total: number;
}

export interface PrintParty {
  title: string;
  name: string;
  gstin?: string | null;
  state?: string | null; // GST state code
  address?: string | null;
  extra?: string[];
}

interface PrintDocumentProps {
  docTitle: string; // e.g. TAX INVOICE
  /** Browser tab title = the default file name for "Save as PDF", e.g. "INV-2026-27-0007 – Acme" */
  docName?: string;
  company: CompanySettings | null;
  meta: { label: string; value?: string | null }[];
  parties: PrintParty[];
  lines: PrintLine[];
  /** "GST" = one combined GST column (e.g. a quote, before the place of supply is fixed) */
  gstType: GstType | "GST";
  totals: { subtotal: number; cgstAmount: number; sgstAmount: number; igstAmount: number; totalAmount: number };
  notes?: string | null;
  footerNote?: string;
  showBank?: boolean; // customer-facing documents: where to pay
  hsnSummary?: boolean; // tax invoices: taxable value + tax per HSN/SAC code
}

// Plain number formatting for print — ₹ symbol only on totals
const num = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const stateLabel = (code?: string | null) => (code ? `${GST_STATES[code] ?? ""} (${code})` : "—");

/** A4 document that the browser can save as PDF (Print → Save as PDF) */
export function PrintDocument({
  docTitle,
  company,
  meta,
  parties,
  lines,
  gstType,
  totals,
  notes,
  footerNote = "This is a computer-generated document.",
  showBank = false,
  hsnSummary = false,
  docName,
}: PrintDocumentProps) {
  const printed = useRef(false);

  // Save as PDF names the file after the tab title
  useEffect(() => {
    if (!docName) return;
    const previous = document.title;
    document.title = docName.replace(/[\\/:*?"<>|]+/g, "-");
    return () => {
      document.title = previous;
    };
  }, [docName]);

  useEffect(() => {
    // Open the print dialog once the document has rendered
    if (printed.current) return;
    printed.current = true;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);

  const intra = gstType === "INTRA";
  const combined = gstType === "GST";
  const half = (p: number) => `${p / 2}%`;
  const gstTotal = round2(totals.cgstAmount + totals.sgstAmount + totals.igstAmount);

  // HSN/SAC summary for the tax invoice: one row per code + GST rate
  const hsnRows = hsnSummary
    ? Object.values(
        lines.reduce<Record<string, { hsn: string; rate: number; taxable: number; gst: number }>>((acc, l) => {
          const key = `${l.hsnCode ?? ""}|${l.gstPercent}`;
          const row = (acc[key] ??= { hsn: l.hsnCode || "—", rate: l.gstPercent, taxable: 0, gst: 0 });
          row.taxable = round2(row.taxable + l.taxableAmount);
          row.gst = round2(row.gst + l.gstAmount);
          return acc;
        }, {})
      )
    : [];

  return (
    <div className="min-h-screen bg-neutral-100 py-8 text-black print:bg-white print:py-0">
      <style>{`@page { size: A4; margin: 12mm; } @media print { .no-print { display: none !important; } }`}</style>
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] justify-end">
        <Button onClick={() => window.print()}>
          <Printer className="size-4" /> Print / Save as PDF
        </Button>
      </div>

      <div className="mx-auto max-w-[210mm] bg-white p-8 text-[11px] leading-snug shadow print:max-w-none print:p-0 print:shadow-none">
        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-black pb-3">
          <div className="flex items-start gap-4">
            {company?.logoDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- data URL logo
              <img src={company.logoDataUrl} alt="" className="max-h-16 max-w-[120px] object-contain" />
            )}
            <div>
            <p className="text-lg font-bold">{company?.name ?? "Company name not set"}</p>
            {company?.address && <p className="whitespace-pre-line">{company.address}</p>}
            <p>
              GSTIN: <b>{company?.gstin ?? "—"}</b> · State: {stateLabel(company?.state)}
              {company?.pan ? ` · PAN: ${company.pan}` : ""}
            </p>
            {company?.cin && <p>CIN: {company.cin}</p>}
            {(company?.email || company?.phone) && (
              <p>{[company?.email, company?.phone].filter(Boolean).join(" · ")}</p>
            )}
            </div>
          </div>
          <p className="text-xl font-bold tracking-wide">{docTitle}</p>
        </div>

        {/* Meta */}
        <div className="grid grid-cols-3 gap-x-6 gap-y-1 border-b border-black py-2">
          {meta
            .filter((m) => m.value)
            .map((m) => (
              <p key={m.label}>
                <span className="text-neutral-600">{m.label}: </span>
                <b>{m.value}</b>
              </p>
            ))}
        </div>

        {/* Parties */}
        <div className={`grid gap-6 border-b border-black py-3 ${parties.length > 1 ? "grid-cols-2" : ""}`}>
          {parties.map((p) => (
            <div key={p.title}>
              <p className="text-[10px] font-semibold uppercase text-neutral-600">{p.title}</p>
              <p className="text-sm font-bold">{p.name}</p>
              {p.address && <p className="whitespace-pre-line">{p.address}</p>}
              <p>GSTIN: {p.gstin ?? "Unregistered"}</p>
              <p>State: {stateLabel(p.state)}</p>
              {p.extra?.map((x) => <p key={x}>{x}</p>)}
            </div>
          ))}
        </div>

        {/* Lines */}
        <table className="mt-3 w-full border-collapse">
          <thead>
            <tr className="border-y border-black text-left">
              <th className="py-1 pr-1">#</th>
              <th className="py-1 pr-1">Description</th>
              <th className="py-1 pr-1">HSN/SAC</th>
              <th className="py-1 pr-1 text-right">Qty</th>
              <th className="py-1 pr-1 text-right">Rate</th>
              <th className="py-1 pr-1 text-right">Taxable</th>
              {combined ? (
                <th className="py-1 pr-1 text-right">GST</th>
              ) : intra ? (
                <>
                  <th className="py-1 pr-1 text-right">CGST</th>
                  <th className="py-1 pr-1 text-right">SGST</th>
                </>
              ) : (
                <th className="py-1 pr-1 text-right">IGST</th>
              )}
              <th className="py-1 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-b border-neutral-300 align-top">
                <td className="py-1 pr-1">{i + 1}</td>
                <td className="py-1 pr-1">{l.description}</td>
                <td className="py-1 pr-1">{l.hsnCode ?? ""}</td>
                <td className="py-1 pr-1 text-right">
                  {l.quantity} {l.unit}
                </td>
                <td className="py-1 pr-1 text-right">{num(l.rate)}</td>
                <td className="py-1 pr-1 text-right">{num(l.taxableAmount)}</td>
                {combined ? (
                  <td className="py-1 pr-1 text-right">
                    {num(l.gstAmount)}
                    <span className="block text-[9px] text-neutral-500">@{l.gstPercent}%</span>
                  </td>
                ) : intra ? (
                  <>
                    <td className="py-1 pr-1 text-right">
                      {num(lineGstSplit(l.gstAmount).cgst)}
                      <span className="block text-[9px] text-neutral-500">@{half(l.gstPercent)}</span>
                    </td>
                    <td className="py-1 pr-1 text-right">
                      {num(lineGstSplit(l.gstAmount).sgst)}
                      <span className="block text-[9px] text-neutral-500">@{half(l.gstPercent)}</span>
                    </td>
                  </>
                ) : (
                  <td className="py-1 pr-1 text-right">
                    {num(l.gstAmount)}
                    <span className="block text-[9px] text-neutral-500">@{l.gstPercent}%</span>
                  </td>
                )}
                <td className="py-1 text-right">{num(l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="mt-3 flex justify-between gap-6">
          <div className="max-w-[60%] space-y-2">
            <p>
              <span className="text-neutral-600">Amount in words: </span>
              <b>{amountInWords(totals.totalAmount)}</b>
            </p>
            {notes && <p className="whitespace-pre-line text-neutral-700">{notes}</p>}
            {showBank && company?.bankAccountNumber && (
              <div className="rounded border border-neutral-300 p-2">
                <p className="text-[10px] font-semibold uppercase text-neutral-600">Bank details for payment</p>
                <p>
                  {company.bankAccountName ?? company.name} · {company.bankName}
                </p>
                <p>
                  A/c No: <b>{company.bankAccountNumber}</b> · IFSC: <b>{company.bankIfsc}</b>
                </p>
                {company.bankBranch && <p>Branch: {company.bankBranch}</p>}
              </div>
            )}
          </div>
          <table className="min-w-[45%]">
            <tbody>
              <TotalRow label="Taxable value" value={totals.subtotal} />
              {combined ? (
                <TotalRow label="GST" value={gstTotal} />
              ) : intra ? (
                <>
                  <TotalRow label="CGST" value={totals.cgstAmount} />
                  <TotalRow label="SGST" value={totals.sgstAmount} />
                </>
              ) : (
                <TotalRow label="IGST" value={totals.igstAmount} />
              )}
              <tr className="border-t-2 border-black text-sm font-bold">
                <td className="py-1">Total</td>
                <td className="py-1 text-right">₹ {num(totals.totalAmount)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {hsnRows.length > 0 && (
          <table className="mt-4 w-full border-collapse text-[10px]">
            <thead>
              <tr className="border-y border-black text-left">
                <th className="py-1 pr-1">HSN/SAC</th>
                <th className="py-1 pr-1 text-right">Taxable value</th>
                {intra ? (
                  <>
                    <th className="py-1 pr-1 text-right">CGST</th>
                    <th className="py-1 pr-1 text-right">SGST</th>
                  </>
                ) : (
                  <th className="py-1 pr-1 text-right">IGST</th>
                )}
                <th className="py-1 text-right">Total tax</th>
              </tr>
            </thead>
            <tbody>
              {hsnRows.map((r) => {
                const split = lineGstSplit(r.gst);
                return (
                  <tr key={`${r.hsn}|${r.rate}`} className="border-b border-neutral-300">
                    <td className="py-1 pr-1">{r.hsn}</td>
                    <td className="py-1 pr-1 text-right">{num(r.taxable)}</td>
                    {intra ? (
                      <>
                        <td className="py-1 pr-1 text-right">
                          {num(split.cgst)} <span className="text-neutral-500">@{half(r.rate)}</span>
                        </td>
                        <td className="py-1 pr-1 text-right">
                          {num(split.sgst)} <span className="text-neutral-500">@{half(r.rate)}</span>
                        </td>
                      </>
                    ) : (
                      <td className="py-1 pr-1 text-right">
                        {num(r.gst)} <span className="text-neutral-500">@{r.rate}%</span>
                      </td>
                    )}
                    <td className="py-1 text-right">{num(r.gst)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Sign-off */}
        <div className="mt-10 flex items-end justify-between">
          <p className="text-[10px] text-neutral-500">
            {footerNote} Printed {formatDateIN(new Date())}.
          </p>
          <div className="text-right">
            <p>For {company?.name ?? ""}</p>
            <p className="mt-10 border-t border-black pt-1">Authorised Signatory</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: number }) {
  return (
    <tr>
      <td className="py-0.5 pr-4 text-neutral-600">{label}</td>
      <td className="py-0.5 text-right">{num(value)}</td>
    </tr>
  );
}
