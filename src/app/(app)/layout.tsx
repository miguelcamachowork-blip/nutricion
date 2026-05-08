"use client";

import { Toaster } from "sonner";
import { ProfileGate } from "@/components/app/ProfileGate";
import { AppShell } from "@/components/app/AppShell";
import { useActiveProfileHydration } from "@/hooks/useActiveProfile";

export default function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const hydrated = useActiveProfileHydration();
  if (!hydrated) return null;
  return (
    <ProfileGate>
      <AppShell>{children}</AppShell>
      <Toaster
        position="top-center"
        richColors
        closeButton
        theme="system"
        toastOptions={{ duration: 5000 }}
      />
    </ProfileGate>
  );
}
