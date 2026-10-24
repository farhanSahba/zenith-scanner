import { getEngine } from "@/engine/singleton";
import { SNAPSHOT_MS } from "@/engine/const";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// بث لحظي للـ snapshot عبر Server-Sent Events
export async function GET() {
  const engine = getEngine();
  await engine.ensureStarted();

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = () => {
        try {
          const data = JSON.stringify(engine.getSnapshot());
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          if (timer) clearInterval(timer);
        }
      };
      send();
      timer = setInterval(send, SNAPSHOT_MS + 100);
    },
    cancel() {
      if (timer) clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
