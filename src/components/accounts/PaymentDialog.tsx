"use client";

import { useEffect, useMemo, useState } from "react";
import { Landmark, Loader2, Wallet } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PillTabs, type PillTab } from "@/components/ui/tabs-pill";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import api from "@/lib/axios";
import { useDiscardGuard } from "@/hooks/useDiscardGuard";
import { notify } from "@/lib/notify";
import { apiErrorMessage, formatINR } from "@/lib/utils";
import type { CompanySettings, Payment, PaymentDirection, PaymentMode, Vendor } from "@/types";

type PartyBank = { name: string; accountName: string; accountNumber: string; ifsc: string };
const EMPTY_BANK: PartyBank = { name: "", accountName: "", accountNumber: "", ifsc: "" };

/** Pre-fill the other party's bank: vendor master for vendors, last receipt for customers */
async function fetchPartyBank(direction: PaymentDirection, partyId: string): Promise<PartyBank> {
  if (direction === "OUT") {
    const v = (await api.get(`/vendors/${partyId}`)).data.data as Vendor;
    return {
      name: v.bankName ?? "",
      accountName: v.bankAccountName ?? "",
      accountNumber: v.bankAccountNumber ?? "",
      ifsc: v.bankIfsc ?? "",
    };
  }
  const list = (await api.get("/payments", { params: { direction: "IN", partyId } })).data.data as Payment[];
  const last = list.find((p) => p.partyBankAccountNumber);
  return last
    ? {
        name: last.partyBankName ?? "",
        accountName: last.partyBankAccountName ?? "",
        accountNumber: last.partyBankAccountNumber ?? "",
        ifsc: last.partyBankIfsc ?? "",
      }
    : EMPTY_BANK;
}

const MODES: PaymentMode[] = ["NEFT", "RTGS", "IMPS", "UPI", "CHEQUE", "CASH", "OTHER"];
const TDS_RATES = [0, 1, 2, 5, 10];

// An invoice the money can settle — sales invoice (IN) or vendor bill (OUT)
export interface OpenInvoice {
  id: string;
  number: string;
  outstanding: number;
  taxable: number;
  total: number;
}

type Party = { id: string; name: string };

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Same rule as backend utils/salesCalc.ts tdsOn: TDS on the taxable share only */
const tdsOn = (gross: number, inv: OpenInvoice, pct: number) =>
  pct && inv.total > 0 ? round2(((gross * inv.taxable) / inv.total) * (pct / 100)) : 0;

async function fetchOpenInvoices(direction: PaymentDirection, partyId: string): Promise<OpenInvoice[]> {
  if (direction === "IN") {
    const { data } = await api.get("/invoices", { params: { leadId: partyId } });
    return (data.data ?? [])
      .filter((i: { outstanding: number }) => i.outstanding > 0)
      .map((i: { id: string; invoiceNumber: string; outstanding: number; subtotal: number; totalAmount: number }) => ({
        id: i.id,
        number: i.invoiceNumber,
        outstanding: i.outstanding,
        taxable: i.subtotal,
        total: i.totalAmount,
      }));
  }
  const { data } = await api.get("/purchase-invoices", { params: { vendorId: partyId } });
  return (data.data ?? [])
    .filter((b: { outstanding: number }) => b.outstanding > 0)
    .map((b: { id: string; billNumber: string; outstanding: number; taxableAmount: number; totalAmount: number }) => ({
      id: b.id,
      number: b.billNumber,
      outstanding: b.outstanding,
      taxable: b.taxableAmount,
      total: b.totalAmount,
    }));
}

// Customers who can pay us: anyone already in the books (invoices / receipts), plus deals the
// customer has accepted (an advance may come before the first invoice). Not every lead.
const PAYABLE_STAGES = new Set(["CUSTOMER_ACCEPTED", "PO_PENDING_ACCOUNTS", "PO_CONFIRMED", "PO_SENT", "INVOICED", "DEAL_REGISTERED"]);

/**
 * One page of matching parties (server-side search, max 20 + 40 rows) — never the whole table.
 * Customers: in the books (/ledgers/customers) + leads at an accepted stage that aren't dropped.
 */
