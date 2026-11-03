"use client";

import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export type LoadError = "notfound" | "error";

/** 404 → the document really isn't there (or isn't yours); anything else is worth retrying */
export function loadErrorKind(err: unknown): LoadError {
  return (err as { response?: { status?: number } })?.response?.status === 404 ? "notfound" : "error";
}

/**
 * Print pages: "not found" vs "couldn't load" (+ Retry). An expired session never lands
 * here — the axios interceptor refreshes it, or sends the user to sign in.
 */
export function PrintLoadError({ kind, what, onRetry }: { kind: LoadError; what: string; onRetry: () => void }) {
  return (
    <div className="space-y-3 p-8">
      {kind === "notfound" ? (
        <p>This {what} wasn&apos;t found — it may have been deleted, or it isn&apos;t one you can see.</p>
      ) : (
        <>
          <p>Couldn&apos;t load this {what} — check your connection and try again.</p>
          <Button variant="outline" onClick={onRetry}>
            <RotateCw className="size-4" /> Retry
          </Button>
        </>
      )}
    </div>
  );
}
