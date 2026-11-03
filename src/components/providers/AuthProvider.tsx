"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { rememberReturnPath } from "@/lib/returnPath";
import { Loader2 } from "lucide-react";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const needsLoginRedirect = !isLoading && !isAuthenticated && pathname !== "/login";
  const needsHomeRedirect = !isLoading && isAuthenticated && pathname === "/login";

  // Another tab signed in as someone else, or signed out: this tab's token in localStorage
  // changed under it — reload so the name, role, menu and socket match who's signed in.
  // (A plain token refresh by the same user is ignored.)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== "accessToken") return;
      const me = useAuthStore.getState().user?.id;
      if (!e.newValue || (me && tokenUserId(e.newValue) !== me)) window.location.reload();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (needsLoginRedirect) {
      rememberReturnPath();
      router.replace("/login");
    } else if (needsHomeRedirect) {
      router.replace("/");
    }
  }, [needsLoginRedirect, needsHomeRedirect, router]);

  if (isLoading || needsLoginRedirect || needsHomeRedirect) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}

function tokenUserId(token: string): string | null {
  try {
    return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).userId ?? null;
  } catch {
    return null;
  }
}
