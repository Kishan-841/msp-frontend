"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Loader2, Plus, Truck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PillTabs, type PillTab } from "@/components/ui/tabs-pill";
import { downloadFile } from "@/lib/download";
import { useAuthStore } from "@/stores/auth-store";
import { PaymentDialog } from "@/components/accounts/PaymentDialog";
import { CustomerTab } from "./_components/CustomerTab";
import { VendorTab } from "./_components/VendorTab";

type Side = "customers" | "vendors";

const REGISTERS = [
  { kind: "sales", label: "Sales" },
  { kind: "purchases", label: "Purchases" },
  { kind: "payments", label: "Payments" },
] as const;

/** Accounts: two separate books — what customers owe us, and what we owe vendors */
export default function AccountsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const canWrite = user?.role === "ACCOUNTS" || user?.role === "ADMIN";

  // side + sub-tab live in the URL: links (badges, toasts, next steps) and back/forward work,
  // even when you're already on this page
  const side: Side = searchParams.get("side") === "vendors" ? "vendors" : "customers";
  const view = searchParams.get("view");
  const [recordOpen, setRecordOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);

  const go = (s: Side, v?: string) =>
    router.replace(`/accounts?side=${s}${v ? `&view=${v}` : ""}`, { scroll: false });
  const changeSide = (s: Side) => go(s);

  const download = async (kind: string) => {
    setDownloading(kind);
    try {
      await downloadFile(`/ledgers/registers/${kind}`, `${kind}-register.csv`, {
        from: from || undefined,
        to: to || undefined,
      });
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
          <p className="text-sm text-muted-foreground">
            Customers: invoices and receipts. Vendors: their invoices and our payments. Each with its own ledger.
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setRecordOpen(true)}>
            <Plus className="size-4" />
            {side === "customers" ? "Record Receipt" : "Record Vendor Payment"}
          </Button>
        )}
      </div>

      <PillTabs
        tabs={[
          { value: "customers", label: "Customers", icon: Users },
          { value: "vendors", label: "Vendors", icon: Truck },
        ] as PillTab<Side>[]}
        value={side}
        onChange={changeSide}
      />

      {side === "customers" ? (
        <CustomerTab canWrite={canWrite} view={view} onViewChange={(v) => go("customers", v)} refreshKey={refreshKey} />
      ) : (
        <VendorTab canWrite={canWrite} view={view} onViewChange={(v) => go("vendors", v)} refreshKey={refreshKey} />
      )}

      <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
        <p className="mr-auto text-sm font-medium">
          Export for Excel / Tally <span className="font-normal text-muted-foreground">(CSV)</span>
        </p>
        <Input type="date" aria-label="From" className="h-9 w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" aria-label="To" className="h-9 w-40" value={to} onChange={(e) => setTo(e.target.value)} />
        {REGISTERS.map((r) => (
          <Button key={r.kind} variant="outline" size="sm" onClick={() => download(r.kind)} disabled={downloading !== null}>
            {downloading === r.kind ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            {r.label}
          </Button>
        ))}
      </section>

      <PaymentDialog
        open={recordOpen}
        onClose={() => setRecordOpen(false)}
        onSuccess={() => setRefreshKey((k) => k + 1)}
        direction={side === "customers" ? "IN" : "OUT"}
      />
    </div>
  );
}
