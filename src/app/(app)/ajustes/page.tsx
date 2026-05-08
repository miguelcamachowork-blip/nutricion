"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useActiveProfileStore } from "@/hooks/useActiveProfile";
import {
  backupCounts,
  createProfile,
  deleteProfile,
  exportAllData,
  exportCatalog,
  exportPlan,
  exportRecipes,
  importAllData,
  importCatalog,
  importPlan,
  importRecipes,
  listProfiles,
  renameProfile,
  type FullBackup,
  type ImportMode,
} from "@/lib/db/repos";
import { Button, Card, Input, Badge } from "@/components/ui/primitives";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { getProfileAvatarColor, getInitials } from "@/lib/ui/groupColor";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Database,
  Download,
  FolderOpen,
  HardDrive,
  LogOut,
  Pencil,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  UserPlus,
} from "lucide-react";
import { uid } from "@/lib/utils";
import {
  getStorageStatus,
  requestPersistentStorage,
  type StorageStatus,
} from "@/lib/storage/persist";
import {
  openBackupFile,
  saveBackupFile,
  suggestBackupFilename,
  type SaveResult,
} from "@/lib/storage/fileIO";
import {
  createAutoBackupNow,
  deleteAutoBackup,
  getAutoBackupPayload,
  restoreAutoBackup,
  useAutoBackups,
  type AutoBackupSummary,
} from "@/lib/storage/autoBackup";

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

      {/* Storage durability */}
      <StorageCard />

      {/* Full backup file (save / restore) */}
      <FullBackupCard
        activeProfileName={
          profiles.find((p) => p.id === activeProfileId)?.name ?? null
        }
      />

      {/* Auto-backups (rolling, in-app) */}
      <AutoBackupsCard
        activeProfileName={
          profiles.find((p) => p.id === activeProfileId)?.name ?? null
        }
      />

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

// ─── Full backup card ─────────────────────────────────────────────────────

function FullBackupCard({ activeProfileName }: { activeProfileName: string | null }) {
  const [busy, setBusy] = useState<"save" | "restore" | null>(null);
  const [pending, setPending] = useState<FullBackup | null>(null);
  const [mode, setMode] = useState<ImportMode>("replace");
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleSave() {
    if (busy) return;
    setBusy("save");
    setFeedback(null);
    try {
      const data = await exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const result = await saveBackupFile(blob, {
        suggestedName: suggestBackupFilename(activeProfileName),
      });
      setFeedback(formatSaveResult(result));
    } catch (err) {
      setFeedback((err as Error).message || "No se pudo guardar el respaldo.");
    } finally {
      setBusy(null);
    }
  }

  async function handlePickFile() {
    if (busy) return;
    setBusy("restore");
    setFeedback(null);
    try {
      const file = await openBackupFile();
      if (!file) {
        setBusy(null);
        return;
      }
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      // Validate by importing-as-replace into nothing first? Simpler: rely on
      // assertFullBackup inside importAllData. We pre-validate here so the
      // confirmation dialog only appears for valid backups.
      const repos = await import("@/lib/db/repos");
      const assertFn: (v: unknown) => asserts v is FullBackup =
        repos.assertFullBackup;
      assertFn(parsed);
      setPending(parsed);
      setMode("replace");
    } catch (err) {
      setFeedback((err as Error).message || "No se pudo leer el archivo.");
    } finally {
      setBusy(null);
    }
  }

  async function confirmImport() {
    if (!pending) return;
    setBusy("restore");
    try {
      const counts = await importAllData(pending, { mode });
      setPending(null);
      setFeedback(
        `Restauración completada: ${counts.profiles} perfiles, ${counts.foods} alimentos, ${counts.recipes} recetas.`,
      );
    } catch (err) {
      setFeedback((err as Error).message || "Error al restaurar.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card variant="elevated" className="p-4 sm:p-5">
      <div className="flex items-center gap-2 font-semibold">
        <ShieldCheck className="h-4 w-4 text-[var(--primary)]" />
        Respaldo completo
      </div>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Guarda un archivo con TODOS los perfiles, alimentos, plan y recetas
        (sin histórico). Puedes llevarlo a otro dispositivo y restaurarlo.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={handleSave} disabled={busy !== null}>
          <Save className="h-4 w-4" />
          {busy === "save" ? "Guardando…" : "Guardar archivo…"}
        </Button>
        <Button
          variant="outline"
          onClick={handlePickFile}
          disabled={busy !== null}
        >
          <FolderOpen className="h-4 w-4" />
          Restaurar desde archivo…
        </Button>
      </div>

      {feedback && (
        <p className="mt-3 text-xs text-[var(--muted-foreground)]">{feedback}</p>
      )}

      <p className="mt-3 text-[11px] text-[var(--muted-foreground)]">
        En iPhone/iPad se abrirá la hoja de compartir (AirDrop, Archivos,
        Mail). En desktop podrás elegir la carpeta directamente.
      </p>

      <Dialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
      >
        <DialogContent
          title="Restaurar respaldo"
          description="Revisa el contenido antes de aplicar."
        >
          {pending && <ImportPreview data={pending} mode={mode} setMode={setMode} />}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmImport} disabled={busy === "restore"}>
              {busy === "restore" ? "Restaurando…" : "Restaurar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ImportPreview({
  data,
  mode,
  setMode,
}: {
  data: FullBackup;
  mode: ImportMode;
  setMode: (m: ImportMode) => void;
}) {
  const c = backupCounts(data);
  const exported = (() => {
    try {
      return new Date(data.exportedAt).toLocaleString();
    } catch {
      return data.exportedAt;
    }
  })();
  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card-2)] p-3">
        <div className="text-xs text-[var(--muted-foreground)]">
          Generado el
        </div>
        <div className="font-medium">{exported}</div>
        <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <li>Perfiles: <b>{c.profiles}</b></li>
          <li>Grupos: <b>{c.groups}</b></li>
          <li>Alimentos: <b>{c.foods}</b></li>
          <li>Comidas: <b>{c.meals}</b></li>
          <li>Celdas de plan: <b>{c.planCells}</b></li>
          <li>Recetas: <b>{c.recipes}</b></li>
          <li>Unidades: <b>{c.unitTypes}</b></li>
          <li>Cantidades: <b>{c.quantityOptions}</b></li>
        </ul>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-xs text-[var(--muted-foreground)]">Modo</legend>
        <label className="flex items-start gap-2">
          <input
            type="radio"
            name="import-mode"
            checked={mode === "replace"}
            onChange={() => setMode("replace")}
            className="mt-1"
          />
          <span>
            <b>Reemplazar</b> — borra los datos actuales (perfiles, alimentos,
            plan y recetas) y los sustituye por los del archivo. El histórico
            local del dispositivo se conserva.
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input
            type="radio"
            name="import-mode"
            checked={mode === "merge"}
            onChange={() => setMode("merge")}
            className="mt-1"
          />
          <span>
            <b>Combinar</b> — añade lo nuevo y actualiza coincidencias por id
            (lo del archivo gana). No borra nada.
          </span>
        </label>
      </fieldset>
    </div>
  );
}

