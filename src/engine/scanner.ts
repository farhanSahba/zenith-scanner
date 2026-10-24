import type { PanelKey, SymbolSnapshot } from "./types";

// عتبات الماسح (قابلة للضبط). كلٌّ منها يبني لوحة مستقلة.
export const PRESETS = {
  gapUpMin: 3, // % فجوة صاعدة
  lowFloatMax: 20, // بالملايين
  momo2mMin: 3, // % خلال دقيقتين
  hodAtrMax: 0.5, // القرب من قمة اليوم بوحدات ATR
};

const take = <T>(arr: T[], n: number) => arr.slice(0, n);

// يصنّف قائمة الرموز إلى لوحات الماسح الخمس، مرتّبة.
export function classify(
  snaps: SymbolSnapshot[]
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
