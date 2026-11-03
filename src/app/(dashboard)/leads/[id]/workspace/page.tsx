"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  ChevronRight,
  Repeat,
  Phone,
  PhoneOff,
  Calendar,
  ClipboardList,
  Receipt,
  CheckCircle2,
  Mail,
  Loader2,
  Send,
  User as UserIcon,
  Building2,
  Clock,
  XCircle,
  FilePlus2,
  Pencil,
  BadgeCheck,
  Truck,
  Wallet,
  Hourglass,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CallOutcomeDialog } from "@/app/(dashboard)/my-leads/_components/CallOutcomeDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import api from "@/lib/axios";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { NextStepBanner, leadNextStep } from "@/components/NextStepBanner";
import { scopeToCurrentOrder } from "@/lib/orders";
import { notify } from "@/lib/notify";
import { NewOrderDialog } from "@/components/leads/NewOrderDialog";
import { LoadError, loadFailureOf, type LoadFailure } from "@/components/leads/LoadError";
import { useDataChanged } from "@/hooks/useDataChanged";
import type { LeadDetail, LeadStatus, Meeting, Quote } from "@/types";
import { RequirementPicker } from "@/components/requirements/RequirementPicker";
import { QuoteDialog } from "@/app/(dashboard)/quotes/_components/QuoteDialog";
import { AcceptQuoteDialog } from "@/app/(dashboard)/quotes/_components/AcceptQuoteDialog";
import { PoDialog } from "@/app/(dashboard)/purchase-orders/_components/PoDialog";
import {
  formatDateTimeIN,
  formatINR,
  formatPaymentStatus,
  formatPoStatusLabel,
  getPaymentStatusColor,
  getPoStatusColor,
} from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { StageCard, type StageStatus } from "./_components/StageCard";
import { PipelineHeader, type PipelineStep } from "./_components/PipelineHeader";

type StageKey =
  | "call"
  | "meeting"
  | "mom"
  | "request"
  | "quote"
  | "approval"
  | "share"
  | "accept"
  | "po"
  | "billing";

// Pipeline order. A rejected quote sits with QUOTE_REQUESTED: it's back with MSP TL.
const STATUS_RANK: Record<LeadStatus, number> = {
  NEW: 0,
  CATEGORIZED: 1,
  ASSIGNED: 2,
  MEETING_SCHEDULED: 3,
  MEETING_DONE: 4,
  MOM_ADDED: 5,
  QUOTE_REQUESTED: 6,
  QUOTE_REJECTED: 6,
  QUOTE_CREATED: 7,
  QUOTE_SUBMITTED: 8,
  QUOTE_APPROVED: 9,
  QUOTE_SENT: 10,
  CUSTOMER_ACCEPTED: 11,
  PO_PENDING_ACCOUNTS: 12,
  PO_CONFIRMED: 13,
  PO_SENT: 14,
  INVOICED: 15,
  DEAL_REGISTERED: 16,
};

function computeStageStatus(
  lead: LeadDetail,
  latestQuote: Quote | undefined
): Record<StageKey, StageStatus> {
  const s = lead.status;
  const rank = STATUS_RANK[s];
  // active while the lead is in one of `activeAt`, done once it's past `doneFrom`
  const stage = (activeAt: LeadStatus[], doneFrom: LeadStatus): StageStatus =>
    activeAt.includes(s) ? "active" : rank >= STATUS_RANK[doneFrom] ? "done" : "upcoming";

  const result: Record<StageKey, StageStatus> = {
    call: stage(["ASSIGNED"], "MEETING_SCHEDULED"),
    meeting: rank >= STATUS_RANK.MEETING_SCHEDULED ? "done" : "upcoming",
    mom: stage(["MEETING_SCHEDULED", "MEETING_DONE"], "MOM_ADDED"),
    request: stage(["MOM_ADDED"], "QUOTE_REQUESTED"),
    quote: stage(["QUOTE_REQUESTED", "QUOTE_REJECTED"], "QUOTE_CREATED"),
    approval: "upcoming",
    share: "upcoming",
    accept: "upcoming",
    po: stage(["CUSTOMER_ACCEPTED", "PO_PENDING_ACCOUNTS", "PO_CONFIRMED"], "PO_SENT"),
    billing: stage(["PO_SENT", "INVOICED"], "DEAL_REGISTERED"),
  };

  // A saved-but-not-submitted draft keeps the quote stage open
  if (latestQuote?.status === "DRAFT") result.quote = "active";

  const quoteStatus = latestQuote?.status;
  if (quoteStatus === "SUBMITTED") result.approval = "active";
  else if (quoteStatus === "APPROVED" || quoteStatus === "SENT" || quoteStatus === "ACCEPTED")
    result.approval = "done";

  if (quoteStatus === "APPROVED") result.share = "active";
  else if (rank >= STATUS_RANK.QUOTE_SENT) result.share = "done";

  if (quoteStatus === "SENT") result.accept = "active";
  else if (rank >= STATUS_RANK.CUSTOMER_ACCEPTED) result.accept = "done";

  return result;
}

