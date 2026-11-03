"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import api from "@/lib/axios";

/** Shown to Admin / MSP TL on a lead received from another software that looks like an existing one */
export function DuplicateWarning({ ids }: { ids: string[] }) {
  const [leads, setLeads] = useState<{ id: string; companyName: string; contactPerson: string }[]>([]);
  const key = ids.join(",");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await Promise.all(
        key.split(",").map((id) =>
          api
            .get(`/leads/${id}`)
            .then((r) => r.data.data)
            .catch(() => null) // deleted since — nothing to compare with
        )
      );
      if (!cancelled) setLeads(rows.filter(Boolean));
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  if (leads.length === 0) return null;
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-medium">Possible duplicate — same phone, email or GSTIN as:</p>
        <ul className="mt-1 space-y-0.5">
          {leads.map((l) => (
            <li key={l.id}>
              <Link href={`/leads/${l.id}`} className="underline underline-offset-4">
                {l.companyName}
              </Link>{" "}
              · {l.contactPerson}
            </li>
          ))}
        </ul>
        <p className="mt-1 text-xs opacity-80">Check before assigning. Nothing was merged automatically.</p>
      </div>
    </div>
  );
}
