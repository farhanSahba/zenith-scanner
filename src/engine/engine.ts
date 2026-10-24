import { MIN, SNAPSHOT_MS, ATR_PERIOD } from "./const";
import { createAdapter } from "./adapters";
import type { MarketAdapter, NewsEvent, SymbolSeed } from "./adapters/types";
import { SymbolState } from "./symbolState";
import { buildSymbolSnapshot } from "./snapshot";
import { classify } from "./scanner";
import { AlertEngine } from "./alerts";
import { PerfTracker } from "./perf";
import { sendTelegram, telegramEnabled } from "./notify";
import { SA_NAMES } from "./saNames";
import type { MarketConfig } from "./markets";
import type {
  Alert,
  NewsItem,
  OHLCV,
  SymbolSnapshot,
  Snapshot,
  Tick,
} from "./types";

const ALERTS_CAP = 80;
const NEWS_CAP = 40;

// تصنيف عربي سريع (قواعدي) للمحفّز — تُثريه طبقة Claude لاحقاً
const CATALYST_AR: Record<NewsEvent["kind"], { ar: string; s: NewsItem["sentiment"] }> = {
  contract: { ar: "عقد/اتفاقية توريد — محفّز حقيقي", s: "bull" },
  fda: { ar: "موافقة FDA — محفّز قوي", s: "bull" },
  earnings: { ar: "نتائج ربعية", s: "neutral" },
  analyst: { ar: "رفع توصية من محلّل", s: "bull" },
  offering: { ar: "طرح/تخفيف أسهم — حذر ⚠️", s: "dilution" },
  pr: { ar: "إعلان شراكة/منتج", s: "bull" },
};

// كشف أخبار الطرح/التخفيف: سنتمنت dilution (من AV/Claude) أو كلمات مفتاحية في العنوان.
const DILUTION_RE =
  /\b(offerings?|registered direct|at[- ]the[- ]market|public offerings?|private placements?|pricing of|proposed (public )?offerings?|shelf registrations?|capital raises?|underwritten|dilut\w*|warrants?)\b/i;
function isDilutionNews(n: NewsItem): boolean {
  return n.sentiment === "dilution" || DILUTION_RE.test(n.headline);
}

// وقت التنبيه بتوقيت السوق
function tgTime(t: number, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(t));
  } catch {
    return "";
  }
}

// تنسيق أرقام بالملايين (فلوت/حجم)
function fmtM(n: number): string {
  if (n >= 1000) return `${round(n / 1000, 1)}B`;
  if (n >= 1) return `${round(n, n >= 10 ? 0 : 1)}M`;
  return `${round(n * 1000, 0)}K`;
}

