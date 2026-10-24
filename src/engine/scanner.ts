import type { PanelKey, SymbolSnapshot } from "./types";

// عتبات الماسح لكل سوق (كلٌّ منها يبني لوحة مستقلة).
export interface Preset {
  gapUpMin: number; // % فجوة صاعدة
  lowFloatMax: number; // بالملايين
  momo2mMin: number; // % خلال دقيقتين
  hodAtrMax: number; // القرب من قمة اليوم بوحدات ATR
}

// السوق الأمريكي: أسهم صغيرة متفجّرة (±مئات %)
export const PRESETS_US: Preset = {
  gapUpMin: 3,
  lowFloatMax: 20,
  momo2mMin: 3,
  hodAtrMax: 0.5,
};

// السوق السعودي: حد النسبة ±10% → حركات أصغر، عتبات أقل
export const PRESETS_SA: Preset = {
  gapUpMin: 2,
  lowFloatMax: 500,
  momo2mMin: 1.5,
  hodAtrMax: 0.6,
};

const take = <T>(arr: T[], n: number) => arr.slice(0, n);

// يصنّف قائمة الرموز إلى لوحات الماسح الخمس، مرتّبة (بعتبات السوق).
export function classify(
  snaps: SymbolSnapshot[],
  PRESETS: Preset = PRESETS_US
): Record<PanelKey, SymbolSnapshot[]> {
  // Momo HOD: فوق الـ VWAP، قريب جداً من قمة اليوم، بميل صاعد وحجم نسبي جيد.
  const momoHod = take(
    snaps
      .filter(
        (s) =>
          s.price >= s.vwap &&
          s.atrHoD <= PRESETS.hodAtrMax &&
          s.zenVUp &&
          s.zenVR >= 1.3 &&
          s.changePct > 0
      )
      .sort((a, b) => b.zenP - a.zenP),
    14
  );

  // Gap Up: كل الفجوات الصاعدة فوق العتبة.
  const gapUp = take(
    snaps
      .filter((s) => s.gapPct >= PRESETS.gapUpMin)
      .sort((a, b) => b.gapPct - a.gapPct),
    18
  );

  // Gap Up LowFloat: فجوة صاعدة + فلوت منخفض.
  const gapUpLowFloat = take(
    snaps
      .filter((s) => s.gapPct >= PRESETS.gapUpMin && s.float <= PRESETS.lowFloatMax)
      .sort((a, b) => b.gapPct - a.gapPct),
    14
  );

  // 2 min Momo UP: قفزة قوية خلال دقيقتين.
  const momo2mUp = take(
    snaps
      .filter((s) => s.twoMinPct >= PRESETS.momo2mMin)
      .sort((a, b) => b.twoMinPct - a.twoMinPct),
    12
  );

  // 2 min Momo DOWN: هبوط حاد خلال دقيقتين.
  const momo2mDown = take(
    snaps
      .filter((s) => s.twoMinPct <= -PRESETS.momo2mMin)
      .sort((a, b) => a.twoMinPct - b.twoMinPct),
    12
  );

  return { momoHod, gapUp, gapUpLowFloat, momo2mUp, momo2mDown };
}
