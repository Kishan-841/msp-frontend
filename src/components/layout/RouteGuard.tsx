"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { canOpenPage } from "@/lib/pageAccess";

/** Sends users away from sections their role doesn't use (e.g. Accounts typing /meetings) */
export function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  const allowed = canOpenPage(pathname, role);

  useEffect(() => {
    if (!allowed) router.replace("/");
  }, [allowed, router]);

  return allowed ? <>{children}</> : null;
}
