import { SA_NAMES } from "../saNames";
import type { OHLCV, Tick } from "../types";
import type { MarketAdapter, NewsHandler, SymbolSeed, TickHandler } from "./types";

// ===== مزوّد SAHMK (سهمك) للسوق السعودي (تداول) — المرحلة 3 (Pro) =====
// داتا لحظية (is_delayed=false) عبر REST: الكون من الحركة (movers)، والتحديث من /quotes
// دفعة (حتى 50 رمز/طلب) بلقطة كاملة: bid/ask/OHLC/حجم/قيمة + تدفّق السيولة.
// إثراء: متوسط حجم حقيقي من /historical (1d) لـ ZenVR دقيق، والفلوت من /company fundamentals،
// وتعبئة الشارت من /historical (1min). التوثيق: https://www.sahmk.sa/en/developers
// Base: https://api.sahmk.sa/api/v1 · مصادقة X-API-Key

const BASE = "https://api.sahmk.sa/api/v1";
const BATCH = 50; // أقصى رموز لكل /quotes (max_symbols)

interface MoverRow {
  symbol?: string;
}

interface Quote {
  symbol?: string;
  name?: string;
  name_en?: string;
  price?: number;
  change?: number;
  open?: number;
  high?: number;
  low?: number;
  previous_close?: number;
  volume?: number;
  value?: number; // قيمة التداول (للـ VWAP = value/volume)
  bid?: number;
  ask?: number;
  liquidity?: { net_value?: number };
}

interface HistBar {
  date?: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
}

const numOr = (v: unknown, d: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

function parseFloats(s?: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of (s ?? "").split(",")) {
    const [sym, val] = part.split(":");
    const n = Number(val);
    if (sym?.trim() && Number.isFinite(n)) out[sym.trim()] = n;
  }
  return out;
}

// تنفيذ مهامّ غير متزامنة بتزامن محدود (ألطف على الـ API من Promise.all الجماعي)
async function mapLimit<T>(items: T[], limit: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]);
    }
  });
  await Promise.all(workers);
}

export class SahmkAdapter implements MarketAdapter {
  readonly name = "sahmk";
  private key: string;
  private index: string;
  private floats: Record<string, number>; // يدوي (SA_FLOATS)
  private floatCache = new Map<string, number>(); // فلوت مجلوب (بالملايين)
  private avgVolCache = new Map<string, number>(); // متوسط حجم يومي مجلوب (أسهم)
  private fetchFloat: boolean;
  private pollMs: number;
  private isOpen: () => boolean;
  private universe = new Set<string>(); // كل الرموز المتتبَّعة (للاستطلاع الدفعي)
  private onTick?: TickHandler;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastVol = new Map<string, number>();
  private stopped = false;

  constructor(opts?: { isOpen?: () => boolean }) {
    this.key = process.env.SAHMK_API_KEY?.trim() || "";
    if (!this.key) throw new Error("SAHMK_API_KEY مفقود");
    this.index = (process.env.SA_INDEX ?? "TASI").toUpperCase();
    this.floats = parseFloats(process.env.SA_FLOATS);
    // Pro: الفلوت التلقائي مُفعّل افتراضياً (مُطفأ فقط عند SA_FETCH_FLOAT=off)
    this.fetchFloat = (process.env.SA_FETCH_FLOAT ?? "on").toLowerCase() !== "off";
    // Pro: استطلاع أسرع (افتراضي 4ث) — لا حدّ طلبات يومي
    this.pollMs = Math.max(2000, Number(process.env.SAHMK_POLL_MS ?? 4000));
    this.isOpen = opts?.isOpen ?? (() => true);
  }

  // الفلوت بالملايين: يدوي (SA_FLOATS) → مجلوب (fundamentals) → افتراضي 50M
  private floatFor(sym: string): number {
    return this.floats[sym] ?? this.floatCache.get(sym) ?? 50;
  }
  // متوسط الحجم اليومي (أسهم): مجلوب، وإلا undefined (المستدعي يقرّر التقريب)
  private avgVolFor(sym: string): number | undefined {
    return this.avgVolCache.get(sym);
  }