function formatSaveResult(r: SaveResult): string {
  switch (r.kind) {
    case "saved-to-folder":
      return `Guardado como "${r.name}".`;
    case "shared":
      return "Compartido. Elige dónde guardarlo (AirDrop, Archivos, Mail).";
    case "downloaded":
      return `Descargado como "${r.name}" (revisa la carpeta de Descargas).`;
    case "cancelled":
      return "Operación cancelada.";
  }
}

// ─── Storage durability card ──────────────────────────────────────────────

function StorageCard() {
  const [status, setStatus] = useState<StorageStatus | null>(null);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    let alive = true;
    getStorageStatus().then((s) => {
      if (alive) setStatus(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function handleRequest() {
    setRequesting(true);
    try {
      const s = await requestPersistentStorage();
      setStatus(s);
    } finally {
      setRequesting(false);
    }
  }

  return (
    <Card variant="elevated" className="p-4 sm:p-5">
      <div className="flex items-center gap-2 font-semibold">
        <HardDrive className="h-4 w-4 text-[var(--primary)]" />
        Almacenamiento
      </div>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Tus datos viven en este dispositivo. Pídele al navegador que NO los
        borre por inactividad.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card-2)] p-3">
          <div className="text-xs text-[var(--muted-foreground)]">Estado</div>
          {status === null ? (
            <div className="font-medium">Comprobando…</div>
          ) : !status.supported ? (
            <Badge tone="warn">No soportado</Badge>
          ) : status.persisted ? (
            <Badge tone="ok">Persistente</Badge>
          ) : (
            <Badge tone="warn">Volátil</Badge>
          )}
        </div>
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card-2)] p-3">
          <div className="text-xs text-[var(--muted-foreground)]">Uso</div>
          <div className="font-medium">{formatUsage(status)}</div>
        </div>
      </div>
      {status && status.supported && !status.persisted && (
        <div className="mt-3">
          <Button
            variant="outline"
            onClick={handleRequest}
            disabled={requesting}
          >
            <Database className="h-4 w-4" />
            {requesting ? "Solicitando…" : "Solicitar almacenamiento persistente"}
          </Button>
          <p className="mt-2 text-[11px] text-[var(--muted-foreground)]">
            En iPhone/iPad: agrega la app a la pantalla de inicio (Compartir →
            Agregar a inicio) para mejorar las probabilidades de que se
            conceda.
          </p>
        </div>
      )}
    </Card>
  );
}

