import { NextResponse } from "next/server";
import { getLatestSnapshot } from "@/lib/sync/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface RouteCtx {
  params: Promise<{ profileId: string }>;
}

export async function GET(request: Request, ctx: RouteCtx) {
  const { profileId } = await ctx.params;
  if (!profileId) {
    return NextResponse.json(
      { error: "Falta el id del perfil." },
      { status: 400 },
    );
  }
  const code = new URL(request.url).searchParams.get("code");
  if (!code) {
    return NextResponse.json(
      { error: 'Falta el parámetro "code".' },
      { status: 400 },
    );
  }
  const result = await getLatestSnapshot(profileId, code);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({
    manifest: result.manifest,
    snapshot: result.snapshot,
  });
}
