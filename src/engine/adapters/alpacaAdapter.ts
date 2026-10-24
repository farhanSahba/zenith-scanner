import type { Tick } from "../types";
import type {
  MarketAdapter,
  NewsEvent,
  NewsHandler,
  SymbolSeed,
  TickHandler,
} from "./types";

// ===== مزوّد Alpaca الحقيقي (24/5 + فرز تلقائي حي) =====
// • اتصال نهاري v2/{iex|sip} + اتصال ليلي v1beta1/{overnight|boats}.
// • screen(): يفرز السوق (movers) ويرجع مرشّحين — للتحديث الحي بلا إعادة تشغيل.
// • subscribe(): يضيف رموزاً للبثّ على الاتصالات الحيّة دون قطع.
// • الفلوت: من ALPACA_FLOATS، ويُكمَّل تلقائياً من FMP لو ضُبط FMP_API_KEY.

const DEFAULT_WATCHLIST = [
  "AAPL", "TSLA", "NVDA", "AMD", "SOFI", "PLTR", "RIVN", "NIO", "MARA", "RIOT",
  "LCID", "AMC", "GME", "IONQ", "CVNA", "AI", "SMCI", "BBAI", "COIN", "HOOD",
];

const DAY_FEEDS = new Set(["iex", "sip", "delayed_sip", "otc"]);
const OVERNIGHT_FEEDS = new Set(["overnight", "boats"]);
const IEX_SYMBOL_CAP = 30;
const FATAL_CODES = new Set([401, 402, 408, 409]);
const DATA = "https://data.alpaca.markets";

interface Snapshot {
  latestTrade?: { p?: number; t?: string };
  latestQuote?: { bp?: number; ap?: number };
  dailyBar?: { o?: number; h?: number; l?: number; c?: number; v?: number };
  prevDailyBar?: { c?: number; v?: number };
}

interface AvArticle {
  title?: string;
  url?: string;
  source?: string;
  time_published?: string;
  ticker_sentiment?: {
    ticker?: string;
    relevance_score?: string;
    ticker_sentiment_label?: string;
  }[];
}

interface AlpacaMsg {
  T: string;
  S?: string;
  p?: number;
  s?: number;
  bp?: number;
  ap?: number;
  t?: string;
  msg?: string;
  code?: number;
}

// اتصال WebSocket واحد لفيد واحد بحالته الخاصة.
class FeedConnection {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private authed = false;
  private lastQuote = new Map<string, { bid: number; ask: number }>();

  constructor(
    private url: string,
    private feed: string,
    private keyId: string,
    private secret: string,
    private getSymbols: () => string[],
    private withQuotes: boolean,
    private onTick: TickHandler
  ) {}

  open() {
    if (this.closed) return;
    if (typeof WebSocket === "undefined") {
      throw new Error("Alpaca: WebSocket غير متاح — يتطلب Node 21+.");
    }
    const ws = new WebSocket(this.url);
    this.ws = ws;
    this.authed = false;

    ws.onopen = () => {
      ws.send(JSON.stringify({ action: "auth", key: this.keyId, secret: this.secret }));
    };

    ws.onmessage = (ev: MessageEvent) => {
      let msgs: unknown;
      try {
        msgs = JSON.parse(typeof ev.data === "string" ? ev.data : String(ev.data));
      } catch {
        return;
      }
      if (!Array.isArray(msgs)) return;

      for (const m of msgs as AlpacaMsg[]) {
        if (m.T === "success" && m.msg === "authenticated") {
          this.attempt = 0;
          this.authed = true;
          this.send(this.getSymbols());
          console.log(
            `[Alpaca:${this.feed}] مُصادق — اشتراك ${this.getSymbols().length} رمز${
              this.withQuotes ? "، صفقات+أسعار" : "، صفقات فقط"
            }.`
          );
        } else if (m.T === "error") {
          console.error(`[Alpaca:${this.feed}] خطأ بثّ: code=${m.code} msg="${m.msg}"`);
          if (m.code != null && FATAL_CODES.has(m.code)) {
            this.closed = true;
            ws.close();
          }
        } else if (m.T === "q" && m.S) {
          this.lastQuote.set(m.S, { bid: m.bp ?? 0, ask: m.ap ?? 0 });
        } else if (m.T === "t" && m.S && typeof m.p === "number") {
          const q = this.lastQuote.get(m.S);
          const half = Math.max(0.005, m.p * 0.001) / 2;
          this.onTick({
            symbol: m.S,
            price: m.p,
            size: m.s ?? 1,
            bid: q?.bid || m.p - half,
            ask: q?.ask || m.p + half,
            t: m.t ? Date.parse(m.t) : Date.now(),
          });
        }
      }
    };

    ws.onerror = () => ws.close();

    ws.onclose = () => {
      this.detach(ws);
      this.authed = false;
      if (this.closed) return;
      const delay = Math.min(30_000, 1000 * 2 ** this.attempt) + Math.random() * 1000;
      this.attempt++;
      console.warn(`[Alpaca:${this.feed}] انقطع — إعادة بعد ${Math.round(delay)}ms.`);
      this.reconnectTimer = setTimeout(() => {
        if (!this.closed) this.open();
      }, delay);
    };
  }

