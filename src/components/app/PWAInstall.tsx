"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const IOS_HINT_KEY = "nmcz-ios-install-hint";

export function PWAInstall() {
  const [prompt, setPrompt] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/service-worker.js")
        .catch(() => {});
    }

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
      return;
    }
    // iOS Safari standalone flag
    if ((navigator as Navigator & { standalone?: boolean }).standalone) {
      setInstalled(true);
      return;
    }

    const onBIP = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BIPEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);

    const ua = navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) && !("MSStream" in window);
    const dismissed = (() => {
      try {
        return localStorage.getItem(IOS_HINT_KEY) === "1";
      } catch {
        return false;
      }
    })();
    if (isIos && !dismissed) setShowIosHint(true);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  if (prompt) {
    return (
      <button
        type="button"
        onClick={async () => {
          try {
            await prompt.prompt();
            const { outcome } = await prompt.userChoice;
            if (outcome === "accepted") setInstalled(true);
          } finally {
            setPrompt(null);
          }
        }}
        className="fixed right-4 bottom-24 md:bottom-6 z-40 flex items-center gap-2 rounded-full bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:opacity-90"
      >
        <Download className="h-4 w-4" />
        Instalar app
      </button>
    );
  }

  if (showIosHint) {
    return (
      <div className="fixed inset-x-4 bottom-24 z-40 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3 text-sm shadow-lg md:bottom-6 md:right-4 md:left-auto md:max-w-sm">
        <div className="flex items-start gap-2">
          <Download className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" />
          <div className="flex-1">
            <p className="font-medium">Instala Nutrición MCZ</p>
            <p className="mt-1 text-[var(--muted-foreground)]">
              Toca Compartir y luego &quot;Añadir a pantalla de inicio&quot;.
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            className="rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
            onClick={() => {
              try {
                localStorage.setItem(IOS_HINT_KEY, "1");
              } catch {
                /* ignore */
              }
              setShowIosHint(false);
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