  // طلب REST مع مصادقة + إعادة محاولة متدرّجة لـ ECONNRESET المتقطّع
  private async get<T>(path: string): Promise<T | null> {
    const headers = {
      "X-API-Key": this.key,
      "User-Agent": "ZenithScanner/1.0",
      Accept: "application/json",
    };
    const delays = [300, 700, 1500, 3000];
    for (let i = 0; i <= delays.length; i++) {
      try {
        const r = await fetch(`${BASE}${path}`, { headers });
        if (r.status === 429) {
          console.warn("[SAHMK] 429 — تجاوز حدّ معدّل الطلبات (أبطئ SAHMK_POLL_MS).");
          return null;
        }
        if (!r.ok) {
          console.warn(`[SAHMK] ${path} → ${r.status}`);
          return null;
        }
        return (await r.json()) as T;
      } catch (e) {
        if (i < delays.length) {
          await new Promise((res) => setTimeout(res, delays[i]));
          continue;
        }
        console.warn("[SAHMK] fetch فشل بعد 5 محاولات:", (e as Error).message);
        return null;
      }
    }
    return null;
  }

  // اكتشاف الكون: الرابحون + الأعلى حجماً (رموز فقط)
  private async discover(limit = 50): Promise<string[]> {
    const g = await this.get<{ gainers?: MoverRow[] }>(
      `/market/gainers/?index=${this.index}&limit=${limit}`
    );
    const v = await this.get<{ stocks?: MoverRow[] }>(
      `/market/volume/?index=${this.index}&limit=${limit}`
    );
    const syms = new Set<string>();
    for (const r of [...(g?.gainers ?? []), ...(v?.stocks ?? [])]) {
      if (r?.symbol) syms.add(r.symbol);
    }
    return [...syms];
  }

  // لقطات كاملة دفعة (حتى 50/طلب) → خريطة رمز→لقطة
  private async fetchQuotes(symbols: string[]): Promise<Map<string, Quote>> {
    const out = new Map<string, Quote>();
    for (let i = 0; i < symbols.length; i += BATCH) {
      const chunk = symbols.slice(i, i + BATCH);
      const d = await this.get<{ quotes?: Quote[] }>(`/quotes/?symbols=${chunk.join(",")}`);
      for (const q of d?.quotes ?? []) if (q?.symbol) out.set(q.symbol, q);
    }
    return out;
  }

  // متوسط الحجم اليومي من /historical (1d) — لـ ZenVR دقيق (مرة لكل رمز)
  private async loadAvgVol(sym: string) {
    if (this.avgVolCache.has(sym)) return;
    const d = await this.get<{ data?: HistBar[] }>(`/historical/${sym}/?interval=1d&limit=20`);
    const vols = (d?.data ?? []).map((b) => numOr(b.volume, 0)).filter((v) => v > 0);
    if (vols.length) this.avgVolCache.set(sym, Math.round(vols.reduce((a, b) => a + b, 0) / vols.length));
  }

  // الفلوت الحر من /company fundamentals (بالملايين) — مرة لكل رمز
  private async loadFloat(sym: string) {
    if (this.floats[sym] != null || this.floatCache.has(sym)) return;
    const c = await this.get<{ fundamentals?: { float_shares?: number } }>(`/company/${sym}/`);
    const fs = Number(c?.fundamentals?.float_shares);
    if (Number.isFinite(fs) && fs > 0) this.floatCache.set(sym, Math.round(fs / 1_000_000));
  }

  // إثراء رموز (متوسط الحجم + الفلوت) بتزامن محدود قبل البذر
  private async enrich(symbols: string[]) {
    await mapLimit(symbols, 8, async (sym) => {
      await this.loadAvgVol(sym);
      if (this.fetchFloat) await this.loadFloat(sym);
    });
  }

  private seedFromQuote(q: Quote): SymbolSeed {
    const sym = q.symbol as string;
    const price = numOr(q.price, 0);
    const pc = numOr(q.previous_close, 0);
    const prevClose = pc > 0.01 ? pc : (price - numOr(q.change, 0) > 0.01 ? price - numOr(q.change, 0) : price || 1);
    const open = numOr(q.open, 0) || price || prevClose;
    const high = Math.max(numOr(q.high, 0), price, open);
    const vol = numOr(q.volume, 0);
    const value = numOr(q.value, 0);
    const vwap = vol > 0 && value > 0 ? value / vol : price || prevClose;
    return {
      symbol: sym,
      name: q.name?.trim() || q.name_en?.trim() || SA_NAMES[sym],
      float: this.floatFor(sym),
      avgDailyVol: this.avgVolFor(sym) ?? (vol > 0 ? vol : 1_000_000),
      prevClose,
      open,
      dayHighSeed: high,
      premktHigh: open,
      dayVolume: vol > 0 ? vol : undefined,
      dayVwap: vwap,
    };
  }

