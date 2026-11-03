"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Calendar, MapPin } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import api from "@/lib/axios";
import { useDiscardGuard } from "@/hooks/useDiscardGuard";
import { notify } from "@/lib/notify";
import type { Meeting } from "@/types";

const momSchema = z.object({
  momContent: z.string().min(1, "Minutes of meeting content is required"),
});

type FormData = z.infer<typeof momSchema>;

interface MOMDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  meeting: Meeting | null;
}

export function MOMDialog({ open, onClose, onSuccess, meeting }: MOMDialogProps) {
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(momSchema),
    defaultValues: {
      momContent: "",
    },
  });

  useEffect(() => {
    if (open) reset({ momContent: meeting?.momContent ?? "" });
  }, [open, meeting, reset]);

  // the error is cleared on close (not in the effect above), so the next open starts clean
  const close = () => {
    setError(null);
    onClose();
  };
  // minutes typed but not saved aren't lost to Esc / an outside click
  const guard = useDiscardGuard(isDirty, close);

  const onSubmit = async (data: FormData) => {
    if (!meeting) return;
    setError(null);
    try {
      await api.patch(`/meetings/${meeting.id}/mom`, {
        momContent: data.momContent,
      });
      notify.success(
        "MOM saved",
        `${meeting.lead?.companyName ?? "Meeting"} — next, pick the final requirement and send it to MSP TL for a quote`
      );
      onSuccess();
      close();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Something went wrong";
      setError(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && !isSubmitting && guard.requestClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {meeting?.momContent ? "Edit Minutes of Meeting" : "Add Minutes of Meeting"}
          </DialogTitle>
          <DialogDescription>
            Record the key discussion points and action items from this meeting.
          </DialogDescription>
        </DialogHeader>

        {meeting && (
          <>
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
              <p className="text-sm font-medium">
                {meeting.lead?.companyName ?? "Meeting"}
              </p>
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="size-3" />
                  {new Date(meeting.meetingDate).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="size-3" />
                  {meeting.location}
                </span>
              </div>
            </div>
            <Separator />
          </>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="momContent">Meeting Minutes</Label>
            <Textarea
              id="momContent"
              placeholder="Key discussion points, decisions made, action items..."
              rows={8}
              {...register("momContent")}
            />
            {errors.momContent && (
              <p className="text-xs text-destructive">
                {errors.momContent.message}
              </p>
            )}
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
                  Saving...
                </>
              ) : (
                "Save MOM"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      {guard.dialog}
    </Dialog>
  );
}
