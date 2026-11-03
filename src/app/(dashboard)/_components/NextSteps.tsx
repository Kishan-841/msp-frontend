"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Hourglass, ListTodo } from "lucide-react";
import { cn } from "@/lib/utils";
import { TASKS } from "@/lib/tasks";
import { useTaskStore } from "@/stores/task-store";

/**
 * "Your next steps" — the work waiting on this user, most urgent first, each a direct
 * link to the page + tab where the button is. Live: counts refresh over the socket.
 */
export function NextSteps() {
  const tasks = useTaskStore((s) => s.tasks);
  // Counts arrive a moment after the page — don't claim "all caught up" before they do.
  // (Every role has at least one task key, so an empty list means "not loaded yet".)
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 1500);
    return () => clearTimeout(t);
  }, []);
  const loading = tasks.length === 0 && !waited;
  const pending = tasks.filter((t) => t.count > 0 && TASKS[t.key]);
  const mine = pending.filter((t) => !TASKS[t.key].waiting);
  const waiting = pending.filter((t) => TASKS[t.key].waiting);

  return (
    <section className="rounded-2xl border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border px-6 py-4">
        <ListTodo className="size-4 text-[#3B82F6]" />
        <h2 className="text-base font-semibold">Your next steps</h2>
        {mine.length > 0 && (
          <span className="rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-semibold text-white">
            {mine.reduce((a, t) => a + t.count, 0)}
          </span>
        )}
      </header>

      {loading ? (
        <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading your next steps">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-4 bg-card px-6 py-4">
              <span className="size-10 shrink-0 animate-pulse rounded-xl bg-muted" />
              <span className="flex-1 space-y-2">
                <span className="block h-3.5 w-3/4 animate-pulse rounded bg-muted" />
                <span className="block h-3 w-1/2 animate-pulse rounded bg-muted" />
              </span>
            </div>
          ))}
        </div>
      ) : mine.length === 0 ? (
        <div className="flex items-center gap-3 px-6 py-5 text-sm text-muted-foreground">
          <CheckCircle2 className="size-5 text-emerald-500" />
          You&apos;re all caught up — nothing is waiting on you right now.
        </div>
      ) : (
        <ul className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-3">
          {mine.map((t) => (
            <TaskLink key={t.key} taskKey={t.key} count={t.count} />
          ))}
        </ul>
      )}

      {waiting.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border px-6 py-3 text-sm">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Hourglass className="size-3.5" /> Waiting on others:
          </span>
          {waiting.map((t) => (
            <Link key={t.key} href={TASKS[t.key].href} className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              {TASKS[t.key].title(t.count)}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function TaskLink({ taskKey, count }: { taskKey: keyof typeof TASKS; count: number }) {
  const info = TASKS[taskKey];
  return (
    <li className="bg-card">
      <Link href={info.href} className={cn("group flex h-full items-center gap-4 px-6 py-4 transition-colors hover:bg-muted/50")}>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#3B82F6]/10 text-lg font-semibold tabular-nums text-[#3B82F6]">
          {count}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{info.title(count)}</span>
          <span className="block text-xs text-muted-foreground">{info.hint}</span>
        </span>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
      </Link>
    </li>
  );
}
