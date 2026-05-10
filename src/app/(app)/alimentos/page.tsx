"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  addFood,
  addGroup,
  deleteFood,
  deleteGroup,
  exportCatalog,
  importCatalog,
  listFoods,
  listForbidden,
  listGroups,
  listQuantities,
  listUnits,
  partitionForbidden,
  renameGroup,
  updateFood,
  updateGroupNote,
} from "@/lib/db/repos";
import { useActiveProfileStore } from "@/hooks/useActiveProfile";
import { Button, Card, Input, Label, Select } from "@/components/ui/primitives";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Ban, Lock, LockOpen, Pencil, Plus, Search, Settings2, StickyNote, Trash2, X, Download, Upload } from "lucide-react";
import { cn, normalizeText, compareNames } from "@/lib/utils";
import { formatPortion } from "@/lib/balance";
import { getGroupColor } from "@/lib/ui/groupColor";
import Link from "next/link";

const EMPTY: never[] = [];

export default function AlimentosPage() {
  const profileId = useActiveProfileStore((s) => s.activeProfileId)!;
  const groups =
    useLiveQuery(() => listGroups(), []) ?? EMPTY;
  const foods = useLiveQuery(() => listFoods(), []) ?? EMPTY;
  const units = useLiveQuery(() => listUnits(), []) ?? EMPTY;
  const quantities =
    useLiveQuery(() => listQuantities(), []) ?? EMPTY;
  const forbidden =
    useLiveQuery(() => listForbidden(profileId), [profileId]) ?? EMPTY;
  const { groupIds: forbiddenGroupIds, foodIds: forbiddenFoodIds } = useMemo(
    () => partitionForbidden(forbidden),
    [forbidden],
  );
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const tabId = activeTab ?? groups[0]?.id ?? null;

  // Auto-focus the search input when it opens.
  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  const filtered = useMemo(() => {
    const inGroup = foods
      .filter((f) => f.groupId === tabId)
      .slice()
      .sort((a, b) => compareNames(a.name, b.name));
    const q = normalizeText(search).trim();
    if (!q) return inGroup;
    return inGroup.filter((f) => normalizeText(f.name).includes(q));
  }, [foods, tabId, search]);

  const activeColor = tabId ? getGroupColor(tabId) : "var(--primary)";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-5 sm:px-6 sm:py-6">
      <SectionHeader
        title="Tabla de Alimentos"
        subtitle="Tu catálogo personal organizado por grupos."
        tone="info"
        actions={
          <>
            <Link href="/alimentos/configuracion">
              <Button variant="outline" size="sm">
                <Settings2 className="h-4 w-4" />
                <span className="hidden sm:inline">Unidades y cantidades</span>
                <span className="sm:hidden">Config</span>
              </Button>
            </Link>
            <CatalogIO profileId={profileId} />
            <AddGroupDialog profileId={profileId} />
          </>
        }
      />

      <div className="flex flex-wrap gap-1.5">
        {groups.map((g) => {
          const color = getGroupColor(g.id);
          const active = tabId === g.id;
          return (
            <button
              key={g.id}
              onClick={() => {
                setActiveTab(g.id);
                setSearch("");
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all",
                active
                  ? "border-transparent text-white shadow-sm"
                  : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--border-strong)] hover:bg-[var(--muted)]",
              )}
              style={active ? { backgroundColor: color } : undefined}
            >
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{
                  backgroundColor: active ? "rgba(255,255,255,0.85)" : color,
                }}
              />
              {g.label}
            </button>
          );
        })}
      </div>

      {tabId && (
        <Card
          variant="elevated"
          className="p-4 border-t-4"
          style={{ borderTopColor: activeColor }}
        >
          <div className="flex items-center justify-between gap-2">
            <GroupHeader
              groupId={tabId}
              label={groups.find((g) => g.id === tabId)?.label ?? ""}
              note={groups.find((g) => g.id === tabId)?.note}
              isBuiltIn={
                !(groups.find((g) => g.id === tabId)?.removable ?? false)
              }
              onDeleted={() => setActiveTab(null)}
            />
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                aria-label={searchOpen ? "Cerrar búsqueda" : "Buscar alimento"}
                onClick={() => {
                  setSearchOpen((v) => {
                    if (v) setSearch("");
                    return !v;
                  });
                }}
              >
                {searchOpen ? (
                  <X className="h-4 w-4" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
              <AddFoodDialog
                profileId={profileId}
                groupId={tabId}
                units={units}
                quantities={quantities}
              />
            </div>
          </div>

          {searchOpen && (
            <div className="mt-3">
              <Input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar alimento (ej. “broc” → Brócoli, Gérmen de brócoli…)"
              />
            </div>
          )}

          {(units.length === 0 || quantities.length === 0) && (
            <div className="mt-3 rounded-lg border border-[var(--color-warning)]/30 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm">
              Necesitas configurar al menos una unidad y una cantidad antes de
              añadir alimentos.{" "}
              <Link
                href="/alimentos/configuracion"
                className="underline font-medium"
              >
                Ir a configuración
              </Link>
              .
            </div>
          )}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-[var(--color-muted-foreground)]">
                <tr>
                  <th className="py-2 pr-2 font-medium w-10"></th>
                  <th className="py-2 pr-3 font-medium">Alimento</th>
                  <th className="py-2 pr-3 font-medium w-24 sm:w-32 md:w-40">Unidad</th>
                  <th className="py-2 pr-3 font-medium w-20 sm:w-24 md:w-32">Cantidad</th>
                  <th className="py-2 pr-3 font-medium w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-6 text-center text-[var(--color-muted-foreground)]"
                    >
                      {search.trim()
                        ? `Ningún alimento de este grupo coincide con “${search}”.`
                        : "Sin alimentos. Añade el primero."}
                    </td>
                  </tr>
                )}
                {filtered.map((f) => {
                  const rowLocked = !!f.locked;
                  return (
                  <tr key={f.id}>
                    <td className="py-2 pr-2 text-center">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={
                          rowLocked
                            ? "Desbloquear alimento"
                            : "Bloquear alimento"
                        }
                        title={
                          rowLocked
                            ? "Bloqueado: pulsa para permitir editar y borrar"
                            : "Desbloqueado: pulsa para evitar cambios accidentales"
                        }
                        onClick={() =>
                          void updateFood(f.id, { locked: !rowLocked })
                        }
                      >
                        {rowLocked ? (
                          <Lock className="h-4 w-4 text-[var(--color-primary)]" />
                        ) : (
                          <LockOpen className="h-4 w-4 text-[var(--color-muted-foreground)]" />
                        )}
                      </Button>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        {(forbiddenFoodIds.has(f.id) ||
                          forbiddenGroupIds.has(f.groupId)) && (
                          <Ban
                            className="h-4 w-4 shrink-0 text-[var(--danger)]"
                            aria-label="Prohibido"
                          />
                        )}
                        <Input
                          defaultValue={f.name}
                          readOnly={rowLocked}
                          onBlur={(e) => {
                            if (rowLocked) return;
                            const v = e.target.value.trim();
                            if (v && v !== f.name)
                              void updateFood(f.id, { name: v });
                          }}
                        />
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <Select
                        value={f.unitId}
                        disabled={rowLocked}
                        onChange={(e) =>
                          void updateFood(f.id, { unitId: e.target.value })
                        }
                      >
                        {units.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.label}
                          </option>
                        ))}
                        {!units.find((u) => u.id === f.unitId) && (
                          <option value={f.unitId} disabled>
                            (eliminada)
                          </option>
                        )}
                      </Select>
                    </td>
                    <td className="py-2 pr-3">
                      <Select
                        value={String(f.quantity)}
                        disabled={rowLocked}
                        onChange={(e) =>
                          void updateFood(f.id, {
                            quantity: Number(e.target.value),
                          })
                        }
                      >
                        {quantities.map((q) => (
                          <option key={q.id} value={String(q.value)}>
                            {formatPortion(q.value)}
                          </option>
                        ))}
                        {!quantities.find((q) => q.value === f.quantity) && (
                          <option value={String(f.quantity)} disabled>
                            {formatPortion(f.quantity)}
                          </option>
                        )}
                      </Select>
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={rowLocked}
                        onClick={() => void deleteFood(f.id)}
                        aria-label="Eliminar alimento"
                      >
                        <Trash2 className="h-4 w-4 text-[var(--color-danger)]" />
                      </Button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function GroupHeader({
  groupId,
  label,
  note,
  isBuiltIn,
  onDeleted,
}: {
  groupId: string;
  label: string;
  note?: string;
  isBuiltIn: boolean;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(label);
  const [noteEditing, setNoteEditing] = useState(false);
  const [noteVal, setNoteVal] = useState(note ?? "");
  return (
    <div className="flex flex-1 flex-col gap-1 min-w-0">
      <div className="flex items-center gap-1">
        <h2 className="text-lg font-semibold">{label}</h2>
        <Dialog open={editing} onOpenChange={setEditing}>
          <DialogTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Renombrar grupo"
              onClick={() => setVal(label)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent title="Renombrar grupo">
            <div className="space-y-3">
              <Input value={val} onChange={(e) => setVal(e.target.value)} />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEditing(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={async () => {
                    await renameGroup(groupId, val.trim() || label);
                    setEditing(false);
                  }}
                >
                  Guardar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog
          open={noteEditing}
          onOpenChange={(v) => {
            setNoteEditing(v);
            if (v) setNoteVal(note ?? "");
          }}
        >
          <DialogTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              aria-label={note ? "Editar nota del grupo" : "Añadir nota al grupo"}
              title={note ? "Editar nota" : "Añadir nota"}
            >
              <StickyNote
                className={cn(
                  "h-4 w-4",
                  note ? "text-[var(--primary)]" : "",
                )}
              />
            </Button>
          </DialogTrigger>
          <DialogContent title="Nota del grupo">
            <div className="space-y-3">
              <p className="text-xs text-[var(--muted-foreground)]">
                Esta nota aparecerá bajo el grupo y como pie en las recetas
                donde se use este grupo.
              </p>
              <textarea
                className={cn(
                  "min-h-32 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-sm",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]",
                )}
                value={noteVal}
                onChange={(e) => setNoteVal(e.target.value)}
                placeholder="Ej. Los alimentos de origen animal se pesan en cocido…"
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setNoteEditing(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={async () => {
                    await updateGroupNote(groupId, noteVal);
                    setNoteEditing(false);
                  }}
                >
                  Guardar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        {(
          <Button
            size="icon"
            variant="ghost"
            aria-label="Eliminar grupo"
            onClick={async () => {
              const warning = isBuiltIn
                ? `Eliminar grupo "${label}" (predeterminado)? Tú eres responsable: también se borran sus alimentos y porciones del plan, y la app no lo volverá a crear automáticamente.`
                : `Eliminar grupo "${label}"? También se borran sus alimentos y porciones del plan.`;
              if (confirm(warning)) {
                await deleteGroup(groupId);
                onDeleted();
              }
            }}
          >
            <Trash2 className="h-4 w-4 text-[var(--color-danger)]" />
          </Button>
        )}
      </div>
      {note && (
        <p className="whitespace-pre-wrap text-xs leading-relaxed text-[var(--muted-foreground)]">
          {note}
        </p>
      )}
    </div>
  );
}

function AddGroupDialog({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="h-4 w-4" />
          Grupo
        </Button>
      </DialogTrigger>
      <DialogContent title="Nuevo grupo">
        <div className="space-y-3">
          <div>
            <Label htmlFor="gname">Nombre</Label>
            <Input
              id="gname"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                if (!name.trim()) return;
                await addGroup(name.trim());
                setName("");
                setOpen(false);
              }}
            >
              Crear
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddFoodDialog({
  profileId,
  groupId,
  units,
  quantities,
}: {
  profileId: string;
  groupId: string;
  units: { id: string; label: string }[];
  quantities: { id: string; value: number }[];
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [unitId, setUnitId] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("");
  const disabled = units.length === 0 || quantities.length === 0;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled}>
          <Plus className="h-4 w-4" />
          Alimento
        </Button>
      </DialogTrigger>
      <DialogContent title="Nuevo alimento">
        <div className="space-y-3">
          <div>
            <Label htmlFor="fname">Nombre</Label>
            <Input
              id="fname"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="funit">Unidad</Label>
              <Select
                id="funit"
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                className="mt-1"
              >
                <option value="" disabled>
                  Selecciona…
                </option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="fqty">Cantidad por porción</Label>
              <Select
                id="fqty"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="mt-1"
              >
                <option value="" disabled>
                  Selecciona…
                </option>
                {quantities.map((q) => (
                  <option key={q.id} value={String(q.value)}>
                    {formatPortion(q.value)}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                if (!name.trim() || !unitId || !quantity) return;
                await addFood(
                  groupId,
                  name.trim(),
                  unitId,
                  Number(quantity),
                );
                setName("");
                setUnitId("");
                setQuantity("");
                setOpen(false);
              }}
            >
              Crear
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


function CatalogIO({ profileId }: { profileId: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button
        variant="outline"
        onClick={async () => {
          const data = await exportCatalog();
          const blob = new Blob([JSON.stringify(data, null, 2)], {
            type: "application/json",
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `catalogo-${new Date().toISOString().slice(0, 10)}.json`;
          a.click();
          URL.revokeObjectURL(url);
        }}
      >
        <Download className="h-4 w-4" />
        Exportar
      </Button>
      <Button variant="outline" onClick={() => fileRef.current?.click()}>
        <Upload className="h-4 w-4" />
        Importar
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          if (
            !confirm(
              "Esto reemplazar� el cat�logo completo del perfil activo. �Continuar?",
            )
          )
            return;
          try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            await importCatalog(parsed);
            alert("Cat�logo importado.");
          } catch (err) {
            alert((err as Error).message || "Error al importar.");
          }
        }}
      />
    </>
  );
}
