import { NextRequest, NextResponse } from "next/server";
import { getEngine } from "@/engine/singleton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// بيانات الرسم لرمز معيّن (1د + 15د) مع المستويات المهمة
export async function GET(req: NextRequest) {
  const engine = getEngine();
  await engine.ensureStarted();
  const sym = req.nextUrl.searchParams.get("symbol");
  if (!sym) return NextResponse.json({ error: "symbol مطلوب" }, { status: 400 });
  const data = engine.getChart(sym);
  if (!data) return NextResponse.json({ error: "رمز غير موجود" }, { status: 404 });
  return NextResponse.json(data);
}