async function searchParties(direction: PaymentDirection, query: string): Promise<Party[]> {
  const search = query.trim() || undefined;
  if (direction === "IN") {
    const [books, leads] = await Promise.all([
      api
        .get("/ledgers/customers", { params: { search, page: 1, limit: 20 } })
        .then((r) => (r.data.data?.items ?? []) as { id: string; companyName: string }[])
        .catch(() => []),
      api
        .get("/leads", { params: { search, page: 1, limit: 40 } })
        .then((r) => (r.data.data?.leads ?? []) as { id: string; companyName: string; status: string; droppedAt?: string | null }[])
        .catch(() => []),
    ]);
    const byId = new Map<string, Party>();
    for (const c of books) byId.set(c.id, { id: c.id, name: c.companyName });
    for (const l of leads) if (PAYABLE_STAGES.has(l.status) && !l.droppedAt) byId.set(l.id, { id: l.id, name: l.companyName });
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
  const { data } = await api.get("/vendors", { params: { search, page: 1, limit: 20 } });
  return ((data.data?.items ?? []) as { id: string; name: string }[]).map((v) => ({ id: v.id, name: v.name }));
}

interface PaymentDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
  direction: PaymentDirection;
  party?: Party; // fixed party (from an invoice / ledger page)
  invoice?: OpenInvoice; // fixed invoice
}