// نص رسالة Telegram لتنبيه — عنوان مميّز + بيانات + سطر تنفيذي + وقت ورابط الشارت (حسب السوق).
function formatTg(a: Alert, s: SymbolSnapshot | undefined, market: MarketConfig): string {
  // الرمز + اسم الشركة إن توفّر (من اللقطة، واحتياطاً من السجلّ المركزي للسعودي)
  const nm = s?.name ?? (market.id === "sa" ? SA_NAMES[a.symbol] : undefined);
  const sym = nm ? `<b>${a.symbol}</b> ${nm}` : `<b>${a.symbol}</b>`;
  const price = `${a.price} ${market.currency}`;
  const num = () => {
    const n = parseFloat(a.reason.match(/[+-]?[\d.]+/)?.[0] ?? "0");
    return Number.isFinite(n) ? n : 0;
  };

  // العنوان حسب النوع
  let head: string;
  switch (a.kind) {
    case "toHod":
      head = `🟢 <b>كسر القمة</b> · دخول\n${sym}  ·  ${price}\nاخترق قمة اليوم بزخم صاعد`;
      break;
    case "up2m":
      head = `🚀 <b>زخم قوي</b> · دخول\n${sym}  ·  ${price}\n+${Math.abs(num()).toFixed(1)}% خلال دقيقتين`;
      break;
    case "down2m":
      head = `🔻 <b>هبوط حاد</b>\n${sym}  ·  ${price}\n${num().toFixed(1)}% خلال دقيقتين`;
      break;
    case "dilution":
      head = `⚠️ <b>تحذير: تخفيف</b>\n${sym}  ·  ${price}\nخبر طرح أسهم`;
      break;
    default:
      head = `🔔 ${sym}  ·  ${price}\n${a.reason}`;
  }

  // سطر البيانات (فلوت · حجم نسبي · فجوة · موقع VWAP)
  let data = "";
  if (s) {
    const parts: string[] = [];
    if (s.float > 0) parts.push(`فلوت ${fmtM(s.float)}`);
    if (s.zenVR > 0) parts.push(`حجم ×${s.zenVR.toFixed(1)}`);
    if (Math.abs(s.gapPct) >= 1) parts.push(`فجوة ${s.gapPct >= 0 ? "+" : ""}${s.gapPct.toFixed(0)}%`);
    parts.push(s.price >= s.vwap ? "فوق VWAP" : "تحت VWAP");
    if (parts.length) data = `\n📊 ${parts.join(" · ")}`;
  }

  // سطر تنفيذي (ستوب/هدف للدخول الصاعد؛ تحذير للهبوط/التخفيف)
  let action = "";
  if ((a.kind === "toHod" || a.kind === "up2m") && s && s.price > 0) {
    // ستوب منطقي: VWAP إن كان قريباً، لكن لا يتجاوز 5% (مناسب للسكالب)
    const vwapStop = s.price >= s.vwap && s.vwap > 0 ? s.vwap : s.price * 0.95;
    const stop = Math.max(vwapStop, s.price * 0.95);
    const risk = Math.max(s.price - stop, s.price * 0.005);
    action = `\n🎯 ستوب ${round(stop)} · هدف ${round(s.price + 2 * risk)} (1:2)`;
  } else if (a.kind === "down2m") {
    action = `\n🔻 ابتعد عن الشراء`;
  } else if (a.kind === "dilution") {
    action = `\n🚫 تجنّب — فخّ تخفيف محتمل`;
  }

  // الوقت + رابط الشارت (بادئة TADAWUL للسعودي)
  const tvSym = encodeURIComponent(market.tvPrefix + a.symbol);
  const link = `<a href="https://www.tradingview.com/chart/?symbol=${tvSym}">📈 الشارت</a>`;
  const foot = `\n⏰ ${tgTime(a.time, market.tz)} · ${link}`;

  return `${head}${data}${action}${foot}`;
}

export class ScannerEngine {
  private adapter: MarketAdapter;
  private provider: string;
  private states = new Map<string, SymbolState>();
  private alertEngine: AlertEngine;
  private perf = new PerfTracker();
  private tgSent = new Set<string>(); // تنبيهات أُرسلت للجوال (منع التكرار)
  private tgLast = new Map<string, number>(); // آخر إرسال لكل رمز (تهدئة)

  private symSnaps = new Map<string, SymbolSnapshot>();
  private latest: Snapshot | null = null;
  private alerts: Alert[] = [];
  private news: NewsItem[] = [];
  private futures = { dj: -0.3, sp: -0.1 };
  private note = "";

  private startReal = Date.now();
  private snapTimer: ReturnType<typeof setInterval> | null = null;
  private screenTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private initPromise: Promise<void> | null = null;
  private screenedOnce = false; // أول فرز = بناء الكون الأولي (لا تنبيهات «مرشّح جديد»)

  constructor(private market: MarketConfig) {
    const requested = (process.env[market.providerEnv] ?? "sim").toLowerCase();
    this.adapter = createAdapter(market);
    this.provider = this.adapter.name; // المصدر الفعلي (قد يرجع للمحاكاة)
    this.alertEngine = new AlertEngine(market.alerts); // عتبات السوق
    if (market.id === "us" && requested === "alpaca" && this.adapter.name !== "alpaca") {
      this.note = "مفاتيح Alpaca ناقصة أو غير صالحة — رجوع تلقائي للمحاكاة.";
    }
  }

