"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, Loader2, MessageSquarePlus, Phone, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import api from "@/lib/axios";
import { notify } from "@/lib/notify";
import { apiErrorMessage, cn, formatDateIN, formatINR } from "@/lib/utils";
import { useDataChanged } from "@/hooks/useDataChanged";
import { useDiscardGuard } from "@/hooks/useDiscardGuard";

interface Group {
  key: string;
  label: string;
  hint: string;
  count: number;
  oldestDays: number;
}
interface Row {
  id: string;
  company: string;
  reference: string;
  contactPerson?: string;
  phone?: string;
  since: string | null;
  days: number;
  amount?: number;
  owner?: string | null;
  link: string;
  canLog?: "QUOTE" | "INVOICE";
  lastFollowUpAt?: string | null;
  lastFollowUpNote?: string | null;
}

/** Fresh → needs attention → urgent. The number is always written; colour only reinforces it. */
const ageTone = (days: number) =>
  days >= 7
    ? "bg-rose-500/10 text-rose-700 dark:text-rose-300"
    : days >= 3
      ? "bg-amber-500/10 text-amber-800 dark:text-amber-300"
      : "bg-muted text-muted-foreground";
const dayText = (d: number) => (d === 1 ? "1 day" : `${d} days`);

/** What the row's button says — the next step for that list */
const ACTION: Record<string, string> = {
  quotesNoResponse: "Open quote",
  callbacksDue: "Call back",
  notCalled: "Call",
  meetingsNoMom: "Add MOM",
  requirementPending: "Send requirement",
  quotesNotSent: "Send quote",
  posNotSent: "Send PO",
  quotesToApprove: "Review quote",
  notCategorized: "Categorize",
  notAssigned: "Assign",
  quoteNotBuilt: "Build quote",
  draftNotSubmitted: "Finish quote",
  acceptedNoPo: "Create PO",
  poNotFinished: "Finish PO",
  poToConfirm: "Review PO",
  noVendorInvoice: "Record invoice",
  notInvoiced: "Raise invoice",
  invoicesOverdue: "Open invoice",
  billsOverdue: "Pay",
};

const PAGE_SIZE = 20;

