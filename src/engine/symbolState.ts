import { MIN, TWO_MIN } from "./const";
import type { OHLCV, Tick, SessionPhase } from "./types";

// حالة لحظية لكل رمز: تُحدَّث مع كل tick وتحسب المؤشرات المتدحرجة.
export class SymbolState {
  readonly symbol: string;
  float: number; // بالملايين من الأسهم
  avgDailyVol: number; // متوسط حجم اليوم (لحساب ZenVR)
  prevClose: number;

  open = 0;
  price = 0;
  bid = 0;
  ask = 0;
  dayHigh = 0;
  dayLow = Infinity;
  premktHigh = 0;

  volume = 0; // الحجم التراكمي للجلسة (أسهم)
  private cumPV = 0; // Σ(سعر×حجم)
  vwap = 0;
  private vwapSamples: number[] = []; // قيم VWAP عند إغلاق كل بار (للميل)

  bars1m: OHLCV[] = [];
  private curBar: OHLCV | null = null;

  private priceHist: { t: number; p: number }[] = []; // آخر ~3 دقائق

  constructor(opts: {
    symbol: string;
    float: number;
    avgDailyVol: number;
    prevClose: number;
  }) {
    this.symbol = opts.symbol;
    this.float = opts.float;
    this.avgDailyVol = opts.avgDailyVol;
    this.prevClose = opts.prevClose;
    this.price = opts.prevClose;
    this.dayHigh = opts.prevClose;
    this.dayLow = opts.prevClose;
    this.bid = opts.prevClose;
    this.ask = opts.prevClose;
  }

  // يُستدعى عند بداية الجلسة الرئيسية لتثبيت سعر الافتتاح (لحساب الـ Gap).
  setOpen(p: number) {
    this.open = p;
  }

  // تعبئة تاريخية: يزرع بارات 1د سابقة حتى تكون الرسوم و ATR و VWAP مكتملة فوراً.
  backfill(bars: OHLCV[]) {
    if (!bars.length) return;
    this.bars1m = bars.slice(-420);
    this.volume = 0;
    this.cumPV = 0;
    for (const b of this.bars1m) {
      this.volume += b.v;
      this.cumPV += b.c * b.v;
      if (b.h > this.dayHigh) this.dayHigh = b.h;
      if (b.l < this.dayLow) this.dayLow = b.l;
      this.vwapSamples.push(this.volume > 0 ? this.cumPV / this.volume : b.c);
      if (this.vwapSamples.length > 40) this.vwapSamples.shift();
    }
    this.vwap = this.volume > 0 ? this.cumPV / this.volume : bars[bars.length - 1].c;
    const last = this.bars1m[this.bars1m.length - 1];
    this.price = last.c;
    // بذرة تاريخ الأسعار لحساب 2Min% منذ البداية
    this.priceHist = this.bars1m.slice(-3).map((b) => ({ t: b.t, p: b.c }));
  }

  onTick(tk: Tick, phase: SessionPhase) {
    this.price = tk.price;
    this.bid = tk.bid;
    this.ask = tk.ask;

    // الحجم التراكمي و VWAP يُحسبان في كل الجلسات النشطة (قبل/رئيسية/بعد/ليلي)
    if (phase !== "closed") {
      this.volume += tk.size;
      this.cumPV += tk.price * tk.size;
      this.vwap = this.volume > 0 ? this.cumPV / this.volume : tk.price;
    } else if (this.vwap === 0) {
      this.vwap = tk.price;
    }

    if (tk.price > this.dayHigh) this.dayHigh = tk.price;
    if (tk.price < this.dayLow) this.dayLow = tk.price;
    if (phase === "pre" && tk.price > this.premktHigh) this.premktHigh = tk.price;

    this.updateBar(tk);

    this.priceHist.push({ t: tk.t, p: tk.price });
    const cutoff = tk.t - 3 * MIN;
    while (this.priceHist.length && this.priceHist[0].t < cutoff) {
      this.priceHist.shift();
    }
  }

  private updateBar(tk: Tick) {
    const barStart = Math.floor(tk.t / MIN) * MIN;
    if (!this.curBar || this.curBar.t !== barStart) {
      if (this.curBar) {
        this.bars1m.push(this.curBar);
        if (this.bars1m.length > 420) this.bars1m.shift();
        this.vwapSamples.push(this.vwap);
        if (this.vwapSamples.length > 40) this.vwapSamples.shift();
      }
      this.curBar = {
        t: barStart,
        o: tk.price,
        h: tk.price,
        l: tk.price,
        c: tk.price,
        v: tk.size,
      };
    } else {
      this.curBar.h = Math.max(this.curBar.h, tk.price);
      this.curBar.l = Math.min(this.curBar.l, tk.price);
      this.curBar.c = tk.price;
      this.curBar.v += tk.size;
    }
  }

  // ATR على البارات المغلقة (المدى الحقيقي المتوسط)
  atr(period: number): number {
    const bars = this.bars1m;
    const fallback = Math.max(this.price * 0.01, 0.01);
    if (bars.length < 2) return fallback;
    const n = Math.min(period, bars.length - 1);
    let sum = 0;
    for (let i = bars.length - n; i < bars.length; i++) {
      const cur = bars[i];
      const prev = bars[i - 1];
      const tr = Math.max(
        cur.h - cur.l,
        Math.abs(cur.h - prev.c),
        Math.abs(cur.l - prev.c)
      );
      sum += tr;
    }
    const v = sum / n;
    return v > 0 ? v : fallback;
  }

  // نسبة التغيّر خلال آخر دقيقتين
  twoMinPct(now: number): number {
    if (this.priceHist.length < 2) return 0;
    const target = now - TWO_MIN;
    let ref: number | null = null;
    for (const s of this.priceHist) {
      if (s.t <= target) ref = s.p;
      else break;
    }
    if (ref === null) ref = this.priceHist[0].p; // التاريخ أحدث من دقيقتين
    if (!ref) return 0;
    return ((this.price - ref) / ref) * 100;
  }

  // هل ميل الـ VWAP صاعد؟ (ZenV)
  vwapSlope(): { up: boolean; magnitude: number } {
    const n = this.vwapSamples.length;
    if (n < 2) {
      const up = this.price >= this.vwap;
      return { up, magnitude: Math.abs(this.price - this.vwap) };
    }
    const last = this.vwapSamples[n - 1];
    const prev = this.vwapSamples[Math.max(0, n - 3)];
    const diff = last - prev;
    return { up: diff >= 0, magnitude: Math.abs(diff) };
  }

  // بارات شاملة البار الجاري (للرسم)
  barsForChart(): OHLCV[] {
    return this.curBar ? [...this.bars1m, this.curBar] : this.bars1m.slice();
  }

  changePct(): number {
    return ((this.price - this.prevClose) / this.prevClose) * 100;
  }
}