export function PaymentDialog({ open, onClose, onSuccess, direction, party, invoice }: PaymentDialogProps) {
  const isIn = direction === "IN";
  const [parties, setParties] = useState<Party[]>([]);
  const [partyId, setPartyId] = useState("");
  const [invoices, setInvoices] = useState<OpenInvoice[]>([]);
  const [mode, setMode] = useState<"invoice" | "advance">("invoice");
  const [invoiceId, setInvoiceId] = useState("");
  const [settle, setSettle] = useState(0);
  const [tdsPercent, setTdsPercent] = useState(0);
  const [advance, setAdvance] = useState(0);
  const [date, setDate] = useState("");
  const [payMode, setPayMode] = useState<PaymentMode>("NEFT");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [ourBank, setOurBank] = useState<CompanySettings | null>(null);
  const [partyBank, setPartyBank] = useState<PartyBank>(EMPTY_BANK);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partyQuery, setPartyQuery] = useState("");

  // anything typed/picked beyond what the dialog opened with → ask before discarding
  const dirty =
    (!party && partyId !== "") ||
    (!invoice && invoiceId !== "") ||
    Number(settle) !== (invoice?.outstanding ?? 0) ||
    tdsPercent !== 0 ||
    Number(advance) !== 0 ||
    payMode !== "NEFT" ||
    reference.trim() !== "" ||
    notes.trim() !== "";
  const guard = useDiscardGuard(dirty && !saving, onClose);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPartyQuery("");
    setMode("invoice");
    setPartyId(party?.id ?? "");
    setInvoiceId(invoice?.id ?? "");
    setSettle(invoice?.outstanding ?? 0);
    setTdsPercent(0);
    setAdvance(0);
    setDate(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })); // today in IST
    setPayMode("NEFT");
    setReference("");
    setNotes("");
    setPartyBank(EMPTY_BANK);
    api
      .get("/settings/company")
      .then(({ data }) => setOurBank(data.data))
      .catch(() => setOurBank(null));
  }, [open, party, invoice, direction]);

  // party picker: search-as-you-type against the server (debounced), keeping the picked one listed
  const [pickedParty, setPickedParty] = useState<Party | null>(null);
  useEffect(() => {
    if (!open || party) return;
    const t = setTimeout(() => {
      searchParties(direction, partyQuery)
        .then(setParties)
        .catch(() => setParties([]));
    }, 300);
    return () => clearTimeout(t);
  }, [open, party, direction, partyQuery]);

  useEffect(() => {
    if (!open || !partyId) return;
    fetchPartyBank(direction, partyId)
      .then(setPartyBank)
      .catch(() => setPartyBank(EMPTY_BANK));
  }, [open, partyId, direction]);

  useEffect(() => {
    if (!open || !partyId) return setInvoices(invoice ? [invoice] : []);
    fetchOpenInvoices(direction, partyId)
      .then((list) => setInvoices(invoice && !list.some((i) => i.id === invoice.id) ? [invoice, ...list] : list))
      .catch(() => setInvoices([]));
  }, [open, partyId, direction, invoice]);

  const selected = invoices.find((i) => i.id === invoiceId);
  const visibleParties =
    pickedParty && pickedParty.id === partyId && !parties.some((p) => p.id === partyId) ? [pickedParty, ...parties] : parties;
  const tds = useMemo(() => (selected ? tdsOn(Number(settle) || 0, selected, tdsPercent) : 0), [selected, settle, tdsPercent]);
  const cash = round2((Number(settle) || 0) - tds);

  const save = async () => {
    if (!partyId) return setError(`Pick the ${isIn ? "customer" : "vendor"}.`);
    if (mode === "invoice" && !selected) return setError("Pick the invoice being paid.");
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.post("/payments", {
        direction,
        partyId,
        paymentDate: date,
        mode: payMode,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        partyBankName: partyBank.name.trim() || undefined,
        partyBankAccountName: partyBank.accountName.trim() || undefined,
        partyBankAccountNumber: partyBank.accountNumber.trim() || undefined,
        partyBankIfsc: partyBank.ifsc.trim().toUpperCase() || undefined,
        ...(mode === "invoice"
          ? { invoiceId, settleAmount: Number(settle), tdsPercent: tdsPercent || undefined }
          : { advanceAmount: Number(advance) }),
      });
      const number: string = data.data?.number ?? "";
      const partyName = party?.name ?? visibleParties.find((p) => p.id === partyId)?.name ?? (isIn ? "the customer" : "the vendor");
      if (mode === "advance") {
        notify.info(
          isIn ? "Advance received" : "Advance paid to vendor",
          `${number} · ${formatINR(Number(advance))} from ${partyName} — apply it to an invoice later from ${isIn ? "Receipts" : "Payments"}.`
        );
      } else if (selected) {
        const gross = Number(settle) || 0;
        const fullyPaid = gross >= selected.outstanding - 0.005;
        const what = `${number} · ${formatINR(cash)}${tds ? ` + TDS ${formatINR(tds)}` : ""} against ${selected.number}`;
        notify.success(
          isIn ? "Payment received" : "Vendor paid",
          fullyPaid
            ? `${what} — ${selected.number} is now fully paid.`
            : `${what} — ${formatINR(round2(selected.outstanding - gross))} still ${isIn ? "to collect" : "to pay"}.`
        );
      }
      await onSuccess();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, "Could not record the payment"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !saving && guard.requestClose()}>
      {guard.dialog}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isIn ? "Record receipt from customer" : "Record payment to vendor"}</DialogTitle>
          <DialogDescription>
            {party ? party.name : isIn ? "Money received from a customer." : "Money paid to a vendor."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {!party && (
            <div className="space-y-1.5">
              <Label htmlFor="pay-party">{isIn ? "Customer" : "Vendor"}</Label>
              <Input
                id="pay-party"
                placeholder={`Search ${isIn ? "customers" : "vendors"}…`}
                value={partyQuery}
                onChange={(e) => setPartyQuery(e.target.value)}
                className="h-8"
              />
              <Select
                value={partyId || null}
                onValueChange={(v) => {
                  setPartyId(v ?? "");
                  setPickedParty(visibleParties.find((p) => p.id === v) ?? null);
                  setInvoiceId("");
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={`Pick a ${isIn ? "customer" : "vendor"}`}>
                    {visibleParties.find((p) => p.id === partyId)?.name ?? `Pick a ${isIn ? "customer" : "vendor"}`}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {visibleParties.length === 0 && (
                    <p className="px-2 py-1.5 text-sm text-muted-foreground">
                      {partyQuery.trim() ? "No match" : isIn ? "No customers with accepted deals yet" : "No vendors"}
                    </p>
                  )}
                  {visibleParties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {!invoice && (
            <PillTabs
              tabs={[
                { value: "invoice", label: "Against an invoice" },
                { value: "advance", label: "Advance" },
              ] as PillTab<"invoice" | "advance">[]}
              value={mode}
              onChange={setMode}
            />
          )}

          {mode === "invoice" ? (
            <>
              {!invoice && (
                <div className="space-y-1.5">
                  <Label>Invoice</Label>
                  <Select
                    value={invoiceId || null}
                    onValueChange={(v) => {
                      setInvoiceId(v ?? "");
                      setSettle(invoices.find((i) => i.id === v)?.outstanding ?? 0);
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={partyId ? "Pick an open invoice" : "Pick the party first"}>
                        {selected ? `${selected.number} · ${formatINR(selected.outstanding)} due` : "Pick an open invoice"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {invoices.map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.number} · {formatINR(i.outstanding)} due
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pay-settle">Amount settled (incl. TDS)</Label>
                  <Input
                    id="pay-settle"
                    type="number"
                    min={0}
                    className="tabular-nums"
                    value={settle}
                    onChange={(e) => setSettle(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>TDS %</Label>
                  <Select value={String(tdsPercent)} onValueChange={(v) => setTdsPercent(Number(v ?? 0))}>
                    <SelectTrigger className="w-full">
                      <SelectValue>{tdsPercent ? `${tdsPercent}%` : "No TDS"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {TDS_RATES.map((r) => (
                        <SelectItem key={r} value={String(r)}>
                          {r ? `${r}%` : "No TDS"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {selected && (
                <div className="space-y-1 rounded-md bg-muted/40 px-3 py-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      TDS {tdsPercent ? `@ ${tdsPercent}% on taxable share` : ""}
                    </span>
                    <span className="tabular-nums">{formatINR(tds)}</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>{isIn ? "Cash received" : "Cash paid"}</span>
                    <span className="tabular-nums">{formatINR(cash)}</span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="pay-advance">Advance amount</Label>
              <Input
                id="pay-advance"
                type="number"
                min={0}
                className="tabular-nums"
                value={advance}
                onChange={(e) => setAdvance(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">Apply it to invoices later from the Payments page.</p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pay-date">Date</Label>
              <Input id="pay-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Mode</Label>
              <Select value={payMode} onValueChange={(v) => setPayMode((v ?? "NEFT") as PaymentMode)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{payMode}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {MODES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-ref">UTR / cheque no.</Label>
              <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
          </div>
          {/* Bank details: our account (from Settings) + the other party's */}
          <div className="space-y-2 rounded-lg border border-border p-3">
            <p className="flex items-center gap-2 text-sm">
              <Landmark className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">{isIn ? "Received into" : "Paid from"}:</span>
              {ourBank?.bankAccountNumber ? (
                <span className="font-medium">
                  {ourBank.bankName} · A/c {ourBank.bankAccountNumber} · {ourBank.bankIfsc}
                </span>
              ) : (
                <span className="text-amber-600">No company bank in Settings</span>
              )}
            </p>
            <p className="text-xs font-medium text-muted-foreground">
              {isIn ? "Customer's bank (paid from)" : "Vendor's bank (paid to)"} — optional
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                placeholder="Bank"
                value={partyBank.name}
                onChange={(e) => setPartyBank((b) => ({ ...b, name: e.target.value }))}
              />
              <Input
                placeholder="Account name"
                value={partyBank.accountName}
                onChange={(e) => setPartyBank((b) => ({ ...b, accountName: e.target.value }))}
              />
              <Input
                placeholder="Account number"
                inputMode="numeric"
                value={partyBank.accountNumber}
                onChange={(e) => setPartyBank((b) => ({ ...b, accountNumber: e.target.value }))}
              />
              <Input
                placeholder="IFSC"
                maxLength={11}
                className="uppercase"
                value={partyBank.ifsc}
                onChange={(e) => setPartyBank((b) => ({ ...b, ifsc: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-notes">Notes</Label>
            <Textarea id="pay-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={guard.requestClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Wallet className="size-4" />}
            Record
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
