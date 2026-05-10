"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { toast } from "sonner";
import {
  Cloud,
  CloudDownload,
  CloudUpload,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  Settings2,
  Share2,
  Trash2,
} from "lucide-react";
import { Badge, Button, Card, Input, Label } from "@/components/ui/primitives";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { listProfiles } from "@/lib/db/repos";
import {
  clearProfileSyncConfig,
  getProfileSyncConfig,
  setProfileSyncConfig,
  type ProfileSyncConfig,
} from "@/lib/sync/config";
import {
  checkRemoteVersion,
  getJoinCode,
  importProfileFromCloud,
  probeCode,
  publishProfile,
  pullProfile,
  SyncError,
} from "@/lib/sync";
import type { ApplyMode } from "@/lib/sync/snapshot";
import type { Profile, RemoteManifest } from "@/lib/types";
import { getInitials, getProfileAvatarColor } from "@/lib/ui/groupColor";

// localStorage is mutated outside React, so we keep a tiny per-mount tick to
// re-render after each successful operation.
function useConfigTick() {
  const [tick, setTick] = useState(0);
  return [tick, () => setTick((t) => t + 1)] as const;
}

export function CloudSyncCard() {
  const profiles = useLiveQuery(() => listProfiles(), []) ?? [];
  const [tick, bump] = useConfigTick();
  const [importing, setImporting] = useState(false);
  return (
    <Card variant="elevated" className="p-4 sm:p-5">
      <div className="flex items-center gap-2 font-semibold">
        <Cloud className="h-4 w-4 text-[var(--primary)]" />
        Sincronización en la nube
      </div>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Comparte un perfil entre varios dispositivos. Cada miembro introduce
        un mismo <b>código familiar</b> una sola vez. Quien edite, pulsa{" "}
        <b>Publicar</b>; los demás verán un aviso y podrán <b>Descargar</b>.
      </p>
      {profiles.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--muted-foreground)]">
          Aún no hay perfiles.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {profiles.map((p) => (
            <CloudSyncRow key={`${p.id}:${tick}`} profile={p} />
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-[var(--muted-foreground)]">
          El código familiar se guarda solo en este dispositivo. Si lo olvidas,
          príndeselo a otro miembro.
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setImporting(true)}
        >
          <Plus className="h-4 w-4" />
          Añadir perfil desde la nube
        </Button>
      </div>
      <ImportFromCloudDialog
        open={importing}
        onClose={() => setImporting(false)}
        onImported={() => {
          bump();
          setImporting(false);
        }}
      />
    </Card>
  );
}

function CloudSyncRow({ profile }: { profile: Profile }) {
  const [tick, bump] = useConfigTick();
  const cfg = readConfig(profile.id, tick);
  const [busy, setBusy] = useState<null | "publish" | "pull" | "check">(null);
  const [configuring, setConfiguring] = useState(false);
  const [confirmAction, setConfirmAction] = useState<null | "publish" | "pull">(null);
  const [pullMode, setPullMode] = useState<ApplyMode>("merge");
  const [remote, setRemote] = useState<RemoteManifest | null>(null);
  const [sharing, setSharing] = useState(false);

  // Refresh the remote manifest when the row mounts (and after each op).
  useEffect(() => {
    if (!cfg) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBusy("check");
    checkRemoteVersion(profile.id)
      .then((m) => {
        if (!cancelled) setRemote(m);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof SyncError && err.kind === "not-found") {
          setRemote(null);
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id, tick]);

  async function handlePublish() {
    if (!cfg) return;
    setConfirmAction(null);
    setBusy("publish");
    const tid = toast.loading("Publicando…");
    try {
      const m = await publishProfile(profile.id);
      toast.success(`Publicado (v${m.version})`, { id: tid });
      setRemote(m);
      bump();
    } catch (err) {
      handleSyncError(err, tid, {
        onConflict: () => setConfirmAction("pull"),
      });
    } finally {
      setBusy(null);
    }
  }

  async function handlePull() {
    if (!cfg) return;
    setConfirmAction(null);
    setBusy("pull");
    const tid = toast.loading("Descargando…");
    try {
      const { manifest, counts } = await pullProfile(profile.id, pullMode);
      toast.success(`Descargado v${manifest.version}`, {
        id: tid,
        description: `${counts.recipes} recetas, ${counts.meals} comidas, ${counts.planCells} celdas de plan.`,
      });
      setRemote(manifest);
      bump();
    } catch (err) {
      handleSyncError(err, tid);
    } finally {
      setBusy(null);
    }
  }

  function handleRemove() {
    if (
      !window.confirm(
        `¿Quitar la sincronización de "${profile.name}" en este dispositivo?\n\n` +
          "Los datos locales no se borran. Solo se olvida el código familiar.",
      )
    ) {
      return;
    }
    clearProfileSyncConfig(profile.id);
    bump();
  }

  return (
    <li className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card-2)] p-3">
      <div className="flex items-center gap-2.5">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white shadow-sm"
          style={{ backgroundColor: getProfileAvatarColor(profile.id) }}
          aria-hidden
        >
          {getInitials(profile.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{profile.name}</div>
          <RowStatus cfg={cfg} remote={remote} busy={busy} />
        </div>
        {!cfg ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfiguring(true)}
          >
            <KeyRound className="h-4 w-4" />
            Configurar
          </Button>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmAction("publish")}
              disabled={busy !== null}
            >
              <CloudUpload className="h-4 w-4" />
              Publicar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setPullMode("merge");
                setConfirmAction("pull");
              }}
              disabled={busy !== null || !remote}
            >
              <CloudDownload className="h-4 w-4" />
              Descargar
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Compartir invitación"
              title="Compartir invitación"
              onClick={() => setSharing(true)}
              disabled={busy !== null}
            >
              <Share2 className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Cambiar configuración"
              onClick={() => setConfiguring(true)}
            >
              <Settings2 className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Quitar de este dispositivo"
              onClick={handleRemove}
              className="text-[var(--danger)] hover:bg-[var(--danger-soft)]"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <ShareInviteDialog
        open={sharing}
        onClose={() => setSharing(false)}
        profile={profile}
      />

      <ConfigureDialog
        open={configuring}
        onClose={() => setConfiguring(false)}
        profile={profile}
        initial={cfg}
        onSaved={() => {
          bump();
          setConfiguring(false);
        }}
      />

      <Dialog
        open={confirmAction === "publish"}
        onOpenChange={(o) => !o && setConfirmAction(null)}
      >
        <DialogContent
          title="Publicar en la nube"
          description={`Subirás los datos del perfil "${profile.name}" para que los vean los demás dispositivos.`}
        >
          <div className="space-y-2 text-sm">
            <p>
              Versión actual en la nube:{" "}
              <b>{remote ? `v${remote.version}` : "ninguna"}</b>
              {remote?.publishedBy ? ` · por ${remote.publishedBy}` : ""}
            </p>
            <p className="text-[var(--muted-foreground)]">
              Si otra persona publicó después que descargaste, te pediremos que
              descargues primero para no perder cambios.
            </p>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmAction(null)}>
              Cancelar
            </Button>
            <Button onClick={handlePublish} disabled={busy !== null}>
              <CloudUpload className="h-4 w-4" />
              Publicar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmAction === "pull"}
        onOpenChange={(o) => !o && setConfirmAction(null)}
      >
        <DialogContent
          title="Descargar de la nube"
          description={`Traerás la última versión publicada del perfil "${profile.name}".`}
        >
          {remote && (
            <p className="text-sm">
              Versión disponible: <b>v{remote.version}</b>
              {remote.publishedBy ? ` · por ${remote.publishedBy}` : ""}
              {" · "}
              {formatRelative(remote.publishedAt)}
            </p>
          )}
          <fieldset className="mt-3 space-y-2 text-sm">
            <legend className="text-xs text-[var(--muted-foreground)]">
              Modo
            </legend>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="pull-mode"
                checked={pullMode === "merge"}
                onChange={() => setPullMode("merge")}
                className="mt-1"
              />
              <span>
                <b>Combinar</b> — actualiza coincidencias por id (lo de la nube
                gana). No borra nada local. Recomendado.
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="pull-mode"
                checked={pullMode === "replace"}
                onChange={() => setPullMode("replace")}
                className="mt-1"
              />
              <span>
                <b>Reemplazar</b> — borra los datos locales de este perfil y
                los sustituye por los de la nube. Otros perfiles e histórico
                local no se tocan. <Badge tone="danger">cuidado</Badge>
              </span>
            </label>
          </fieldset>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmAction(null)}>
              Cancelar
            </Button>
            <Button onClick={handlePull} disabled={busy !== null}>
              <CloudDownload className="h-4 w-4" />
              Descargar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </li>
  );
}

