"use client";

import { ArrowLeft, RefreshCw, SearchX, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/lib/utils";

export interface LoadFailure {
  notFound: boolean;
  message: string;
}

/** 404 = the record is gone or not yours; anything else (network, 500, expired session) can be retried */
export function loadFailureOf(err: unknown): LoadFailure {
  const status = (err as { response?: { status?: number } })?.response?.status;
  return status === 404
    ? { notFound: true, message: "It may have been deleted, or it isn't assigned to you." }
    : { notFound: false, message: apiErrorMessage(err, "Check your connection and try again.") };
}

/** Full-page state for a record page that couldn't load */
export function LoadError({
  failure,
  what,
  onRetry,
  onBack,
  backLabel,
}: {
  failure: LoadFailure;
  what: string; // "lead", "meeting"
  onRetry: () => void;
  onBack: () => void;
  backLabel: string;
}) {
  const Icon = failure.notFound ? SearchX : WifiOff;
  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft className="size-4" />
        {backLabel}
      </Button>
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Icon className="size-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium">
            {failure.notFound ? `This ${what} isn't available` : `Couldn't load this ${what}`}
          </p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">{failure.message}</p>
        </div>
        {!failure.notFound && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="size-3.5" />
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}
