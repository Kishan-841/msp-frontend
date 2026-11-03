"use client";

import { useTheme } from "next-themes";
import { Toaster as SileoToaster } from "sileo";

/** App toaster (Sileo) — follows the app's light/dark toggle. Fire toasts via `notify` in lib/notify.ts. */
export function Toaster() {
  const { resolvedTheme } = useTheme();
  // top-center, at the very top of the window (over the top bar)
  return <SileoToaster position="top-center" offset={{ top: 12 }} theme={resolvedTheme === "dark" ? "dark" : "light"} />;
}
