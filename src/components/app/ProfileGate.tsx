"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  createProfile,
  deleteProfile,
  listProfiles,
  renameProfile,
} from "@/lib/db/repos";
import { useActiveProfileStore } from "@/hooks/useActiveProfile";
import { Button, Card, Input, Label } from "@/components/ui/primitives";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ChevronRight, Pencil, Salad, Trash2, UserPlus, Users } from "lucide-react";
import { getProfileAvatarColor, getInitials } from "@/lib/ui/groupColor";

export function ProfileGate({ children }: { children: React.ReactNode }) {
  const profiles = useLiveQuery(() => listProfiles(), []);
  const { activeProfileId, setActive } = useActiveProfileStore();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    if (
      profiles &&
      activeProfileId &&
      !profiles.find((p) => p.id === activeProfileId)
    ) {
      setActive(null);
    }
  }, [profiles, activeProfileId, setActive]);

  if (!profiles) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-[var(--muted-foreground)]">
        Cargando…
      </div>
    );
  }

  if (activeProfileId && profiles.find((p) => p.id === activeProfileId)) {
    return <>{children}</>;
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Decorative gradient backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(900px 500px at 80% -10%, rgba(16,185,129,0.18), transparent 60%), radial-gradient(700px 400px at -10% 110%, rgba(2,132,199,0.12), transparent 60%)",
        }}
      />
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-8 px-4 py-12">
        {/* Hero */}
        <div className="text-center animate-fade-in">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--primary)] to-[var(--primary-700)] text-[var(--primary-foreground)] shadow-[var(--shadow-lg)]">
            <Salad className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">
            Nutrición MCZ
          </h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Tu plan alimenticio por porciones, organizado y vivo.
          </p>
        </div>

        {/* Profiles card */}
        <Card variant="glass" className="w-full p-4 sm:p-5 animate-fade-in">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-[var(--foreground-soft)]">
              Perfiles
            </p>
            <Dialog open={creating} onOpenChange={setCreating}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <UserPlus className="h-4 w-4" />
                  Nuevo
                </Button>
              </DialogTrigger>
              <DialogContent
                title="Nuevo perfil"
                description="Se creará con catálogo y horarios sugeridos. Todo es editable después."
              >
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="pname">Nombre</Label>
                    <Input
                      id="pname"
                      autoFocus
                      placeholder="Ej. Miguel"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setCreating(false)}>
                      Cancelar
                    </Button>
                    <Button
                      onClick={async () => {
                        const p = await createProfile(name || "Perfil");
                        setName("");
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

          {profiles.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Aún no hay perfiles"
              description="Crea uno para comenzar con tu plan personalizado."
            />
          ) : (
            <ul className="space-y-1.5">
              {profiles.map((p) => (
                <li key={p.id}>
                  <div className="group flex items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-2 transition-colors hover:border-[var(--border-strong)]">
                    <button
                      onClick={() => setActive(p.id)}
                      className="flex flex-1 items-center gap-3 rounded-md py-1 pl-1 pr-2 text-left"
                    >
                      <div
                        className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white shadow-sm"
                        style={{ backgroundColor: getProfileAvatarColor(p.id) }}
                        aria-hidden
                      >
                        {getInitials(p.name)}
                      </div>
                      <span className="flex-1 truncate font-medium">
                        {p.name}
                      </span>
                      <ChevronRight className="h-4 w-4 text-[var(--muted-foreground)] transition-transform group-hover:translate-x-0.5" />
                    </button>
                    <ProfileEditActions id={p.id} name={p.name} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <p className="text-center text-xs text-[var(--muted-foreground)]">
          Los datos se guardan localmente en este dispositivo.
        </p>
      </div>
    </div>
  );
}

function ProfileEditActions({ id, name }: { id: string; name: string }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [val, setVal] = useState(name);
  return (
    <div className="flex items-center gap-0.5">
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogTrigger asChild>
          <Button size="icon" variant="ghost" aria-label="Renombrar">
            <Pencil className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent title="Renombrar perfil">
          <div className="space-y-3">
            <Input value={val} onChange={(e) => setVal(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
              <Button
                onClick={async () => {
                  await renameProfile(id, val.trim() || name);
                  setEditing(false);
                }}
              >
                Guardar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Eliminar"
            className="text-[var(--danger)] hover:bg-[var(--danger-soft)]"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent
          title={`Eliminar "${name}"`}
          description="Se borrarán catálogo, plan, recetas e histórico de este perfil. Esta acción no se puede deshacer."
        >
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await deleteProfile(id);
                setConfirming(false);
              }}
            >
              Eliminar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
