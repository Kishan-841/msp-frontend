"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import api from "@/lib/axios";
import { notify } from "@/lib/notify";
import type { LeadDetail } from "@/types";
import { RequirementPicker } from "./RequirementPicker";

/** Final requirement → send for quote, opened from list pages by lead id */
export function RequirementDialog({
  leadId,
  onClose,
  onSent,
}: {
  leadId: string | null;
  onClose: () => void;
  onSent: () => void | Promise<void>;
}) {
  const [lead, setLead] = useState<LeadDetail | null>(null);

  // The render below ignores a stale lead (id check), so no reset needed when closing
  useEffect(() => {
    if (!leadId) return;
    api
      .get(`/leads/${leadId}`)
      .then(({ data }) => setLead(data.data))
      .catch((err) => {
        setLead(null);
        notify.apiError(err, "Couldn't load the lead's requirement");
      });
  }, [leadId]);

  return (
    <Dialog open={!!leadId} onOpenChange={(v) => !v && onClose()}>
      {/* Capped height: picker body scrolls, header + Send footer stay put */}
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-border px-6 pt-5 pb-4">
          <DialogTitle>Final requirement{lead ? ` — ${lead.companyName}` : ""}</DialogTitle>
          <DialogDescription>
            Pick what the customer needs and send the lead to MSP TL for a quote.
          </DialogDescription>
        </DialogHeader>
        {lead && lead.id === leadId ? (
          // key resets the picker's state when switching leads
          <RequirementPicker
            key={lead.id}
            inDialog
            lead={lead}
            onSent={async () => {
              await onSent();
              onClose();
            }}
          />
        ) : (
          <div className="flex h-32 items-center justify-center px-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
