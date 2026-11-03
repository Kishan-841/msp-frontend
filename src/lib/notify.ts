import { sileo, type SileoOptions } from "sileo";
import { apiErrorMessage } from "@/lib/utils";

/**
 * App-wide toasts (Sileo). One place so every message follows the same rules:
 *  - title: what happened, in plain words ("Quote approved"), ≤ ~40 chars
 *  - description: the record + what happens next ("QT-… — Sales can now send it to the customer")
 *
 * Which type to use:
 *  success  an action finished                    error    it failed (shows the server's reason)
 *  warning  done/blocked but needs attention      info     neutral news (nothing to do)
 *  action   done, with a one-click next step      promise  slow work: loading → success / error
 */

type Desc = SileoOptions["description"];
type Extra = Omit<SileoOptions, "title" | "description" | "type">;
type State = "success" | "error" | "warning" | "info" | "action" | "loading";

// Sileo gives every toast the same id unless told otherwise, so a new toast replaces the one
// on screen. Here each toast gets its own id — they stack, and a live notification can't wipe
// out "Invoice raised [View invoice]". Re-using an id updates that toast in place (morphs).
let seq = 0;
const nextId = () => `t${Date.now().toString(36)}${(seq++).toString(36)}`;

// How long each kind stays: quick confirmations 4 s; things worth reading (errors, warnings,
// next-step buttons) 5 s. Hovering any toast pauses the countdown.
const DURATION: Record<Exclude<State, "loading">, number> = {
  success: 4000,
  info: 4000,
  error: 5000,
  warning: 5000,
  action: 5000,
};

// Our own countdown (Sileo has one too). Sileo only resumes its timers on mouse-leave, so a
// toast that disappears under the pointer (e.g. after clicking its button) leaves it thinking
// the pointer is still there — and then no toast ever times out. This ticker checks the real
// :hover state each tick, pauses while a toast is hovered, and always dismisses on time.
const TICK = 200;
const remaining = new Map<string, number>();
let ticker: number | null = null;
const tick = () => {
  const hovered = !!document.querySelector("[data-sileo-toast]:hover");
  if (!hovered) {
    for (const [id, ms] of remaining) {
      if (ms - TICK > 0) remaining.set(id, ms - TICK);
      else {
        remaining.delete(id);
        sileo.dismiss(id);
      }
    }
  }
  if (remaining.size === 0 && ticker !== null) {
    window.clearInterval(ticker);
    ticker = null;
  }
};
const countdown = (id: string, ms: number | null) => {
  if (ms === null) return void remaining.delete(id); // loading: stays until it resolves
  remaining.set(id, ms);
  if (ticker === null && typeof window !== "undefined") ticker = window.setInterval(tick, TICK);
};

const fire = (type: State, opts: SileoOptions & { id?: string }) => {
  const id = opts.id ?? nextId();
  const duration = opts.duration !== undefined ? opts.duration : type === "loading" ? null : DURATION[type];
  sileo.show({ ...opts, type, id, duration } as SileoOptions);
  countdown(id, duration);
  return id;
};

export const notify = {
  success: (title: string, description?: Desc, extra?: Extra) => fire("success", { title, description, ...extra }),
  error: (title: string, description?: Desc, extra?: Extra) => fire("error", { title, description, ...extra }),
  warning: (title: string, description?: Desc, extra?: Extra) => fire("warning", { title, description, ...extra }),
  info: (title: string, description?: Desc, extra?: Extra) => fire("info", { title, description, ...extra }),

  /** Success with a next-step button, e.g. "Invoice raised" → [View invoice] */
  action: (title: string, description: Desc, button: { label: string; onClick: () => void }, extra?: Extra) =>
    fire("action", { title, description, button: { title: button.label, onClick: button.onClick }, ...extra }),

  /** A failed API call — the backend's message ("Only 1 Nos left to bill") is the description */
  apiError: (err: unknown, title = "Something went wrong") =>
    fire("error", { title, description: apiErrorMessage(err, "Please try again. If it keeps happening, refresh the page.") }),

  /**
   * Loading → result for slower work (emails, uploads, downloads); the loading toast morphs
   * into the result. `success` may return `type: "warning" | "info"` when it worked but needs
   * attention (e.g. an email in test mode). Returns the original promise.
   */
  promise: <T>(
    work: Promise<T> | (() => Promise<T>),
    msgs: {
      loading: string;
      success: string | ((data: T) => { title: string; description?: Desc; type?: "success" | "warning" | "info" });
      error: string;
      description?: Desc; // shown while loading
    }
  ): Promise<T> => {
    const id = fire("loading", { title: msgs.loading, description: msgs.description, duration: null });
    const p = typeof work === "function" ? work() : work;
    p.then(
      (data) => {
        const r = typeof msgs.success === "string" ? { title: msgs.success } : msgs.success(data);
        fire(r.type ?? "success", { id, title: r.title, description: r.description });
      },
      (err) => fire("error", { id, title: msgs.error, description: apiErrorMessage(err, "Please try again.") })
    );
    return p;
  },

  dismiss: (id: string) => {
    remaining.delete(id);
    sileo.dismiss(id);
  },
};
