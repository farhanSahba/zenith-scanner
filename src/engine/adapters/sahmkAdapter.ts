import type { Tick } from "../types";
import type { MarketAdapter, NewsHandler, SymbolSeed, TickHandler } from "./types";

// ===== مزوّد SAHMK (سهمك) للسوق السعودي (تداول) =====
// المرحلة 2: مسار REST عبر الحركة (movers) — متوافق مع الخطة المجانية.
// المجاني: مؤجّل ~15د، بلا WebSocket، 100 طلب/يوم. اللحظي (WebSocket) يتطلب Pro.
// التوثيق: https://www.sahmk.sa/en/developers · Base: https://api.sahmk.sa/api/v1 · مصادقة X-API-Key

const BASE = "https://api.sahmk.sa/api/v1";

interface MoverRow {
  symbol?: string;
  name?: string;
  name_en?: string;
  price?: number;
  change?: number;
  change_percent?: number;
  volume?: number;
  value?: number;
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

export class SahmkAdapter implements MarketAdapter {
  readonly name = "sahmk";
  private key: string;
  private index: string;
  private floats: Record<string, number>;
  private floatCache = new Map<string, number>(); // فلوت مجلوب من fundamentals
  private fetchFloat: boolean;
  private pollMs: number;
  private onTick?: TickHandler;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastVol = new Map<string, number>();
  private stopped = false;

  constructor() {
    this.key = process.env.SAHMK_API_KEY?.trim() || "";
    if (!this.key) throw new Error("SAHMK_API_KEY مفقود");
    this.index = (process.env.SA_INDEX ?? "TASI").toUpperCase();
    this.floats = parseFloats(process.env.SA_FLOATS);
    // جلب الفلوت تلقائياً من /company (يتطلب Starter+؛ مُطفأ افتراضياً لحماية حصّة المجاني)
    this.fetchFloat = (process.env.SA_FETCH_FLOAT ?? "off").toLowerCase() === "on";
    this.pollMs = Math.max(5000, Number(process.env.SAHMK_POLL_MS ?? 15000));
  }

  // الفلوت بالملايين: يدوي (SA_FLOATS) → مجلوب (cache) → افتراضي 50M
  private floatFor(sym: string): number {
    return this.floats[sym] ?? this.floatCache.get(sym) ?? 50;
  }

  // يجلب الفلوت الحر من fundamentals ويخزّنه (اختياري)
  private async loadFloat(sym: string) {
    if (this.floats[sym] != null || this.floatCache.has(sym)) return;
    const c = await this.get<{ fundamentals?: { float_shares?: number } }>(`/company/${sym}/`);
    const fs = Number(c?.fundamentals?.float_shares);
    if (Number.isFinite(fs) && fs > 0) this.floatCache.set(sym, Math.round(fs / 1_000_000));
  }

  // طلب REST مع مصادقة + إعادة محاولة متدرّجة لـ ECONNRESET المتقطّع
  private async get<T>(path: string): Promise<T | null> {
    const headers = {
      "X-API-Key": this.key,
      "User-Agent": "ZenithScanner/1.0",
      Accept: "application/json",
    };
    const delays = [400, 900, 1800, 3500]; // 5 محاولات إجمالاً
    for (let i = 0; i <= delays.length; i++) {
      try {
        const r = await fetch(`${BASE}${path}`, { headers });
        if (r.status === 429) {
          console.warn("[SAHMK] 429 — تجاوز حدّ الطلبات (المجاني 100/يوم).");
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

  // الحركة (الرابحون + الأعلى حجماً) موحّدة — تسلسلياً لتقليل ضغط الاتصالات
  private async fetchMovers(limit = 50): Promise<MoverRow[]> {
    const g = await this.get<{ gainers?: MoverRow[] }>(
      `/market/gainers/?index=${this.index}&limit=${limit}`
    );
    const v = await this.get<{ stocks?: MoverRow[] }>(
      `/market/volume/?index=${this.index}&limit=${limit}`
    );
    const rows = [...(g?.gainers ?? []), ...(v?.stocks ?? [])];
    const seen = new Set<string>();
    const out: MoverRow[] = [];
    for (const r of rows) {
      if (!r?.symbol || seen.has(r.symbol)) continue;
      seen.add(r.symbol);
      out.push(r);
    }
    return out;
  }

  private seedFromRow(r: MoverRow): SymbolSeed {
    const sym = r.symbol as string;
    const price = numOr(r.price, 0);
    const change = numOr(r.change, 0);
    const prevClose = price - change > 0.01 ? price - change : price || 1;
    const vol = numOr(r.volume, 0);
    return {
      symbol: sym,
      float: this.floatFor(sym), // يدوي → مجلوب → افتراضي 50M
      avgDailyVol: vol > 0 ? vol : 1_000_000, // تقريب: لا متوسط في movers (يُحسّن من /historical في Pro)
      prevClose,
      open: price || prevClose,
      dayHighSeed: Math.max(price, prevClose),
      premktHigh: price || prevClose,
      dayVolume: vol > 0 ? vol : undefined,
      dayVwap: price || prevClose, // تقريب (لا VWAP في movers)
    };
  }

  async prepare(): Promise<SymbolSeed[]> {
    const rows = await this.fetchMovers();
    if (this.fetchFloat) await Promise.all(rows.map((r) => this.loadFloat(r.symbol as string)));
    const seeds: SymbolSeed[] = [];
    for (const r of rows) {
      this.lastVol.set(r.symbol as string, numOr(r.volume, 0));
      seeds.push(this.seedFromRow(r));
    }
    if (!seeds.length) console.warn("[SAHMK] لا حركة الآن (سوق مغلق أو خارج أوقات التداول).");
    return seeds;
  }

  start(onTick: TickHandler, _onNews?: NewsHandler) {
    this.onTick = onTick;
    // المجاني: استطلاع دوري للحركة (لا WebSocket). Pro لاحقاً: WebSocket لحظي.
    this.timer = setInterval(() => void this.poll(), this.pollMs);
  }

  private async poll() {
    if (this.stopped || !this.onTick) return;
    const rows = await this.fetchMovers();
    const now = Date.now();
    for (const r of rows) {
      const sym = r.symbol as string;
      const price = numOr(r.price, 0);
      if (price <= 0) continue;
      const vol = numOr(r.volume, 0);
      const prevVol = this.lastVol.get(sym) ?? vol;
      this.lastVol.set(sym, vol);
      const half = Math.max(0.01, price * 0.0008) / 2;
      this.onTick({
        symbol: sym,
        price: round(price, 2),
        size: Math.max(1, vol - prevVol),
        bid: round(price - half, 2),
        ask: round(price + half, 2),
        t: now,
      });
    }
  }

  async screen(maxPrice: number, limit: number): Promise<SymbolSeed[]> {
    const rows = await this.fetchMovers(Math.min(50, Math.max(10, limit)));
    if (this.fetchFloat) await Promise.all(rows.map((r) => this.loadFloat(r.symbol as string)));
    const out: SymbolSeed[] = [];
    for (const r of rows) {
      const price = numOr(r.price, 0);
      if (price <= 0 || price > maxPrice) continue;
      if (!this.lastVol.has(r.symbol as string)) this.lastVol.set(r.symbol as string, numOr(r.volume, 0));
      out.push(this.seedFromRow(r));
    }
    return out;
  }

  subscribe(_symbols: string[]) {
    /* الحركة تُجلب كاملة في كل poll — لا اشتراك فردي في مسار REST */
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
