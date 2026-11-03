"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Users,
  FileText,
  User as UserIcon,
  Loader2,
  ClipboardList,
  ChevronRight,
  CheckCircle2,
  Clock,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import api from "@/lib/axios";
import { cn, formatDateTimeIN } from "@/lib/utils";
import { useDataChanged } from "@/hooks/useDataChanged";
import { LoadError, loadFailureOf, type LoadFailure } from "@/components/leads/LoadError";
import type { Meeting } from "@/types";
import { MOMDialog } from "../_components/MOMDialog";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function InfoItem({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <div className="truncate text-sm font-medium text-foreground">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function MeetingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [momOpen, setMomOpen] = useState(false);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const loaded = useRef(false);

  // spinner on the first load only; refreshes keep the page on screen
  const fetchMeeting = useCallback(async () => {
    try {
      const { data } = await api.get(`/meetings/${id}`);
      setMeeting(data.data);
      setFailure(null);
      loaded.current = true;
    } catch (err) {
      if (!loaded.current) setFailure(loadFailureOf(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchMeeting();
  }, [fetchMeeting]);

  useDataChanged(fetchMeeting);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!meeting) {
    return (
      <LoadError
        failure={failure ?? { notFound: true, message: "" }}
        what="meeting"
        onRetry={() => {
          setLoading(true);
          fetchMeeting();
        }}
        onBack={() => router.push("/meetings")}
        backLabel="Back to Meetings"
      />
    );
  }

  const meetingDate = new Date(meeting.meetingDate);
  const hasMom = Boolean(meeting.momContent);
  const company = meeting.lead?.companyName ?? "Unknown";

  return (
    <div className="space-y-6 pb-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <button
          onClick={() => router.push("/meetings")}
          className="flex items-center gap-1.5 transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Meetings
        </button>
        <ChevronRight className="size-3.5" />
        <span className="font-medium text-foreground">Meeting with {company}</span>
      </div>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#3B82F6]/8 via-[#3B82F6]/3 to-transparent dark:from-[#3B82F6]/15" />

        <div className="relative p-6 lg:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-5">
              <div className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#3B82F6] to-[#6366F1] text-white shadow-lg shadow-[#3B82F6]/20 ring-1 ring-white/20">
                <Calendar className="size-7" />
              </div>
              <div className="min-w-0 space-y-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Meeting
                  </p>
                  <h1 className="mt-0.5 text-2xl font-semibold tracking-tight sm:text-3xl">
                    {company}
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Created{" "}
                    {formatDistanceToNow(new Date(meeting.createdAt), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {hasMom ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30">
                      <CheckCircle2 className="size-3" />
                      MOM Added
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30">
                      <Clock className="size-3" />
                      MOM Pending
                    </span>
                  )}
                  {meeting.lead && (
                    <button
                      onClick={() => router.push(`/leads/${meeting.lead!.id}`)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground ring-1 ring-inset ring-border transition-colors hover:bg-accent"
                    >
                      <Building2 className="size-3" />
                      View Lead
                    </button>
                  )}
                </div>
              </div>
            </div>

            {!hasMom && (
              <Button onClick={() => setMomOpen(true)}>
                <FileText className="size-4" />
                Add MOM
              </Button>
            )}
          </div>

          {/* Meta grid */}
          <div className="mt-6 grid gap-4 border-t border-border pt-5 sm:grid-cols-2 lg:grid-cols-3">
            <InfoItem icon={Calendar} label="Date & Time">
              {formatDateTimeIN(meetingDate)}
            </InfoItem>
            <InfoItem icon={MapPin} label="Location">
              {meeting.location}
            </InfoItem>
            {meeting.conductedBy && (
              <InfoItem icon={UserIcon} label="Conducted by">
                {meeting.conductedBy.name}
              </InfoItem>
            )}
          </div>
        </div>
      </div>

      {/* Bottom grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Attendees + Agenda */}
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card">
            <header className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <Users className="size-4 text-muted-foreground" />
                <h2 className="text-base font-semibold">Attendees</h2>
              </div>
              <Badge variant="secondary" className="text-xs">
                {meeting.attendees.length}
              </Badge>
            </header>
            <div className="p-5">
              {meeting.attendees.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No attendees listed.
                </p>
              ) : (
                <ul className="space-y-3">
                  {meeting.attendees.map((attendee, index) => (
                    <li key={index} className="flex items-center gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3B82F6] to-[#6366F1] text-xs font-semibold text-white">
                        {getInitials(attendee)}
                      </div>
                      <span className="truncate text-sm font-medium">
                        {attendee}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {meeting.agenda && (
            <section className="rounded-2xl border border-border bg-card">
              <header className="flex items-center gap-2 border-b border-border px-5 py-4">
                <ClipboardList className="size-4 text-muted-foreground" />
                <h2 className="text-base font-semibold">Agenda</h2>
              </header>
              <div className="p-5">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                  {meeting.agenda}
                </p>
              </div>
            </section>
          )}
        </div>

        {/* MOM */}
        <section className="rounded-2xl border border-border bg-card lg:col-span-2">
          <header className="flex items-center justify-between border-b border-border px-6 py-4">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-muted-foreground" />
              <h2 className="text-base font-semibold">Minutes of Meeting</h2>
            </div>
            {hasMom && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMomOpen(true)}
              >
                Edit
              </Button>
            )}
          </header>
          <div className="p-6">
            {hasMom ? (
              <div
                className={cn(
                  "prose prose-sm max-w-none",
                  "whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-5 text-sm leading-relaxed text-foreground"
                )}
              >
                {meeting.momContent}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                  <FileText className="size-6" />
                </div>
                <p className="mt-4 text-sm font-medium">
                  No minutes recorded yet
                </p>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                  Capture key discussion points, decisions, and next steps from
                  the meeting.
                </p>
                <Button className="mt-5" onClick={() => setMomOpen(true)}>
                  <FileText className="size-4" />
                  Add Minutes
                </Button>
              </div>
            )}
          </div>
        </section>
      </div>

      <MOMDialog
        open={momOpen}
        onClose={() => setMomOpen(false)}
        onSuccess={fetchMeeting}
        meeting={meeting}
      />
    </div>
  );
}
