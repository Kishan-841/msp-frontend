"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import api from "@/lib/axios";
import { notify } from "@/lib/notify";
import { formatDateTimeIN } from "@/lib/utils";
import { useDiscardGuard } from "@/hooks/useDiscardGuard";
import type { Lead } from "@/types";

const meetingSchema = z.object({
  leadId: z.string().min(1, "Lead is required"),
  meetingDate: z.string().min(1, "Meeting date is required"),
  location: z.string().min(1, "Location is required"),
  attendees: z.string().min(1, "At least one attendee is required"),
  agenda: z.string().optional(),
});

type FormData = z.infer<typeof meetingSchema>;

interface MeetingDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  preselectedLeadId?: string;
}

export function MeetingDialog({
  open,
  onClose,
  onSuccess,
  preselectedLeadId,
}: MeetingDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(meetingSchema),
    defaultValues: {
      leadId: preselectedLeadId ?? "",
      meetingDate: "",
      location: "",
      attendees: "",
      agenda: "",
    },
  });

  // a half-filled meeting form isn't lost to Esc / an outside click
  const guard = useDiscardGuard(isDirty, onClose);

  const selectedLeadId = watch("leadId");

  // Lead picker: search-as-you-type against the server (20 at a time) instead of loading every lead
  const [leadQuery, setLeadQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(leadQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [leadQuery]);

  const fetchLeads = useCallback(
    async (q: string) => {
      try {
        setLoadingLeads(true);
        // the lead this dialog was opened for: fetch just that one
        if (preselectedLeadId) {
          const one = await api.get(`/leads/${preselectedLeadId}`);
          setLeads(one.data.data ? [one.data.data as Lead] : []);
          return;
        }
        const { data } = await api.get("/leads", { params: { page: 1, limit: 20, search: q || undefined } });
        // only leads already with Sales (ASSIGNED or later) can have a meeting
        const found: Lead[] = (data.data?.leads ?? []).filter(
          (l: Lead) => l.status !== "NEW" && l.status !== "CATEGORIZED" && !l.droppedAt
        );
        // keep the chosen lead in the list even when a new search doesn't match it
        setLeads((prev) => {
          const chosen = prev.find((l) => l.id === selectedLeadRef.current);
          return chosen && !found.some((l) => l.id === chosen.id) ? [chosen, ...found] : found;
        });
      } catch (err) {
        notify.apiError(err, "Couldn't load leads for the meeting");
      } finally {
        setLoadingLeads(false);
      }
    },
    [preselectedLeadId]
  );

  const selectedLeadRef = useRef(selectedLeadId);
  useEffect(() => {
    selectedLeadRef.current = selectedLeadId;
  }, [selectedLeadId]);

  useEffect(() => {
    if (open) fetchLeads(debouncedQuery);
  }, [open, debouncedQuery, fetchLeads]);

  useEffect(() => {
    if (open) {
      setError(null);
      setLeadQuery("");
      reset({
        leadId: preselectedLeadId ?? "",
        meetingDate: "",
        location: "",
        attendees: "",
        agenda: "",
      });
    }
  }, [open, preselectedLeadId, reset]);

  const onSubmit = async (formData: FormData) => {
    setError(null);
    try {
      const attendeesArray = formData.attendees
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);

      await api.post("/meetings", {
        leadId: formData.leadId,
        meetingDate: new Date(formData.meetingDate).toISOString(),
        location: formData.location,
        attendees: attendeesArray,
        agenda: formData.agenda || undefined,
      });
      notify.success(
        "Meeting booked",
        `${leads.find((l) => l.id === formData.leadId)?.companyName ?? "Lead"} · ${formatDateTimeIN(new Date(formData.meetingDate))} · ${formData.location} — add the MOM after the meeting`
      );
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Something went wrong";
      setError(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && !isSubmitting && guard.requestClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule Meeting</DialogTitle>
          <DialogDescription>
            Schedule a new meeting with a lead.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="leadId">Lead</Label>
            {preselectedLeadId ? (
              <Input
                value={
                  leads.find((l) => l.id === preselectedLeadId)?.companyName ??
                  (loadingLeads ? "Loading..." : "—")
                }
                disabled
              />
            ) : (
              <>
              <Input
                value={leadQuery}
                onChange={(e) => setLeadQuery(e.target.value)}
                placeholder="Search company…"
                aria-label="Search leads"
                className="h-8"
              />
              <Select
                value={selectedLeadId}
                onValueChange={(val) => setValue("leadId", val ?? "", { shouldDirty: true })}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      loadingLeads ? "Loading leads..." : "Select a lead"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {leads.length === 0 ? (
                    <p className="px-2 py-1.5 text-xs text-muted-foreground">
                      {loadingLeads ? "Searching…" : leadQuery ? "No assigned lead matches." : "No assigned leads."}
                    </p>
                  ) : (
                    leads.map((lead) => (
                      <SelectItem key={lead.id} value={lead.id}>
                        {lead.companyName}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Showing up to 20 matches — type to narrow it down.</p>
              </>
            )}
            {errors.leadId && (
              <p className="text-xs text-destructive">
                {errors.leadId.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="meetingDate">Meeting Date</Label>
            <Input
              id="meetingDate"
              type="datetime-local"
              {...register("meetingDate")}
            />
            {errors.meetingDate && (
              <p className="text-xs text-destructive">
                {errors.meetingDate.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              placeholder="Office / Google Meet / Client site"
              {...register("location")}
            />
            {errors.location && (
              <p className="text-xs text-destructive">
                {errors.location.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="attendees">Attendees</Label>
            <Textarea
              id="attendees"
              placeholder="Enter names separated by commas (e.g. Rahul Sharma, Priya Patel)"
              rows={2}
              {...register("attendees")}
            />
            {errors.attendees && (
              <p className="text-xs text-destructive">
                {errors.attendees.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="agenda">Agenda (optional)</Label>
            <Textarea
              id="agenda"
              placeholder="Topics to be discussed..."
              rows={3}
              {...register("agenda")}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={guard.requestClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Scheduling...
                </>
              ) : (
                "Schedule Meeting"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      {guard.dialog}
    </Dialog>
  );
}
