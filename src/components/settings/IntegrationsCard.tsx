"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, KeyRound, Loader2, Plug, Plus, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import api from "@/lib/axios";
import { notify } from "@/lib/notify";
import { formatDateTimeIN } from "@/lib/utils";

interface Client {
  id: string;
  name: string;
  keyPrefix: string;
  isActive: boolean;
  lastUsedAt: string | null;
  leads: number;
}

/**
 * Admin: one API key per external software that sends us leads (docs/INTEGRATION_API.md).
 * A key is shown only once, when it's created or regenerated — only its hash is stored.
 */
export function IntegrationsCard() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState<{ name: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [regenFor, setRegenFor] = useState<Client | null>(null);

  const fetchClients = useCallback(async () => {
    try {
      const { data } = await api.get("/integration-clients");
      setClients(data.data ?? []);
    } catch (err) {
      setClients([]);
      notify.apiError(err, "Couldn't load integrations");
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(fetchClients, 0);
    return () => clearTimeout(t);
  }, [fetchClients]);

  const showKey = (clientName: string, key: string) => {
    setCopied(false);
    setNewKey({ name: clientName, key });
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.post("/integration-clients", { name: name.trim() });
      showKey(data.data.name, data.data.apiKey);
      setName("");
      await fetchClients();
    } catch (err) {
      notify.apiError(err, "Couldn't create the key");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (c: Client, isActive: boolean) => {
    try {
      await api.patch(`/integration-clients/${c.id}`, { isActive });
      if (isActive) notify.success(`${c.name} enabled`, "It can send leads and read status again.");
      else notify.warning(`${c.name} disabled`, "Its requests are refused until you enable it.");
      await fetchClients();
    } catch (err) {
      notify.apiError(err, `Couldn't update ${c.name}`);
    }
  };

  const regenerate = async () => {
    if (!regenFor) return;
    const c = regenFor;
    setRegenFor(null);
    try {
      const { data } = await api.post(`/integration-clients/${c.id}/regenerate-key`);
      showKey(c.name, data.data.apiKey);
      await fetchClients();
    } catch (err) {
      notify.apiError(err, "Couldn't create a new key");
    }
  };

  const copy = async () => {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey.key);
      setCopied(true);
    } catch {
      notify.warning("Couldn't copy automatically", "Select the key and copy it by hand.");
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
      <div>
        <div className="flex items-center gap-2">
          <Plug className="size-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Integrations</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Your other software send MSP leads here using an API key, and read back each lead&apos;s status. Each key can only
          do that — nothing else in this CRM.
        </p>
      </div>

      {newKey && (
        <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
            <KeyRound className="size-4" /> Copy the key for {newKey.name} now — it won&apos;t be shown again
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-md bg-background px-3 py-2 font-mono text-xs">{newKey.key}</code>
            <Button type="button" variant="outline" size="sm" onClick={copy}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
              Put it in that software&apos;s server environment (e.g. <code>MSP_CRM_API_KEY</code>). Never in browser code.
            </p>
            <Button type="button" variant="ghost" size="sm" onClick={() => setNewKey(null)}>
              Done
            </Button>
          </div>
        </div>
      )}

      {clients === null ? (
        <div className="flex h-16 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : clients.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
          No software connected yet. Add one below to get its API key.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {clients.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {c.name}
                  {!c.isActive && <Badge variant="secondary">Disabled</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono">{c.keyPrefix}…</span> · {c.leads} lead{c.leads === 1 ? "" : "s"} · Last used{" "}
                  {c.lastUsedAt ? formatDateTimeIN(c.lastUsedAt) : "never"}
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setRegenFor(c)}>
                <RefreshCw className="size-3.5" /> New key
              </Button>
              <Switch checked={c.isActive} onCheckedChange={(v: boolean) => toggle(c, v)} aria-label={`${c.name} enabled`} />
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={create} className="flex flex-wrap items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Software name, e.g. ILL CRM"
          aria-label="Software name"
          maxLength={60}
          className="min-w-48 flex-1"
        />
        <Button type="submit" disabled={busy || name.trim().length < 2}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Create API key
        </Button>
      </form>

      <AlertDialog open={!!regenFor} onOpenChange={(v) => !v && setRegenFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create a new key for {regenFor?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The current key stops working immediately. That software can&apos;t send leads or read status until you update
              its environment with the new key.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={regenerate}>Create new key</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