  // إرسال اشتراك لمجموعة رموز (Alpaca يسمح بإضافة اشتراكات دون قطع)
  private send(syms: string[]) {
    if (!this.ws || !this.authed || !syms.length) return;
    const sub: { action: string; trades: string[]; quotes?: string[] } = {
      action: "subscribe",
      trades: syms,
    };
    if (this.withQuotes) sub.quotes = syms;
    this.ws.send(JSON.stringify(sub));
  }

  // إضافة رموز جديدة للبثّ الحي
  subscribeMore(syms: string[]) {
    this.send(syms);
  }

  close() {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.detach(this.ws);
      this.ws.close();
      this.ws = null;
    }
  }

  private detach(ws: WebSocket) {
    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
  }
}

export class AlpacaAdapter implements MarketAdapter {
  readonly name = "alpaca";
  private keyId: string;
  private secret: string;
  private dayFeed: string;
  private overnightFeed: string;
  private symbols: string[];
  private floats: Record<string, number>;
  private floatCache = new Map<string, number>(); // يُملأ من Alpha Vantage / FMP
  private fmpBlocked = false;
  private fmpWarned = false;
  private avCount = 0; // عدّاد طلبات Alpha Vantage لهذا التشغيل (حد 25/يوم)
  private avBlocked = false;
  private avWarned = false;
  private yahooCookie = "";
  private yahooCrumb = "";
  private yahooBlocked = false;
  private yahooWarned = false;
  private subscribed = new Set<string>();
  private conns: FeedConnection[] = [];
  private newsTimer: ReturnType<typeof setInterval> | null = null;
  private seenNews = new Set<string>();

  constructor() {
    this.keyId = (process.env.ALPACA_KEY_ID ?? "").trim();
    this.secret = (process.env.ALPACA_SECRET_KEY ?? "").trim();
    this.dayFeed = (process.env.ALPACA_FEED ?? "iex").toLowerCase().trim();
    this.overnightFeed = (process.env.ALPACA_OVERNIGHT_FEED ?? "off").toLowerCase().trim();
    this.floats = parseFloats(process.env.ALPACA_FLOATS ?? "");

    if (!this.keyId || !this.secret) {
      throw new Error(
        "Alpaca: ناقص ALPACA_KEY_ID / ALPACA_SECRET_KEY في .env.local (أو استخدم DATA_PROVIDER=sim)."
      );
    }
    if (!DAY_FEEDS.has(this.dayFeed)) {
      throw new Error(`Alpaca: ALPACA_FEED غير صالح "${this.dayFeed}".`);
    }
    if (this.overnightFeed !== "off" && !OVERNIGHT_FEEDS.has(this.overnightFeed)) {
      throw new Error(`Alpaca: ALPACA_OVERNIGHT_FEED غير صالح "${this.overnightFeed}".`);
    }

    let syms = (process.env.ALPACA_SYMBOLS ?? DEFAULT_WATCHLIST.join(","))
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    syms = [...new Set(syms)];
    if (this.dayFeed === "iex" && syms.length > IEX_SYMBOL_CAP) {
      console.warn(`[Alpaca] المجاني (iex) يحدّ بـ ${IEX_SYMBOL_CAP} رمزاً — اقتُطعت من ${syms.length}.`);
      syms = syms.slice(0, IEX_SYMBOL_CAP);
    }
    this.symbols = syms;
  }