function formatUsage(s: StorageStatus | null): string {
  if (!s || !s.supported) return "—";
  if (s.usage === undefined) return "—";
  const mb = s.usage / (1024 * 1024);
  const quotaMb = s.quota ? s.quota / (1024 * 1024) : null;
  const used = mb < 1 ? `${(mb * 1024).toFixed(0)} KB` : `${mb.toFixed(1)} MB`;
  if (quotaMb && quotaMb > 0) {
    const pct = ((s.usage! / s.quota!) * 100).toFixed(1);
    return `${used} (${pct}%)`;
  }
  return used;
}

// Suppress unused re-export
void uid;

// ─── Auto-backup card ─────────────────────────────────────────────────────

function AutoBackupsCard({
  activeProfileName,
}: {
  activeProfileName: string | null;
}) {
  const backups = useAutoBackups();
  const [busy, setBusy] = useState<string | "create" | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleCreate() {
    setBusy("create");
    setFeedback(null);
    try {
      await createAutoBackupNow();
      setFeedback("Respaldo automático generado.");
    } catch (err) {
      setFeedback((err as Error).message || "No se pudo generar el respaldo.");
    } finally {
      setBusy(null);
    }
  }

  async function handleDownload(b: AutoBackupSummary) {
    setBusy(b.id);
    setFeedback(null);
    try {
      const data = await getAutoBackupPayload(b.id);
      if (!data) throw new Error("Respaldo no encontrado.");
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const result = await saveBackupFile(blob, {
        suggestedName: suggestBackupFilename(activeProfileName),
      });
      setFeedback(formatSaveResult(result));
    } catch (err) {
      setFeedback((err as Error).message || "Error al descargar.");
    } finally {
      setBusy(null);
    }
  }

  async function handleRestore(b: AutoBackupSummary) {
    if (
      !confirm(
        "Esto reemplazará perfiles, alimentos, plan y recetas con los del respaldo. ¿Continuar?",
      )
    )
      return;
    setBusy(b.id);
    setFeedback(null);
    try {
      const counts = await restoreAutoBackup(b.id, "replace");
      setFeedback(
        `Restaurado: ${counts.profiles} perfiles, ${counts.foods} alimentos, ${counts.recipes} recetas.`,
      );
    } catch (err) {
      setFeedback((err as Error).message || "Error al restaurar.");
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(b: AutoBackupSummary) {
    if (!confirm("¿Eliminar este respaldo automático?")) return;
    setBusy(b.id);
    try {
      await deleteAutoBackup(b.id);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card variant="elevated" className="p-4 sm:p-5">
      <div className="flex items-center gap-2 font-semibold">
        <Database className="h-4 w-4 text-[var(--primary)]" />
        Respaldos automáticos
      </div>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        La app guarda hasta 7 respaldos diarios dentro del dispositivo. Puedes
        descargarlos a un archivo o restaurar alguno.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCreate}
          disabled={busy !== null}
        >
          <Save className="h-4 w-4" />
          {busy === "create" ? "Generando…" : "Generar ahora"}
        </Button>
        <span className="text-xs text-[var(--muted-foreground)]">
          {backups === undefined
            ? "Cargando…"
            : backups.length === 0
              ? "Aún no hay respaldos."
              : `Último: ${formatRelative(backups[0].createdAt)}`}
        </span>
      </div>

      {backups && backups.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {backups.map((b) => (
            <li
              key={b.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card-2)] p-2.5"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium">
                  {new Date(b.createdAt).toLocaleString()}
                </div>
                <div className="text-[11px] text-[var(--muted-foreground)]">
                  {formatBytes(b.size)} · {formatRelative(b.createdAt)}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDownload(b)}
                  disabled={busy !== null}
                >
                  <Download className="h-4 w-4" />
                  Descargar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRestore(b)}
                  disabled={busy !== null}
                >
                  <Upload className="h-4 w-4" />
                  Restaurar
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Eliminar"
                  className="text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                  onClick={() => handleDelete(b)}
                  disabled={busy !== null}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {feedback && (
        <p className="mt-3 text-xs text-[var(--muted-foreground)]">{feedback}</p>
      )}
    </Card>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.round(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} d`;
}
