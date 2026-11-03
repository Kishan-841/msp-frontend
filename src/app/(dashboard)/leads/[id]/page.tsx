"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  User as UserIcon,
  Phone,
  Mail,
  Tags,
  UserPlus,
  Calendar,
  FileText,
  Activity,
  Loader2,
  Plus,
  Sparkles,
  Briefcase,
  MapPin,
  Receipt,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronRight,
  Repeat,
  Send,
  StickyNote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import api from "@/lib/axios";
import {
  formatStatusLabel,
  formatRoleLabel,
  getQuoteStatusColor,
  formatQuoteStatusLabel,
  cn,
  formatDateTimeIN,
  formatINR,
  getStatusColor,
} from "@/lib/utils";
import { useDataChanged } from "@/hooks/useDataChanged";
import { LoadError, loadFailureOf, type LoadFailure } from "@/components/leads/LoadError";
import { useAuthStore } from "@/stores/auth-store";
import { stateName } from "@/lib/gst";
import { describeActivity } from "@/lib/activity";
import { DuplicateWarning } from "@/components/leads/DuplicateWarning";
import { NewOrderDialog } from "@/components/leads/NewOrderDialog";
import type { LeadDetail, QuoteStatus, LeadStatus, UserRole } from "@/types";
import { CategorizeDialog } from "../_components/CategorizeDialog";
import { AssignDialog } from "../_components/AssignDialog";
import { MeetingDialog } from "../../meetings/_components/MeetingDialog";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const AVATAR_PALETTES = [
  "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
  "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
];

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h << 5) - h + name.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function Avatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const palette = AVATAR_PALETTES[hashName(name) % AVATAR_PALETTES.length];
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full font-semibold",
        palette,
        className
      )}
    >
      {getInitials(name)}
    </div>
  );
}


function StatusPill({ status }: { status: string }) {
  const tone = getStatusColor(status as LeadStatus); // one colour per status, same as the lists
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
        tone
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {formatStatusLabel(status as LeadStatus)}
    </span>
  );
}

function InfoChip({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ElementType;
  label: string;
  value: string | null | undefined;
  href?: string;
}) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {href ? (
          <a href={href} className="block truncate text-sm font-medium text-foreground hover:underline">
            {value}
          </a>
        ) : (
          <p className="truncate text-sm font-medium text-foreground">{value}</p>
        )}
      </div>
    </div>
  );
}

function PersonRow({
  label,
  person,
  note,
}: {
  label: string;
  person: { name: string; role?: string } | null | undefined;
  note?: string;
}) {
  if (!person) return null;
  return (
    <div className="flex items-center gap-2.5">
      <Avatar name={person.name} className="size-7 text-[11px]" />
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-sm font-medium">
          {person.name}
          {person.role && (
            <span className="ml-1.5 font-normal text-muted-foreground">
              · {formatRoleLabel(person.role as UserRole)}
            </span>
          )}
          {note && <span className="ml-1.5 font-normal text-muted-foreground">· {note}</span>}
        </p>
      </div>
    </div>
  );
}

