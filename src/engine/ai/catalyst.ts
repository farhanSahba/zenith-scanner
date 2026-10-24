import { aiAvailable, aiText } from "./client";
import type { NewsItem } from "../types";

// محلّل المحفّزات الفوري: يقرأ الخبر ويصنّفه بالعربي (زخم سليم مقابل تخفيف/حذر).

const SYSTEM = `أنت محلل محفّزات لأسهم الزخم. اقرأ عنوان الخبر وأعطِ بالعربي:
سطر أول: التصنيف بين قوسين [زخم سليم] أو [حذر — تخفيف] أو [محايد] ثم سبب موجز.
سطر ثانٍ: الأثر المتوقّع على الحركة (استمرارية أو خطر بيع).
كن موجزاً جداً (سطران). انتبه بشدة لطروحات الأسهم (offering / 424B5 / ATM / dilution) فهي قاتل حركات الفلوت المنخفض.`;

export async function analyzeCatalyst(
  headline: string
): Promise<{ text: string; sentiment: NewsItem["sentiment"]; ai: boolean }> {
  if (aiAvailable()) {
    try {
      const text = (await aiText(SYSTEM, headline, 220)).trim();
      return { text, sentiment: guessSentiment(headline), ai: true };
    } catch {
      // سقوط للبديل
    }
  }
  return { text: fallback(headline), sentiment: guessSentiment(headline), ai: false };
}

function guessSentiment(h: string): NewsItem["sentiment"] {
  const t = h.toLowerCase();
  if (/(offering|424b5|atm|dilut|registered direct|priced)/.test(t)) return "dilution";
  if (/(fda|clearance|contract|agreement|upgrade|partnership|beat)/.test(t)) return "bull";
  if (/(miss|downgrade|lawsuit|investigation|halt)/.test(t)) return "bear";
  return "neutral";
}

function fallback(h: string): string {
  const s = guessSentiment(h);
  switch (s) {
    case "dilution":
      return "[حذر — تخفيف] الخبر يشير إلى طرح/تخفيف أسهم.\nخطر بيع على القوة؛ تعامل بحذر مع الارتفاع.";
    case "bull":
      return "[زخم سليم] محفّز إيجابي حقيقي (عقد/موافقة/ترقية).\nيدعم استمرارية الحركة مع الحجم.";
    case "bear":
      return "[حذر] خبر سلبي قد يضغط على السعر.\nراقب كسر المستويات.";
    default:
      return "[محايد] خبر بلا أثر تخفيفي واضح.\nالحركة تعتمد على الحجم والمستويات.";
  }
}