  private seedList(quotes: Map<string, Quote>): SymbolSeed[] {
    const seeds: SymbolSeed[] = [];
    for (const q of quotes.values()) {
      const sym = q.symbol as string;
      this.universe.add(sym);
      this.lastVol.set(sym, numOr(q.volume, 0));
      seeds.push(this.seedFromQuote(q));
    }
    return seeds;
  }

  async prepare(): Promise<SymbolSeed[]> {
    // Pro: نجلب لقطة واحدة حتى والسوق مغلق (لعرض آخر جلسة)؛ الاستطلاع المتكرّر يُبوَّب في poll.
    const syms = await this.discover();
    if (!syms.length) {
      console.warn("[SAHMK] لا حركة الآن (سوق مغلق أو خارج أوقات التداول).");
      return [];
    }
    await this.enrich(syms); // متوسط الحجم + الفلوت قبل البذر (ZenVR دقيق)
    const quotes = await this.fetchQuotes(syms);
    return this.seedList(quotes);
  }

  start(onTick: TickHandler, _onNews?: NewsHandler) {
    this.onTick = onTick;
    void this.poll(true); // لقطة أولى فورية (حتى والسوق مغلق) لعرض آخر جلسة كاملة + السيولة
    this.timer = setInterval(() => void this.poll(), this.pollMs);
  }

  private async poll(force = false) {
    if (this.stopped || !this.onTick) return;
    if (!force && !this.isOpen()) return; // لا استطلاع متكرّر والسوق مغلق (الداتا ثابتة)
    const syms = [...this.universe];
    if (!syms.length) return;
    const quotes = await this.fetchQuotes(syms);
    const now = Date.now();
    for (const q of quotes.values()) {
      const sym = q.symbol as string;
      const price = numOr(q.price, 0);
      if (price <= 0) continue;
      const vol = numOr(q.volume, 0);
      const prevVol = this.lastVol.get(sym) ?? vol;
      this.lastVol.set(sym, vol);
      const value = numOr(q.value, 0);
      const vwap = vol > 0 && value > 0 ? value / vol : undefined;
      const tick: Tick = {
        symbol: sym,
        price: round(price, 2),
        size: Math.max(0, vol - prevVol),
        bid: round(numOr(q.bid, price), 2),
        ask: round(numOr(q.ask, price), 2),
        t: now,
        dayHigh: numOr(q.high, 0) || undefined,
        dayLow: numOr(q.low, 0) || undefined,
        dayVolume: vol > 0 ? vol : undefined,
        dayVwap: vwap,
        liquidityNet: q.liquidity?.net_value,
      };
      this.onTick(tick);
    }
  }

  async screen(maxPrice: number, limit: number): Promise<SymbolSeed[]> {
    if (!this.isOpen()) return []; // السوق مغلق — لا فرز
    const syms = await this.discover(Math.min(50, Math.max(10, limit)));
    await this.enrich(syms); // متوسط الحجم + الفلوت للرموز الجديدة
    const quotes = await this.fetchQuotes(syms);
    const out: SymbolSeed[] = [];
    for (const q of quotes.values()) {
      const price = numOr(q.price, 0);
      if (price <= 0 || price > maxPrice) continue;
      const sym = q.symbol as string;
      this.universe.add(sym); // ليشمله الاستطلاع الدفعي؛ onTick يأتي من poll التالي
      if (!this.lastVol.has(sym)) this.lastVol.set(sym, numOr(q.volume, 0));
      out.push(this.seedFromQuote(q));
    }
    return out;
  }

  subscribe(symbols: string[]) {
    for (const s of symbols) this.universe.add(s); // ليشملها الاستطلاع الدفعي
  }

  // تاريخ 15د لرمز (أحدث ~120 بار) لسياق الشارت — 15min متاح على Pro (1min يتطلب Enterprise)
  async history(sym: string): Promise<OHLCV[]> {
    const d = await this.get<{ data?: HistBar[] }>(`/historical/${sym}/?interval=15min&limit=500`);
    const bars: OHLCV[] = [];
    for (const b of d?.data ?? []) {
      const t = Date.parse(b.date ?? "");
      const c = numOr(b.close, 0);
      if (!Number.isFinite(t) || c <= 0) continue;
      bars.push({ t, o: numOr(b.open, c), h: numOr(b.high, c), l: numOr(b.low, c), c, v: numOr(b.volume, 0) });
    }
    bars.sort((a, b) => a.t - b.t); // تصاعدي زمنياً (الـ API يرجّع من الأقدم)
    return bars.slice(-120); // أحدث ~120 بار (≈6 أيام تداول)
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

function round(n: number, d = 2) {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}
