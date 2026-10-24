import { NextRequest, NextResponse } from "next/server";
import { getEngine } from "@/engine/singleton";
import { aiAvailable } from "@/engine/ai/client";
import { narrateSetup } from "@/engine/ai/narrate";
import { analyzeCatalyst } from "@/engine/ai/catalyst";
import { nlToFilter, applyFilter } from "@/engine/ai/nlquery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// طبقة الذكاء العربية: narrate | catalyst | nlquery
export async function POST(req: NextRequest) {
  const engine = getEngine();
  await engine.ensureStarted();

  let body: { mode?: string; symbol?: string; text?: string; headline?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }

  const mode = body.mode;

  if (mode === "narrate") {
    const sym = (body.symbol ?? "").toUpperCase();
    const snap = engine.getSymbolSnapshot(sym);
    if (!snap) return NextResponse.json({ error: "رمز غير موجود" }, { status: 404 });
    const chart = engine.getChart(sym);
    const result = await narrateSetup(snap, chart?.meta);
    return NextResponse.json({ ...result, symbol: sym });
  }

  if (mode === "catalyst") {
    const headline = body.headline ?? "";
    if (!headline) return NextResponse.json({ error: "headline مطلوب" }, { status: 400 });
    const result = await analyzeCatalyst(headline);
    return NextResponse.json(result);
  }

  if (mode === "nlquery") {
    const text = body.text ?? "";
    if (!text) return NextResponse.json({ error: "text مطلوب" }, { status: 400 });
    const { filter, ai } = await nlToFilter(text);
    const results = applyFilter(engine.allSnapshots(), filter, engine.newsSymbols());
    return NextResponse.json({ filter, ai, results, count: results.length });
  }

  return NextResponse.json({ error: "mode غير معروف" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({ aiAvailable: aiAvailable() });
}