export default function LeadWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const id = params.id as string;

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(true); // first load only — refreshes keep the page on screen
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const loaded = useRef(false);

  const fetchLead = useCallback(async () => {
    try {
      const { data } = await api.get(`/leads/${id}`);
      setLead(scopeToCurrentOrder(data.data)); // repeat orders: work on the current one only
      setFailure(null);
      loaded.current = true;
    } catch (err) {
      // a failed background refresh keeps what's on screen; only the first load shows the error
      if (!loaded.current) setFailure(loadFailureOf(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchLead();
  }, [fetchLead]);

  // someone else approved / sent / invoiced → this page updates by itself
  useDataChanged(fetchLead);

  const latestMeeting = useMemo<Meeting | undefined>(
    () =>
      lead?.meetings
        ? [...lead.meetings].sort(
            (a, b) =>
              new Date(b.meetingDate).getTime() -
              new Date(a.meetingDate).getTime()
          )[0]
        : undefined,
    [lead]
  );

  const latestQuote = useMemo<Quote | undefined>(
    () =>
      lead?.quotes
        ? [...lead.quotes].sort(
            (a, b) =>
              new Date(b.createdAt).getTime() -
              new Date(a.createdAt).getTime()
          )[0]
        : undefined,
    [lead]
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!lead) {
    return (
      <LoadError
        failure={failure ?? { notFound: true, message: "" }}
        what="lead"
        onRetry={() => {
          setLoading(true);
          fetchLead();
        }}
        onBack={() => router.push("/leads")}
        backLabel="Back to Leads"
      />
    );
  }

  const stages = computeStageStatus(lead, latestQuote);
  const canSell =
    user?.role === "ADMIN" || (user?.role === "SALES" && lead.assignedTo?.id === user.id);
  const salesLock = canSell
    ? undefined
    : `Done by the Sales person on this lead${lead.assignedTo ? ` (${lead.assignedTo.name})` : ""}.`;

  const pipelineSteps: PipelineStep[] = [
    { label: "Call", status: stages.call, icon: Phone },
    { label: "Meeting", status: stages.meeting, icon: Calendar },
    { label: "MOM", status: stages.mom, icon: ClipboardList },
    { label: "Request Quote", status: stages.request, icon: Send },
    { label: "Quote", status: stages.quote, icon: Receipt },
    { label: "Approval", status: stages.approval, icon: CheckCircle2 },
    { label: "Send", status: stages.share, icon: Mail },
    { label: "Accepted", status: stages.accept, icon: BadgeCheck },
    { label: "PO", status: stages.po, icon: Truck },
    { label: "Billing", status: stages.billing, icon: Wallet },
  ];

  return (
    <div className="space-y-6 pb-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <button
          onClick={() => router.push("/leads")}
          className="flex items-center gap-1.5 transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Leads
        </button>
        <ChevronRight className="size-3.5" />
        <button
          onClick={() => router.push(`/leads/${id}`)}
          className="transition-colors hover:text-foreground"
        >
          {lead.companyName}
        </button>
        <ChevronRight className="size-3.5" />
        <span className="font-medium text-foreground">Workspace</span>
      </div>

      {/* Lead snapshot */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-4 rounded-2xl border p-5",
          lead.droppedAt
            ? "border-rose-200 bg-rose-50/50 dark:border-rose-500/30 dark:bg-rose-500/5"
            : "border-border bg-card"
        )}
      >
        <div
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-xl text-white",
            lead.droppedAt
              ? "bg-rose-500"
              : "bg-gradient-to-br from-[#3B82F6] to-[#6366F1]"
          )}
        >
          {lead.droppedAt ? <XCircle className="size-6" /> : <Building2 className="size-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 truncate text-lg font-semibold">
            {lead.companyName}
            {(lead.orderNo ?? 1) > 1 && (
              <span className="rounded-full bg-[#3B82F6]/10 px-2 py-0.5 text-xs font-semibold text-[#3B82F6] ring-1 ring-inset ring-[#3B82F6]/25">
                Order #{lead.orderNo}
              </span>
            )}
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            {lead.contactPerson} ·{" "}
            <a href={`tel:${lead.phone}`} className="hover:text-foreground hover:underline">
              {lead.phone}
            </a>{" "}
            · {lead.email}
          </p>
        </div>
        {lead.submittedByName && (
          <div className="text-right">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Lead owner
            </p>
            <p className="text-sm font-medium">{lead.submittedByName}</p>
          </div>
        )}
        {lead.assignedTo && (
          <div className="text-right">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {lead.submittedByName ? "Sales" : "Owner"}
            </p>
            <p className="text-sm font-medium">{lead.assignedTo.name}</p>
          </div>
        )}
        {(lead.status === "DEAL_REGISTERED" || lead.droppedAt) &&
          (user?.role === "ADMIN" ||
            user?.role === "MSP_TL" ||
            (user?.role === "SALES" && lead.assignedTo?.id === user.id)) && (
            <Button onClick={() => setNewOrderOpen(true)}>
              <Repeat className="size-4" />
              {lead.droppedAt ? "Reopen as New Order" : "New Order"}
            </Button>
          )}
      </div>

      <NewOrderDialog
        open={newOrderOpen}
        lead={lead}
        canPickSales={user?.role === "ADMIN" || user?.role === "MSP_TL"}
        onClose={() => setNewOrderOpen(false)}
        onDone={() => {
          setNewOrderOpen(false);
          fetchLead();
        }}
      />

      {lead.sourceRequirement && (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <span className="font-medium">
            Requirement from {lead.integrationClient?.name ?? "the other software"}
            {lead.submittedByName ? ` (${lead.submittedByName})` : ""}:{" "}
          </span>
          <span className="whitespace-pre-line text-muted-foreground">{lead.sourceRequirement}</span>
        </p>
      )}

      {/* Dropped banner */}
      {lead.droppedAt && (
        <div className="overflow-hidden rounded-2xl border border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/5">
          <div className="flex items-start gap-4 p-5">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white">
              <XCircle className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold text-rose-900 dark:text-rose-200">
                Lead dropped · No further actions can be taken
              </h3>
              <p className="mt-1 text-sm text-rose-800/80 dark:text-rose-300/80">
                Dropped on {formatDateTimeIN(lead.droppedAt)}.
                {lead.dropReason && (
                  <>
                    {" "}
                    <span className="font-medium">Reason:</span>{" "}
                    {lead.dropReason}
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Pipeline */}
      {!lead.droppedAt && <PipelineHeader steps={pipelineSteps} />}

      {!lead.droppedAt && (
        <NextStepBanner
          step={leadNextStep(lead.status, { id: user?.id, role: user?.role }, {
            assignedToId: lead.assignedTo?.id,
            callbackAt: lead.callbackAt,
            quoteId: latestQuote?.id,
            poId: lead.purchaseOrders?.[0]?.id,
          })}
        />
      )}

      {/* Sales steps: only Admin or the Sales person assigned to the lead (API enforces the same) */}
      {/* Stages */}
      {!lead.droppedAt && (
      <div className="space-y-4">
        <CallStage
          locked={salesLock}
          status={stages.call}
          lead={lead}
          onDone={fetchLead}
          submitting={submitting}
          setSubmitting={setSubmitting}
        />
        <MeetingStage
          locked={salesLock}
          status={stages.meeting}
          lead={lead}
          latestMeeting={latestMeeting}
          onDone={fetchLead}
          submitting={submitting}
          setSubmitting={setSubmitting}
        />
        <MomStage
          locked={salesLock}
          status={stages.mom}
          latestMeeting={latestMeeting}
          onDone={fetchLead}
          submitting={submitting}
          setSubmitting={setSubmitting}
        />
        <RequestQuoteStage
          locked={salesLock}
          status={stages.request}
          lead={lead}
          onDone={fetchLead}
          submitting={submitting}
          setSubmitting={setSubmitting}
        />
        <QuoteStage
          status={stages.quote}
          lead={lead}
          latestQuote={latestQuote}
          role={user?.role}
          onDone={fetchLead}
          submitting={submitting}
          setSubmitting={setSubmitting}
        />
        <ApprovalStage
          status={stages.approval}
          latestQuote={latestQuote}
          role={user?.role}
          onDone={fetchLead}
          submitting={submitting}
          setSubmitting={setSubmitting}
        />
        <ShareStage
          locked={salesLock}
          status={stages.share}
          latestQuote={latestQuote}
          lead={lead}
          onDone={fetchLead}
          submitting={submitting}
          setSubmitting={setSubmitting}
        />
        <AcceptStage
          locked={salesLock}
          status={stages.accept}
          latestQuote={latestQuote}
          onDone={fetchLead}
          submitting={submitting}
          setSubmitting={setSubmitting}
        />
        <PoStage
          status={stages.po}
          lead={lead}
          latestQuote={latestQuote}
          role={user?.role}
          onDone={fetchLead}
          submitting={submitting}
          setSubmitting={setSubmitting}
        />
        <BillingStage status={stages.billing} lead={lead} onDone={fetchLead} submitting={submitting} setSubmitting={setSubmitting} />
      </div>
      )}
    </div>
  );
}

// ---------- Stage components ----------

interface StageProps {
  status: StageStatus;
  locked?: string; // why this user can't act on the step
  onDone: () => void | Promise<void>;
  submitting: boolean;
  setSubmitting: (v: boolean) => void;
}

function formatTimerDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

interface ParsedCall {
  id: string;
  createdAt: string;
  duration?: string;
  outcome: "Meeting scheduled" | "Call later" | "Dropped" | "Other";
  scheduledFor?: string;
  note?: string;
}

function parseCallLog(action: string): Omit<ParsedCall, "id" | "createdAt"> {
  // "Call logged (1s) — Outcome: Call later. Callback scheduled for 4/22/2026, 3:00:00 PM."
  const durMatch = action.match(/Call logged \(([^)]+)\)/);
  const duration = durMatch?.[1];
  let outcome: ParsedCall["outcome"] = "Other";
  if (/Meeting scheduled/i.test(action)) outcome = "Meeting scheduled";
  else if (/Call later/i.test(action)) outcome = "Call later";
  else if (/Dropped/i.test(action)) outcome = "Dropped";

  let scheduledFor: string | undefined;
  const callback = action.match(/Callback scheduled for ([^.]+)/i);
  const meeting = action.match(/Meeting at [^o]+on ([^.]+)/i);
  if (callback) scheduledFor = callback[1].trim();
  else if (meeting) scheduledFor = meeting[1].trim();

  return { duration, outcome, scheduledFor };
}

const OUTCOME_STYLE: Record<ParsedCall["outcome"], string> = {
  "Meeting scheduled":
    "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30",
  "Call later":
    "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/30",
  Dropped:
    "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30",
  Other:
    "bg-muted text-muted-foreground ring-border",
};

function CallStage({
  status,
  locked,
  lead,
  onDone,
}: StageProps & { lead: LeadDetail }) {
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [capturedDuration, setCapturedDuration] = useState(0);

  useEffect(() => {
    if (!callStartedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [callStartedAt]);

  const callLogs: ParsedCall[] = (lead.activityLogs ?? [])
    .filter((a) => a.action.startsWith("Call logged"))
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )
    .map((a) => ({ id: a.id, createdAt: a.createdAt, ...parseCallLog(a.action) }));

  const attempts = callLogs.length;

  const elapsedSec = callStartedAt
    ? Math.floor((now - callStartedAt) / 1000)
    : 0;

  const startCall = () => {
    setCallStartedAt(Date.now());
    setNow(Date.now());
  };

  const endCall = () => {
    setCapturedDuration(elapsedSec);
    setCallStartedAt(null);
    setOutcomeOpen(true);
  };

  return (
    <StageCard
      step={1}
      title="Call the customer"
      description="Start the call to begin a timer. When you hang up, log the outcome."
      icon={Phone}
      status={status}
      locked={locked}
      summary={
        attempts > 0 ? (
          <span>
            {attempts} call {attempts === 1 ? "attempt" : "attempts"} ·{" "}
            {callLogs[callLogs.length - 1].outcome}
          </span>
        ) : null
      }
    >
      <div className="space-y-4">
        {/* Call timer + button */}
        <div className="flex flex-col items-center gap-4 py-1 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-4">
            <div
              className={cn(
                "flex size-14 items-center justify-center rounded-full transition-all",
                callStartedAt
                  ? "bg-emerald-500/10 text-emerald-600 ring-4 ring-emerald-500/20 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <Phone
                className={cn("size-6", callStartedAt && "animate-pulse")}
              />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {callStartedAt
                  ? "Call in progress"
                  : attempts > 0
                    ? `Attempt ${attempts + 1}`
                    : "Ready to call"}
              </p>
              <p className="font-mono text-2xl font-semibold tabular-nums">
                {formatTimerDuration(elapsedSec)}
              </p>
              {!callStartedAt && lead.phone && (
                <a href={`tel:${lead.phone}`} className="mt-0.5 block text-xs text-muted-foreground hover:text-foreground hover:underline">
                  {lead.phone}
                </a>
              )}
            </div>
          </div>
          {callStartedAt ? (
            <Button
              onClick={endCall}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              <PhoneOff className="size-4" />
              End Call
            </Button>
          ) : lead.status === "ASSIGNED" ? (
            // Calls only while waiting for a call (fresh or call-later) — same rule as the API
            <Button onClick={startCall}>
              <Phone className="size-4" />
              Call
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">Calling is closed — the lead has moved on.</p>
          )}
        </div>
        {lead.status === "ASSIGNED" && lead.callbackAt && (
          <p className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            <Clock className="size-4" />
            Call back on{" "}
            {formatDateTimeIN(lead.callbackAt)}
          </p>
        )}

        {/* Previous attempts */}
        {attempts > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Previous attempts
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {callLogs.map((c, i) => (
                <li
                  key={c.id}
                  className="flex items-center gap-3 px-3 py-2 text-sm"
                >
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                      OUTCOME_STYLE[c.outcome]
                    )}
                  >
                    {c.outcome}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-muted-foreground">
                      {c.duration && (
                        <span className="font-mono text-foreground">
                          {c.duration}
                        </span>
                      )}
                      {c.scheduledFor && (
                        <>
                          {c.duration && " · "}
                          <span className="inline-flex items-center gap-1">
                            <Clock className="size-3" />
                            {c.scheduledFor}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {formatDistanceToNow(new Date(c.createdAt), {
                      addSuffix: true,
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <CallOutcomeDialog
        open={outcomeOpen}
        onClose={() => setOutcomeOpen(false)}
        onSuccess={async () => {
          setOutcomeOpen(false);
          await onDone();
        }}
        lead={lead}
        duration={capturedDuration}
      />
    </StageCard>
  );
}

function MeetingStage({
  status,
  locked,
  lead,
  latestMeeting,
  onDone,
  submitting,
  setSubmitting,
}: StageProps & { lead: LeadDetail; latestMeeting?: Meeting }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [agenda, setAgenda] = useState("");

  const scheduleMeeting = async () => {
    if (!date || !time || !location) return;
    try {
      setSubmitting(true);
      const iso = new Date(`${date}T${time}`).toISOString();
      await api.post("/meetings", {
        leadId: lead.id,
        meetingDate: iso,
        location,
        attendees: [lead.contactPerson],
        agenda: agenda || undefined,
      });
      notify.success(
        "Meeting booked",
        `${lead.companyName} · ${formatDateTimeIN(iso)} · ${location} — add the MOM after the meeting`
      );
      await onDone();
    } catch (err) {
      notify.apiError(err, "Couldn't book the meeting");
    } finally {
      setSubmitting(false);
    }
  };

  const summary = latestMeeting ? (
    <span>
      {formatDateTimeIN(latestMeeting.meetingDate)}
      {" · "}
      {latestMeeting.location}
    </span>
  ) : null;

  return (
    <StageCard
      step={2}
      title="Schedule the meeting"
      description="Pick a date, time, and location for the customer meeting."
      icon={Calendar}
      status={status}
      locked={locked}
      summary={summary}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ws-meeting-date">Date</Label>
            <Input
              id="ws-meeting-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ws-meeting-time">Time</Label>
            <Input
              id="ws-meeting-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ws-meeting-location">Location</Label>
          <Input
            id="ws-meeting-location"
            placeholder="Customer office, Zoom link, etc."
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ws-meeting-agenda">Agenda (optional)</Label>
          <Textarea
            id="ws-meeting-agenda"
            rows={2}
            placeholder="What will you discuss..."
            value={agenda}
            onChange={(e) => setAgenda(e.target.value)}
          />
        </div>
        <div className="flex justify-end">
          <Button
            onClick={scheduleMeeting}
            disabled={!date || !time || !location || submitting}
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Schedule Meeting
          </Button>
        </div>
      </div>
    </StageCard>
  );
}

function MomStage({
  status,
  locked,
  latestMeeting,
  onDone,
  submitting,
  setSubmitting,
}: StageProps & { latestMeeting?: Meeting }) {
  const [mom, setMom] = useState("");

  const submit = async () => {
    if (!latestMeeting || !mom.trim()) return;
    try {
      setSubmitting(true);
      await api.patch(`/meetings/${latestMeeting.id}/mom`, {
        momContent: mom,
      });
      setMom("");
      notify.success("MOM saved", "Next, pick the final requirement and send it to MSP TL for a quote");
      await onDone();
    } catch (err) {
      notify.apiError(err, "Couldn't save the MOM");
    } finally {
      setSubmitting(false);
    }
  };

  const summary = latestMeeting?.momContent ? (
    <span className="line-clamp-1">{latestMeeting.momContent}</span>
  ) : null;

  return (
    <StageCard
      step={3}
      title="Record Minutes of Meeting"
      description="Capture what was discussed, decisions, and next steps."
      icon={ClipboardList}
      status={status}
      locked={locked}
      summary={summary}
    >
      <div className="space-y-4">
        <Textarea
          rows={5}
          placeholder="Key discussion points, decisions, action items..."
          value={mom}
          onChange={(e) => setMom(e.target.value)}
        />
        <div className="flex justify-end">
          <Button onClick={submit} disabled={!mom.trim() || submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Save MOM
          </Button>
        </div>
      </div>
    </StageCard>
  );
}

function QuoteStage({
  status,
  lead,
  latestQuote,
  role,
  onDone,
}: StageProps & { lead: LeadDetail; latestQuote?: Quote; role?: string }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const canBuild = role === "MSP_TL" || role === "ADMIN";
  const draft = latestQuote?.status === "DRAFT" ? latestQuote : null;

  const summary = latestQuote ? (
    <span>
      {latestQuote.quoteNumber} · {formatINR(latestQuote.totalAmount)}
    </span>
  ) : null;

  return (
    <StageCard
      step={5}
      title="Build the quote"
      description={
        canBuild
          ? "Add requirements with their items and services, then submit for Admin approval."
          : "MSP TL builds the quote from your requirement."
      }
      icon={Receipt}
      status={status}
      summary={summary}
    >
      <div className="space-y-4">
        {lead.status === "QUOTE_REJECTED" && latestQuote?.status === "REJECTED" && (
          <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-inset ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30">
            Quote {latestQuote.quoteNumber} was rejected
            {latestQuote.rejectionReason ? ` — ${latestQuote.rejectionReason}` : ""}. Build a new one.
          </div>
        )}
        {canBuild ? (
          <div className="flex justify-end">
            <Button onClick={() => setDialogOpen(true)}>
              {draft ? <Pencil className="size-4" /> : <FilePlus2 className="size-4" />}
              {draft ? `Continue draft ${draft.quoteNumber}` : "Build Quote"}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Hourglass className="size-3.5" />
            Waiting for MSP TL to build the quote…
          </div>
        )}
      </div>
      {canBuild && (
        <QuoteDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSuccess={onDone}
          quote={draft}
          preselectedLeadId={lead.id}
        />
      )}
    </StageCard>
  );
}

function ApprovalStage({
  status,
  latestQuote,
  role,
  onDone,
  submitting,
  setSubmitting,
}: StageProps & { latestQuote?: Quote; role?: string }) {
  const canApprove = role === "ADMIN";
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  const approve = async () => {
    if (!latestQuote) return;
    try {
      setSubmitting(true);
      await api.patch(`/quotes/${latestQuote.id}/approve`);
      notify.success("Quote approved", `${latestQuote.quoteNumber} — Sales can now send it to the customer`);
      await onDone();
    } catch (err) {
      notify.apiError(err, "Couldn't approve the quote");
    } finally {
      setSubmitting(false);
    }
  };

  const reject = async () => {
    if (!latestQuote) return;
    try {
      setSubmitting(true);
      await api.patch(`/quotes/${latestQuote.id}/reject`, { reason: reason.trim() || undefined });
      notify.warning(
        "Quote rejected",
        `${latestQuote.quoteNumber}${reason.trim() ? ` — ${reason.trim()}.` : "."} MSP TL will prepare a new quote.`
      );
      setRejectOpen(false);
      setReason("");
      await onDone();
    } catch (err) {
      notify.apiError(err, "Couldn't reject the quote");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StageCard
      step={6}
      title="Admin approval"
      description={
        canApprove
          ? "Review the submitted quote and approve or reject."
          : "Awaiting Admin approval."
      }
      icon={CheckCircle2}
      status={status}
      summary={
        latestQuote?.approvedBy && (
          <span>
            Approved by <span className="text-foreground font-medium">{latestQuote.approvedBy.name}</span>
          </span>
        )
      }
    >
      {canApprove && latestQuote ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <span className="font-mono font-medium">
              {latestQuote.quoteNumber}
            </span>
            <span className="text-muted-foreground"> is awaiting your review.</span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setRejectOpen(true)}
              disabled={submitting}
              className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
            >
              <XCircle className="size-4" />
              Reject
            </Button>
            <Button
              onClick={approve}
              disabled={submitting}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              Approve
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Hourglass className="size-3.5" />
          Waiting for Admin…
        </div>
      )}
      {/* Same as the quote page: a rejection always goes through this dialog (reason optional) */}
      <Dialog open={rejectOpen} onOpenChange={(v) => !v && !submitting && setRejectOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject {latestQuote?.quoteNumber}?</DialogTitle>
            <DialogDescription>MSP TL will be asked to prepare a new quote for this lead.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="ws-reject-reason" className="text-muted-foreground">
              Reason (optional)
            </Label>
            <Textarea
              id="ws-reject-reason"
              rows={3}
              placeholder="e.g. Margin too low on the firewall line"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={reject} disabled={submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
              Reject Quote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </StageCard>
  );
}

function RequestQuoteStage({ status, locked, lead, onDone }: StageProps & { lead: LeadDetail }) {
  return (
    <StageCard
      step={4}
      title="Send to MSP TL for quote"
      description="Pick what the customer needs, add details for each, and send the lead to MSP TL."
      icon={Send}
      status={status}
      locked={locked}
      summary={
        lead.requirementItems?.length ? (
          <span className="line-clamp-1">{lead.requirementItems.map((i) => i.name).join(", ")}</span>
        ) : lead.finalRequirement ? (
          <span className="line-clamp-1">{lead.finalRequirement}</span>
        ) : null
      }
    >
      <RequirementPicker lead={lead} onSent={onDone} />
    </StageCard>
  );
}

function ShareStage({
  status,
  locked,
  latestQuote,
  lead,
  onDone,
  submitting,
  setSubmitting,
}: StageProps & { latestQuote?: Quote; lead: LeadDetail }) {
  const [recipient, setRecipient] = useState(lead.email || "");
  const [sent, setSent] = useState<string | null>(null);

  // Hard guard: never allow sharing unless the latest quote is actually APPROVED
  const quoteApproved = latestQuote?.status === "APPROVED";

  const markSent = async () => {
    if (!latestQuote || !quoteApproved) return;
    try {
      setSubmitting(true);
      await api.patch(`/quotes/${latestQuote.id}/mark-sent`);
      notify.success(
        "Quote marked as sent",
        `${latestQuote.quoteNumber} — click Customer Accepted when ${lead.companyName} confirms`
      );
      await onDone();
    } catch (err) {
      notify.apiError(err, "Couldn't mark the quote as sent");
    } finally {
      setSubmitting(false);
    }
  };

  const share = async () => {
    if (!latestQuote || !quoteApproved) return;
    try {
      setSubmitting(true);
      const { data } = await notify.promise(
        api.post(`/quotes/${latestQuote.id}/share-email`, {
          recipient: recipient || undefined,
        }),
        {
          loading: "Emailing the quote…",
          description: `${latestQuote.quoteNumber} to ${recipient || lead.email || "the customer"}`,
          success: (res) => ({
            title: "Quote emailed",
            description: `${res.data.message ?? latestQuote.quoteNumber} — it's marked as sent`,
          }),
          error: "Couldn't email the quote",
        }
      );
      setSent(data.message);
      await onDone();
    } catch {
      // the promise toast already showed the error
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StageCard
      step={7}
      title="Send to the customer"
      description="Share the approved quote with the customer, then mark it as sent. You can also email it from here."
      icon={Mail}
      status={status}
      locked={locked}
      summary={
        latestQuote?.status === "SENT" ? (
          <span>
            Sent to customer
            {latestQuote.sentBy ? ` by ${latestQuote.sentBy.name}` : ""}
          </span>
        ) : null
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <UserIcon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{lead.contactPerson}</p>
            <p className="text-xs text-muted-foreground">
              {lead.companyName}
            </p>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ws-share-recipient">Recipient email</Label>
          <Input
            id="ws-share-recipient"
            type="email"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
          />
        </div>
        {sent && (
          <p className="rounded-md bg-muted px-3 py-2 text-center text-sm">
            {sent}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            onClick={share}
            disabled={!recipient || submitting || !quoteApproved}
          >
            <Mail className="size-4" />
            Email Quote
          </Button>
          <Button onClick={markSent} disabled={submitting || !quoteApproved}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            Mark as Sent
          </Button>
        </div>
        {!quoteApproved && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-center text-xs text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30">
            Waiting for Admin to approve the quote before it can be sent.
          </p>
        )}
      </div>
    </StageCard>
  );
}

function AcceptStage({
  status,
  locked,
  latestQuote,
  onDone,
}: StageProps & { latestQuote?: Quote }) {
  const [open, setOpen] = useState(false);
  const accepted = latestQuote?.status === "ACCEPTED";

  return (
    <StageCard
      step={8}
      title="Customer acceptance"
      description="Record when the customer accepts the quote. MSP TL can then raise the PO to the vendor."
      icon={BadgeCheck}
      status={status}
      locked={locked}
      summary={
        accepted ? (
          <span>
            Accepted
            {latestQuote?.customerPoNumber ? ` · Customer PO ${latestQuote.customerPoNumber}` : ""}
          </span>
        ) : null
      }
    >
      {latestQuote?.status === "SENT" && (
        <>
          <div className="flex justify-end">
            <Button onClick={() => setOpen(true)}>
              <BadgeCheck className="size-4" />
              Customer Accepted
            </Button>
          </div>
          <AcceptQuoteDialog
            open={open}
            onClose={() => setOpen(false)}
            onSuccess={onDone}
            quoteId={latestQuote.id}
            quoteNumber={latestQuote.quoteNumber}
          />
        </>
      )}
    </StageCard>
  );
}

function PoStage({
  status,
  lead,
  latestQuote,
  role,
}: StageProps & { lead: LeadDetail; latestQuote?: Quote; role?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const po = lead.purchaseOrders?.[0];
  const canCreate = (role === "MSP_TL" || role === "ADMIN") && latestQuote?.status === "ACCEPTED" && !po;

  const next: Record<string, string> = {
    DRAFT: "Draft — MSP TL to send it to Accounts.",
    PENDING_ACCOUNTS: "Waiting for Accounts to confirm.",
    CONFIRMED: "Confirmed — Sales to send it to the vendor.",
    REJECTED: "Rejected by Accounts — MSP TL to fix and resubmit.",
    SENT_TO_VENDOR: "Sent to the vendor. Accounts records the vendor bill.",
  };

  return (
    <StageCard
      step={9}
      title="Purchase order to vendor"
      description="MSP TL creates the PO (quote lines, pick vendor) → Accounts confirms → Sales sends it to the vendor."
      icon={Truck}
      status={status}
      summary={po ? <span>{po.poNumber} · {po.vendor.name}</span> : null}
    >
      {po ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-mono font-medium">{po.poNumber}</span>
              <Badge variant="secondary" className={getPoStatusColor(po.status)}>
                {formatPoStatusLabel(po.status)}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {po.vendor.name} · {formatINR(po.totalAmount)}
            </p>
            <p className="text-xs text-muted-foreground">{next[po.status]}</p>
          </div>
          <Button variant="outline" onClick={() => router.push(`/purchase-orders/${po.id}`)}>
            Open PO
          </Button>
        </div>
      ) : canCreate && latestQuote ? (
        <>
          <div className="flex justify-end">
            <Button onClick={() => setOpen(true)}>
              <Truck className="size-4" />
              Create PO
            </Button>
          </div>
          <PoDialog
            open={open}
            onClose={() => setOpen(false)}
            quoteId={latestQuote.id}
            onSuccess={(created) => router.push(`/purchase-orders/${created.id}`)}
          />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">MSP TL creates the PO once the customer accepts.</p>
      )}
    </StageCard>
  );
}

function BillingStage({ status, lead }: StageProps & { lead: LeadDetail }) {
  const router = useRouter();
  const invoices = lead.salesInvoices ?? [];
  const po = lead.purchaseOrders?.[0];

  return (
    <StageCard
      step={10}
      title="Customer invoices & payment"
      description="Accounts invoices the customer from the accepted quote and records their payments."
      icon={Wallet}
      status={status}
      summary={
        lead.status === "DEAL_REGISTERED" ? (
          <span>Deal closed — fully invoiced and paid</span>
        ) : invoices.length ? (
          <span>
            {invoices.length} invoice{invoices.length === 1 ? "" : "s"}
          </span>
        ) : null
      }
    >
      {invoices.length > 0 ? (
        <ul className="divide-y divide-border rounded-lg border border-border text-sm">
          {invoices.map((inv) => (
            <li key={inv.id}>
              <button
                onClick={() => router.push(`/invoices/${inv.id}`)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/40"
              >
                <span className="font-mono">{inv.invoiceNumber}</span>
                <Badge variant="secondary" className={getPaymentStatusColor(inv.paymentStatus)}>
                  {formatPaymentStatus(inv.paymentStatus)}
                </Badge>
                <span className="ml-auto tabular-nums">{formatINR(inv.totalAmount)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : po?.status === "SENT_TO_VENDOR" ? (
        <p className="text-sm text-muted-foreground">Ready for Accounts to invoice the customer.</p>
      ) : (
        <p className="text-sm text-muted-foreground">Starts once the PO is sent to the vendor.</p>
      )}
    </StageCard>
  );
}