function RowStatus({
  cfg,
  remote,
  busy,
}: {
  cfg: ProfileSyncConfig | null;
  remote: RemoteManifest | null;
  busy: null | "publish" | "pull" | "check";
}) {
  if (!cfg) {
    return (
      <p className="text-xs text-[var(--muted-foreground)]">No configurado</p>
    );
  }
  if (busy === "check") {
    return (
      <p className="text-xs text-[var(--muted-foreground)]">Comprobando…</p>
    );
  }
  if (!remote) {
    return (
      <p className="text-xs text-[var(--muted-foreground)]">
        Sin datos en la nube — sé el primero en publicar.
      </p>
    );
  }
  const local = cfg.lastSyncedVersion ?? 0;
  if (local === remote.version) {
    return (
      <p className="text-xs text-[var(--muted-foreground)]">
        Sincronizado v{remote.version}
        {remote.publishedBy ? ` · por ${remote.publishedBy}` : ""} ·{" "}
        {formatRelative(remote.publishedAt)}
      </p>
    );
  }
  if (local < remote.version) {
    return (
      <p className="text-xs text-[var(--warning-soft-fg)]">
        Hay nueva versión (v{remote.version}
        {remote.publishedBy ? ` · ${remote.publishedBy}` : ""})
      </p>
    );
  }
  return (
    <p className="text-xs text-[var(--muted-foreground)]">
      Versión local: v{local} (en la nube: v{remote.version})
    </p>
  );
}

