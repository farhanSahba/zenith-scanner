// إشعارات Telegram — ترسل التنبيهات المهمة لجوال المستخدم عبر بوت خاص.
// يُفعّل تلقائياً عند وجود TELEGRAM_BOT_TOKEN و TELEGRAM_CHAT_ID في البيئة.

const API = "https://api.telegram.org";

const token = () => process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
const chatId = () => process.env.TELEGRAM_CHAT_ID?.trim() || "";

export function telegramEnabled(): boolean {
  return Boolean(token() && chatId());
}

async function send(toChat: string, text: string): Promise<boolean> {
  const t = token();
  if (!t || !toChat) return false;
  try {
    const res = await fetch(`${API}/bot${t}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: toChat,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function sendTelegram(text: string): Promise<boolean> {
  return send(chatId(), text);
}

export function sendTelegramTo(toChat: string, text: string): Promise<boolean> {
  return send(toChat, text);
}

// يكتشف chat_id من آخر رسالة أرسلها المستخدم للبوت (getUpdates) — لتسهيل الإعداد.
export async function detectChatId(): Promise<string | null> {
  const t = token();
  if (!t) return null;
  try {
    const d = await fetch(`${API}/bot${t}/getUpdates`).then((r) => r.json());
    const ups: unknown[] = Array.isArray(d?.result) ? d.result : [];
    for (let i = ups.length - 1; i >= 0; i--) {
      const u = ups[i] as { message?: { chat?: { id?: number } }; channel_post?: { chat?: { id?: number } } };
      const id = u?.message?.chat?.id ?? u?.channel_post?.chat?.id;
      if (id != null) return String(id);
    }
    return null;
  } catch {
    return null;
  }
}
