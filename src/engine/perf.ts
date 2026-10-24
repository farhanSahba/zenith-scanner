import fs from "node:fs";
import path from "node:path";
import type { Alert, SymbolSnapshot } from "./types";

// متتبّع أداء التنبيهات: يسجّل كل تنبيه، يقيس أقصى حركة مواتية بعده خلال أفق زمني،
// ويحسب نسبة نجاح كل نوع — لبناء الثقة بالأرقام قبل رأس المال الحقيقي.

export interface PerfEntry {
  id: string;
  symbol: string;
  kind: string;
  tone: "bull" | "bear";
  price: number; // سعر لحظة التنبيه
  time: number;
  maxFav: number; // أقصى حركة مواتية % (صعود للشراء، هبوط للتحذير)
  maxAdv: number; // أقصى حركة معاكسة %
  settled: boolean; // انتهى الأفق الزمني؟
  outcome: "win" | "loss" | null;
  settledMove: number | null; // الحركة المواتية عند انتهاء الأفق %
}

interface Agg {
  count: number;
  settled: number;
  wins: number;
  winRate: number; // %
  avgMaxFav: number; // %
}

export interface PerfStats {
  horizonMin: number;
  winPct: number;
  overall: Agg;
  byKind: Record<string, Agg>;
}

const WIN_PCT = Number(process.env.ALERT_WIN_PCT ?? 2); // هدف الربح لاعتبار التنبيه ناجحاً
const HORIZON = Math.max(1, Number(process.env.ALERT_HORIZON_MIN ?? 15)) * 60_000;
const CAP = 2000;

export class PerfTracker {
  private entries: PerfEntry[] = [];
  private readonly file: string;
  private dirty = false;

  constructor() {
    this.file = path.join(process.cwd(), "data", "perf.json");
    this.load();
  }

  private load() {
    try {
      const arr = JSON.parse(fs.readFileSync(this.file, "utf8"));
      if (Array.isArray(arr)) this.entries = arr.slice(-CAP);
    } catch {
      /* أول تشغيل — لا ملف بعد */
    }
  }

  save() {
    if (!this.dirty) return;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.entries.slice(-CAP)));
      this.dirty = false;
    } catch {
      /* تجاهل أخطاء الكتابة */
    }
  }

  // تسجيل تنبيهات جديدة (مرة واحدة لكل id). يُمرّر كامل قائمة التنبيهات بأمان.
  record(alerts: Alert[]) {
    const seen = new Set(this.entries.map((e) => e.id));
    for (const a of alerts) {
      if (a.tone === "info" || seen.has(a.id) || a.price <= 0) continue;
      this.entries.push({
        id: a.id,
        symbol: a.symbol,
        kind: a.kind ?? "other",
        tone: a.tone,
        price: a.price,
        time: a.time,
        maxFav: 0,
        maxAdv: 0,
        settled: false,
        outcome: null,
        settledMove: null,
      });
      seen.add(a.id);
      this.dirty = true;
    }
    if (this.entries.length > CAP) this.entries = this.entries.slice(-CAP);
  }

  // تحديث النتائج من الأسعار الحالية وإغلاق ما انتهى أفقه.
  update(snaps: Map<string, SymbolSnapshot>, now: number) {
    for (const e of this.entries) {
      if (e.settled) continue;
      const s = snaps.get(e.symbol);
      if (s && s.price > 0) {
        const movePct = ((s.price - e.price) / e.price) * 100;
        const fav = e.tone === "bear" ? -movePct : movePct; // الهبوط مواتٍ لتنبيهات التحذير
        if (fav > e.maxFav) e.maxFav = fav;
        if (fav < e.maxAdv) e.maxAdv = fav;
        this.dirty = true;
        if (now - e.time >= HORIZON) {
          e.settled = true;
          e.settledMove = Math.round(fav * 100) / 100;
          e.outcome = e.maxFav >= WIN_PCT ? "win" : "loss";
        }
      } else if (now - e.time >= HORIZON) {
        // لا سعر متاح عند الإغلاق — نُقيّم بأقصى حركة مُسجّلة
        e.settled = true;
        e.settledMove = Math.round(e.maxFav * 100) / 100;
        e.outcome = e.maxFav >= WIN_PCT ? "win" : "loss";
        this.dirty = true;
      }
    }
  }

  stats(): PerfStats {
    const acc: Record<string, { count: number; settled: number; wins: number; favSum: number }> = {
      __all__: { count: 0, settled: 0, wins: 0, favSum: 0 },
    };
    for (const e of this.entries) {
      const a = acc[e.kind] ?? (acc[e.kind] = { count: 0, settled: 0, wins: 0, favSum: 0 });
      for (const g of [acc.__all__, a]) {
        g.count++;
        g.favSum += e.maxFav;
        if (e.settled) {
          g.settled++;
          if (e.outcome === "win") g.wins++;
        }
      }
    }
    const fin = (g: { count: number; settled: number; wins: number; favSum: number }): Agg => ({
      count: g.count,
      settled: g.settled,
      wins: g.wins,
      winRate: g.settled ? Math.round((g.wins / g.settled) * 1000) / 10 : 0,
      avgMaxFav: g.count ? Math.round((g.favSum / g.count) * 100) / 100 : 0,
    });
    const byKind: Record<string, Agg> = {};
    for (const k of Object.keys(acc)) if (k !== "__all__") byKind[k] = fin(acc[k]);
    return { horizonMin: HORIZON / 60_000, winPct: WIN_PCT, overall: fin(acc.__all__), byKind };
  }

  recent(n = 40): PerfEntry[] {
    return this.entries.slice(-n).reverse();
  }
}
