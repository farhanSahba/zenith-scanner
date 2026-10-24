"use client";
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Lang = "ar" | "en";

// قاموس الترجمة. أعمدة التداول (Name/Price/Gap/Float/ZenP...) تبقى إنجليزية في اللغتين.
const dict = {
  ar: {
    subtitle: "ماسح الضاربة اللحظي",
    sim: "SIM · محاكاة",
    connected: "متصل",
    disconnected: "منقطع",
    symbols: "رمز",
    legendNeon: "نيون · أعلى احتمال",
    legendGreen: "أخضر",
    legendNeutral: "محايد",
    legendRed: "أحمر",
    legendRule: "القاعدة: كل الأعمدة خضراء",
    phasePre: "ما قبل السوق",
    phaseRegular: "الجلسة الرئيسية",
    phaseAfter: "ما بعد السوق",
    phaseOvernight: "التداول الليلي (24س)",
    phaseClosed: "السوق مغلق",
    ahClose: "إغلاق AH",
    sound: "الصوت",
    panelMomoHod: "قمة اليوم",
    panelGapUp: "فجوات صاعدة",
    panelLowFloat: "فجوات · فلوت منخفض",
    panelMomoUp: "زخم دقيقتين ↑",
    panelMomoDown: "زخم دقيقتين ↓",
    panelAlerts: "التنبيهات اللحظية",
    noCandidates: "— لا مرشّحين الآن —",
    alertsWaiting: "— بانتظار التنبيهات —",
    newsEmpty: "— لا أخبار بعد —",
    newsAnalyze: "✦ تحليل Claude",
    newsAnalyzing: "...يحلّل",
    newsFallback: "(بديل قواعدي)",
    aiTab: "✦ الماسح الذكي",
    newsTab: "الأخبار",
    aiPlaceholder: "اكتب فلترك…",
    aiSearch: "ابحث",
    aiUnderstood: "فُهم:",
    aiResults: "نتيجة",
    aiByRule: "قواعدي",
    aiHint: "اكتب استعلاماً أو اختر مثالاً.",
    ex1: "أسهم تحت 5$ قفزت 20% بفلوت أقل من 10 مليون وفيها خبر",
    ex2: "فلوت أقل من 5 مليون وزخم دقيقتين فوق 8%",
    ex3: "كل الأعمدة خضراء واحتمالية فوق 70",
    chartSelectHint: "اختر رمزاً من أي لوحة لعرض الرسم والتحليل",
    chartReadSetup: "✦ اقرأ السيتَب (Claude)",
    chartReading: "...يقرأ Claude السيتَب",
    chartRuleNote: "(تحليل قواعدي — فعّل مفتاح Claude لقراءة أعمق)",
    tvOpen: "افتح الرمز في TradingView (جلستك المدفوعة — شارت 24س)",
    tf1: "1 دقيقة",
    tf15: "15 دقيقة",
    live: "مباشر · Alpaca",
    colName: "الاسم",
    colPrice: "السعر",
    colVol: "الحجم",
    colGap: "الفجوة",
    colFloat: "الفلوت",
    col2Min: "دقيقتين٪",
    colReason: "السبب",
    colWarn: "تحذير",
    colTime: "الوقت",
    reasonToHod: "قرب القمة",
    langBtn: "EN",
  },
  en: {
    subtitle: "Real-time Momentum Scanner",
    sim: "SIM",
    connected: "Connected",
    disconnected: "Offline",
    symbols: "symbols",
    legendNeon: "Neon · Top odds",
    legendGreen: "Green",
    legendNeutral: "Neutral",
    legendRed: "Red",
    legendRule: "Rule: all columns green",
    phasePre: "Pre-Market",
    phaseRegular: "Regular Session",
    phaseAfter: "After-Hours",
    phaseOvernight: "Overnight (24h)",
    phaseClosed: "Market Closed",
    ahClose: "AH Close",
    sound: "Sound",
    panelMomoHod: "Momo HOD · High of Day",
    panelGapUp: "Gap Up",
    panelLowFloat: "Gap Up · Low Float",
    panelMomoUp: "2 min Momo UP",
    panelMomoDown: "2 min Momo DOWN",
    panelAlerts: "Live Alerts",
    noCandidates: "— no candidates —",
    alertsWaiting: "— waiting for alerts —",
    newsEmpty: "— no news yet —",
    newsAnalyze: "✦ Claude analysis",
    newsAnalyzing: "analyzing...",
    newsFallback: "(rule-based)",
    aiTab: "✦ Smart Scanner",
    newsTab: "News",
    aiPlaceholder: "Type your filter…",
    aiSearch: "Search",
    aiUnderstood: "Understood:",
    aiResults: "results",
    aiByRule: "rule-based",
    aiHint: "Type a query or pick an example.",
    ex1: "stocks under $5 up 20% with float under 10M and news",
    ex2: "float under 5M and 2-min momentum above 8%",
    ex3: "all columns green and probability above 70",
    chartSelectHint: "Select a symbol from any panel to view chart and analysis",
    chartReadSetup: "✦ Read setup (Claude)",
    chartReading: "Claude is reading the setup...",
    chartRuleNote: "(rule-based — add a Claude key for a deeper read)",
    tvOpen: "Open symbol in TradingView (your paid session — 24h chart)",
    tf1: "1 min",
    tf15: "15 min",
    live: "LIVE · Alpaca",
    colName: "Name",
    colPrice: "Price",
    colVol: "Vol",
    colGap: "Gap",
    colFloat: "Float",
    col2Min: "2Min%",
    colReason: "Reason",
    colWarn: "Warn",
    colTime: "Time",
    reasonToHod: "To HoD",
    langBtn: "ع",
  },
} as const;

export type TKey = keyof (typeof dict)["ar"];

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggle: () => void;
  t: (k: TKey) => string;
}

const LangContext = createContext<Ctx>({
  lang: "ar",
  setLang: () => {},
  toggle: () => {},
  t: (k) => dict.ar[k],
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ar");

  useEffect(() => {
    try {
      const s = localStorage.getItem("zenith_lang");
      if (s === "ar" || s === "en") setLangState(s);
    } catch {
      /* تجاهل */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem("zenith_lang", l);
    } catch {
      /* تجاهل */
    }
  };

  const t = (k: TKey) => dict[lang][k] ?? dict.ar[k] ?? k;

  return createElement(
    LangContext.Provider,
    { value: { lang, setLang, toggle: () => setLang(lang === "ar" ? "en" : "ar"), t } },
    children
  );
}

export const useLang = () => useContext(LangContext);