  private headers() {
    return { "APCA-API-KEY-ID": this.keyId, "APCA-API-SECRET-KEY": this.secret };
  }

  private async getJson(url: string): Promise<Record<string, unknown> | null> {
    try {
      const res = await fetch(url, { headers: this.headers() });
      if (!res.ok) return null;
      return (await res.json()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  // فلوت الرمز (بالملايين): من ALPACA_FLOATS ثم كاش FMP ثم افتراضي
  private floatFor(sym: string): number {
    const v = this.floats[sym] ?? this.floatCache.get(sym);
    return Number.isFinite(v) ? (v as number) : 50;
  }

  // تعبئة الفلوت الناقص تلقائياً: Alpha Vantage (فلوت حقيقي) ثم FMP بديلاً. كاش ضمني.
  private async fillFloats(syms: string[]) {
    const hasAV = !!process.env.ALPHAVANTAGE_API_KEY;
    const hasFMP = !!process.env.FMP_API_KEY;
    if (!hasAV && !hasFMP) return;
    // تسلسلي ومحدود لاحترام حدود Alpha Vantage المجانية (25/يوم، 5/دقيقة)
    const missing = syms
      .filter((s) => this.floats[s] == null && !this.floatCache.has(s))
      .slice(0, 15); // باقة AV المدفوعة تحتمل أكثر (75/دقيقة)
    for (const sym of missing) {
      // Alpha Vantage المدفوع (موثوق) أولاً، ثم Yahoo احتياطياً، ثم FMP
      let f = hasAV ? await this.avFloat(sym) : undefined;
      if (f == null) f = await this.yahooFloat(sym);
      if (f == null && hasFMP) f = await this.fmpFloat(sym);
      if (Number.isFinite(f) && (f as number) > 0) this.floatCache.set(sym, f as number);
    }
  }

  // Yahoo Finance (مجاني، بلا مفتاح) → floatShares عبر quoteSummary (مع crumb/cookie)
  private async yahooFloat(sym: string): Promise<number | undefined> {
    if (this.yahooBlocked) return undefined;
    const UA =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
    try {
      if (!this.yahooCrumb) {
        const c = await fetch("https://fc.yahoo.com/", { headers: { "User-Agent": UA } });
        const setc = (c.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
        this.yahooCookie = setc.map((x) => x.split(";")[0]).join("; ");
        const cr = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
          headers: { "User-Agent": UA, Cookie: this.yahooCookie, Accept: "*/*" },
        });
        this.yahooCrumb = (await cr.text()).trim();
        if (!this.yahooCrumb || this.yahooCrumb.includes("<") || this.yahooCrumb.length > 40) {
          this.warnYahoo("تعذّر الحصول على crumb");
          return undefined;
        }
      }
      const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${sym}?modules=defaultKeyStatistics&crumb=${encodeURIComponent(
        this.yahooCrumb
      )}`;
      const r = await fetch(url, { headers: { "User-Agent": UA, Cookie: this.yahooCookie } });
      if (!r.ok) {
        if (r.status === 401 || r.status === 429) {
          this.yahooCrumb = ""; // جدّد الـ crumb في المرة القادمة
          if (r.status === 429) this.warnYahoo("حظر مؤقت (429)");
        }
        return undefined;
      }
      const d = await r.json();
      const stats = d?.quoteSummary?.result?.[0]?.defaultKeyStatistics;
      const f = stats?.floatShares?.raw ?? stats?.sharesOutstanding?.raw;
      return Number.isFinite(f) && f > 0 ? f / 1_000_000 : undefined;
    } catch {
      return undefined;
    }
  }

  private warnYahoo(reason: string) {
    this.yahooBlocked = true;
    if (!this.yahooWarned) {
      this.yahooWarned = true;
      console.warn(`[Yahoo] ${reason} — الفلوت التلقائي متوقف (استخدم TradingView يدوياً).`);
    }
  }

  // Alpha Vantage OVERVIEW → SharesFloat (فلوت حقيقي)
  private async avFloat(sym: string): Promise<number | undefined> {
    const key = process.env.ALPHAVANTAGE_API_KEY;
    if (!key || this.avBlocked || this.avCount >= 400) return undefined; // المدفوعة بلا حد يومي
    this.avCount++;
    try {
      const r = await fetch(
        `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${sym}&apikey=${key}`
      );
      if (!r.ok) return undefined;
      const d = (await r.json()) as Record<string, string>;
      const msg = d?.Information || d?.Note || (d as Record<string, string>)?.["Error Message"];
      if (msg) {
        this.avBlocked = true; // رسالة بدل داتا — نوقف ونطبع السبب
        if (!this.avWarned) {
          this.avWarned = true;
          console.warn("[AlphaVantage] " + String(msg).slice(0, 220));
        }
        return undefined;
      }
      const f = parseFloat(d?.SharesFloat ?? d?.SharesOutstanding ?? "");
      return Number.isFinite(f) && f > 0 ? f / 1_000_000 : undefined;
    } catch {
      return undefined;
    }
  }

  // FMP shares-float (قد يكون مدفوعاً) → floatShares
  private async fmpFloat(sym: string): Promise<number | undefined> {
    const key = process.env.FMP_API_KEY;
    if (!key || this.fmpBlocked) return undefined;
    try {
      const r = await fetch(
        `https://financialmodelingprep.com/stable/shares-float?symbol=${sym}&apikey=${key}`
      );
      if (!r.ok) {
        if ([401, 402, 403].includes(r.status)) {
          this.fmpBlocked = true;
          if (!this.fmpWarned) {
            this.fmpWarned = true;
            console.warn("[FMP] shares-float غير متاح على باقتك — تم تجاهله.");
          }
        }
        return undefined;
      }
      const d = await r.json();
      const row = Array.isArray(d) ? d[0] : d;
      const f = row?.floatShares;
      return Number.isFinite(f) && f > 0 ? f / 1_000_000 : undefined;
    } catch {
      return undefined;
    }
  }

  private seedFromSnapshot(sym: string, s: Snapshot): SymbolSeed | null {
    const price = s?.latestTrade?.p ?? s?.dailyBar?.c ?? s?.prevDailyBar?.c;
    if (!Number.isFinite(price)) return null;
    const p = price as number;
    const prevClose = numOr(s.prevDailyBar?.c, p);
    const open = numOr(s.dailyBar?.o, prevClose);
    const dayHigh = numOr(s.dailyBar?.h, Math.max(open, p));
    const avgVol = numOr(s.prevDailyBar?.v, numOr(s.dailyBar?.v, 1_000_000));
    return {
      symbol: sym,
      float: this.floatFor(sym),
      avgDailyVol: avgVol,
      prevClose,
      open,
      dayHighSeed: dayHigh,
      premktHigh: open,
    };
  }

  async prepare(): Promise<SymbolSeed[]> {
    const data = (await this.getJson(
      `${DATA}/v2/stocks/snapshots?symbols=${encodeURIComponent(this.symbols.join(","))}&feed=${this.dayFeed}`
    )) as Record<string, Snapshot> | null;
    if (!data) throw new Error("Alpaca snapshots فشل — تحقّق من المفاتيح/الباقة.");

    await this.fillFloats(this.symbols);
    const seeds: SymbolSeed[] = [];
    const missingFloat: string[] = [];
    for (const sym of this.symbols) {
      const seed = data[sym] ? this.seedFromSnapshot(sym, data[sym]) : null;
      if (!seed) continue;
      if (this.floats[sym] == null && !this.floatCache.has(sym)) missingFloat.push(sym);
      seeds.push(seed);
      this.subscribed.add(sym);
    }
    if (missingFloat.length)
      console.warn(`[Alpaca] فلوت مفقود (50M افتراضي): ${missingFloat.join(", ")}`);
    return seeds;
  }

  // فرز السوق الحالي (movers + most-actives) وإرجاع مرشّحين جُدد
  async screen(maxPrice: number, limit: number): Promise<SymbolSeed[]> {
    const movers = (await this.getJson(`${DATA}/v1beta1/screener/stocks/movers?top=50`)) as {
      gainers?: { symbol: string; price?: number }[];
    } | null;
    const actives = (await this.getJson(
      `${DATA}/v1beta1/screener/stocks/most-actives?by=volume&top=50`
    )) as { most_actives?: { symbol: string }[] } | null;

    const cand = new Set<string>();
    for (const g of movers?.gainers ?? []) if ((g.price ?? 1e9) <= maxPrice) cand.add(g.symbol);
    for (const a of actives?.most_actives ?? []) cand.add(a.symbol);
    const syms = [...cand];
    if (!syms.length) return [];

    const snap = (await this.getJson(
      `${DATA}/v2/stocks/snapshots?symbols=${encodeURIComponent(syms.join(","))}&feed=${this.dayFeed}`
    )) as Record<string, Snapshot> | null;
    if (!snap) return [];

    const rows: { sym: string; s: Snapshot; chg: number }[] = [];
    for (const sym of syms) {
      const s = snap[sym];
      const price = s?.latestTrade?.p ?? s?.dailyBar?.c;
      if (!Number.isFinite(price) || (price as number) > maxPrice || (price as number) < 0.2) continue;
      const prev = numOr(s.prevDailyBar?.c, price as number);
      rows.push({ sym, s, chg: (((price as number) - prev) / prev) * 100 });
    }
    rows.sort((a, b) => b.chg - a.chg);
    const top = rows.slice(0, limit);
    await this.fillFloats(top.map((r) => r.sym));
    return top.map((r) => this.seedFromSnapshot(r.sym, r.s)).filter(Boolean) as SymbolSeed[];
  }

  // إضافة رموز جديدة للبثّ الحي
  subscribe(syms: string[]) {
    const fresh = syms.map((s) => s.toUpperCase()).filter((s) => !this.subscribed.has(s));
    if (!fresh.length) return;
    for (const s of fresh) this.subscribed.add(s);
    for (const c of this.conns) c.subscribeMore(fresh);
  }

  start(onTick: TickHandler, _onNews?: NewsHandler) {
    const getSymbols = () => [...this.subscribed];

    const dayConn = new FeedConnection(
      `wss://stream.data.alpaca.markets/v2/${this.dayFeed}`,
      this.dayFeed,
      this.keyId,
      this.secret,
      getSymbols,
      this.dayFeed !== "iex",
      onTick
    );
    this.conns.push(dayConn);

    if (this.overnightFeed !== "off") {
      this.conns.push(
        new FeedConnection(
          `wss://stream.data.alpaca.markets/v1beta1/${this.overnightFeed}`,
          this.overnightFeed,
          this.keyId,
          this.secret,
          getSymbols,
          true,
          onTick
        )
      );
      console.log(`[Alpaca] الجلسة الليلية مفعّلة عبر "${this.overnightFeed}" (v1beta1).`);
    }

    for (const c of this.conns) c.open();

    // جلب أخبار AV الحقيقية + سنتمنت دورياً (كل 3 دقائق) — يتطلب باقة مدفوعة
    if (_onNews) {
      const run = () => this.fetchNews(_onNews);
      run();
      this.newsTimer = setInterval(run, 180_000);
    }
  }

  private async fetchNews(onNews: NewsHandler) {
    const key = process.env.ALPHAVANTAGE_API_KEY;
    if (!key || this.avBlocked) return;
    const syms = [...this.subscribed].slice(0, 8); // لكل رمز طلب مستقل
    let total = 0;
    let emitted = 0;
    for (const sym of syms) {
      try {
        const r = await fetch(
          `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${sym}&sort=LATEST&limit=10&apikey=${key}`
        );
        if (!r.ok) continue;
        const d = (await r.json()) as { feed?: AvArticle[]; Information?: string; Note?: string };
        if (d?.Information || d?.Note) {
          console.warn("[AV-News] " + String(d.Information || d.Note).slice(0, 160));
          return;
        }
        const feed = Array.isArray(d?.feed) ? d.feed : [];
        total += feed.length;
        let perSym = 0;
        for (const a of feed) {
          if (perSym >= 3) break;
          const url = a?.url;
          if (!url || this.seenNews.has(url)) continue;
          this.seenNews.add(url);
          if (this.seenNews.size > 600) this.seenNews.clear();
          const title = String(a?.title ?? "");
          let label = "";
          for (const t of a?.ticker_sentiment ?? []) {
            if (String(t?.ticker ?? "").toUpperCase() === sym) {
              label = String(t?.ticker_sentiment_label ?? "");
              break;
            }
          }
          emitted++;
          perSym++;
          onNews({
            symbol: sym,
            headline: title,
            source: String(a?.source ?? "Alpha Vantage"),
            time: parseAvTime(a?.time_published),
            kind: inferKind(title),
            url,
            sentiment: mapAvSentiment(label, title),
          });
        }
      } catch {
        /* تجاهل رمزاً فاشلاً */
      }
    }
    console.log(`[AV-News] فحص ${syms.length} رمز، مقالات ${total}، بُثّ ${emitted}`);
  }

  stop() {
    for (const c of this.conns) c.close();
    this.conns = [];
    if (this.newsTimer) {
      clearInterval(this.newsTimer);
      this.newsTimer = null;
    }
  }
}

function numOr(v: number | undefined, fallback: number): number {
  return Number.isFinite(v) ? (v as number) : fallback;
}

function parseFloats(raw: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of raw.split(",")) {
    const [sym, f] = part.split(":");
    if (!sym || f == null) continue;
    const n = parseFloat(f);
    if (Number.isFinite(n)) out[sym.trim().toUpperCase()] = n;
  }
  return out;
}