function ConfigureDialog({
  open,
  onClose,
  profile,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  profile: Profile;
  initial: ProfileSyncConfig | null;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(initial?.code ?? "");
  const [memberName, setMemberName] = useState(initial?.memberName ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCode(initial?.code ?? "");
      setMemberName(initial?.memberName ?? "");
      setError(null);
      setHint(null);
      setReveal(false);
    }
  }, [open, initial]);

  async function handleSave() {
    const trimmed = code.trim();
    if (!trimmed) {
      setError("Introduce un código familiar.");
      return;
    }
    setBusy(true);
    setError(null);
    setHint(null);
    try {
      const probe = await probeCode(profile.id, trimmed);
      setProfileSyncConfig(profile.id, {
        code: trimmed,
        memberName: memberName.trim() || undefined,
        ...(probe.status === "match"
          ? { lastSeenRemoteVersion: probe.manifest.version }
          : {}),
      });
      if (probe.status === "empty") {
        toast.success(
          "Código guardado. Aún no hay datos publicados — pulsa Publicar para ser el primero.",
        );
      } else {
        toast.success(
          `Código correcto. Versión actual en la nube: v${probe.manifest.version}.`,
        );
      }
      onSaved();
    } catch (err) {
      if (err instanceof SyncError) {
        if (err.kind === "unauthorized") {
          setError(
            "El código no coincide con el guardado por otros miembros. Comprueba que sea el mismo.",
          );
        } else if (err.kind === "server-not-configured") {
          setError(
            "El servidor no tiene configurado el almacenamiento en la nube. Avisa al administrador.",
          );
        } else {
          setError(err.message);
        }
      } else {
        setError((err as Error).message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={initial ? "Cambiar configuración" : "Configurar sincronización"}
        description={`Perfil: ${profile.name}`}
      >
        <div className="space-y-3 text-sm">
          <div>
            <Label htmlFor="sync-code">Código familiar</Label>
            <div className="relative">
              <Input
                id="sync-code"
                type={reveal ? "text" : "password"}
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="p. ej. familia-mcz-2026"
                className="pr-9"
              />
              <button
                type="button"
                aria-label={reveal ? "Ocultar código" : "Mostrar código"}
                title={reveal ? "Ocultar código" : "Mostrar código"}
                onClick={() => setReveal((r) => !r)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--fg)]"
              >
                {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
              Inventa una frase secreta y compártela con los demás miembros por
              un canal seguro (WhatsApp, llamada). Debe ser idéntica en todos
              los dispositivos.
            </p>
          </div>
          <div>
            <Label htmlFor="sync-member">Tu nombre (opcional)</Label>
            <Input
              id="sync-member"
              value={memberName}
              onChange={(e) => setMemberName(e.target.value)}
              placeholder="p. ej. Juan"
            />
            <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
              Aparecerá en el aviso &ldquo;publicado por &hellip;&rdquo; para los demás.
            </p>
          </div>
          {error && (
            <p className="rounded-md bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger-soft-fg)]">
              {error}
            </p>
          )}
          {hint && (
            <p className="rounded-md bg-[var(--accent)] px-3 py-2 text-xs text-[var(--primary)]">
              {hint}
            </p>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy ? "Comprobando…" : "Comprobar y guardar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function readConfig(profileId: string, _tick: number): ProfileSyncConfig | null {
  // _tick forces a re-read after we mutate localStorage.
  void _tick;
  return getProfileSyncConfig(profileId);
}

function handleSyncError(
  err: unknown,
  toastId: string | number,
  hooks: { onConflict?: () => void } = {},
) {
  if (err instanceof SyncError) {
    if (err.kind === "conflict") {
      toast.error("Hay una versión más reciente en la nube.", {
        id: toastId,
        description: "Descarga primero (combinar) y vuelve a publicar.",
        action: hooks.onConflict
          ? { label: "Descargar", onClick: hooks.onConflict }
          : undefined,
      });
      return;
    }
    if (err.kind === "unauthorized") {
      toast.error("Código familiar incorrecto.", { id: toastId });
      return;
    }
    if (err.kind === "server-not-configured") {
      toast.error("El servidor no tiene activada la sincronización.", {
        id: toastId,
      });
      return;
    }
    if (err.kind === "not-configured") {
      toast.error(err.message, { id: toastId });
      return;
    }
    if (err.kind === "network") {
      toast.error("Sin conexión.", {
        id: toastId,
        description: "Reintenta cuando vuelvas a tener internet.",
      });
      return;
    }
    toast.error(err.message, { id: toastId });
    return;
  }
  toast.error((err as Error).message || "Error desconocido.", { id: toastId });
}

function formatRelative(iso: string): string {
  try {
    const ms = Date.now() - new Date(iso).getTime();
    const min = Math.round(ms / 60000);
    if (min < 1) return "ahora mismo";
    if (min < 60) return `hace ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.round(h / 24);
    if (d < 7) return `hace ${d} d`;
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

// ─── Share invite & Add-from-cloud dialogs ────────────────────────────────

function ShareInviteDialog({
  open,
  onClose,
  profile,
}: {
  open: boolean;
  onClose: () => void;
  profile: Profile;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCode(null);
      setError(null);
      setCopied(false);
      return;
    }
    let cancelled = false;
    getJoinCode(profile.id)
      .then((c) => {
        if (!cancelled) setCode(c);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [open, profile.id]);

  async function handleCopy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Código copiado al portapapeles");
    } catch {
      toast.error("No se pudo copiar. Selecciona y copia a mano.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Compartir invitación"
        description={`Envía este código a otro miembro para que añada el perfil "${profile.name}" en su dispositivo.`}
      >
        {error && (
          <p className="rounded-md bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger-soft-fg)]">
            {error}
          </p>
        )}
        {!code && !error && (
          <p className="text-sm text-[var(--muted-foreground)]">Generando…</p>
        )}
        {code && (
          <>
            <textarea
              readOnly
              value={code}
              onFocus={(e) => e.currentTarget.select()}
              className="mt-2 h-28 w-full resize-none rounded-md border border-[var(--border)] bg-[var(--card-2)] p-2 font-mono text-[11px] break-all"
            />
            <p className="mt-2 text-[11px] text-[var(--muted-foreground)]">
              Este código incluye el <b>código familiar</b> en claro. Compártelo
              solo por canales seguros (WhatsApp con la familia, mensaje
              directo). Cualquiera con este código podrá leer y modificar este
              perfil en la nube.
            </p>
          </>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
          <Button onClick={handleCopy} disabled={!code}>
            <Share2 className="h-4 w-4" />
            {copied ? "Copiado" : "Copiar código"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ImportFromCloudDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const [joinCode, setJoinCode] = useState("");
  const [memberName, setMemberName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setJoinCode("");
      setMemberName("");
      setError(null);
    }
  }, [open]);

  async function handleImport() {
    if (!joinCode.trim()) {
      setError("Pega el código de invitación.");
      return;
    }
    setBusy(true);
    setError(null);
    const tid = toast.loading("Descargando perfil…");
    try {
      const res = await importProfileFromCloud(joinCode, memberName);
      toast.success(`Perfil "${res.profileName}" añadido (v${res.manifest.version})`, {
        id: tid,
        description: `${res.counts.recipes} recetas, ${res.counts.meals} comidas, ${res.counts.planCells} celdas de plan.`,
      });
      onImported();
    } catch (err) {
      handleSyncError(err, tid);
      if (err instanceof SyncError) setError(err.message);
      else setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Añadir perfil desde la nube"
        description="Pega el código de invitación que te envió otro miembro de la familia."
      >
        <div className="space-y-3 text-sm">
          <div>
            <Label htmlFor="join-code">Código de invitación</Label>
            <textarea
              id="join-code"
              autoFocus
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="mcz1:..."
              className="mt-1 h-24 w-full resize-none rounded-md border border-[var(--border)] bg-[var(--card-2)] p-2 font-mono text-[11px] break-all"
            />
          </div>
          <div>
            <Label htmlFor="join-member">Tu nombre (opcional)</Label>
            <Input
              id="join-member"
              value={memberName}
              onChange={(e) => setMemberName(e.target.value)}
              placeholder="p. ej. Juan"
            />
          </div>
          {error && (
            <p className="rounded-md bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger-soft-fg)]">
              {error}
            </p>
          )}
          <p className="text-[11px] text-[var(--muted-foreground)]">
            Se descargará la última versión publicada y se creará el perfil en
            este dispositivo. Si ya existía un perfil con el mismo identificador,
            se combinará (lo de la nube gana en coincidencias).
          </p>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={handleImport} disabled={busy}>
            <CloudDownload className="h-4 w-4" />
            {busy ? "Descargando…" : "Añadir perfil"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