  // تهيئة كسولة تُستدعى مرة واحدة من أول طلب
  ensureStarted(): Promise<void> {
    if (!this.initPromise) {
      // لا نخزّن وعداً فاشلاً للأبد: نصفّره عند الفشل لنعيد المحاولة في الطلب التالي
      this.initPromise = this.init().catch((e) => {
        this.initPromise = null;
        throw e;
      });
    }
    return this.initPromise;
  }

  private async init() {
    const seeds = await this.adapter.prepare();
    const now = Date.now();
    for (const seed of seeds) {
      const st = new SymbolState({
        symbol: seed.symbol,
        name: seed.name,
        float: seed.float,
        avgDailyVol: seed.avgDailyVol,
        prevClose: seed.prevClose,
        dayVolume: seed.dayVolume,
        dayVwap: seed.dayVwap,
      });
      st.setOpen(seed.open);
      st.premktHigh = seed.premktHigh;
      st.dayHigh = Math.max(st.dayHigh, seed.dayHighSeed); // قمة اليوم الحقيقية (لـ atrHoD صحيح فوراً)
      // تعبئة تاريخية (للمحاكاة) حتى تظهر الرسوم مكتملة
      if (this.provider === "sim") {
        st.backfill(generateBackfill(seed, now));
      }
      this.states.set(seed.symbol, st);
    }

    this.adapter.start(
      (tick) => this.onTick(tick),
      (ev) => this.onNews(ev)
    );

    this.snapTimer = setInterval(() => this.buildSnapshot(), SNAPSHOT_MS);
    this.buildSnapshot();
    this.running = true;

    // حفظ دوري لسجل الأداء على القرص (ينجو من إعادة التشغيل)
    setInterval(() => this.perf.save(), 15_000);

    // فرز تلقائي حيّ: يضيف مرشّحي السوق الجدد دون إعادة تشغيل
    if (this.adapter.screen && (process.env.ALPACA_AUTOSCREEN ?? "on").toLowerCase() !== "off") {
      const mp = Number(process.env.AUTOSCREEN_MAX_PRICE ?? 20);
      const lim = Number(process.env.AUTOSCREEN_TOP ?? 50);
      const ms = Math.max(60_000, Number(process.env.AUTOSCREEN_MS ?? 300_000));
      this.refreshUniverse(mp, lim);
      this.screenTimer = setInterval(() => this.refreshUniverse(mp, lim), ms);
    }
  }

  // يفرز السوق ويضيف المرشّحين الجدد للبثّ الحي (بلا إعادة تشغيل)
  private async refreshUniverse(maxPrice: number, limit: number) {
    const adapter = this.adapter;
    if (!adapter.screen || !adapter.subscribe) return;
    if (this.market.phaseFor(this.provider, Date.now()) === "closed") return; // لا فرز والسوق مغلق
    const MAX_UNIVERSE = 150;
    try {
      const seeds = await adapter.screen(maxPrice, limit);
      const firstScreen = !this.screenedOnce;
      this.screenedOnce = true;
      const newSyms: string[] = [];
      for (const seed of seeds) {
        if (this.states.has(seed.symbol)) continue;
        if (this.states.size >= MAX_UNIVERSE) break;
        const st = new SymbolState({
          symbol: seed.symbol,
          name: seed.name,
          float: seed.float,
          avgDailyVol: seed.avgDailyVol,
          prevClose: seed.prevClose,
          dayVolume: seed.dayVolume,
          dayVwap: seed.dayVwap,
        });
        st.setOpen(seed.open);
        st.premktHigh = seed.premktHigh;
        st.dayHigh = Math.max(st.dayHigh, seed.dayHighSeed); // قمة اليوم الحقيقية (لـ atrHoD صحيح فوراً)
        this.states.set(seed.symbol, st);
        newSyms.push(seed.symbol);
      }
      if (seeds.length) {
        console.log(
          `[AutoScreen] فرز: ${seeds.length} مرشّح، أُضيف ${newSyms.length} جديد (الكون ${this.states.size}).`
        );
      }
      if (newSyms.length) {
        adapter.subscribe(newSyms);
        // تنبيه «مرشّح جديد ساخن» (طبقة الصقر) — فقط بعد الفرز الأول (ليس عند بناء الكون)،
        // وأعلى 6 فجوة فقط لتجنّب دفقة عند ظهور عدة مرشّحين دفعة واحدة.
        if (!firstScreen) {
          const now = Date.now();
          const fresh = new Set(newSyms);
          const cand = seeds
            .filter((s) => fresh.has(s.symbol))
            .map((s) => ({
              s,
              gap: s.prevClose > 0 ? ((s.open - s.prevClose) / s.prevClose) * 100 : 0,
            }))
            .filter((x) => x.gap >= 3)
            .sort((a, b) => b.gap - a.gap)
            .slice(0, 6);
          const newAlerts: Alert[] = cand.map(({ s, gap }) => ({
            id: `${s.symbol}-new-${now}`,
            symbol: s.symbol,
            name: this.nameOf(s.symbol),
            reason: `مرشّح جديد +${gap.toFixed(0)}%`,
            kind: "new",
            tier: "early",
            price: round(s.open || s.prevClose, 2),
            time: now,
            tone: "bull",
          }));
          if (newAlerts.length) {
            this.alerts = [...newAlerts, ...this.alerts].slice(0, ALERTS_CAP);
          }
        }
      }
    } catch {
      /* تجاهل أخطاء الفرز المؤقتة */
    }
  }