export default function FollowUpsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingRows, setLoadingRows] = useState(true);
  const [page, setPage] = useState(1);
  const [logging, setLogging] = useState<Row | null>(null);

  const waiting = (groups ?? []).filter((g) => g.count > 0);
  // the list lives in the URL; default to the first one with something in it
  const requested = searchParams.get("list");
  const activeKey = groups?.some((g) => g.key === requested) ? requested! : (waiting[0]?.key ?? null);
  const active = groups?.find((g) => g.key === activeKey);

  const fetchGroups = useCallback(async () => {
    try {
      const { data } = await api.get("/follow-ups");
      setGroups(data.data ?? []);
      setLoadFailed(false);
    } catch (err) {
      setLoadFailed(true);
      notify.apiError(err, "Couldn't load follow-ups");
    }
  }, []);

  const fetchRows = useCallback(async () => {
    if (!activeKey) {
      setRows([]);
      setTotal(0);
      setLoadingRows(false);
      return;
    }
    try {
      const { data } = await api.get(`/follow-ups/${activeKey}`, { params: { page, limit: PAGE_SIZE } });
      setRows(data.data.items ?? []);
      setTotal(data.data.total ?? 0);
    } catch (err) {
      notify.apiError(err, "Couldn't load this list");
    } finally {
      setLoadingRows(false);
    }
  }, [activeKey, page]);

  useEffect(() => {
    const t = setTimeout(fetchGroups, 0);
    return () => clearTimeout(t);
  }, [fetchGroups]);
  useEffect(() => {
    const t = setTimeout(fetchRows, 0);
    return () => clearTimeout(t);
  }, [fetchRows]);
  const refresh = () => {
    fetchGroups();
    fetchRows();
  };
  useDataChanged(refresh);

  const openList = (key: string) => {
    setPage(1);
    setLoadingRows(true);
    router.replace(`/follow-ups?list=${key}`);
  };

  if (!groups) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        {loadFailed ? (
          <>
            <p>Couldn&apos;t load follow-ups.</p>
            <Button variant="outline" size="sm" onClick={fetchGroups}>
              <RotateCcw className="size-4" /> Try again
            </Button>
          </>
        ) : (
          <Loader2 className="size-6 animate-spin" />
        )}
      </div>
    );
  }

  const totalWaiting = waiting.reduce((n, g) => n + g.count, 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6 pb-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Follow-ups</h1>
        <p className="text-sm text-muted-foreground">
          {totalWaiting > 0
            ? `${totalWaiting} item${totalWaiting === 1 ? "" : "s"} waiting, oldest first.`
            : "Everything waiting on you or a customer shows up here."}
        </p>
      </div>

      {waiting.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-16 text-center">
          <CheckCircle2 className="size-8 text-emerald-500" />
          <p className="text-sm font-medium">Nothing to follow up on</p>
          <p className="text-xs text-muted-foreground">Items appear here as soon as something is waiting.</p>
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          {/* The lists */}
          <nav aria-label="Follow-up lists" className="overflow-hidden rounded-2xl border border-border bg-card lg:sticky lg:top-0">
            <ul className="divide-y divide-border">
              {waiting.map((g) => {
                const selected = g.key === activeKey;
                return (
                  <li key={g.key}>
                    <button
                      type="button"
                      aria-current={selected ? "true" : undefined}
                      onClick={() => openList(g.key)}
                      className={cn(
                        "relative flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50",
                        selected && "bg-muted/70"
                      )}
                    >
                      {selected && <span className="absolute inset-y-0 left-0 w-1 bg-[#3B82F6]" />}
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm", selected ? "font-semibold" : "font-medium")}>{g.label}</span>
                        {g.oldestDays > 0 && (
                          <span className="mt-0.5 block text-xs text-muted-foreground">Oldest {dayText(g.oldestDays)}</span>
                        )}
                      </span>
                      <span className={cn("flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full px-2 text-xs font-semibold tabular-nums", ageTone(g.oldestDays))}>
                        {g.count}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* The selected list */}
          <section className="overflow-hidden rounded-2xl border border-border bg-card">
            <header className="border-b border-border px-6 py-4">
              <h2 className="text-base font-semibold">{active?.label}</h2>
              <p className="text-sm text-muted-foreground">{active?.hint}</p>
            </header>

            {loadingRows ? (
              <ul className="divide-y divide-border" aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <li key={i} className="flex items-center gap-4 px-6 py-4">
                    <span className="size-12 shrink-0 animate-pulse rounded-xl bg-muted" />
                    <span className="flex-1 space-y-2">
                      <span className="block h-3.5 w-1/3 animate-pulse rounded bg-muted" />
                      <span className="block h-3 w-1/2 animate-pulse rounded bg-muted" />
                    </span>
                  </li>
                ))}
              </ul>
            ) : rows.length === 0 ? (
              <p className="px-6 py-12 text-center text-sm text-muted-foreground">Nothing here right now.</p>
            ) : (
              <ul className="divide-y divide-border">
                {rows.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-6 py-4">
                    {/* how long it's been waiting */}
                    <span
                      className={cn("flex size-12 shrink-0 flex-col items-center justify-center rounded-xl leading-none", ageTone(r.days))}
                      title={r.since ? `Since ${formatDateIN(r.since)}` : undefined}
                    >
                      {r.days === 0 ? (
                        <span className="text-[11px] font-semibold">Today</span>
                      ) : (
                        <>
                          <span className="text-base font-semibold tabular-nums">{r.days}</span>
                          <span className="mt-0.5 text-[10px] font-medium">{r.days === 1 ? "day" : "days"}</span>
                        </>
                      )}
                    </span>

                    <div className="min-w-[180px] flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 font-medium">
                        <Link href={r.link} className="hover:underline">
                          {r.company}
                        </Link>
                        {r.reference && <span className="font-mono text-xs font-normal text-muted-foreground">{r.reference}</span>}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                        {r.contactPerson && <span>{r.contactPerson}</span>}
                        {r.phone && (
                          <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
                            <Phone className="size-3" />
                            {r.phone}
                          </a>
                        )}
                        {r.owner && <span>Sales: {r.owner}</span>}
                        {r.amount !== undefined && <span className="font-medium tabular-nums text-foreground">{formatINR(r.amount)}</span>}
                      </p>
                      {r.lastFollowUpAt && (
                        <p className="mt-1.5 line-clamp-2 rounded-md bg-muted/60 px-2 py-1 text-xs" title={r.lastFollowUpNote ?? undefined}>
                          <span className="text-muted-foreground">{formatDateIN(r.lastFollowUpAt)}: </span>
                          {r.lastFollowUpNote}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {r.canLog && (
                        <Button size="sm" variant="outline" onClick={() => setLogging(r)}>
                          <MessageSquarePlus className="size-3.5" /> Log follow-up
                        </Button>
                      )}
                      <Button size="sm" variant={r.canLog ? "ghost" : "outline"} onClick={() => router.push(r.link)}>
                        {(activeKey && ACTION[activeKey]) || "Open"} <ArrowRight className="size-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {total > PAGE_SIZE && (
              <footer className="flex items-center justify-between gap-3 border-t border-border px-6 py-3 text-sm text-muted-foreground">
                <span>
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
                </span>
                <span className="flex items-center gap-1">
                  <Button size="icon-sm" variant="outline" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                    <ChevronLeft className="size-4" />
                  </Button>
                  <span className="px-2 text-xs font-medium text-foreground">
                    {page} / {pages}
                  </span>
                  <Button size="icon-sm" variant="outline" aria-label="Next page" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                    <ChevronRight className="size-4" />
                  </Button>
                </span>
              </footer>
            )}
          </section>
        </div>
      )}

      {logging && <LogDialog row={logging} onClose={() => setLogging(null)} onDone={refresh} />}
    </div>
  );
}

const istToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
function plusDays(n: number) {
  const d = new Date(`${istToday()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function LogDialog({ row, onClose, onDone }: { row: Row; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [nextDate, setNextDate] = useState(plusDays(3));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guard = useDiscardGuard(note.trim().length > 0, onClose);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.post(`/follow-ups/${row.canLog === "QUOTE" ? "quote" : "invoice"}/${row.id}`, {
        note: note.trim(),
        nextDate: nextDate || undefined,
      });
      if (nextDate) notify.success("Follow-up logged", `${row.company} — back on your list on ${formatDateIN(nextDate)}.`);
      else notify.info("Follow-up logged", `${row.company} stays on your list until it moves on.`);
      onDone();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't log the follow-up"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && !saving && guard.requestClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Follow-up · {row.company}</DialogTitle>
          <DialogDescription>
            {row.reference} · {row.days === 0 ? "since today" : `waiting ${dayText(row.days)}`}
            {row.phone ? ` · ${row.contactPerson ?? ""} ${row.phone}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="fu-note">What did they say?</Label>
            <Textarea id="fu-note" rows={3} autoFocus placeholder="e.g. Reviewing with their finance team, will decide next week" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fu-next">Follow up again on</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input id="fu-next" type="date" className="w-[160px]" min={istToday()} value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
              {[1, 3, 7].map((n) => (
                <Button key={n} type="button" size="sm" variant="ghost" onClick={() => setNextDate(plusDays(n))}>
                  +{n}d
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">It leaves this list until that date. Leave blank to keep it on the list.</p>
          </div>
          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={guard.requestClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !note.trim()}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
        {guard.dialog}
      </DialogContent>
    </Dialog>
  );
}
