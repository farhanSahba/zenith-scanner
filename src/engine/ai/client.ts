import Anthropic from "@anthropic-ai/sdk";

// غلاف بسيط حول SDK من Anthropic.
// إذا لم يوجد مفتاح، ترجع aiAvailable() = false ويعمل النظام بالبدائل القواعدية.

const MODEL = process.env.AI_MODEL || "claude-opus-5-5";
let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  if (!client) client = new Anthropic({ apiKey: key });
  return client;
}

export function aiAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

// استدعاء نصّي عام: system + user → نص عربي.
export async function aiText(
  system: string,
  user: string,
  maxTokens = 500
): Promise<string> {
  const c = getClient();
  if (!c) throw new Error("ANTHROPIC_API_KEY غير مضبوط");
  const res = await c.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  const block = res.content.find((b) => b.type === "text");
  return block && "text" in block ? (block.text as string) : "";
}
