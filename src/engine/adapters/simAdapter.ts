import { TICK_MS } from "../const";
import type { Tick } from "../types";
import type {
  MarketAdapter,
  NewsEvent,
  NewsHandler,
  SymbolSeed,
  TickHandler,
} from "./types";

// ===== محرّك محاكاة سوق واقعي =====
// يولّد tape حيّ لأسهم ضاربة مع انفجارات زخم قصيرة تصنع قمم يوم وتنبيهات واقعية.
// profile = "us": أسهم صغيرة متفجّرة (±مئات%). "sa": تداول بحد نسبة ±10%.
// لا يحتاج إنترنت أو حساب — يشتغل فوراً.

export type SimProfile = "us" | "sa";

type Character = "runner" | "gapper" | "fader" | "chop" | "dumper";

interface SimSym {
  seed: SymbolSeed;
  character: Character;
  price: number;
  dayHigh: number;
  burst: number;
  burstDir: number;
  vol: number;
  activity: number;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

const CHARS: { c: Character; w: number }[] = [
  { c: "gapper", w: 0.3 },
  { c: "runner", w: 0.22 },
  { c: "fader", w: 0.2 },
  { c: "chop", w: 0.18 },
  { c: "dumper", w: 0.1 },
];

function weightedChar(): Character {
  const r = Math.random();
  let acc = 0;
  for (const x of CHARS) {
    acc += x.w;
    if (r <= acc) return x.c;
  }
  return "chop";
}

function randomSymbol(used: Set<string>, profile: SimProfile): string {
  let s = "";
  if (profile === "sa") {
    // رمز سعودي: 4 أرقام (1000–9999)
    do {
      s = String(Math.floor(1000 + Math.random() * 9000));
    } while (used.has(s));
  } else {
    const L = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    do {
      const n = Math.random() < 0.5 ? 3 : 4;
      s = "";
      for (let i = 0; i < n; i++) s += L[Math.floor(Math.random() * L.length)];
    } while (used.has(s));
  }
  used.add(s);
  return s;
}

function buildSeeds(count: number, profile: SimProfile): SymbolSeed[] {
  const seeds: SymbolSeed[] = [];
  const used = new Set<string>();
  const sa = profile === "sa";
  for (let i = 0; i < count; i++) {
    const symbol = randomSymbol(used, profile);
    const character = weightedChar();

    const floatM = sa
      ? rnd(20, 800) // فلوت سعودي أكبر (ملايين الأسهم)
      : Math.random() < 0.6
      ? rnd(0.3, 15)
      : Math.random() < 0.7
      ? rnd(15, 60)
      : rnd(60, 180);

    const prevClose = sa
      ? Math.random() < 0.7
        ? rnd(10, 80) // أسعار تداول بالريال
        : rnd(80, 250)
      : Math.random() < 0.7
      ? rnd(0.4, 8)
      : rnd(8, 40);

    // الفجوة: السعودي محدود (±10%)، الأمريكي متفجّر
    let gap = 0;
    if (sa) {
      if (character === "gapper" || character === "runner") gap = rnd(0.015, 0.06);
      else if (character === "fader") gap = rnd(0.01, 0.05);
      else if (character === "dumper") gap = rnd(-0.04, 0.01);
      else gap = rnd(-0.015, 0.03);
    } else {
      if (character === "gapper" || character === "runner") gap = floatM < 15 ? rnd(0.08, 0.9) : rnd(0.05, 0.3);
      else if (character === "fader") gap = rnd(0.1, 0.5);
      else if (character === "dumper") gap = rnd(-0.05, 0.12);
      else gap = rnd(-0.02, 0.08);
    }

    const open = Math.max(sa ? 1 : 0.1, prevClose * (1 + gap));
    const avgDailyVol = sa
      ? rnd(0.5, 10) * 1_000_000
      : (floatM < 15 ? rnd(2, 20) : rnd(0.5, 8)) * 1_000_000;

    const dayHighSeed = Math.max(open, open * rnd(1.0, sa ? 1.05 : 1.15));
    const premktHigh = character === "fader" ? dayHighSeed : open * rnd(0.98, 1.05);

    seeds.push({
      symbol,
      float: round(floatM, 2),
      avgDailyVol: Math.round(avgDailyVol),
      prevClose: round(prevClose, 2),
      open: round(open, 2),
      dayHighSeed: round(dayHighSeed, 2),
      premktHigh: round(premktHigh, 2),
    });
  }
  return seeds;
}

const NEWS_US: { kind: NewsEvent["kind"]; en: string; src: string }[] = [
  { kind: "contract", en: "announces $%M multi-year supply agreement with major OEM", src: "PR Newswire" },
  { kind: "fda", en: "receives FDA clearance for its lead device", src: "GlobeNewswire" },
  { kind: "earnings", en: "reports Q beat, revenue up %% YoY", src: "Business Wire" },
  { kind: "analyst", en: "upgraded to Buy, price target raised", src: "Benzinga" },
  { kind: "offering", en: "announces $%M registered direct offering priced at a discount", src: "SEC 424B5" },
  { kind: "pr", en: "unveils strategic partnership to expand AI platform", src: "PR Newswire" },
];

const NEWS_SA: { kind: NewsEvent["kind"]; en: string; src: string }[] = [
  { kind: "contract", en: "توقّع عقداً بقيمة %M مليون ريال مع جهة حكومية", src: "تداول" },
  { kind: "earnings", en: "أرباح الربع ترتفع %% سنوياً", src: "تداول" },
  { kind: "analyst", en: "رفع توصية من محلّل مع سعر مستهدف أعلى", src: "أرقام" },
  { kind: "offering", en: "إعلان عن طرح/زيادة رأس المال — حذر", src: "تداول" },
  { kind: "pr", en: "توقيع شراكة استراتيجية للتوسّع", src: "مباشر" },
  { kind: "contract", en: "ترسية مشروع بقيمة %M مليون ريال", src: "تداول" },
];

export class SimAdapter implements MarketAdapter {
  readonly name = "sim";
  private syms: SimSym[] = [];
  private seedList: SymbolSeed[];
  private timer: ReturnType<typeof setInterval> | null = null;
  private newsTimer: ReturnType<typeof setInterval> | null = null;
  private profile: SimProfile;

