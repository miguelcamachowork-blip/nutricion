"use client";

import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useActiveProfileStore } from "@/hooks/useActiveProfile";
import {
  createProfile,
  deleteProfile,
  exportCatalog,
  exportPlan,
  exportRecipes,
  importCatalog,
  importPlan,
  importRecipes,
  listProfiles,
  renameProfile,
} from "@/lib/db/repos";
import { getDB } from "@/lib/db/database";
import { Button, Card, Input, Badge } from "@/components/ui/primitives";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { getProfileAvatarColor, getInitials } from "@/lib/ui/groupColor";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Download,
  LogOut,
  Pencil,
  Trash2,
  Upload,
  UserPlus,
} from "lucide-react";
import { uid } from "@/lib/utils";

export default function AjustesPage() {
  const profiles = useLiveQuery(() => listProfiles(), []) ?? [];
  const { activeProfileId, setActive } = useActiveProfileStore();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-5 sm:px-6 sm:py-6">
      <SectionHeader
        title="Ajustes"
        subtitle="Administra perfiles y respaldos."
        tone="neutral"
      />

      {/* Profiles */}
      <Card variant="elevated" className="p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Perfiles</div>
          <Dialog open={creating} onOpenChange={setCreating}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <UserPlus className="h-4 w-4" />
                Nuevo
              </Button>
            </DialogTrigger>
            <DialogContent title="Nuevo perfil">
              <div className="space-y-3">
                <Input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nombre"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setCreating(false)}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={async () => {
                      const p = await createProfile(newName || "Perfil");
                      setNewName("");
                      setCreating(false);
                      setActive(p.id);
                    }}
                  >
                    Crear
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {profiles.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-2.5"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white shadow-sm"
                  style={{ backgroundColor: getProfileAvatarColor(p.id) }}
                  aria-hidden
                >
                  {getInitials(p.name)}
                </div>
                <div className="min-w-0">
                  <div className="truncate font-medium">{p.name}</div>
                  {p.id === activeProfileId && (
                    <Badge tone="ok" className="mt-0.5">
                      activo
                    </Badge>
                  )}
                </div>
              </div>
              <ProfileActions
                id={p.id}
                name={p.name}
                isActive={p.id === activeProfileId}
              />
            </li>
          ))}
        </ul>
      </Card>

      {/* Per-section export/import */}
      {activeProfileId && (
        <Card variant="elevated" className="p-4 sm:p-5">
          <div className="font-semibold mb-1">Importar / Exportar</div>
          <p className="text-sm text-[var(--muted-foreground)] mb-3">
            Trabaja sobre el perfil activo. Importar reemplaza la sección
            correspondiente.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <SectionIO
              title="Catálogo"
              description="Grupos, alimentos, unidades y cantidades."
              onExport={() => exportCatalog(activeProfileId)}
              onImport={(data) => importCatalog(activeProfileId, data)}
              filename="catalogo"
            />
            <SectionIO
              title="Plan"
              description="Horarios y porciones por grupo."
              onExport={() => exportPlan(activeProfileId)}
              onImport={(data) => importPlan(activeProfileId, data)}
              filename="plan"
            />
            <SectionIO
              title="Recetas"
              description="Recetas vigentes (la versión actual)."
              onExport={() => exportRecipes(activeProfileId)}
              onImport={(data) => importRecipes(activeProfileId, data)}
              filename="recetas"
            />
          </div>
        </Card>
      )}

      {/* Full backup */}
      <Card variant="elevated" className="p-4 sm:p-5">
        <div className="font-semibold mb-1">Respaldo completo</div>
        <p className="text-sm text-[var(--muted-foreground)]">
          Exporta absolutamente toda la base local (todos los perfiles).
        </p>
        <div className="mt-3">
          <Button variant="outline" onClick={exportAll}>
            <Download className="h-4 w-4" />
            Exportar todo (JSON)
          </Button>
        </div>
      </Card>

      {/* Session */}
      <Card variant="elevated" className="p-4 sm:p-5">
        <div className="font-semibold mb-2">Sesión</div>
        <Button variant="outline" onClick={() => setActive(null)}>
          <LogOut className="h-4 w-4" />
          Cambiar de perfil
        </Button>
      </Card>
    </div>
  );
}

function ProfileActions({
  id,
  name,
  isActive,
}: {
  id: string;
  name: string;
  isActive: boolean;
}) {
  const [renaming, setRenaming] = useState(false);
  const [val, setVal] = useState(name);
  const setActive = useActiveProfileStore((s) => s.setActive);
  return (
    <div className="flex items-center gap-1">
      {!isActive && (
        <Button size="sm" variant="ghost" onClick={() => setActive(id)}>
          Activar
        </Button>
      )}
      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogTrigger asChild>
          <Button size="icon" variant="ghost" aria-label="Renombrar">
            <Pencil className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent title="Renombrar perfil">
          <div className="space-y-3">
            <Input value={val} onChange={(e) => setVal(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRenaming(false)}>
                Cancelar
              </Button>
              <Button
                onClick={async () => {
                  await renameProfile(id, val.trim() || name);
                  setRenaming(false);
                }}
              >
                Guardar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Eliminar"
        className="text-[var(--danger)] hover:bg-[var(--danger-soft)]"
        onClick={async () => {
          if (
            confirm(
              `¿Eliminar perfil "${name}"? Se borran su catálogo, plan, recetas e histórico.`,
            )
          ) {
            if (isActive) setActive(null);
            await deleteProfile(id);
          }
        }}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

function SectionIO<T>({
  title,
  description,
  onExport,
  onImport,
  filename,
}: {
  title: string;
  description: string;
  onExport: () => Promise<T>;
  onImport: (data: T) => Promise<void>;
  filename: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card-2)] p-3">
      <div className="font-semibold">{title}</div>
      <div className="text-xs text-[var(--muted-foreground)]">
        {description}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            const data = await onExport();
            downloadJSON(data, filename);
          }}
        >
          <Download className="h-4 w-4" />
          Exportar
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => fileRef.current?.click()}
        >
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
            try {
              const text = await file.text();
              const parsed = JSON.parse(text) as T;
              if (
                !confirm(
                  `Esto reemplazará "${title.toLowerCase()}" del perfil activo. ¿Continuar?`,
                )
              )
                return;
              await onImport(parsed);
              alert("Importado correctamente.");
            } catch (err) {
              alert((err as Error).message || "Error al importar.");
            }
          }}
        />
      </div>
    </div>
  );
}

function downloadJSON(data: unknown, prefix: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${prefix}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportAll() {
  const db = getDB();
  const data = {
    version: 3,
    exportedAt: new Date().toISOString(),
    profiles: await db.profiles.toArray(),
    groups: await db.groups.toArray(),
    foods: await db.foods.toArray(),
    meals: await db.meals.toArray(),
    planCells: await db.planCells.toArray(),
    recipes: await db.recipes.toArray(),
    unitTypes: await db.unitTypes.toArray(),
    quantityOptions: await db.quantityOptions.toArray(),
    planSnapshots: await db.planSnapshots.toArray(),
    recipeSnapshots: await db.recipeSnapshots.toArray(),
  };
  downloadJSON(data, "nutricion-mcz");
}

// Suppress unused re-export
void uid;
