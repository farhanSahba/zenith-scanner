import type { Alert, AlertKind, AlertTier, SessionPhase, SymbolSnapshot } from "./types";

interface Mem {
  seen: boolean; // شوهد في لقطة سابقة (يمنع دفقة الإقلاع عبر الكون كله)
  approachArmed: boolean; // تسليح تنبيه الاقتراب (hysteresis) لمنع التكرار على نفس المستوى
  lastToHod: number;
  lastApproach: number;
  lastSurge: number;
  lastUp2m: number;
  lastDown2m: number;
  prevZenVR: number; // لكشف الحافة الصاعدة للحجم
  prevTwoMin: number; // لكشف حافة عبور عتبة الزخم (بدل تنبيه متكرّر طوال الموجة)
}

// عتبات كشف وضع الصقر لكل سوق — أبكر إشارة ممكنة، مع حواف وتهدئة تمنع «صياح الذيب».
export interface AlertThresholds {
  surgeZenVR: number; // انفجار حجم: الحجم النسبي ≥ × المتوقّع
  approachAtr: number; // «يقترب»: ضمن هذا العدد من ATR من القمة
  early2m: number; // زخم مبكر % خلال دقيقتين
  strong2m: number; // زخم قوي % خلال دقيقتين
}
// الأمريكي: حركات كبيرة. السعودي: حد النسبة ±10% → عتبات أقل بكثير.
export const ALERTS_US: AlertThresholds = { surgeZenVR: 3, approachAtr: 0.4, early2m: 3, strong2m: 5 };
export const ALERTS_SA: AlertThresholds = { surgeZenVR: 3, approachAtr: 0.4, early2m: 1, strong2m: 2 };

const APPROACH_REARM = 0.8; // لا يُعاد تسليح تنبيه الاقتراب إلا بعد ابتعاد واضح عن القمة

// فترات التهدئة لكل رمز لكل نوع (ms)
const CD_SURGE = 120_000;
const CD_APPROACH = 180_000;
const CD_TOHOD = 45_000;
const CD_2M = 90_000;

// كاشف الأحداث: يقارن اللقطة الحالية بذاكرة لكل رمز ويولّد تنبيهات مصنّفة بطبقات.
export class AlertEngine {
  constructor(private th: AlertThresholds = ALERTS_US) {}
  private mem = new Map<string, Mem>();

  private get(sym: string): Mem {
    let m = this.mem.get(sym);
    if (!m) {
      m = {
        seen: false,
        approachArmed: true,
        lastToHod: 0,
        lastApproach: 0,
        lastSurge: 0,
        lastUp2m: 0,
        lastDown2m: 0,
        prevZenVR: 0,
        prevTwoMin: 0,
      };
      this.mem.set(sym, m);
    }
    return m;
  }

  // phase: والسوق مغلق لا نولّد أي تنبيه (الحالة مجمّدة = تكرار كاذب).
  update(snaps: SymbolSnapshot[], now: number, phase: SessionPhase): Alert[] {
    const out: Alert[] = [];

    // سوق مغلق: نحدّث الذاكرة فقط حتى لا تُحتسب أول لقطة بعد الفتح كحافة كاذبة.
    if (phase === "closed") {
      for (const s of snaps) {
        const m = this.get(s.symbol);
        m.prevZenVR = s.zenVR;
        m.prevTwoMin = s.twoMinPct;
        m.seen = true;
      }
      return out;
    }

    for (const s of snaps) {
      const m = this.get(s.symbol);
      // بوّابة جودة: يتحرّك صعوداً فعلاً (فوق VWAP + ميل صاعد + فوق إغلاق الأمس)
      const rising = s.zenVUp && s.price >= s.vwap && s.changePct > 0;

      // ① انفجار حجم (أبكر إشارة) — حافة صاعدة لعبور ZenVR عتبة الانفجار
      if (
        m.seen &&
        rising &&
        s.zenVR >= this.th.surgeZenVR &&
        m.prevZenVR < this.th.surgeZenVR &&
        now - m.lastSurge > CD_SURGE
      ) {
        m.lastSurge = now;
        out.push(mk(s, now, "surge", "early", `انفجار حجم ×${s.zenVR.toFixed(1)}`, "bull"));
      }

      // ② يقترب من القمة (قبل الكسر) — يتطلّب ATR موثوقاً + تسليحاً (hysteresis)
      const inApproach = s.atrReliable && s.atrHoD > 0.15 && s.atrHoD <= this.th.approachAtr;
      if (m.seen && rising && inApproach && m.approachArmed && now - m.lastApproach > CD_APPROACH) {
        m.lastApproach = now;
        m.approachArmed = false; // لا يُعاد حتى يبتعد السعر عن القمة
        out.push(mk(s, now, "approachHod", "early", "يقترب من القمة", "bull"));
      }
      if (s.atrHoD > APPROACH_REARM) m.approachArmed = true; // إعادة التسليح بعد ابتعاد واضح

      // ③ لمس/كسر قمة اليوم (لحظة الدخول) — يتطلّب ATR موثوقاً و«seen»
      if (
        m.seen &&
        s.atrReliable &&
        s.atrHoD <= 0.15 &&
        s.price >= s.dayHigh * 0.995 &&
        s.zenVUp &&
        now - m.lastToHod > CD_TOHOD
      ) {
        m.lastToHod = now;
        out.push(mk(s, now, "toHod", "trigger", "To HoD", "bull"));
      }

      // ④ زخم دقيقتين صاعد — حافة صاعدة لعبور 3% (قوي عند ≥5%)، لا تكرار طوال الموجة
      if (
        m.seen &&
        s.twoMinPct >= this.th.early2m &&
        m.prevTwoMin < this.th.early2m &&
        now - m.lastUp2m > CD_2M
      ) {
        m.lastUp2m = now;
        const strong = s.twoMinPct >= this.th.strong2m;
        out.push(
          mk(s, now, "up2m", strong ? "trigger" : "early", `+${s.twoMinPct.toFixed(1)} % /2Min`, "bull")
        );
      }

      // ⑤ هبوط دقيقتين حاد — حافة هابطة لعبور -5%
      if (
        m.seen &&
        s.twoMinPct <= -this.th.strong2m &&
        m.prevTwoMin > -this.th.strong2m &&
        now - m.lastDown2m > CD_2M
      ) {
        m.lastDown2m = now;
        const a = mk(s, now, "down2m", "trigger", `${s.twoMinPct.toFixed(1)} % /2Min`, "bear");
        if (s.twoMinPct <= -10) a.warning = "هبوط حاد";
        out.push(a);
      }

      m.prevZenVR = s.zenVR;
      m.prevTwoMin = s.twoMinPct;
      m.seen = true;
    }

    return out;
  }
}

function mk(
  s: SymbolSnapshot,
  now: number,
  kind: AlertKind,
  tier: AlertTier,
  reason: string,
  tone: Alert["tone"]
): Alert {
  return {
    id: `${s.symbol}-${kind}-${now}`,
    symbol: s.symbol,
    reason,
    kind,
    tier,
    price: round(s.price),
    time: now,
    tone,
  };
}

const round = (n: number) => Math.round(n * 100) / 100;