  constructor(count = 60, profile: SimProfile = "us") {
    this.profile = profile;
    this.seedList = buildSeeds(count, profile);
    this.syms = this.seedList.map((seed) => this.initSym(seed));
  }

  private initSym(seed: SymbolSeed): SimSym {
    const gap = (seed.open - seed.prevClose) / seed.prevClose;
    let character: Character = "chop";
    if (this.profile === "sa") {
      if (gap > 0.03) character = Math.random() < 0.6 ? "runner" : "gapper";
      else if (gap > 0.01) character = Math.random() < 0.5 ? "gapper" : "fader";
      else if (gap < 0) character = "dumper";
    } else {
      if (gap > 0.25 && seed.float < 20) character = Math.random() < 0.6 ? "runner" : "gapper";
      else if (gap > 0.08) character = Math.random() < 0.5 ? "gapper" : "fader";
      else if (gap < 0) character = "dumper";
    }

    const baseVol = this.profile === "sa" ? 0.0018 : 0.006;
    return {
      seed,
      character,
      price: seed.open,
      dayHigh: seed.dayHighSeed,
      burst: 0,
      burstDir: 1,
      vol:
        (character === "runner" || character === "gapper" ? baseVol : baseVol * 0.67) *
        (this.profile === "us" && seed.open < 3 ? 1.5 : 1),
      activity: character === "runner" ? 0.9 : character === "chop" ? 0.35 : 0.6,
    };
  }

  async prepare(): Promise<SymbolSeed[]> {
    return this.seedList;
  }

