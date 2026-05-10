"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { countNeedsReview, listProfiles } from "@/lib/db/repos";
import { useActiveProfileStore } from "@/hooks/useActiveProfile";
import { useRemoteVersionWatcher } from "@/hooks/useRemoteVersionWatcher";
import { Select } from "@/components/ui/primitives";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import {
  Apple,
  Ban,
  CalendarDays,
  CalendarPlus,
  ChefHat,
  CloudDownload,
  ListChecks,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getProfileAvatarColor, getInitials } from "@/lib/ui/groupColor";
import { PWAInstall } from "./PWAInstall";

const NAV = [
  { href: "/dia", label: "Plan del día", icon: ChefHat },
  { href: "/plan", label: "Plan", icon: ListChecks },
  { href: "/recetas", label: "Recetas", icon: CalendarPlus },
  { href: "/alimentos", label: "Alimentos", icon: Apple },
  { href: "/prohibidos", label: "Prohibidos", icon: Ban },
  { href: "/historico", label: "Histórico", icon: CalendarDays },
  { href: "/ajustes", label: "Ajustes", icon: Settings },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/dia") return pathname === "/dia" || pathname.startsWith("/dia/");
  return pathname === href || pathname.startsWith(href + "/");
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { activeProfileId, setActive } = useActiveProfileStore();
  const profiles = useLiveQuery(() => listProfiles(), []) ?? [];
  const activeProfile = profiles.find((p) => p.id === activeProfileId);
  // Number of scheduled recipes flagged as needing review (i.e. created
  // before a plan change). Surfaced as a small badge on the Recetas nav
  // item so the user is reminded even from other screens.
  const reviewCount =
    useLiveQuery(
      () => (activeProfileId ? countNeedsReview(activeProfileId) : Promise.resolve(0)),
      [activeProfileId],
    ) ?? 0;
  const sync = useRemoteVersionWatcher(activeProfileId);

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* ─── Sidebar (desktop / tablet) ───────────────────────────── */}
      <aside
        className={cn(
          "hidden md:flex shrink-0 flex-col border-r border-[var(--border)]",
          "bg-[var(--card)]/85 backdrop-blur-md",
          "w-[68px] lg:w-64",
          "transition-[width]",
        )}
      >
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-3 lg:px-5 py-4 lg:py-5">
          <div className="flex h-9 w-9 lg:h-[6.703125rem] lg:w-[6.703125rem] shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius)] bg-white shadow-[var(--shadow-sm)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.png" alt="" className="h-full w-full object-contain" />
          </div>
          <div className="hidden lg:block min-w-0">
            <p className="text-sm font-semibold leading-none">Nutrición</p>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">
              MCZ
            </p>
          </div>
        </div>

        {/* Profile picker */}
        <div className="hidden lg:block px-4 pb-3">
          <Select
            value={activeProfileId ?? ""}
            onChange={(e) => setActive(e.target.value || null)}
            aria-label="Perfil activo"
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1 px-2 lg:px-3 mt-1">
          {NAV.map((it) => {
            const active = isActive(pathname, it.href);
            const Icon = it.icon;
            const showBadge = it.href === "/recetas" && reviewCount > 0;
            return (
              <Link
                key={it.href}
                href={it.href}
                title={it.label}
                aria-label={
                  showBadge
                    ? `${it.label} (${reviewCount} por revisar)`
                    : it.label
                }
                className={cn(
                  "group relative flex items-center gap-3 rounded-[var(--radius)] px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-[var(--accent)] text-[var(--primary)] font-semibold"
                    : "text-[var(--foreground-soft)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]",
                )}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-[var(--primary)]"
                  />
                )}
                <span className="relative">
                  <Icon
                    className={cn(
                      "h-5 w-5 shrink-0",
                      active ? "text-[var(--primary)]" : "",
                    )}
                  />
                  {showBadge && (
                    <span
                      aria-hidden
                      className="absolute -top-1 -right-1.5 min-w-[1rem] h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-semibold flex items-center justify-center tabular-nums"
                    >
                      {reviewCount > 9 ? "9+" : reviewCount}
                    </span>
                  )}
                </span>
                <span className="hidden lg:inline truncate">{it.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Bottom (avatar + theme) */}
        <div className="mt-auto flex flex-col items-center gap-3 px-2 lg:px-3 py-4">
          <div className="hidden lg:flex w-full items-center gap-2.5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card-2)] p-2.5">
            {activeProfile && (
              <>
                <div
                  className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white shadow-sm"
                  style={{
                    backgroundColor: getProfileAvatarColor(activeProfile.id),
                  }}
                  aria-hidden
                >
                  {getInitials(activeProfile.name)}
                  {sync.hasUpdate && (
                    <span
                      aria-hidden
                      title="Hay una nueva versión en la nube"
                      className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-[var(--card-2)]"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {activeProfile.name}
                  </p>
                  <p className="truncate text-[11px] text-[var(--muted-foreground)]">
                    {sync.hasUpdate
                      ? `Nueva versión disponible (v${sync.remoteVersion})`
                      : "Perfil activo"}
                  </p>
                </div>
                {sync.hasUpdate && (
                  <Link
                    href="/ajustes"
                    aria-label="Ir a sincronización"
                    title="Hay una nueva versión en la nube"
                    className="shrink-0 rounded-md p-1 text-amber-600 hover:bg-[var(--muted)]"
                  >
                    <CloudDownload className="h-4 w-4" />
                  </Link>
                )}
              </>
            )}
          </div>
          <ThemeToggle />
        </div>
      </aside>

      {/* ─── Mobile top bar ───────────────────────────────────────── */}
      <header
        className={cn(
          "md:hidden sticky top-0 z-30 flex items-center justify-between gap-2",
          "border-b border-[var(--border)] bg-[var(--card)]/85 backdrop-blur-md",
          "px-4 py-3",
        )}
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-sm)] bg-white shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.png" alt="" className="h-full w-full object-contain" />
          </div>
          <p className="text-sm font-semibold truncate">Nutrición MCZ</p>
        </div>
        <div className="flex items-center gap-1.5">
          {sync.hasUpdate && (
            <Link
              href="/ajustes"
              aria-label="Hay una nueva versión en la nube"
              title="Nueva versión en la nube"
              className="relative flex h-9 w-9 items-center justify-center rounded-md text-amber-600 hover:bg-[var(--muted)]"
            >
              <CloudDownload className="h-5 w-5" />
              <span
                aria-hidden
                className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-amber-500"
              />
            </Link>
          )}
          <Select
            value={activeProfileId ?? ""}
            onChange={(e) => setActive(e.target.value || null)}
            aria-label="Perfil activo"
            className="h-9 max-w-32 text-xs"
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <ThemeToggle />
        </div>
      </header>

      {/* ─── Main ─────────────────────────────────────────────────── */}
      <main
        className="flex-1 pb-28 md:pb-6 animate-fade-in"
        style={{
          paddingBottom: "max(7rem, calc(env(safe-area-inset-bottom) + 5rem))",
        }}
      >
        {children}
      </main>

      {/* ─── Mobile bottom nav ───────────────────────────────────── */}
      <nav
        className={cn(
          "md:hidden fixed inset-x-0 bottom-0 z-30",
          "border-t border-[var(--border)] bg-[var(--card)]/90 backdrop-blur-md",
        )}
        style={{
          paddingBottom: "max(0.25rem, env(safe-area-inset-bottom))",
        }}
        aria-label="Navegación principal"
      >
        <div className="grid grid-cols-5">
          {NAV.map((it) => {
            const active = isActive(pathname, it.href);
            const Icon = it.icon;
            const showBadge = it.href === "/recetas" && reviewCount > 0;
            return (
              <Link
                key={it.href}
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-2 text-[10.5px] font-medium",
                  "transition-colors",
                  active
                    ? "text-[var(--primary)]"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
                )}
              >
                <span
                  className={cn(
                    "relative flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                    active && "bg-[var(--accent)]",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {showBadge && (
                    <span
                      aria-hidden
                      className="absolute top-0 right-2 min-w-[1rem] h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-semibold flex items-center justify-center tabular-nums"
                    >
                      {reviewCount > 9 ? "9+" : reviewCount}
                    </span>
                  )}
                </span>
                <span className="leading-none">{it.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <PWAInstall />
    </div>
  );
}
