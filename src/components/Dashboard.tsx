"use client";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useStream } from "@/lib/useStream";
import { setTtsEnabled, speakAr } from "@/lib/tts";
import { LangProvider, useLang, type TKey } from "@/lib/i18n";
import type { Alert, PanelKey } from "@/engine/types";
import type { MarketId } from "@/engine/markets";
import TopBar from "@/components/TopBar";
import Panel from "@/components/Panel";
import ScannerTable from "@/components/ScannerTable";
import AlertsFeed from "@/components/AlertsFeed";
import ChartsArea from "@/components/ChartsArea";
import AiConsole from "@/components/AiConsole";
import NewsPanel from "@/components/NewsPanel";
import PerfPanel from "@/components/PerfPanel";

// تعريف اللوحات وأعمدتها (العنوان عبر مفتاح ترجمة)
const PANELS: { key: PanelKey; titleKey: TKey; accent: string; cols: string[] }[] = [
  { key: "momoHod", titleKey: "panelMomoHod", accent: "#1cff9b", cols: ["name", "price", "volume", "float", "zenV", "zenP", "atrSprd", "atrVwap", "atrHoD", "twoMin"] },
  { key: "gapUp", titleKey: "panelGapUp", accent: "#39ff14", cols: ["name", "price", "gap", "volume", "float", "zenP", "atrSprd", "atrVwap", "atrHoD", "twoMin"] },
  { key: "gapUpLowFloat", titleKey: "panelLowFloat", accent: "#22d3ee", cols: ["name", "price", "gap", "volume", "float", "zenP", "atrHoD"] },
  { key: "momo2mUp", titleKey: "panelMomoUp", accent: "#1cff9b", cols: ["name", "price", "twoMin", "volume", "zenVR", "zenP", "atrVwap", "atrHoD"] },
  { key: "momo2mDown", titleKey: "panelMomoDown", accent: "#ff2d55", cols: ["name", "price", "twoMin", "volume", "zenVR", "zenP", "atrVwap", "atrHoD"] },
];

// لوحات تعرض عمود تدفّق السيولة (السعودي Pro)
const FLOW_PANELS = new Set<PanelKey>(["momoHod", "momo2mUp", "momo2mDown"]);

type MobileView = "scan" | "alerts" | "chart" | "tools";
type Tab = "ai" | "news" | "perf";

// هل العرض سطح مكتب (≥ lg)؟ — لعرض تخطيط واحد فقط (تفادي تحميل المكوّنات مرّتين)
function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setDesktop(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desktop;
}

export default function Dashboard({ market }: { market: MarketId }) {
  return (
    <LangProvider>
      <DashboardInner market={market} />
    </LangProvider>
  );
}

