import { NextRequest, NextResponse } from "next/server";
import { isPlatformAdmin } from "@/server/platform/platform-admin.data";
import { runRestSyncBatch } from "@/server/rest/runBatch";

export async function POST(req: NextRequest) {
  const ok = await isPlatformAdmin();
  if (!ok) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  try {
    const { sourceId } = (await req.json()) as { sourceId?: string };
    if (!sourceId) return NextResponse.json({ ok: false, error: "missing sourceId" }, { status: 400 });
    const res = await runRestSyncBatch(sourceId);
    if (!res.ok) return NextResponse.json(res, { status: 400 });
    return NextResponse.json(res);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}


