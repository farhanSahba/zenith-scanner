import { ATR_PERIOD } from "./const";
import {
  cellGap,
  cellTwoMin,
  cellZenVR,
  cellZenP,
  cellZenV,
  cellAtrVwap,
  cellAtrHoD,
  cellAtrSprd,
  cellFloat,
  cellFloatRot,
  isGreen,
} from "./colors";
import type { SymbolState } from "./symbolState";
import type { Cell, SymbolSnapshot } from "./types";

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// الأعمدة التي تدخل في "القاعدة الذهبية" (كلها خضراء = أعلى احتمال)
const GOLDEN_KEYS = [
  "zenV",
  "zenVR",
  "atrSprd",
  "atrVwap",
  "atrHoD",
  "zenP",
  "twoMin",
] as const;

export interface SnapshotCtx {
  now: number;
  sessionProgress: number; // 0..1 من نسبة تقدّم الجلسة (لحساب ZenVR المتوقّع)
}

// الاحتمالية المركّبة ZenP (0..100): مزيج موزون من الزخم والحجم والقرب من القمة والسيولة.
function computeZenP(d: {
  twoMinPct: number;
  zenVR: number;
  atrVwap: number;
  atrHoD: number;
  atrSprd: number;
  floatRot: number;
  zenVUp: boolean;
  aboveVwap: boolean;
}): number {
  const mom = clamp01(d.twoMinPct / 10);
  const rvol = clamp01((d.zenVR - 1) / 6);
  const hod = clamp01(1 - d.atrHoD / 1.5);
  const vwap = d.aboveVwap ? clamp01(1 - Math.abs(d.atrVwap - 0.75) / 2.5) : 0.12;
  const spread = clamp01(1 - d.atrSprd / 0.3);
  const rot = clamp01(d.floatRot / 1.5);
  const slope = d.zenVUp ? 1 : 0;

  const score =
    0.22 * mom +
    0.18 * rvol +
    0.18 * hod +
    0.14 * vwap +
    0.1 * spread +
    0.1 * rot +
    0.08 * slope;

  return Math.round(clamp01(score) * 1000) / 10; // 0..100 بخانة عشرية
}

export function buildSymbolSnapshot(
  s: SymbolState,
  ctx: SnapshotCtx
): SymbolSnapshot {
  const atr = s.atr(ATR_PERIOD);
  const price = s.price;
  const vwap = s.vwap || price;
  const gapPct =
    s.open > 0 ? ((s.open - s.prevClose) / s.prevClose) * 100 : s.changePct();
  const twoMinPct = s.twoMinPct(ctx.now);
  const spread = Math.max(0, s.ask - s.bid);

  const atrVwap = atr > 0 ? (price - vwap) / atr : 0;
  const atrHoD = atr > 0 ? (s.dayHigh - price) / atr : 0;
  const atrSprd = atr > 0 ? spread / atr : 0;
  const atrReliable = s.bars1m.length >= 2; // ATR من بارات مغلقة حقيقية
  const floatRot = s.float > 0 ? s.volume / (s.float * 1_000_000) : 0;

  // ZenVR: الحجم الفعلي ÷ الحجم المتوقّع بهذا الوقت من الجلسة
  const expected = Math.max(1, s.avgDailyVol * Math.max(0.02, ctx.sessionProgress));
  const zenVR = s.volume / expected;

  const slope = s.vwapSlope();
  const aboveVwap = price >= vwap;

  const zenP = computeZenP({
    twoMinPct,
    zenVR,
    atrVwap,
    atrHoD,
    atrSprd,
    floatRot,
    zenVUp: slope.up,
    aboveVwap,
  });

  const cells: Record<string, Cell> = {
    gap: cellGap(gapPct),
    twoMin: cellTwoMin(twoMinPct),
    zenVR: cellZenVR(zenVR),
    zenP: cellZenP(zenP),
    zenV: cellZenV(slope.up, slope.magnitude),
    atrVwap: cellAtrVwap(atrVwap),
    atrHoD: cellAtrHoD(atrHoD),
    atrSprd: cellAtrSprd(atrSprd),
    float: cellFloat(s.float),
    floatRot: cellFloatRot(floatRot),
  };

  let greenCount = 0;
  for (const k of GOLDEN_KEYS) {
    if (cells[k] && isGreen(cells[k].level)) greenCount++;
  }
  const greenScore = greenCount / GOLDEN_KEYS.length;
  const allGreen = greenCount === GOLDEN_KEYS.length;

  // SSR: السهم هبط ≥10% عن إغلاق الأمس اليوم (قاعدة SEC 201؛ وللسعودي = ضرب حد ↓)
  const effLow = s.dayLow === Infinity ? price : s.dayLow;
  const ssr = s.prevClose > 0 && effLow <= s.prevClose * 0.9;

  return {
    symbol: s.symbol,
    name: s.name,
    price,
    prevClose: s.prevClose,
    open: s.open,
    dayHigh: s.dayHigh,
    dayLow: s.dayLow === Infinity ? price : s.dayLow,
    premktHigh: s.premktHigh,
    float: s.float,
    volume: s.volume,
    vwap,
    atr,
    gapPct,
    twoMinPct,
    changePct: s.changePct(),
    zenVR,
    zenP,
    zenVUp: slope.up,
    atrVwap,
    atrHoD,
    atrSprd,
    floatRot,
    atrReliable,
    liquidityNet: s.liquidityNet,
    halted: s.halted || undefined,
    haltReason: s.halted ? s.haltReason : undefined,
    ssr: ssr || undefined,
    spread,
    bid: s.bid,
    ask: s.ask,
    cells,
    allGreen,
    greenScore,
    updatedAt: ctx.now,
  };
}
