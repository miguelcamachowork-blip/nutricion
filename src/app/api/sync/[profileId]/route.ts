// Per-profile cloud sync endpoints.
//
//   GET    /api/sync/[profileId]/manifest?code=...  → lightweight metadata
//   GET    /api/sync/[profileId]/latest?code=...    → manifest + snapshot
//   POST   /api/sync/[profileId]/publish            → upload new snapshot
//
// Authorization model: a "family code" string shared between members. The
// server stores SHA-256(code) in the manifest the first time the profile is
// published. Every subsequent request must present a code that hashes to
// the same value, otherwise it gets a 401.

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  readManifest,
  writeSnapshotAndManifest,
} from "@/lib/sync/blobStore";
import { sha256Hex } from "@/lib/sync/hash";
import { isConfigError } from "@/lib/sync/server";
import {
  PROFILE_SNAPSHOT_KIND,
  PROFILE_SNAPSHOT_VERSION,
  type ProfileSnapshot,
  type RemoteManifest,
} from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ─── Validation ────────────────────────────────────────────────────────────

const recipeItemSchema = z.object({
  foodId: z.string().min(1),
  amount: z.number(),
});

const snapshotSchema = z.object({
  kind: z.literal(PROFILE_SNAPSHOT_KIND),
  version: z.literal(PROFILE_SNAPSHOT_VERSION),
  snapshotVersion: z.number().int().nonnegative(),
  publishedAt: z.string().min(1),
  publishedBy: z.string().optional(),
  profile: z.object({
    id: z.string().min(1),
    name: z.string(),
    createdAt: z.number(),
  }).passthrough(),
  meals: z.array(z.unknown()),
  planCells: z.array(z.unknown()),
  recipes: z.array(
    z.object({
      id: z.string(),
      profileId: z.string(),
      mealId: z.string(),
      items: z.array(recipeItemSchema),
    }).passthrough(),
  ),
  scheduledRecipes: z.array(z.unknown()),
  forbiddenItems: z.array(z.unknown()),
  recipeDrafts: z.array(z.unknown()),
  catalog: z.object({
    groups: z.array(z.unknown()),
    foods: z.array(z.unknown()),
    unitTypes: z.array(z.unknown()),
    quantityOptions: z.array(z.unknown()),
    freeUseFoods: z.array(z.unknown()),
  }),
});

const publishBodySchema = z.object({
  code: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
  memberName: z.string().optional(),
  snapshot: snapshotSchema,
});

// ─── Helpers ───────────────────────────────────────────────────────────────

interface RouteCtx {
  params: Promise<{ profileId: string }>;
}

type ErrorBody = { error: string; code?: string; manifest?: RemoteManifest };

function jsonError(
  status: number,
  error: string,
  extra: Partial<ErrorBody> = {},
) {
  return NextResponse.json({ error, ...extra }, { status });
}

// ─── Handlers ──────────────────────────────────────────────────────────────

export async function GET(request: Request, ctx: RouteCtx) {
  const { profileId } = await ctx.params;
  if (!profileId) return jsonError(400, "Falta el id del perfil.");

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) return jsonError(400, 'Falta el parámetro "code".');

  let manifest: RemoteManifest | null;
  try {
    manifest = await readManifest(profileId);
  } catch (err) {
    if (isConfigError(err)) return jsonError(503, (err as Error).message);
    return jsonError(502, (err as Error).message);
  }
  if (!manifest) return jsonError(404, "No hay datos publicados aún.");

  const codeHash = await sha256Hex(code);
  if (codeHash !== manifest.codeHash) {
    return jsonError(401, "Código familiar incorrecto.");
  }

  return NextResponse.json({ manifest });
}

export async function POST(request: Request, ctx: RouteCtx) {
  const { profileId } = await ctx.params;
  if (!profileId) return jsonError(400, "Falta el id del perfil.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Cuerpo JSON inválido.");
  }

  const parsed = publishBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Petición inválida.", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { code, expectedVersion, memberName, snapshot } = parsed.data;
  if (snapshot.profile.id !== profileId) {
    return jsonError(400, "El snapshot no corresponde al perfil indicado.");
  }

  const codeHash = await sha256Hex(code);

  let current: RemoteManifest | null;
  try {
    current = await readManifest(profileId);
  } catch (err) {
    if (isConfigError(err)) return jsonError(503, (err as Error).message);
    return jsonError(502, (err as Error).message);
  }

  if (current) {
    if (codeHash !== current.codeHash) {
      return jsonError(401, "Código familiar incorrecto.");
    }
    if (expectedVersion !== current.version) {
      return jsonError(409, "Hay una versión más reciente publicada.", {
        manifest: current,
      });
    }
  } else {
    // First publish: only allow expectedVersion === 0 to fail loudly when
    // the client thinks it's syncing on top of an older version.
    if (expectedVersion !== 0) {
      return jsonError(409, "Aún no hay datos publicados.", {
        manifest: undefined,
      });
    }
  }

  const nextVersion = (current?.version ?? 0) + 1;
  const publishedAt = new Date().toISOString();
  // The Zod schema validates structural shape; runtime values come from a
  // trusted client snapshot, so we cast through unknown to satisfy TS.
  const finalSnapshot = {
    ...snapshot,
    snapshotVersion: nextVersion,
    publishedAt,
    publishedBy: memberName?.trim() || undefined,
  } as unknown as ProfileSnapshot;
  const payload = JSON.stringify(finalSnapshot);
  const manifest: RemoteManifest = {
    version: nextVersion,
    publishedAt,
    publishedBy: memberName?.trim() || undefined,
    size: payload.length,
    codeHash,
  };

  try {
    await writeSnapshotAndManifest(profileId, finalSnapshot, manifest);
  } catch (err) {
    if (isConfigError(err)) return jsonError(503, (err as Error).message);
    return jsonError(502, (err as Error).message);
  }

  return NextResponse.json({ manifest });
}