  start(onTick: TickHandler, onNews?: NewsHandler) {
    this.timer = setInterval(() => {
      const now = Date.now();
      for (const s of this.syms) {
        if (Math.random() > s.activity) continue;
        this.step(s);
        const price = s.price;
        const spreadBps = price < 1 ? 0.01 : price < 5 ? 0.004 : 0.0015;
        const half = Math.max(0.005, price * spreadBps) / 2;
        const tick: Tick = {
          symbol: s.seed.symbol,
          price: round(price, price < 1 ? 4 : 2),
          size: this.sizeFor(s),
          bid: round(price - half, 4),
          ask: round(price + half, 4),
          t: now,
        };
        onTick(tick);
      }
    }, TICK_MS);

    if (onNews) {
      const templates = this.profile === "sa" ? NEWS_SA : NEWS_US;
      this.newsTimer = setInterval(() => {
        const s = pick(this.syms);
        const tpl = pick(templates);
        const headline = `${s.seed.symbol} ${tpl.en
          .replace("%M", String(Math.round(rnd(3, 60))))
          .replace("%%", String(Math.round(rnd(12, 240))))
          .replace("%", "")}`;
        onNews({ symbol: s.seed.symbol, headline, source: tpl.src, time: Date.now(), kind: tpl.kind });
      }, 9_000);
    }
  }

  private step(s: SimSym) {
    const sa = this.profile === "sa";
    if (s.burst <= 0 && Math.random() < 0.014) {
      s.burst = Math.round(rnd(6, 16));
      if (s.character === "runner" || s.character === "gapper") s.burstDir = Math.random() < 0.78 ? 1 : -1;
      else if (s.character === "fader" || s.character === "dumper") s.burstDir = Math.random() < 0.75 ? -1 : 1;
      else s.burstDir = Math.random() < 0.5 ? 1 : -1;
    }

    let baseDrift = 0;
    switch (s.character) {
      case "runner": baseDrift = sa ? 0.0002 : 0.0006; break;
      case "gapper": baseDrift = sa ? 0.0001 : 0.0002; break;
      case "fader": baseDrift = sa ? -0.00015 : -0.0005; break;
      case "dumper": baseDrift = sa ? -0.0003 : -0.0009; break;
      case "chop": baseDrift = 0; break;
    }

    let drift = baseDrift;
    if (s.burst > 0) {
      drift += s.burstDir * s.vol * rnd(1.2, 2.2);
      s.burst--;
    }

    const anchor = s.seed.open;
    const ext = s.price / anchor;
    if (ext > 1.3) drift -= (ext - 1.3) * 0.02;
    else if (ext < 0.7) drift += (0.7 - ext) * 0.02;
    if (s.character === "chop") drift += ((anchor - s.price) / Math.max(anchor, 0.1)) * 0.02;

    const noise = (Math.random() - 0.5) * 2 * s.vol;
    let pct = drift + noise;
    const tickClamp = sa ? 0.015 : 0.06; // السعودي حركة أهدأ لكل tick
    pct = Math.max(-tickClamp, Math.min(tickClamp, pct));

    s.price = s.price * (1 + pct);

    // الحدود: السعودي ±10% من إغلاق الأمس (حد النسبة)؛ الأمريكي نطاق واسع.
    const ceil = sa ? s.seed.prevClose * 1.1 : Math.max(anchor, s.seed.prevClose) * 3.2;
    const floor = sa ? s.seed.prevClose * 0.9 : s.seed.prevClose * 0.25;
    s.price = Math.max(floor, Math.min(ceil, s.price));

    if (s.price > s.dayHigh) s.dayHigh = s.price;
  }

  private sizeFor(s: SimSym): number {
    const base = s.seed.avgDailyVol / 20_000;
    const mult = s.burst > 0 ? rnd(2, 6) : rnd(0.3, 1.4);
    return Math.max(1, Math.round(base * mult));
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.newsTimer) clearInterval(this.newsTimer);
    this.timer = null;
    this.newsTimer = null;
  }
}

function round(n: number, d = 2) {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}
