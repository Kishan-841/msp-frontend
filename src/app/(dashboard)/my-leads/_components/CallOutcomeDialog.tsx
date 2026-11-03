"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CalendarClock, PhoneForwarded, XCircle } from "lucide-react";
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
import { cn, formatDateTimeIN } from "@/lib/utils";
import { useDiscardGuard } from "@/hooks/useDiscardGuard";
import api from "@/lib/axios";
import { notify } from "@/lib/notify";
import type { Lead } from "@/types";

type Outcome = "MEETING_SCHEDULED" | "CALL_LATER" | "DROPPED";

interface CallOutcomeDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  lead: Lead | null;
  duration: number; // seconds
}

const OUTCOME_OPTIONS: {
  value: Outcome;
  label: string;
  icon: typeof CalendarClock;
  activeClass: string;
  iconActiveClass: string;
}[] = [
  {
    value: "MEETING_SCHEDULED",
    label: "Schedule Meeting",
    icon: CalendarClock,
    activeClass:
      "border-emerald-600 ring-1 ring-emerald-600/40 bg-emerald-600/[0.04] dark:bg-emerald-400/5",
    iconActiveClass: "text-emerald-600 dark:text-emerald-400",
  },
  {
    value: "CALL_LATER",
    label: "Call Later",
    icon: PhoneForwarded,
    activeClass:
      "border-blue-600 ring-1 ring-blue-600/40 bg-blue-600/[0.04] dark:bg-blue-400/5",
    iconActiveClass: "text-blue-600 dark:text-blue-400",
  },
  {
    value: "DROPPED",
    label: "Drop",
    icon: XCircle,
    activeClass:
      "border-rose-600 ring-1 ring-rose-600/40 bg-rose-600/[0.04] dark:bg-rose-400/5",
    iconActiveClass: "text-rose-600 dark:text-rose-400",
  },
];

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

