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
// يولّد tape حيّ لأسهم ضاربة (gappers / runners / faders / dumpers)
// مع انفجارات زخم قصيرة تصنع قمم يوم وتنبيهات 2 دقيقة واقعية.
// لا يحتاج أي إنترنت أو حساب — يشتغل فوراً.

type Character = "runner" | "gapper" | "fader" | "chop" | "dumper";

interface SimSym {
  seed: SymbolSeed;
  character: Character;
  price: number;
  dayHigh: number;
  drift: number; // ميل لحظي
  burst: number; // عدّاد انفجار الزخم المتبقي (ticks)
  burstDir: number; // اتجاه الانفجار (+1/-1)
  vol: number; // تقلّب أساسي نسبي
  activity: number; // 0..1 احتمال إصدار tick كل دورة
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

function randomSymbol(used: Set<string>): string {
  const L = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let s = "";
  do {
    const n = Math.random() < 0.5 ? 3 : 4;
    s = "";
    for (let i = 0; i < n; i++) s += L[Math.floor(Math.random() * L.length)];
  } while (used.has(s));
  used.add(s);
  return s;
}

function buildSeeds(count: number): SymbolSeed[] {
  const seeds: SymbolSeed[] = [];
  const used = new Set<string>();
  for (let i = 0; i < count; i++) {
    const symbol = randomSymbol(used);
    const character = weightedChar();

    // الفلوت منحاز للمنخفض (أكثر الضاربات)
    const floatM =
      Math.random() < 0.6
        ? rnd(0.3, 15) // فلوت منخفض
        : Math.random() < 0.7
        ? rnd(15, 60)
        : rnd(60, 180);

    // سعر منخفض غالباً
    const prevClose =
      Math.random() < 0.7 ? rnd(0.4, 8) : rnd(8, 40);

    // Gap حسب الطبع
    let gap = 0;
    if (character === "gapper" || character === "runner") {
      gap = floatM < 15 ? rnd(0.08, 0.9) : rnd(0.05, 0.3); // الفلوت المنخفض يفجّر
    } else if (character === "fader") {
      gap = rnd(0.1, 0.5);
    } else if (character === "dumper") {
      gap = rnd(-0.05, 0.12);
    } else {
      gap = rnd(-0.02, 0.08);
    }

    const open = Math.max(0.1, prevClose * (1 + gap));
    const avgDailyVol =
      (floatM < 15 ? rnd(2, 20) : rnd(0.5, 8)) * 1_000_000;

    const dayHighSeed = Math.max(open, open * rnd(1.0, 1.15));
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

const NEWS_TEMPLATES: { kind: NewsEvent["kind"]; en: string; src: string }[] = [
  { kind: "contract", en: "announces $%M multi-year supply agreement with major OEM", src: "PR Newswire" },
  { kind: "fda", en: "receives FDA clearance for its lead device", src: "GlobeNewswire" },
  { kind: "earnings", en: "reports Q beat, revenue up %% YoY", src: "Business Wire" },
  { kind: "analyst", en: "upgraded to Buy, price target raised", src: "Benzinga" },
  { kind: "offering", en: "announces $%M registered direct offering priced at a discount", src: "SEC 424B5" },
  { kind: "pr", en: "unveils strategic partnership to expand AI platform", src: "PR Newswire" },
];

export class SimAdapter implements MarketAdapter {
  readonly name = "sim";
  private syms: SimSym[] = [];
  private seedList: SymbolSeed[];
  private timer: ReturnType<typeof setInterval> | null = null;
  private newsTimer: ReturnType<typeof setInterval> | null = null;

  constructor(count = 60) {
    this.seedList = buildSeeds(count);
    this.syms = this.seedList.map((seed) => this.initSym(seed));
  }

  private initSym(seed: SymbolSeed): SimSym {
    // استنتاج الطبع من الفجوة/الفلوت (تقريبي)
    const gap = (seed.open - seed.prevClose) / seed.prevClose;
    let character: Character = "chop";
    if (gap > 0.25 && seed.float < 20) character = Math.random() < 0.6 ? "runner" : "gapper";
    else if (gap > 0.08) character = Math.random() < 0.5 ? "gapper" : "fader";
    else if (gap < 0) character = "dumper";

    return {
      seed,
      character,
      price: seed.open,
      dayHigh: seed.dayHighSeed,
      drift: 0,
      burst: 0,
      burstDir: 1,
      vol: (character === "runner" || character === "gapper" ? 0.006 : 0.004) * (seed.open < 3 ? 1.5 : 1),
      activity:
        character === "runner" ? 0.9 : character === "chop" ? 0.35 : 0.6,
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
      this.newsTimer = setInterval(() => {
        const s = pick(this.syms);
        const tpl = pick(NEWS_TEMPLATES);
        const headline = `${s.seed.symbol} ${tpl.en
          .replace("%M", String(Math.round(rnd(3, 60))))
          .replace("%%", String(Math.round(rnd(12, 240))))
          .replace("%", "")}`;
        onNews({
          symbol: s.seed.symbol,
          headline,
          source: tpl.src,
          time: Date.now(),
          kind: tpl.kind,
        });
      }, 9_000);
    }
  }

  // خطوة سعرية لرمز واحد (مُقيّدة لتعطي نطاقات واقعية)
  private step(s: SimSym) {
    // إطلاق انفجار زخم عشوائياً
    if (s.burst <= 0 && Math.random() < 0.014) {
      s.burst = Math.round(rnd(6, 16));
      if (s.character === "runner" || s.character === "gapper")
        s.burstDir = Math.random() < 0.78 ? 1 : -1;
      else if (s.character === "fader" || s.character === "dumper")
        s.burstDir = Math.random() < 0.75 ? -1 : 1;
      else s.burstDir = Math.random() < 0.5 ? 1 : -1;
    }

    // الميل الأساسي حسب الطبع
    let baseDrift = 0;
    switch (s.character) {
      case "runner": baseDrift = 0.0006; break;
      case "gapper": baseDrift = 0.0002; break;
      case "fader": baseDrift = -0.0005; break;
      case "dumper": baseDrift = -0.0009; break;
      case "chop": baseDrift = 0; break;
    }

    let drift = baseDrift;
    if (s.burst > 0) {
      drift += s.burstDir * s.vol * rnd(1.2, 2.2);
      s.burst--;
    }

    // ارتداد نحو المرساة (الافتتاح) يمنع الانفلات ويحاكي نطاق اليوم
    const anchor = s.seed.open;
    const ext = s.price / anchor;
    if (ext > 1.3) drift -= (ext - 1.3) * 0.02;
    else if (ext < 0.7) drift += (0.7 - ext) * 0.02;
    if (s.character === "chop") drift += (anchor - s.price) / Math.max(anchor, 0.1) * 0.02;

    const noise = (Math.random() - 0.5) * 2 * s.vol;
    let pct = drift + noise;
    pct = Math.max(-0.06, Math.min(0.06, pct)); // حدّ لكل tick

    s.price = s.price * (1 + pct);

    // سقف/أرضية صلبة (الفلوت المنخفض يركض بقوة لكن ليس بلا حدود)
    const ceil = Math.max(anchor, s.seed.prevClose) * 3.2;
    const floor = s.seed.prevClose * 0.25;
    s.price = Math.max(floor, Math.min(ceil, s.price));

    if (s.price > s.dayHigh) s.dayHigh = s.price;
  }

  private sizeFor(s: SimSym): number {
    const base = s.seed.avgDailyVol / 20_000; // متوسط لكل tick تقريبي
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