  private onTick(tick: Tick) {
    const st = this.states.get(tick.symbol);
    if (!st) return;
    const phase = this.market.phaseFor(this.provider, tick.t);
    st.onTick(tick, phase);
  }

  // اسم الشركة من الرمز: اسم الحالة (من المزوّد) → السجلّ المركزي للسعودي
  private nameOf(sym: string): string | undefined {
    return this.states.get(sym)?.name ?? (this.market.id === "sa" ? SA_NAMES[sym] : undefined);
  }

  private onNews(ev: NewsEvent) {
    const id = ev.url || `${ev.symbol}-${ev.time}`;
    if (this.news.some((n) => n.id === id)) return; // تجنّب التكرار
    const map = CATALYST_AR[ev.kind];
    const item: NewsItem = {
      id,
      symbol: ev.symbol,
      name: this.nameOf(ev.symbol),
      time: ev.time,
      headline: ev.headline,
      source: ev.source,
      url: ev.url,
      catalystAr: map?.ar,
      sentiment: ev.sentiment ?? map?.s, // سنتمنت AV له الأولوية
    };
    this.news.unshift(item);
    if (this.news.length > NEWS_CAP) this.news.length = NEWS_CAP;

    // تنبيه تخفيف: خبر طرح على سهم موجود في الكون (فخّ محتمل — تحذير أحمر).
    // معرّف فريد من معرّف الخبر، وتنبيه واحد فقط لكل رمز (لا تكرار من عدة عناوين).
    const st = this.states.get(item.symbol);
    const already = this.alerts.some((a) => a.kind === "dilution" && a.symbol === item.symbol);
    if (st && isDilutionNews(item) && !already) {
      const a: Alert = {
        id: `dilution-${item.id}`,
        symbol: item.symbol,
        name: this.nameOf(item.symbol),
        reason: "تخفيف/طرح",
        kind: "dilution",
        tier: "trigger",
        price: round(st.price, 2),
        warning: "⚠",
        time: item.time,
        tone: "bear",
      };
      this.alerts = [a, ...this.alerts].slice(0, ALERTS_CAP);
    }
  }