export function CallOutcomeDialog({
  open,
  onClose,
  onSuccess,
  lead,
  duration,
}: CallOutcomeDialogProps) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  // Schedule meeting fields
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingTime, setMeetingTime] = useState("");
  const [meetingLocation, setMeetingLocation] = useState("");

  // Call later fields
  const [callLaterDate, setCallLaterDate] = useState("");
  const [callLaterTime, setCallLaterTime] = useState("");

  // Common
  const [notes, setNotes] = useState("");
  const [dropReason, setDropReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setOutcome(null);
      setMeetingDate("");
      setMeetingTime("");
      setMeetingLocation("");
      setCallLaterDate("");
      setCallLaterTime("");
      setNotes("");
      setDropReason("");
      setError(null);
    }
  }, [open]);

  // the call happened — don't lose the outcome to an accidental Esc / outside click
  const dirty =
    !!outcome || !!notes.trim() || !!meetingDate || !!meetingLocation.trim() || !!callLaterDate || !!dropReason.trim();
  const guard = useDiscardGuard(dirty, onClose);

  const validate = (): string | null => {
    if (!outcome) return "Please select an outcome.";
    if (outcome === "MEETING_SCHEDULED") {
      if (!meetingDate) return "Meeting date is required.";
      if (!meetingTime) return "Meeting time is required.";
      if (!meetingLocation.trim()) return "Meeting location is required.";
    }
    if (outcome === "CALL_LATER") {
      if (!callLaterDate) return "Callback date is required.";
      if (!callLaterTime) return "Callback time is required.";
    }
    if (outcome === "DROPPED") {
      if (!dropReason.trim()) return "Please provide a reason for dropping this lead.";
    }
    return null;
  };

  const handleSubmit = async () => {
    if (!lead) return;
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      // Build the details string for the call log.
      let details: string | undefined;
      if (outcome === "MEETING_SCHEDULED") {
        const when = formatDateTimeIN(new Date(`${meetingDate}T${meetingTime}`)); // IST, whatever the browser's zone
        details = `Meeting at ${meetingLocation.trim()} on ${when}.${
          notes ? ` Notes: ${notes}` : ""
        }`;
      } else if (outcome === "CALL_LATER") {
        const when = formatDateTimeIN(new Date(`${callLaterDate}T${callLaterTime}`));
        details = `Callback scheduled for ${when}.${
          notes ? ` Notes: ${notes}` : ""
        }`;
      } else if (outcome === "DROPPED") {
        details = `Reason: ${dropReason.trim()}`;
      }

      // Log the call. The backend creates the meeting / stores the callback in the same request,
      // which moves the lead out of the "To Call" / "Call Later" tabs as appropriate.
      await api.post(`/leads/${lead.id}/call-log`, {
        duration,
        outcome,
        details,
        ...(outcome === "MEETING_SCHEDULED" && {
          meeting: {
            meetingDate: new Date(`${meetingDate}T${meetingTime}`).toISOString(),
            location: meetingLocation.trim(),
            agenda: notes || undefined,
          },
        }),
        ...(outcome === "CALL_LATER" && {
          callbackAt: new Date(`${callLaterDate}T${callLaterTime}`).toISOString(),
        }),
      });

      // Each outcome gets its own toast: meeting → jump to the workspace, call-back → info, dropped → warning
      if (outcome === "MEETING_SCHEDULED") {
        const leadId = lead.id;
        notify.action(
          "Meeting booked",
          `${lead.companyName} · ${formatDateTimeIN(new Date(`${meetingDate}T${meetingTime}`))} · ${meetingLocation.trim()}`,
          { label: "Open workspace", onClick: () => router.push(`/leads/${leadId}/workspace`) }
        );
      } else if (outcome === "CALL_LATER") {
        notify.info(
          `Call-back set for ${formatDateTimeIN(new Date(`${callLaterDate}T${callLaterTime}`))}`,
          `${lead.companyName} moved to your Call Later tab`
        );
      } else if (outcome === "DROPPED") {
        notify.warning("Lead dropped", `${lead.companyName} — ${dropReason.trim()}. No further actions can be taken on it.`);
      }
      onSuccess();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Failed to log call outcome";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && !submitting && guard.requestClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Call Outcome</DialogTitle>
          <DialogDescription>
            Call with{" "}
            <span className="font-medium text-foreground">
              {lead?.companyName}
            </span>{" "}
            lasted{" "}
            <span className="font-mono font-medium text-foreground">
              {formatDuration(duration)}
            </span>
            . What happened on the call?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Outcome picker */}
          <div className="grid grid-cols-3 gap-2">
            {OUTCOME_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = outcome === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setOutcome(opt.value)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2 py-3 text-center transition-all",
                    "hover:border-foreground/30 hover:bg-muted/40",
                    active && opt.activeClass
                  )}
                >
                  <Icon
                    className={cn(
                      "size-4",
                      active ? opt.iconActiveClass : "text-muted-foreground"
                    )}
                  />
                  <span className="text-xs font-medium">{opt.label}</span>
                </button>
              );
            })}
          </div>

          {/* Schedule Meeting fields */}
          {outcome === "MEETING_SCHEDULED" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="meeting-date">Date</Label>
                  <Input
                    id="meeting-date"
                    type="date"
                    value={meetingDate}
                    onChange={(e) => setMeetingDate(e.target.value)}
                    min={todayIST()}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="meeting-time">Time</Label>
                  <Input
                    id="meeting-time"
                    type="time"
                    value={meetingTime}
                    onChange={(e) => setMeetingTime(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="meeting-location">Location</Label>
                <Input
                  id="meeting-location"
                  placeholder="Customer office, Zoom link, etc."
                  value={meetingLocation}
                  onChange={(e) => setMeetingLocation(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Call Later fields */}
          {outcome === "CALL_LATER" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="callback-date">Callback date</Label>
                <Input
                  id="callback-date"
                  type="date"
                  value={callLaterDate}
                  onChange={(e) => setCallLaterDate(e.target.value)}
                  min={todayIST()}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="callback-time">Time</Label>
                <Input
                  id="callback-time"
                  type="time"
                  value={callLaterTime}
                  onChange={(e) => setCallLaterTime(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Dropped — reason */}
          {outcome === "DROPPED" && (
            <div className="space-y-1.5">
              <Label htmlFor="drop-reason">
                Reason <span className="text-rose-600">*</span>
              </Label>
              <Textarea
                id="drop-reason"
                placeholder="Budget, competitor, not interested..."
                value={dropReason}
                onChange={(e) => setDropReason(e.target.value)}
                rows={2}
              />
            </div>
          )}

          {/* Optional notes for Meeting / Call Later */}
          {(outcome === "MEETING_SCHEDULED" || outcome === "CALL_LATER") && (
            <div className="space-y-1.5">
              <Label htmlFor="notes" className="text-muted-foreground">
                Notes <span className="text-xs">(optional)</span>
              </Label>
              <Textarea
                id="notes"
                placeholder="Anything worth capturing..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          )}

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={guard.requestClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !outcome}>
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Outcome"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
      {guard.dialog}
    </Dialog>
  );
}

/** YYYY-MM-DD for today in IST — for date inputs' min */
function todayIST() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
