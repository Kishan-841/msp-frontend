"use client";

import { useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import api from "@/lib/axios";
import { notify } from "@/lib/notify";
import { CATEGORY_LABEL } from "@/lib/categories";
import { apiErrorMessage } from "@/lib/utils";
import type { Material, RequirementItem, RequirementMaterial } from "@/types";

/**
 * One picked product (e.g. Firewall): pick saved catalogue items or create a new one
 * (saved for everyone), each with a quantity, plus free-text details.
 */
export function ProductItems({
  product,
  catalogue,
  onCatalogueAdd,
  onMaterialsChange,
  onDetailsChange,
}: {
  product: RequirementItem;
  catalogue: Material[]; // items saved under this product
  onCatalogueAdd: (m: Material) => void;
  onMaterialsChange: (materials: RequirementMaterial[]) => void;
  onDetailsChange: (details: string) => void;
}) {
  const picked = product.materials ?? [];
  const available = catalogue.filter((m) => !picked.some((p) => p.materialId === m.id));

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = (m: Material) =>
    onMaterialsChange([...picked, { materialId: m.id, name: m.name, brand: m.brand, quantity: 1 }]);

  const saveNew = async () => {
    try {
      setSaving(true);
      setError(null);
      const { data } = await api.post("/materials", {
        category: product.category,
        product: product.name,
        name: name.trim(),
        brand: brand.trim() || undefined,
      });
      const m = data.data as Material;
      onCatalogueAdd(m);
      if (!picked.some((p) => p.materialId === m.id)) add(m);
      setAdding(false);
      setName("");
      setBrand("");
      notify.success(`“${m.name}” added`, `Saved under ${product.name} for everyone and picked for this lead`);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not save the item"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      {/* Header: product + item actions on one line */}
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm font-medium">
          {product.name}
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">{CATEGORY_LABEL[product.category]}</span>
        </p>
        <Select
          value={null}
          disabled={available.length === 0}
          onValueChange={(v) => {
            const m = catalogue.find((x) => x.id === v);
            if (m) add(m);
          }}
        >
          <SelectTrigger className="h-8 w-52">
            <SelectValue placeholder="Select item">
              {available.length ? `Select item (${available.length})` : catalogue.length ? "All items added" : "No saved items yet"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {available.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
                {m.brand ? ` · ${m.brand}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => setAdding((v) => !v)}
          aria-expanded={adding}
        >
          <Plus className="size-3.5" />
          New item
        </Button>
      </div>

      {/* New catalogue item */}
      {adding && (
        <div className="space-y-2 rounded-md border border-dashed border-border bg-muted/30 p-2">
          <div className="grid gap-2 sm:grid-cols-[1fr_140px_auto]">
            <Input
              autoFocus
              className="h-8"
              placeholder={`New ${product.name} item, e.g. Fortinet FortiGate 60F`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim().length >= 2) {
                  e.preventDefault();
                  saveNew();
                }
              }}
            />
            <Input className="h-8" placeholder="Brand (optional)" value={brand} onChange={(e) => setBrand(e.target.value)} />
            <Button type="button" size="sm" className="h-8" onClick={saveNew} disabled={saving || name.trim().length < 2}>
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              Save
            </Button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <p className="text-[11px] text-muted-foreground">Saved items appear in the {product.name} list for everyone.</p>
        </div>
      )}

      {/* Picked items */}
      {picked.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {picked.map((m) => (
            <li key={m.materialId} className="flex items-center gap-2 px-2 py-1">
              <span className="min-w-0 flex-1 truncate text-sm">
                {m.name}
                {m.brand && <span className="ml-1.5 text-xs text-muted-foreground">{m.brand}</span>}
              </span>
              <span className="text-xs text-muted-foreground">Qty</span>
              <Input
                type="number"
                min={1}
                aria-label={`Quantity of ${m.name}`}
                className="h-7 w-16 tabular-nums"
                value={m.quantity}
                onChange={(e) =>
                  onMaterialsChange(
                    picked.map((p) => (p.materialId === m.materialId ? { ...p, quantity: Number(e.target.value) } : p))
                  )
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${m.name}`}
                onClick={() => onMaterialsChange(picked.filter((p) => p.materialId !== m.materialId))}
              >
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Input
        className="h-8"
        placeholder={
          product.category === "HARDWARE"
            ? "Other details, e.g. 50 users, with installation"
            : "Other details, e.g. 3 VMs, 500 GB storage, 1-year term"
        }
        value={product.details ?? ""}
        onChange={(e) => onDetailsChange(e.target.value)}
      />
    </div>
  );
}