  private buildSnapshot() {
    const now = Date.now();
    const phase = this.market.phaseFor(this.provider, now);
    // المقام في ZenVR = متوسط حجم اليوم × تقدّم الجلسة.
    // المحاكاة: تقدّم مبني على وقت تشغيل المحرّك (جلسة صناعية تبدأ عند الإقلاع).
    // الحقيقي: نسبة نهار التداول الفعلي من ساعة السوق (لا وقت التشغيل).
    const sessionProgress =
      this.provider === "sim"
        ? Math.max(0.05, Math.min(1, (now - this.startReal) / (8 * 60 * 1000) + 0.05))
        : this.market.sessionFraction(now);

    // رموز عليها خبر طرح/تخفيف حديث (لإظهار شارة التحذير على صفّها)
    const dilutionSyms = new Set<string>();
    for (const n of this.news) if (isDilutionNews(n)) dilutionSyms.add(n.symbol);

    const all: SymbolSnapshot[] = [];
    for (const st of this.states.values()) {
      const snap = buildSymbolSnapshot(st, { now, sessionProgress });
      snap.dilution = dilutionSyms.has(snap.symbol);
      this.symSnaps.set(snap.symbol, snap);
      all.push(snap);
    }

    const panels = classify(all, this.market.presets);

    // تنبيهات جديدة من كل الكون (لا تنبيهات والسوق مغلق)
    const fresh = this.alertEngine.update(all, now, phase);
    if (fresh.length) {
      for (const a of fresh) a.name = this.nameOf(a.symbol); // اسم الشركة للعرض
      this.alerts = [...fresh.reverse(), ...this.alerts].slice(0, ALERTS_CAP);
    }

    // تتبّع الأداء: سجّل كل التنبيهات وقِس نتائجها من الأسعار الحالية
    this.perf.record(this.alerts);
    this.perf.update(this.symSnaps, now);

    // إشعارات الجوال: المهمّ فقط (لحظة الدخول + التخفيف)، مع تهدئة لكل رمز
    this.pushTelegram(now);

    // عقود آجلة تتحرّك ببطء
    this.futures.dj = clamp(this.futures.dj + (Math.random() - 0.5) * 0.05, -3, 3);
    this.futures.sp = clamp(this.futures.sp + (Math.random() - 0.5) * 0.04, -3, 3);

    this.latest = {
      phase,
      clock: now,
      marketClock: this.market.marketClock(now),
      toAhCloseMs: this.market.toCloseMs(now),
      panels,
      alerts: this.alerts,
      news: this.news,
      futures: { dj: round(this.futures.dj, 2), sp: round(this.futures.sp, 2) },
      universeCount: this.states.size,
      dataSource: this.provider,
      market: this.market.id,
      note: this.note || undefined,
      telegram: telegramEnabled() && (this.provider !== "sim" || process.env.TELEGRAM_SIM === "on"),
    };
  }

  getSnapshot(): Snapshot {
    return (
      this.latest ?? {
        phase: "closed",
        clock: Date.now(),
        marketClock: this.market.marketClock(Date.now()),
        toAhCloseMs: this.market.toCloseMs(Date.now()),
        panels: { momoHod: [], gapUp: [], gapUpLowFloat: [], momo2mUp: [], momo2mDown: [] },
        alerts: [],
        news: [],
        futures: { dj: 0, sp: 0 },
        universeCount: 0,
        dataSource: this.provider,
        market: this.market.id,
        note: this.note || undefined,
      }
    );
  }

  getSymbolSnapshot(sym: string): SymbolSnapshot | undefined {
    return this.symSnaps.get(sym.toUpperCase());
  }

  getNews(): NewsItem[] {
    return this.news;
  }

  // إحصاءات أداء التنبيهات + آخر النتائج
  getPerf() {
    const recent = this.perf.recent(40).map((e) => ({ ...e, name: this.nameOf(e.symbol) }));
    return { stats: this.perf.stats(), recent };
  }

  // يرسل التنبيهات المهمّة للجوال عبر Telegram (مرة لكل تنبيه، تهدئة 2د لكل رمز).
  private pushTelegram(now: number) {
    if (!telegramEnabled()) return;
    // المحاكاة لا تُرسل للجوال افتراضياً — إلا بتفعيل التجربة TELEGRAM_SIM=on
    if (this.provider === "sim" && process.env.TELEGRAM_SIM !== "on") return;
    for (const a of this.alerts) {
      if (this.tgSent.has(a.id)) continue;
      this.tgSent.add(a.id);
      if (now - a.time > 60_000) continue; // قديم (بعد إعادة التشغيل) — لا ترسل
      const important = a.tier === "trigger" || a.kind === "dilution"; // لحظة الدخول + التحذير
      if (!important) continue;
      const last = this.tgLast.get(a.symbol) ?? 0;
      if (now - last < 120_000) continue; // تهدئة لكل رمز لمنع إزعاج الجوال
      this.tgLast.set(a.symbol, now);
      void sendTelegram(formatTg(a, this.symSnaps.get(a.symbol), this.market));
    }
    if (this.tgSent.size > 5000) this.tgSent = new Set([...this.tgSent].slice(-2000));
  }