export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const id = params.id as string;

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [categorizeOpen, setCategorizeOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [meetingDialogOpen, setMeetingDialogOpen] = useState(false);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const loaded = useRef(false);

  const isMspTl = user?.role === "MSP_TL" || user?.role === "ADMIN";
  const [newOrderOpen, setNewOrderOpen] = useState(false);

  // spinner on the first load only; refreshes (after an action, or live) keep the page on screen
  const fetchLead = useCallback(async () => {
    try {
      const { data } = await api.get(`/leads/${id}`);
      setLead(data.data);
      setFailure(null);
      loaded.current = true;
    } catch (err) {
      if (!loaded.current) setFailure(loadFailureOf(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchLead();
  }, [fetchLead]);

  useDataChanged(fetchLead);

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

  // Sales work on a lead: Admin or the Sales person it's assigned to (the API enforces the same)
  const canSell = user?.role === "ADMIN" || (user?.role === "SALES" && lead.assignedTo?.id === user.id);
  const canBookMeeting =
    canSell && !lead.droppedAt && ["ASSIGNED", "MEETING_SCHEDULED", "MEETING_DONE"].includes(lead.status);

  const meetingCount = lead.meetings?.length ?? 0;
  const quoteCount = lead.quotes?.length ?? 0;
  const activityCount = lead.activityLogs?.length ?? 0;

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
        <span className="font-medium text-foreground">
          {lead.companyName}
        </span>
      </div>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
        {/* decorative gradient */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#3B82F6]/8 via-[#3B82F6]/3 to-transparent dark:from-[#3B82F6]/15" />

        <div className="relative p-6 lg:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-5">
              <div className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#3B82F6] to-[#6366F1] text-xl font-semibold text-white shadow-lg shadow-[#3B82F6]/20 ring-1 ring-white/20">
                {getInitials(lead.companyName)}
              </div>
              <div className="min-w-0 space-y-3">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                    {lead.companyName}
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Created {formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true })}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={lead.status} />
                  {(lead.orderNo ?? 1) > 1 && (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full bg-[#3B82F6]/10 px-2.5 py-1 text-xs font-semibold text-[#3B82F6] ring-1 ring-inset ring-[#3B82F6]/25"
                      title="This customer has ordered more than once — the status is for the current order"
                    >
                      <Repeat className="size-3" />
                      Order #{lead.orderNo}
                    </span>
                  )}
                  {lead.category && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground ring-1 ring-inset ring-border">
                      <Briefcase className="size-3" />
                      {lead.category === "HARDWARE" ? "Hardware" : "Software"}
                      {lead.subcategory && lead.subcategory.length > 0 && (
                        <>
                          <span className="text-muted-foreground">·</span>
                          {lead.subcategory.join(", ")}
                        </>
                      )}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border">
                    <MapPin className="size-3" />
                    {lead.integrationClient
                      ? `From ${lead.integrationClient.name}${lead.submittedByName ? ` · ${lead.submittedByName}` : ""}`
                      : `Source: ${lead.source}`}
                  </span>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              {isMspTl && !lead.category && !lead.droppedAt && (
                <Button onClick={() => setCategorizeOpen(true)}>
                  <Tags className="size-4" />
                  Categorize
                </Button>
              )}
              {isMspTl && lead.status === "CATEGORIZED" && (
                <Button onClick={() => setAssignOpen(true)}>
                  <UserPlus className="size-4" />
                  Assign
                </Button>
              )}
              {lead.assignedTo && !lead.droppedAt && (
                <Button
                  variant="outline"
                  onClick={() => router.push(`/leads/${lead.id}/workspace`)}
                >
                  <Sparkles className="size-4" />
                  Open Workspace
                </Button>
              )}
              {/* Repeat order: closed deal → same customer orders again */}
              {/* closed deal → repeat order; dropped lead → customer came back */}
              {(lead.status === "DEAL_REGISTERED" || lead.droppedAt) &&
                (isMspTl || (user?.role === "SALES" && lead.assignedTo?.id === user.id)) && (
                  <Button onClick={() => setNewOrderOpen(true)}>
                    <Repeat className="size-4" />
                    {lead.droppedAt ? "Reopen as New Order" : "New Order"}
                  </Button>
                )}
            </div>
          </div>

          {/* Contact grid */}
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <InfoChip icon={UserIcon} label="Contact Person" value={lead.contactPerson} />
            <InfoChip icon={Phone} label="Phone" value={lead.phone} href={lead.phone ? `tel:${lead.phone}` : undefined} />
            <InfoChip icon={Mail} label="Email" value={lead.email} />
            <InfoChip icon={Receipt} label="GSTIN" value={lead.customerGstin} />
            <InfoChip
              icon={MapPin}
              label={lead.billingAddress ? "Billing Address" : "State"}
              value={
                lead.billingAddress
                  ? `${lead.billingAddress}${lead.customerState ? `, ${stateName(lead.customerState)}` : ""}`
                  : stateName(lead.customerState)
              }
            />
          </div>

          {/* People */}
          <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3 border-t border-border pt-5">
            {/* a lead from another software belongs to whoever sent it there */}
            {lead.submittedByName ? (
              <PersonRow label="Lead owner" person={{ name: lead.submittedByName }} note={lead.integrationClient?.name} />
            ) : (
              <PersonRow label="Created by" person={lead.createdBy} />
            )}
            <PersonRow label={lead.submittedByName ? "Sales" : "Assigned to"} person={lead.assignedTo} />
            <PersonRow label="MSP TL" person={lead.mspTl} />
          </div>
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard icon={Activity} label="Activity" value={activityCount} tint="blue" />
        <StatCard icon={Calendar} label="Meetings" value={meetingCount} tint="emerald" />
        <StatCard icon={FileText} label="Quotes" value={quoteCount} tint="violet" />
      </div>

      {/* Dropped banner */}
      {lead.droppedAt && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 dark:border-rose-500/30 dark:bg-rose-500/5">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white">
              <XCircle className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold text-rose-900 dark:text-rose-200">
                Lead dropped · No further actions can be taken
              </h3>
              <p className="mt-1 text-sm text-rose-800/80 dark:text-rose-300/80">
                Dropped on {formatDateTimeIN(lead.droppedAt)}
                {lead.dropReason && (
                  <>
                    {" · "}
                    <span className="font-medium">Reason:</span>{" "}
                    {lead.dropReason}
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Notes */}
      {(lead.possibleDuplicateIds?.length ?? 0) > 0 && <DuplicateWarning ids={lead.possibleDuplicateIds!} />}

      {lead.sourceRequirement && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Requirement from {lead.integrationClient?.name ?? "the other software"}</h2>
          <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{lead.sourceRequirement}</p>
        </section>
      )}

      {lead.notes && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5 dark:border-amber-500/20 dark:bg-amber-500/5">
          <div className="flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
              <StickyNote className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                Notes
              </h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-amber-900/80 dark:text-amber-200/80">
                {lead.notes}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Bottom grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Activity Timeline */}
        <section className="rounded-2xl border border-border bg-card lg:col-span-2">
          <header className="flex items-center justify-between border-b border-border px-6 py-4">
            <div className="flex items-center gap-2">
              <Activity className="size-4 text-muted-foreground" />
              <h2 className="text-base font-semibold">Activity Timeline</h2>
            </div>
            {activityCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {activityCount}
              </Badge>
            )}
          </header>
          <div className="p-6">
            {activityCount === 0 ? (
              <EmptyState
                icon={Activity}
                title="No activity yet"
                description="Actions taken on this lead will appear here."
              />
            ) : (
              <div className="divide-y divide-border rounded-lg border border-border">
                {[...lead.activityLogs]
                  .sort(
                    (a, b) =>
                      new Date(a.createdAt).getTime() -
                      new Date(b.createdAt).getTime()
                  )
                  .map((log, idx) => {
                    const parsed = describeActivity(log.action);
                    const Icon = parsed.icon;
                    return (
                      <div
                        key={log.id}
                        className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
                      >
                        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold tabular-nums text-muted-foreground">
                          {idx + 1}
                        </span>
                        <div
                          className={cn(
                            "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md ring-1 ring-inset",
                            parsed.tone
                          )}
                        >
                          <Icon className="size-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">
                            {parsed.title}
                          </p>
                          {parsed.details.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {parsed.details.map((d, i) => (
                                <span
                                  key={i}
                                  className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                                >
                                  {d}
                                </span>
                              ))}
                            </div>
                          )}
                          {log.details && (
                            <p className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-muted-foreground">
                              {log.details}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 text-right text-[11px] text-muted-foreground">
                          <div>{log.user?.name ?? "System"}</div>
                          <div>
                            {formatDistanceToNow(new Date(log.createdAt), {
                              addSuffix: true,
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </section>

        {/* Right column */}
        <div className="space-y-6">
          {/* Meetings */}
          <section className="rounded-2xl border border-border bg-card">
            <header className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <Calendar className="size-4 text-muted-foreground" />
                <h2 className="text-base font-semibold">Meetings</h2>
                {meetingCount > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {meetingCount}
                  </Badge>
                )}
              </div>
              {canBookMeeting && (
                <Button variant="outline" size="sm" onClick={() => setMeetingDialogOpen(true)}>
                  <Plus className="size-3.5" />
                  Schedule
                </Button>
              )}
            </header>
            <div className="p-5">
              {meetingCount === 0 ? (
                <EmptyState
                  icon={Calendar}
                  title="No meetings scheduled"
                  description={
                    canBookMeeting
                      ? "Schedule a meeting to keep the conversation going."
                      : "Sales books meetings from the call outcome."
                  }
                  compact
                />
              ) : (
                <div className="space-y-2">
                  {lead.meetings.map((meeting) => (
                    <button
                      key={meeting.id}
                      onClick={() => router.push(`/meetings/${meeting.id}`)}
                      className="group w-full rounded-lg border border-border bg-background p-3 text-left transition-all hover:border-[#3B82F6]/40 hover:shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold">
                            {formatDateTimeIN(meeting.meetingDate)}
                          </div>
                          {meeting.location && (
                            <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="size-3" />
                              {meeting.location}
                            </div>
                          )}
                        </div>
                        {meeting.momContent ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30">
                            <CheckCircle2 className="size-2.5" />
                            MOM
                          </span>
                        ) : (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30">
                            <Clock className="size-2.5" />
                            Pending
                          </span>
                        )}
                      </div>
                      {meeting.agenda && (
                        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                          {meeting.agenda}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Quotes */}
          <section className="rounded-2xl border border-border bg-card">
            <header className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-muted-foreground" />
                <h2 className="text-base font-semibold">Quotes</h2>
                {quoteCount > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {quoteCount}
                  </Badge>
                )}
              </div>
              {/* MOM done → Sales sends the requirement; requested/rejected → MSP TL builds the quote */}
              {!lead.droppedAt && lead.status === "MOM_ADDED" && canSell && (
                <Button variant="outline" size="sm" onClick={() => router.push(`/leads/${lead.id}/workspace`)}>
                  <Send className="size-3.5" />
                  Send for quote
                </Button>
              )}
              {!lead.droppedAt && (lead.status === "QUOTE_REQUESTED" || lead.status === "QUOTE_REJECTED") && isMspTl && (
                <Button variant="outline" size="sm" onClick={() => router.push(`/quotes?newForLead=${lead.id}`)}>
                  <Plus className="size-3.5" />
                  Build quote
                </Button>
              )}
            </header>
            <div className="p-5">
              {quoteCount === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="No quotes yet"
                  description="Quotes will appear here once created."
                  compact
                />
              ) : (
                <div className="space-y-2">
                  {lead.quotes.map((quote) => (
                    <button
                      key={quote.id}
                      onClick={() => router.push(`/quotes/${quote.id}`)}
                      className="group w-full rounded-lg border border-border bg-background p-3 text-left transition-all hover:border-[#3B82F6]/40 hover:shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-xs font-semibold">
                          {quote.quoteNumber}
                          {(lead.orderNo ?? 1) > 1 && (
                            <span className="ml-1.5 font-sans font-medium text-muted-foreground">
                              · Order #{quote.orderNo ?? 1}
                            </span>
                          )}
                        </span>
                        <Badge
                          variant="secondary"
                          className={cn(
                            "shrink-0 text-[10px]",
                            getQuoteStatusColor(quote.status as QuoteStatus)
                          )}
                        >
                          {formatQuoteStatusLabel(quote.status as QuoteStatus)}
                        </Badge>
                      </div>
                      <div className="mt-1 text-sm font-semibold text-foreground">
                        {formatINR(quote.totalAmount)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Dialogs */}
      <NewOrderDialog
        open={newOrderOpen}
        lead={lead}
        canPickSales={isMspTl}
        onClose={() => setNewOrderOpen(false)}
        onDone={() => {
          setNewOrderOpen(false);
          router.push(`/leads/${lead.id}/workspace`);
        }}
      />
      <CategorizeDialog
        open={categorizeOpen}
        onClose={() => setCategorizeOpen(false)}
        onSuccess={fetchLead}
        lead={lead}
      />
      <AssignDialog
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        onSuccess={fetchLead}
        lead={lead}
      />
      <MeetingDialog
        open={meetingDialogOpen}
        onClose={() => setMeetingDialogOpen(false)}
        onSuccess={fetchLead}
        preselectedLeadId={lead.id}
      />
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tint,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  tint: "blue" | "emerald" | "violet";
}) {
  const tintMap = {
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
    emerald:
      "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    violet:
      "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
  };
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
      <div
        className={cn(
          "flex size-11 items-center justify-center rounded-lg",
          tintMap[tint]
        )}
      >
        <Icon className="size-5" />
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
      </div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  compact,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "py-6" : "py-10"
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-muted text-muted-foreground",
          compact ? "size-10" : "size-12"
        )}
      >
        <Icon className={compact ? "size-4" : "size-5"} />
      </div>
      <p className="mt-3 text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-xs text-xs text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
