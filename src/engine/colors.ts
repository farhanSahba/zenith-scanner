import type { ColorLevel, Cell } from "./types";

// دالة مساعدة: تبني خلية بقيمة ومستوى لون ونص
function cell(v: number | null, level: ColorLevel, text: string): Cell {
  return { v, level, text };
}

const fmt = (n: number, d = 2) =>
  Number.isFinite(n) ? n.toFixed(d) : "—";

// كل دالة أدناه ترجع Cell جاهزة. العتبات مضبوطة لتداول الزخم على الفلوت المنخفض.

export function cellGap(gapPct: number): Cell {
  const t = `${gapPct >= 0 ? "" : ""}${fmt(gapPct, 2)}%`;
  if (gapPct >= 20) return cell(gapPct, "neon", t);
  if (gapPct >= 10) return cell(gapPct, "green", t);
  if (gapPct >= 3) return cell(gapPct, "neutral", t);
  if (gapPct <= -3) return cell(gapPct, "red", t);
  return cell(gapPct, "neutral", t);
}

export function cellTwoMin(p: number): Cell {
  const t = `${p >= 0 ? "+" : ""}${fmt(p, 1)}%`;
  if (p >= 5) return cell(p, "neon", t);
  if (p >= 1.5) return cell(p, "green", t);
  if (p > 0) return cell(p, "neutral", t);
  if (p <= -5) return cell(p, "red", t);
  if (p < 0) return cell(p, "amber", t);
  return cell(p, "neutral", t);
}

export function cellZenVR(r: number): Cell {
  const t = fmt(r, 2);
  if (r >= 5) return cell(r, "neon", t);
  if (r >= 2) return cell(r, "green", t);
  if (r >= 1) return cell(r, "neutral", t);
  return cell(r, "red", t);
}

export function cellZenP(p: number): Cell {
  const t = fmt(p, 2);
  if (p >= 75) return cell(p, "neon", t);
  if (p >= 60) return cell(p, "green", t);
  if (p >= 45) return cell(p, "neutral", t);
  return cell(p, "red", t);
}

// ZenV = ميل الـ VWAP (إشارة اتجاه)
export function cellZenV(up: boolean, magnitude: number): Cell {
  const t = `${up ? "+" : "-"}${fmt(Math.abs(magnitude), 2)}`;
  return up ? cell(magnitude, "green", t) : cell(-magnitude, "red", t);
}

// AtrVwap: المسافة عن الـ VWAP بوحدات ATR. فوق الـ VWAP وغير ممتد = جيد.
export function cellAtrVwap(x: number): Cell {
  const t = fmt(x, 2);
  if (x >= 0 && x <= 1.5) return cell(x, "green", t);
  if (x > 1.5 && x <= 3) return cell(x, "amber", t); // ممتد
  if (x > 3) return cell(x, "red", t); // ممتد جداً
  return cell(x, "red", t); // تحت الـ VWAP
}

// AtrHoD: البُعد تحت قمة اليوم بوحدات ATR. صغير = قريب من القمة = ممتاز.
export function cellAtrHoD(x: number): Cell {
  const t = fmt(x, 2);
  if (x <= 0.3) return cell(x, "neon", t);
  if (x <= 0.8) return cell(x, "green", t);
  if (x <= 1.5) return cell(x, "neutral", t);
  return cell(x, "red", t);
}

// AtrSprd: فرق السعر بوحدات ATR. ضيّق = سيولة جيدة = أخضر.
export function cellAtrSprd(x: number): Cell {
  const t = fmt(x, 3);
  if (x <= 0.05) return cell(x, "neon", t);
  if (x <= 0.15) return cell(x, "green", t);
  if (x <= 0.3) return cell(x, "neutral", t);
  return cell(x, "red", t);
}

// Float: الفلوت المنخفض أكثر انفجاراً.
export function cellFloat(sharesM: number): Cell {
  const t = sharesM >= 1 ? `${fmt(sharesM, 0)}M` : `${fmt(sharesM * 1000, 0)}K`;
  if (sharesM <= 10) return cell(sharesM, "neon", t);
  if (sharesM <= 20) return cell(sharesM, "green", t);
  if (sharesM <= 50) return cell(sharesM, "neutral", t);
  return cell(sharesM, "red", t);
}

export function cellFloatRot(x: number): Cell {
  const t = `${fmt(x, 2)}x`;
  if (x >= 1) return cell(x, "neon", t);
  if (x >= 0.5) return cell(x, "green", t);
  if (x >= 0.2) return cell(x, "neutral", t);
  return cell(x, "red", t);
}

// هل المستوى يُعدّ "أخضر" لأغراض القاعدة الذهبية؟
export function isGreen(level: ColorLevel): boolean {
  return level === "neon" || level === "green";
}

// ترتيب المستويات للفرز
export const LEVEL_RANK: Record<ColorLevel, number> = {
  neon: 4,
  green: 3,
  neutral: 2,
  amber: 1,
  red: 0,
};
