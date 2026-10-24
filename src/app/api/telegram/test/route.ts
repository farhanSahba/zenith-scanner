import { detectChatId, sendTelegramTo } from "@/engine/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// إعداد/اختبار Telegram: يكتشف chat_id من رسالة المستخدم للبوت ويرسل رسالة تجربة.
export async function GET() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    return Response.json({ ok: false, error: "أضف TELEGRAM_BOT_TOKEN في .env.local ثم أعد التشغيل" });
  }
  const chat = process.env.TELEGRAM_CHAT_ID?.trim() || (await detectChatId());
  if (!chat) {
    return Response.json({
      ok: false,
      error: "راسل البوت أولاً: افتحه في Telegram، اضغط Start وأرسل أي كلمة، ثم أعد المحاولة",
    });
  }
  const ok = await sendTelegramTo(chat, "✅ <b>Zenith</b> متصل — بتوصلك التنبيهات المهمّة هنا 🦅");
  return Response.json({
    ok,
    chatId: chat,
    hint: ok
      ? `تم الإرسال! ثبّته بإضافة TELEGRAM_CHAT_ID=${chat} في .env.local`
      : "فشل الإرسال — تأكّد من صحة التوكن",
  });
}
