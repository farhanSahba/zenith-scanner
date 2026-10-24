import { aiAvailable, aiText } from "./client";
import type { SymbolSnapshot } from "../types";
import type { ChartMeta } from "../engine";

// راوي السيتَب: قراءة عربية مختصرة لكل مرشّح — نوع النموذج، المستويات،
// دوران الفلوت، وما الذي يُبطِل الصفقة. يستخدم Claude إن توفّر وإلا بديل قواعدي.

const SYSTEM = `أنت محلل تداول زخم يومي خبير بالأسهم الأمريكية ذات الفلوت المنخفض.
مهمتك: قراءة سيتَب سهم من أرقامه اللحظية وكتابة تحليل عربي موجز وعملي.
اكتب 4 إلى 6 أسطر فقط بهذا الترتيب:
1) نوع النموذج (اختراق قمة يوم / اندفاع VWAP / فجوة وتماسك / انعكاس...).
2) المستويات المهمة بالأرقام (VWAP، قمة اليوم، قمة ما قبل السوق).
3) جودة الزخم (دوران الفلوت، الحجم النسبي، السبريد).
4) ما الذي يُبطِل الصفقة (مستوى الإبطال).
كن حاسماً وواقعياً. لا توصية شراء مباشرة — تقييم فقط. لا تكرّر الأرقام بلا فائدة.`;

function dataBlock(s: SymbolSnapshot, meta?: ChartMeta): string {
  return [
    `الرمز: ${s.symbol}`,
    `السعر: ${s.price}`,
    `التغيّر اليوم: ${s.changePct.toFixed(1)}%`,
    `الفجوة: ${s.gapPct.toFixed(1)}%`,
    `VWAP: ${s.vwap.toFixed(3)} (بُعد ${s.atrVwap.toFixed(2)} ATR)`,
    `قمة اليوم: ${s.dayHigh} (بُعد ${s.atrHoD.toFixed(2)} ATR تحتها)`,
    `قمة ما قبل السوق: ${s.premktHigh}`,
    `الفلوت: ${s.float}M`,
    `دوران الفلوت: ${s.floatRot.toFixed(2)}x`,
    `الحجم النسبي ZenVR: ${s.zenVR.toFixed(2)}`,
    `زخم دقيقتين: ${s.twoMinPct.toFixed(1)}%`,
    `ZenP: ${s.zenP}`,
    `السبريد/ATR: ${s.atrSprd.toFixed(3)}`,
    `ميل VWAP: ${s.zenVUp ? "صاعد" : "هابط"}`,
    `كل الأعمدة خضراء: ${s.allGreen ? "نعم" : "لا"}`,
  ].join("\n");
}

export async function narrateSetup(
  s: SymbolSnapshot,
  meta?: ChartMeta
): Promise<{ text: string; ai: boolean }> {
  if (aiAvailable()) {
    try {
      const text = await aiText(SYSTEM, dataBlock(s, meta), 450);
      return { text: text.trim(), ai: true };
    } catch {
      // سقوط للبديل القواعدي
    }
  }
  return { text: fallbackNarrative(s), ai: false };
}

// بديل قواعدي عربي (بدون مفتاح) — يبني قراءة من الأرقام.
function fallbackNarrative(s: SymbolSnapshot): string {
  const lines: string[] = [];

  let pattern = "تماسك";
  if (s.atrHoD <= 0.3 && s.zenVUp) pattern = "اختراق/اختبار قمة اليوم";
  else if (s.price >= s.vwap && s.atrVwap > 0 && s.atrVwap < 1.5) pattern = "اندفاع فوق VWAP";
  else if (s.price < s.vwap) pattern = "تحت VWAP — ضعف";
  else if (s.twoMinPct <= -5) pattern = "انعكاس/هبوط حاد";

  lines.push(`• النموذج: ${pattern} على فلوت ${s.float}M.`);
  lines.push(
    `• المستويات: VWAP ${s.vwap.toFixed(2)} | قمة اليوم ${s.dayHigh} | قمة ما قبل السوق ${s.premktHigh}.`
  );
  lines.push(
    `• الزخم: دوران فلوت ${s.floatRot.toFixed(2)}x، حجم نسبي ${s.zenVR.toFixed(
      1
    )}، سبريد/ATR ${s.atrSprd.toFixed(3)} ${s.atrSprd <= 0.15 ? "(سيولة جيدة)" : "(حذر من السبريد)"}.`
  );
  const invalidation = s.price >= s.vwap ? s.vwap : s.dayLow;
  lines.push(`• الإبطال: كسر ${invalidation.toFixed(2)} يُلغي السيتَب.`);
  lines.push(
    `• الحالة: ZenP ${s.zenP}${s.allGreen ? " — كل الأعمدة خضراء (أعلى احتمال)." : "."}`
  );
  lines.push("— تقييم آلي للعناية الواجبة، ليس توصية.");
  return lines.join("\n");
}
