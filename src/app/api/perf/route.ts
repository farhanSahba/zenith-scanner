import { getEngine } from "@/engine/singleton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// إحصاءات أداء التنبيهات (نسبة نجاح كل نوع + آخر النتائج)
export async function GET(req: Request) {
  const market = new URL(req.url).searchParams.get("market");
  const engine = getEngine(market);
  await engine.ensureStarted();
  return Response.json(engine.getPerf());
}