  // بيانات الرسم: بارات 1د + مجمّعة 15د
  getChart(sym: string): { bars1: OHLCV[]; bars15: OHLCV[]; meta: ChartMeta } | null {
    const st = this.states.get(sym.toUpperCase());
    if (!st) return null;
    const bars1 = st.barsForChart();
    const snap = this.symSnaps.get(sym.toUpperCase());
    return {
      bars1,
      bars15: aggregate(bars1, 15),
      meta: {
        symbol: st.symbol,
        name: st.name,
        price: st.price,
        vwap: st.vwap,
        dayHigh: st.dayHigh,
        premktHigh: st.premktHigh,
        prevClose: st.prevClose,
        atr: st.atr(ATR_PERIOD),
        float: st.float,
        changePct: snap?.changePct ?? st.changePct(),
      },
    };
  }

  listSymbols(): string[] {
    return [...this.states.keys()];
  }

  // كل لقطات الرموز (للماسح اللغوي الطبيعي)
  allSnapshots(): SymbolSnapshot[] {
    return [...this.symSnaps.values()];
  }

  // مجموعة الرموز التي لها خبر حديث
  newsSymbols(): Set<string> {
    return new Set(this.news.map((n) => n.symbol));
  }
}

export interface ChartMeta {
  symbol: string;
  name?: string;
  price: number;
  vwap: number;
  dayHigh: number;
  premktHigh: number;
  prevClose: number;
  atr: number;
  float: number;
  changePct: number;
}

// ===== مساعدات =====

function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}
function round(n: number, d = 2) {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

// تجميع بارات 1د إلى إطار أكبر (بالدقائق)
function aggregate(bars: OHLCV[], minutes: number): OHLCV[] {
  if (!bars.length) return [];
  const bucket = minutes * MIN;
  const out: OHLCV[] = [];
  let cur: OHLCV | null = null;
  for (const b of bars) {
    const start = Math.floor(b.t / bucket) * bucket;
    if (!cur || cur.t !== start) {
      if (cur) out.push(cur);
      cur = { t: start, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v };
    } else {
      cur.h = Math.max(cur.h, b.h);
      cur.l = Math.min(cur.l, b.l);
      cur.c = b.c;
      cur.v += b.v;
    }
  }
  if (cur) out.push(cur);
  return out;
}

// توليد تاريخ اصطناعي (~120 بار 1د) لرمز — للمحاكاة فقط
function generateBackfill(seed: SymbolSeed, now: number): OHLCV[] {
  const minutes = 120;
  const startMin = Math.floor(now / MIN) * MIN - minutes * MIN;
  const bars: OHLCV[] = [];
  let p = seed.prevClose;
  const perBarVol = Math.max(50, seed.avgDailyVol / 390);

  for (let i = 0; i < minutes; i++) {
    const t = startMin + i * MIN;
    const o = p;
    let drift: number;
    if (i < 12) {
      // ترقّي نحو سعر الافتتاح (الفجوة)
      drift = ((seed.open - seed.prevClose) / seed.prevClose) / 12;
    } else {
      // تذبذب مع ميل بسيط لبناء قمة اليوم
      const toward = (seed.dayHighSeed - p) / Math.max(p, 0.1);
      drift = (Math.random() - 0.48) * 0.012 + toward * 0.01;
    }
    const noise = (Math.random() - 0.5) * 0.01;
    let c = Math.max(0.05, o * (1 + drift + noise));
    c = Math.min(c, seed.dayHighSeed * 1.02);
    const h = Math.max(o, c) * (1 + Math.random() * 0.004);
    const l = Math.min(o, c) * (1 - Math.random() * 0.004);
    const v = Math.round(perBarVol * (i < 20 ? 2.5 : 1) * (0.5 + Math.random()));
    bars.push({ t, o: r4(o), h: r4(h), l: r4(l), c: r4(c), v });
    p = c;
  }
  return bars;
}

function r4(n: number) {
  return Math.round(n * 10000) / 10000;
}
