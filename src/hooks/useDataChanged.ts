"use client";

import { useEffect, useRef } from "react";

/** Fired by SocketProvider whenever the server says something changed (any user's action) */
export const DATA_CHANGED_EVENT = "crm:data-changed";

/**
 * Re-runs `refetch` when data changes anywhere (debounced), so an open page stays current —
 * e.g. Sales sees "Approved" the moment Admin approves, without reloading.
 * `refetch` should refresh in the background (no full-page spinner).
 */
export function useDataChanged(refetch: () => void, delayMs = 400) {
  const ref = useRef(refetch);
  useEffect(() => {
    ref.current = refetch;
  });
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onChange = () => {
      clearTimeout(timer);
      timer = setTimeout(() => ref.current(), delayMs);
    };
    window.addEventListener(DATA_CHANGED_EVENT, onChange);
    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, onChange);
      clearTimeout(timer);
    };
  }, [delayMs]);
}