function DashboardInner({ market }: { market: MarketId }) {
  const { t } = useLang();
  const { snap, connected } = useStream(market);
  const [selected, setSelected] = useState<string | null>(null);
  const [tts, setTts] = useState(false);
  const [hawk, setHawk] = useState(true);
  const [tab, setTab] = useState<Tab>("ai");
  const [mobileView, setMobileView] = useState<MobileView>("scan");
  const isDesktop = useIsDesktop();
  const lastSpoken = useRef<string | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem("zenith_hawk") === "0") setHawk(false);
    } catch {
      /* تجاهل */
    }
  }, []);

  const alerts = hawk ? snap?.alerts ?? [] : (snap?.alerts ?? []).filter((a) => a.tier !== "early");

  useEffect(() => {
    if (selected || !snap) return;
    const first =
      snap.panels.momoHod[0]?.symbol ??
      snap.panels.gapUp[0]?.symbol ??
      snap.panels.momo2mUp[0]?.symbol ??
      null;
    if (first) setSelected(first);
  }, [snap, selected]);

  useEffect(() => {
    if (!tts || !alerts.length) return;
    const newest = alerts[0];
    if (newest.id === lastSpoken.current) return;
    const idx = alerts.findIndex((a) => a.id === lastSpoken.current);
    const cap = hawk ? 3 : 2;
    const fresh = idx === -1 ? alerts.slice(0, 1) : alerts.slice(0, Math.min(idx, cap));
    lastSpoken.current = newest.id;
    fresh.reverse().forEach((a) => speakAr(alertSpeech(a)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, tts]);

  function toggleTts() {
    const next = !tts;
    setTts(next);
    setTtsEnabled(next);
    if (next) lastSpoken.current = alerts[0]?.id ?? null;
  }

  function toggleHawk() {
    setHawk((h) => {
      const n = !h;
      const view = n ? snap?.alerts ?? [] : (snap?.alerts ?? []).filter((a) => a.tier !== "early");
      lastSpoken.current = view[0]?.id ?? null;
      try {
        localStorage.setItem("zenith_hawk", n ? "1" : "0");
      } catch {
        /* تجاهل */
      }
      return n;
    });
  }

  // اختيار رمز: على الجوال ينقل تلقائياً لعرض الرسم
  function selectSymbol(sym: string) {
    setSelected(sym);
    if (!isDesktop) setMobileView("chart");
  }

  // ===== قطع المحتوى (تُرسم في تخطيط واحد فقط) =====
  const panelEls = PANELS.map((p) => {
    const cols = market === "sa" && FLOW_PANELS.has(p.key) ? [...p.cols, "flow"] : p.cols;
    return (
      <Panel
        key={p.key}
        title={t(p.titleKey)}
        accent={p.accent}
        className="h-full"
        badge={<span className="text-slate-600 text-[10px]">{snap?.panels[p.key]?.length ?? 0}</span>}
      >
        <ScannerTable
          rows={snap?.panels[p.key] ?? []}
          cols={cols}
          selected={selected ?? undefined}
          onSelect={selectSymbol}
        />
      </Panel>
    );
  });

  const alertsPanel = (
    <Panel
      title={t("panelAlerts")}
      accent="#ffb020"
      className="h-full"
      badge={<span className="text-slate-600 text-[10px]">{alerts.length}</span>}
    >
      <AlertsFeed alerts={alerts} onSelect={selectSymbol} />
    </Panel>
  );

  const chartArea = <ChartsArea symbol={selected} market={market} />;

  const toolsArea = (
    <div className="panel h-full flex flex-col">
      <div className="flex border-b border-base-700 shrink-0">
        <TabBtn active={tab === "ai"} onClick={() => setTab("ai")}>
          {t("aiTab")}
        </TabBtn>
        <TabBtn active={tab === "news"} onClick={() => setTab("news")}>
          {t("newsTab")} {snap?.news.length ? `(${snap.news.length})` : ""}
        </TabBtn>
        <TabBtn active={tab === "perf"} onClick={() => setTab("perf")}>
          {t("perfTab")}
        </TabBtn>
      </div>
      <div className="flex-1 min-h-0">
        {tab === "ai" ? (
          <AiConsole onSelect={selectSymbol} market={market} />
        ) : tab === "news" ? (
          <NewsPanel news={snap?.news ?? []} onSelect={selectSymbol} market={market} />
        ) : (
          <PerfPanel market={market} />
        )}
      </div>
    </div>
  );

  return (
    <div className="h-[100dvh] flex flex-col bg-base-900 text-slate-300 overflow-hidden">
      <TopBar
        snap={snap}
        connected={connected}
        tts={tts}
        onToggleTts={toggleTts}
        hawk={hawk}
        onToggleHawk={toggleHawk}
        market={market}
      />

      {isDesktop ? (
        /* ===== سطح المكتب: التخطيط الكامل ===== */
        <main className="flex-1 min-h-0 flex flex-col gap-2 p-2">
          <section className="flex gap-2" style={{ height: "45%" }}>
            <div className="flex-1 grid grid-cols-2 xl:grid-cols-3 grid-rows-2 gap-2 min-w-0">
              {panelEls}
            </div>
            <div className="w-[340px] shrink-0">{alertsPanel}</div>
          </section>
          <section className="flex-1 min-h-0 flex gap-2">
            <div className="flex-[3] min-w-0">{chartArea}</div>
            <div className="flex-[2] min-w-0">{toolsArea}</div>
          </section>
        </main>
      ) : (
        /* ===== الجوال: منطقة واحدة + شريط تنقّل سفلي ===== */
        <main className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 overflow-hidden p-2">
            {mobileView === "scan" && (
              <div className="h-full overflow-auto flex flex-col gap-2 pb-1">
                {panelEls.map((el, i) => (
                  <div key={i} className="shrink-0 h-[280px]">
                    {el}
                  </div>
                ))}
              </div>
            )}
            {mobileView === "alerts" && <div className="h-full">{alertsPanel}</div>}
            {mobileView === "chart" && <div className="h-full">{chartArea}</div>}
            {mobileView === "tools" && <div className="h-full">{toolsArea}</div>}
          </div>
          <MobileNav view={mobileView} setView={setMobileView} alertCount={alerts.length} />
        </main>
      )}
    </div>
  );
}

function MobileNav({
  view,
  setView,
  alertCount,
}: {
  view: MobileView;
  setView: (v: MobileView) => void;
  alertCount: number;
}) {
  const { t } = useLang();
  const items: { key: MobileView; icon: string; label: TKey; badge?: number }[] = [
    { key: "scan", icon: "📊", label: "navScan" },
    { key: "alerts", icon: "🔔", label: "navAlerts", badge: alertCount },
    { key: "chart", icon: "📈", label: "navChart" },
    { key: "tools", icon: "✦", label: "navTools" },
  ];
  return (
    <nav className="shrink-0 flex items-stretch border-t border-base-700 bg-base-850 pb-[env(safe-area-inset-bottom)]">
      {items.map((it) => {
        const active = view === it.key;
        return (
          <button
            key={it.key}
            onClick={() => setView(it.key)}
            className={clsx(
              "relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold transition-colors",
              active ? "text-neon-cyan" : "text-slate-500 hover:text-slate-300"
            )}
          >
            <span className="text-base leading-none">{it.icon}</span>
            <span>{t(it.label)}</span>
            {it.badge ? (
              <span className="absolute top-1 ltr:right-1/4 rtl:left-1/4 min-w-[16px] h-4 px-1 rounded-full bg-neon-amber text-base-900 text-[9px] font-black flex items-center justify-center">
                {it.badge > 99 ? "99+" : it.badge}
              </span>
            ) : null}
            {active && <span className="absolute bottom-0 inset-x-3 h-0.5 rounded-full bg-neon-cyan" />}
          </button>
        );
      })}
    </nav>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap",
        active ? "text-neon-cyan border-b-2 border-neon-cyan bg-base-800" : "text-slate-500 hover:text-slate-300"
      )}
    >
      {children}
    </button>
  );
}

function alertSpeech(a: Alert): string {
  const sym = a.symbol.split("").join(" ");
  switch (a.kind) {
    case "toHod":
      return `${sym} يكسر قمة اليوم`;
    case "approachHod":
      return `${sym} يقترب من القمة`;
    case "surge":
      return `${sym} انفجار حجم`;
    case "new":
      return `${sym} مرشّح جديد`;
    case "dilution":
      return `${sym} تحذير تخفيف`;
    case "halt":
      return `${sym} إيقاف تداول`;
    case "resume":
      return `${sym} استئناف التداول`;
    case "up2m":
    case "down2m": {
      const m = a.reason.match(/([+-]?[\d.]+)\s*% \/2Min/);
      if (m) {
        const v = parseFloat(m[1]);
        return v >= 0
          ? `${sym} ارتفاع ${Math.abs(v).toFixed(0)} بالمئة في دقيقتين`
          : `${sym} هبوط ${Math.abs(v).toFixed(0)} بالمئة في دقيقتين`;
      }
      return `${sym} ${a.reason}`;
    }
    default:
      if (a.reason.includes("To HoD")) return `${sym} يقترب من قمة اليوم`;
      return `${sym} ${a.reason}`;
  }
}
