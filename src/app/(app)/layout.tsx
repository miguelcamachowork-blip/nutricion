"use client";

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
    </ProfileGate>
  );
}
