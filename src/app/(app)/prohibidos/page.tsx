"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  addForbiddenCustom,
  addForbiddenFood,
  addForbiddenGroup,
  deleteForbidden,
  listFoods,
  listForbidden,
  listGroups,
  partitionForbidden,
} from "@/lib/db/repos";
import { useActiveProfileStore } from "@/hooks/useActiveProfile";
import {
  Badge,
  Button,
  Card,
  Input,
  Label,
  Select,
} from "@/components/ui/primitives";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Ban, Plus, Trash2 } from "lucide-react";
import { getGroupColor } from "@/lib/ui/groupColor";

const EMPTY: never[] = [];

export default function ProhibidosPage() {
  const profileId = useActiveProfileStore((s) => s.activeProfileId)!;
  const groups =
    useLiveQuery(() => listGroups(), []) ?? EMPTY;
  const foods = useLiveQuery(() => listFoods(), []) ?? EMPTY;
  const forbidden =
    useLiveQuery(() => listForbidden(profileId), [profileId]) ?? EMPTY;

  const { groupIds, foodIds, customs } = useMemo(
    () => partitionForbidden(forbidden),
    [forbidden],
  );
  const groupById = useMemo(
    () => new Map(groups.map((g) => [g.id, g])),
    [groups],
  );
  const foodById = useMemo(
    () => new Map(foods.map((f) => [f.id, f])),
    [foods],
  );

  const forbiddenGroups = forbidden.filter((it) => it.kind === "group");
  const forbiddenFoods = forbidden.filter((it) => it.kind === "food");

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 px-4 py-5 sm:px-6 sm:py-6">
      <SectionHeader
        title="Alimentos prohibidos"
        subtitle="Veta grupos enteros, alimentos del catálogo o ingredientes que no tengas listados."
        tone="warning"
      />

      {/* ─── Grupos vetados ────────────────────────────── */}
      <Card variant="elevated" className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Grupos</h2>
          <AddGroupForbidden
            profileId={profileId}
            groups={groups.filter((g) => !groupIds.has(g.id))}
          />
        </div>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          Útil para vetar categorías completas (ej. <em>Azúcares</em> en perfiles diabéticos).
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {forbiddenGroups.length === 0 && (
            <li className="text-sm text-[var(--muted-foreground)]">
              Sin grupos vetados.
            </li>
          )}
          {forbiddenGroups.map((it) => {
            const g = it.ref ? groupById.get(it.ref) : undefined;
            const color = it.ref ? getGroupColor(it.ref) : "var(--muted)";
            const label = g?.label ?? "(grupo eliminado)";
            return (
              <li key={it.id}>
                <Badge tone="danger" className="gap-2 pr-1">
                  <span
                    aria-hidden
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span>{label}</span>
                  <button
                    onClick={() => void deleteForbidden(it.id)}
                    aria-label={`Quitar veto a ${label}`}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-[var(--danger)]/15"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </Badge>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* ─── Alimentos vetados ─────────────────────────── */}
      <Card variant="elevated" className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Alimentos</h2>
          <AddFoodForbidden
            profileId={profileId}
            groups={groups}
            foods={foods}
            forbiddenFoodIds={foodIds}
            forbiddenGroupIds={groupIds}
          />
        </div>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          Vetos puntuales del catálogo. Se ocultarán al editar recetas.
        </p>
        <ul className="mt-3 space-y-2">
          {forbiddenFoods.length === 0 && (
            <li className="text-sm text-[var(--muted-foreground)]">
              Sin alimentos vetados.
            </li>
          )}
          {forbiddenFoods.map((it) => {
            const f = it.ref ? foodById.get(it.ref) : undefined;
            const g = f ? groupById.get(f.groupId) : undefined;
            const color = f ? getGroupColor(f.groupId) : "var(--muted)";
            return (
              <li
                key={it.id}
                className="flex items-center justify-between gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card-2)] px-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Ban className="h-4 w-4 shrink-0 text-[var(--danger)]" />
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="truncate font-medium">
                    {f?.name ?? "(alimento eliminado)"}
                  </span>
                  {g && (
                    <span className="text-xs text-[var(--muted-foreground)]">
                      · {g.label}
                    </span>
                  )}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Quitar veto"
                  onClick={() => void deleteForbidden(it.id)}
                  className="text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* ─── Otros (no en catálogo) ────────────────────── */}
      <Card variant="elevated" className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Otros (notas)</h2>
        </div>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          Ingredientes o especias que no están en tus tablas (ej. <em>canela</em>). Se mostrarán como nota global en el plan del día.
        </p>

        <ul className="mt-3 space-y-2">
          {customs.length === 0 && (
            <li>
              <EmptyState
                icon={Ban}
                title="Sin notas"
                description="Agrega ingredientes a evitar que no estén en el catálogo."
              />
            </li>
          )}
          {customs.map((it) => (
            <li
              key={it.id}
              className="flex items-center justify-between gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card-2)] px-3 py-2"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Ban className="h-4 w-4 shrink-0 text-[var(--danger)]" />
                <span className="truncate font-medium">{it.label}</span>
              </span>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Quitar"
                onClick={() => void deleteForbidden(it.id)}
                className="text-[var(--danger)] hover:bg-[var(--danger-soft)]"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>

        <AddCustomForbidden profileId={profileId} />
      </Card>
    </div>
  );
}

// ─── Sub-forms ────────────────────────────────────────────────────────────

function AddGroupForbidden({
  profileId,
  groups,
}: {
  profileId: string;
  groups: { id: string; label: string }[];
}) {
  const [groupId, setGroupId] = useState("");
  const disabled = groups.length === 0;
  return (
    <div className="flex items-center gap-2">
      <Select
        value={groupId}
        onChange={(e) => setGroupId(e.target.value)}
        disabled={disabled}
        className="min-w-40 sm:min-w-52"
        aria-label="Grupo a vetar"
      >
        <option value="" disabled>
          {disabled ? "Sin grupos disponibles" : "Selecciona grupo…"}
        </option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.label}
          </option>
        ))}
      </Select>
      <Button
        size="sm"
        disabled={!groupId}
        onClick={async () => {
          await addForbiddenGroup(profileId, groupId);
          setGroupId("");
        }}
      >
        <Plus className="h-4 w-4" />
        Vetar
      </Button>
    </div>
  );
}

function AddFoodForbidden({
  profileId,
  groups,
  foods,
  forbiddenFoodIds,
  forbiddenGroupIds,
}: {
  profileId: string;
  groups: { id: string; label: string }[];
  foods: { id: string; name: string; groupId: string }[];
  forbiddenFoodIds: Set<string>;
  forbiddenGroupIds: Set<string>;
}) {
  const [groupId, setGroupId] = useState("");
  const [foodId, setFoodId] = useState("");
  const eligibleGroups = groups.filter((g) => !forbiddenGroupIds.has(g.id));
  const eligibleFoods = foods.filter(
    (f) =>
      f.groupId === groupId &&
      !forbiddenFoodIds.has(f.id) &&
      !forbiddenGroupIds.has(f.groupId),
  );
  const disabled = eligibleGroups.length === 0;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={groupId}
        onChange={(e) => {
          setGroupId(e.target.value);
          setFoodId("");
        }}
        disabled={disabled}
        className="min-w-32"
        aria-label="Grupo"
      >
        <option value="" disabled>
          Grupo…
        </option>
        {eligibleGroups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.label}
          </option>
        ))}
      </Select>
      <Select
        value={foodId}
        onChange={(e) => setFoodId(e.target.value)}
        disabled={!groupId || eligibleFoods.length === 0}
        className="min-w-40 sm:min-w-52"
        aria-label="Alimento"
      >
        <option value="" disabled>
          {!groupId
            ? "Alimento…"
            : eligibleFoods.length === 0
              ? "Sin opciones"
              : "Alimento…"}
        </option>
        {eligibleFoods.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </Select>
      <Button
        size="sm"
        disabled={!foodId}
        onClick={async () => {
          await addForbiddenFood(profileId, foodId);
          setFoodId("");
        }}
      >
        <Plus className="h-4 w-4" />
        Vetar
      </Button>
    </div>
  );
}

function AddCustomForbidden({ profileId }: { profileId: string }) {
  const [val, setVal] = useState("");
  return (
    <div className="mt-4 border-t border-[var(--border)] pt-3">
      <Label htmlFor="forb-new">Añadir ingrediente</Label>
      <div className="mt-1 flex gap-2">
        <Input
          id="forb-new"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="Ej. canela, miel, café…"
          onKeyDown={async (e) => {
            if (e.key === "Enter") {
              const ok = await addForbiddenCustom(profileId, val);
              if (ok) setVal("");
            }
          }}
        />
        <Button
          onClick={async () => {
            const ok = await addForbiddenCustom(profileId, val);
            if (ok) setVal("");
          }}
        >
          <Plus className="h-4 w-4" />
          Añadir
        </Button>
      </div>
    </div>
  );
}