// طابع AV الزمني "20250101T103000" → epoch ms
function parseAvTime(s?: string): number {
  if (typeof s !== "string" || s.length < 15) return Date.now();
  const n = (a: number, b: number) => parseInt(s.slice(a, b), 10);
  const t = Date.UTC(n(0, 4), n(4, 6) - 1, n(6, 8), n(9, 11), n(11, 13), n(13, 15));
  return Number.isFinite(t) ? t : Date.now();
}

// استنتاج نوع المحفّز من العنوان
function inferKind(title: string): NewsEvent["kind"] {
  const t = title.toLowerCase();
  if (/(offering|424b5|\batm\b|dilut|registered direct|priced|warrant)/.test(t)) return "offering";
  if (/(fda|clearance|approval|\bphase\b|trial)/.test(t)) return "fda";
  if (/(earnings|revenue|\beps\b|quarterly|results|guidance)/.test(t)) return "earnings";
  if (/(upgrade|downgrade|price target|analyst|initiat|rating)/.test(t)) return "analyst";
  if (/(contract|agreement|\bdeal\b|award|partnership|\border\b|acquisition)/.test(t)) return "contract";
  return "pr";
}

// سنتمنت AV → تصنيفنا (مع كشف التخفيف من العنوان)
function mapAvSentiment(label: string, title: string): NewsEvent["sentiment"] {
  const t = title.toLowerCase();
  if (/(offering|424b5|\batm\b|dilut|registered direct|priced)/.test(t)) return "dilution";
  const l = label.toLowerCase();
  if (l.includes("bull")) return "bull";
  if (l.includes("bear")) return "bear";
  return "neutral";
}
