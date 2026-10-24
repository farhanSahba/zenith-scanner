import { aiAvailable, aiText } from "./client";
import type { SymbolSnapshot } from "../types";

// ماسح بلغة عربية طبيعية: يحوّل جملة مثل
// "ورّني أسهم تحت 5$ قفزت 20% بفلوت أقل من 10 مليون وفيها خبر" إلى فلتر مُطبَّق.

export interface ScanFilter {
  priceMin?: number;
  priceMax?: number;
  floatMaxM?: number;
  floatMinM?: number;
  gapMinPct?: number;
  twoMinMinPct?: number;
  changeMinPct?: number;
  zenPMin?: number;
  needsNews?: boolean;
  allGreen?: boolean;
  sort?: "gap" | "twoMin" | "zenP" | "change" | "zenVR";
  label?: string;
}

const SYSTEM = `حوّل طلب المستخدم العربي عن فلترة الأسهم إلى JSON فقط (بدون أي نص آخر).
الحقول المتاحة (كلها اختيارية):
priceMin, priceMax (بالدولار)،
floatMaxM, floatMinM (بالملايين)،
gapMinPct (أدنى فجوة %)، twoMinMinPct (أدنى زخم دقيقتين %)، changeMinPct (أدنى تغيّر يوم %)،
zenPMin (أدنى احتمالية 0-100)، needsNews (true إذا طلب وجود خبر)، allGreen (true إذا طلب كل الأعمدة خضراء)،
sort (أحد: gap | twoMin | zenP | change | zenVR)،
label (وصف عربي موجز لما فهمته).
أعد JSON صالحاً فقط.`;

export async function nlToFilter(
  text: string
): Promise<{ filter: ScanFilter; ai: boolean }> {
  if (aiAvailable()) {
    try {
      const raw = await aiText(SYSTEM, text, 300);
      const json = extractJson(raw);
      if (json) return { filter: json, ai: true };
    } catch {
      // سقوط للبديل
    }
  }
  return { filter: fallbackParse(text), ai: false };
}

function extractJson(raw: string): ScanFilter | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as ScanFilter;
  } catch {
    return null;
  }
}

// بديل قواعدي: استخراج الأرقام من الجملة العربية بالكلمات المفتاحية.
function fallbackParse(text: string): ScanFilter {
  const f: ScanFilter = {};
  const nums = (re: RegExp) => {
    const m = text.match(re);
    return m ? parseFloat(m[1].replace(/[^\d.]/g, "")) : undefined;
  };

  // تحت/أقل من X$ → سعر أقصى
  f.priceMax = nums(/(?:تحت|أقل من|اقل من|دون)\s*\$?\s*([\d.]+)\s*\$?/);
  // فلوت أقل من X (مليون)
  const fl = text.match(/فلوت[^0-9]*([\d.]+)\s*(?:مليون|m|M)?/);
  if (fl) f.floatMaxM = parseFloat(fl[1]);
  // قفزت/ارتفعت X%
  const jump = text.match(/(?:قفز|ارتفع|صعد|فجوة|gap)[^0-9]*([\d.]+)\s*%/);
  if (jump) f.gapMinPct = parseFloat(jump[1]);
  // زخم دقيقتين
  const two = text.match(/دقيقتين[^0-9]*([\d.]+)\s*%/);
  if (two) f.twoMinMinPct = parseFloat(two[1]);
  // خبر
  if (/خبر|أخبار|محفّز|محفز|news/i.test(text)) f.needsNews = true;
  // كله أخضر
  if (/أخضر|اخضر|كلها خضراء|green/i.test(text)) f.allGreen = true;

  f.sort = f.twoMinMinPct ? "twoMin" : f.gapMinPct ? "gap" : "zenP";
  f.label = "فلتر قواعدي مبدئي (فعّل مفتاح Claude لفهم أدق).";
  return f;
}

// تطبيق الفلتر على الكون.
export function applyFilter(
  snaps: SymbolSnapshot[],
  f: ScanFilter,
  newsSymbols: Set<string>
): SymbolSnapshot[] {
  let out = snaps.filter((s) => {
    if (f.priceMin != null && s.price < f.priceMin) return false;
    if (f.priceMax != null && s.price > f.priceMax) return false;
    if (f.floatMaxM != null && s.float > f.floatMaxM) return false;
    if (f.floatMinM != null && s.float < f.floatMinM) return false;
    if (f.gapMinPct != null && s.gapPct < f.gapMinPct) return false;
    if (f.twoMinMinPct != null && s.twoMinPct < f.twoMinMinPct) return false;
    if (f.changeMinPct != null && s.changePct < f.changeMinPct) return false;
    if (f.zenPMin != null && s.zenP < f.zenPMin) return false;
    if (f.allGreen && !s.allGreen) return false;
    if (f.needsNews && !newsSymbols.has(s.symbol)) return false;
    return true;
  });

  const sort = f.sort ?? "zenP";
  const key: Record<string, (s: SymbolSnapshot) => number> = {
    gap: (s) => s.gapPct,
    twoMin: (s) => s.twoMinPct,
    zenP: (s) => s.zenP,
    change: (s) => s.changePct,
    zenVR: (s) => s.zenVR,
  };
  out = out.sort((a, b) => key[sort](b) - key[sort](a)).slice(0, 30);
  return out;
}
