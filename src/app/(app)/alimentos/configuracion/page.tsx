"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import {
  addQuantity,
  addUnit,
  deleteQuantity,
  deleteUnit,
  listQuantities,
  listUnits,
  renameUnit,
} from "@/lib/db/repos";
import { useActiveProfileStore } from "@/hooks/useActiveProfile";
import { Button, Card, Input, Label } from "@/components/ui/primitives";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { formatPortion } from "@/lib/balance";

export default function ConfiguracionPage() {
  const profileId = useActiveProfileStore((s) => s.activeProfileId)!;
  const units = useLiveQuery(() => listUnits(profileId), [profileId]) ?? [];
  const quantities =
    useLiveQuery(() => listQuantities(profileId), [profileId]) ?? [];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 px-4 py-5 sm:px-6 sm:py-6">
      <div className="flex items-center gap-2">
        <Link href="/alimentos">
          <Button size="icon" variant="ghost" aria-label="Volver">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Unidades y cantidades</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Catálogos globales que se usan en toda la tabla de alimentos.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <UnitsCard
          profileId={profileId}
          units={units}
        />
        <QuantitiesCard
          profileId={profileId}
          quantities={quantities}
        />
      </div>
    </div>
  );
}

function UnitsCard({
  profileId,
  units,
}: {
  profileId: string;
  units: { id: string; label: string }[];
}) {
  const [newLabel, setNewLabel] = useState("");
  return (
    <Card variant="elevated" className="p-4 sm:p-5">
      <h2 className="text-lg font-semibold">Unidades</h2>
      <p className="text-xs text-[var(--muted-foreground)]">
        Ej. Piezas, Cucharadas, Mililitros…
      </p>

      <ul className="mt-3 space-y-2">
        {units.length === 0 && (
          <li className="text-sm text-[var(--muted-foreground)]">
            Sin unidades. Añade la primera.
          </li>
        )}
        {units.map((u) => (
          <li key={u.id} className="flex items-center gap-2">
            <Input
              defaultValue={u.label}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== u.label) void renameUnit(u.id, v);
              }}
            />
            <Button
              size="icon"
              variant="ghost"
              aria-label="Eliminar unidad"
              onClick={async () => {
                try {
                  await deleteUnit(u.id);
                } catch (err) {
                  alert((err as Error).message);
                }
              }}
            >
              <Trash2 className="h-4 w-4 text-[var(--color-danger)]" />
            </Button>
          </li>
        ))}
      </ul>

      <div className="mt-4 border-t border-[var(--color-border)] pt-3">
        <Label htmlFor="new-unit">Nueva unidad</Label>
        <div className="mt-1 flex gap-2">
          <Input
            id="new-unit"
            placeholder='Ej. "Cucharadas"'
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === "Enter" && newLabel.trim()) {
                await addUnit(profileId, newLabel.trim());
                setNewLabel("");
              }
            }}
          />
          <Button
            onClick={async () => {
              if (!newLabel.trim()) return;
              await addUnit(profileId, newLabel.trim());
              setNewLabel("");
            }}
          >
            <Plus className="h-4 w-4" />
            Añadir
          </Button>
        </div>
      </div>
    </Card>
  );
}

function QuantitiesCard({
  profileId,
  quantities,
}: {
  profileId: string;
  quantities: { id: string; value: number }[];
}) {
  const [newValue, setNewValue] = useState<string>("");
  return (
    <Card variant="elevated" className="p-4 sm:p-5">
      <h2 className="text-lg font-semibold">Cantidades</h2>
      <p className="text-xs text-[var(--muted-foreground)]">
        Valores numéricos seleccionables (¼, ⅓, ⅔, ⅛, etc). Puedes escribir decimales o pegar fracciones.
      </p>

      <ul className="mt-3 space-y-2">
        {quantities.length === 0 && (
          <li className="text-sm text-[var(--muted-foreground)]">
            Sin cantidades. Añade la primera.
          </li>
        )}
        {quantities.map((q) => (
          <li
            key={q.id}
            className="flex items-center justify-between gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card-2)] px-3 py-2"
          >
            <span className="font-medium tabular-nums">
              {formatPortion(q.value)}
            </span>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Eliminar cantidad"
              className="text-[var(--danger)] hover:bg-[var(--danger-soft)]"
              onClick={async () => {
                try {
                  await deleteQuantity(q.id);
                } catch (err) {
                  alert((err as Error).message);
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>

      <div className="mt-4 border-t border-[var(--border)] pt-3">
        <Label htmlFor="new-qty">Nueva cantidad</Label>
        <div className="mt-1 flex gap-2">
          <Input
            id="new-qty"
            type="number"
            step="any"
            min="0.01"
            placeholder="Ej. 0.5, 0.333, 0.125 (¼, ⅓, ⅛)"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === "Enter") await handleAdd();
            }}
          />
          <Button onClick={handleAdd}>
            <Plus className="h-4 w-4" />
            Añadir
          </Button>
        </div>
      </div>
    </Card>
  );

  async function handleAdd() {
    const raw = Number(newValue.replace(",", "."));
    if (!Number.isFinite(raw) || raw <= 0) return;
    await addQuantity(profileId, raw);
    setNewValue("");
  }
}
