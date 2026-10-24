import type { Alert, SymbolSnapshot } from "./types";

interface Mem {
  lastToHod: number;
  lastUp2m: number;
  lastDown2m: number;
  lastHod: number; // آخر قيمة قمة يوم نبّهنا عنها
}

// كاشف الأحداث: يقارن اللقطة الحالية بذاكرة لكل رمز ويولّد تنبيهات مع تهدئة.
export class AlertEngine {
  private mem = new Map<string, Mem>();

  private get(sym: string): Mem {
    let m = this.mem.get(sym);
    if (!m) {
      m = { lastToHod: 0, lastUp2m: 0, lastDown2m: 0, lastHod: 0 };
      this.mem.set(sym, m);
    }
    return m;
  }

  update(snaps: SymbolSnapshot[], now: number): Alert[] {
    const out: Alert[] = [];

    for (const s of snaps) {
      const m = this.get(s.symbol);

      // To HoD — يقترب/يلامس قمة اليوم بزخم صاعد
      if (
        s.atrHoD <= 0.15 &&
        s.price >= s.dayHigh * 0.995 &&
        s.zenVUp &&
        now - m.lastToHod > 45_000
      ) {
        m.lastToHod = now;
        out.push({
          id: `${s.symbol}-hod-${now}`,
          symbol: s.symbol,
          reason: "To HoD",
          price: round(s.price),
          time: now,
          tone: "bull",
        });
      }

      // +X% /2Min — قفزة حادة خلال دقيقتين
      if (s.twoMinPct >= 5 && now - m.lastUp2m > 25_000) {
        m.lastUp2m = now;
        out.push({
          id: `${s.symbol}-up2m-${now}`,
          symbol: s.symbol,
          reason: `+${s.twoMinPct.toFixed(1)} % /2Min`,
          price: round(s.price),
          time: now,
          tone: "bull",
        });
      }

      // -X% /2Min — هبوط حاد خلال دقيقتين
      if (s.twoMinPct <= -5 && now - m.lastDown2m > 25_000) {
        m.lastDown2m = now;
        out.push({
          id: `${s.symbol}-dn2m-${now}`,
          symbol: s.symbol,
          reason: `${s.twoMinPct.toFixed(1)} % /2Min`,
          price: round(s.price),
          warning: s.twoMinPct <= -10 ? "هبوط حاد" : undefined,
          time: now,
          tone: "bear",
        });
      }
    }

    return out;
  }
}

const round = (n: number) => Math.round(n * 100) / 100;
