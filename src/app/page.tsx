"use client";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useStream } from "@/lib/useStream";
import { setTtsEnabled, speakAr } from "@/lib/tts";
import { LangProvider, useLang, type TKey } from "@/lib/i18n";
import type { Alert, PanelKey } from "@/engine/types";
import TopBar from "@/components/TopBar";
import Panel from "@/components/Panel";
import ScannerTable from "@/components/ScannerTable";
import AlertsFeed from "@/components/AlertsFeed";
import ChartsArea from "@/components/ChartsArea";
import AiConsole from "@/components/AiConsole";
import NewsPanel from "@/components/NewsPanel";

// تعريف اللوحات وأعمدتها (العنوان عبر مفتاح ترجمة)
const PANELS: {
  key: PanelKey;
  titleKey: TKey;
  accent: string;
  cols: string[];
}[] = [
  {
    key: "momoHod",
    titleKey: "panelMomoHod",
    accent: "#1cff9b",
    cols: ["name", "price", "volume", "float", "zenV", "zenP", "atrSprd", "atrVwap", "atrHoD", "twoMin"],
  },
  {
    key: "gapUp",
    titleKey: "panelGapUp",
    accent: "#39ff14",
    cols: ["name", "price", "gap", "volume", "float", "zenP", "atrSprd", "atrVwap", "atrHoD", "twoMin"],
  },
  {
    key: "gapUpLowFloat",
    titleKey: "panelLowFloat",
    accent: "#22d3ee",
    cols: ["name", "price", "gap", "volume", "float", "zenP", "atrHoD"],
  },
  {
    key: "momo2mUp",
    titleKey: "panelMomoUp",
    accent: "#1cff9b",
    cols: ["name", "price", "twoMin", "volume", "zenVR", "zenP", "atrVwap", "atrHoD"],
  },
  {
    key: "momo2mDown",
    titleKey: "panelMomoDown",
    accent: "#ff2d55",
    cols: ["name", "price", "twoMin", "volume", "zenVR", "zenP", "atrVwap", "atrHoD"],
  },
];

export default function Home() {
  return (
    <LangProvider>
      <Dashboard />
    </LangProvider>
  );
}

function Dashboard() {
  const { t } = useLang();
  const { snap, connected } = useStream();
  const [selected, setSelected] = useState<string | null>(null);
  const [tts, setTts] = useState(false);
  const [hawk, setHawk] = useState(true);
  const [tab, setTab] = useState<"ai" | "news">("ai");
  const lastSpoken = useRef<string | null>(null);

  // استرجاع تفضيل وضع الصقر (افتراضياً مُفعّل)
  useEffect(() => {
    try {
      if (localStorage.getItem("zenith_hawk") === "0") setHawk(false);
    } catch {
      /* تجاهل */
    }
  }, []);

  // التنبيهات المعروضة: الوضع الهادئ يُخفي إشارات الصقر المبكرة
  const alerts = hawk
    ? snap?.alerts ?? []
    : (snap?.alerts ?? []).filter((a) => a.tier !== "early");

  // اختيار رمز افتراضي أول ما تصل الداتا
  useEffect(() => {
    if (selected || !snap) return;
    const first =
      snap.panels.momoHod[0]?.symbol ??
      snap.panels.gapUp[0]?.symbol ??
      snap.panels.momo2mUp[0]?.symbol ??
      null;
    if (first) setSelected(first);
  }, [snap, selected]);

  // نطق التنبيهات الجديدة (أعدى في وضع الصقر)
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
      // أعد مزامنة آخر منطوق مع العرض الجديد حتى لا يُعيد التبديلُ نطق تنبيه قديم
      const view = n
        ? snap?.alerts ?? []
        : (snap?.alerts ?? []).filter((a) => a.tier !== "early");
      lastSpoken.current = view[0]?.id ?? null;
      try {
        localStorage.setItem("zenith_hawk", n ? "1" : "0");
      } catch {
        /* تجاهل */
      }
      return n;
    });
  }

  return (
    <div className="h-screen flex flex-col bg-base-900 text-slate-300">
      <TopBar
        snap={snap}
        connected={connected}
        tts={tts}
        onToggleTts={toggleTts}
        hawk={hawk}
        onToggleHawk={toggleHawk}
      />

      <main className="flex-1 min-h-0 flex flex-col gap-2 p-2">
        {/* لوحات الماسح + التنبيهات */}
        <section className="flex gap-2" style={{ height: "45%" }}>
          <div className="flex-1 grid grid-cols-2 xl:grid-cols-3 grid-rows-2 gap-2 min-w-0">
            {PANELS.map((p) => (
              <Panel
                key={p.key}
                title={t(p.titleKey)}
                accent={p.accent}
                badge={
                  <span className="text-slate-600 text-[10px]">
                    {snap?.panels[p.key]?.length ?? 0}
                  </span>
                }
              >
                <ScannerTable
                  rows={snap?.panels[p.key] ?? []}
                  cols={p.cols}
                  selected={selected ?? undefined}
                  onSelect={setSelected}
                />
              </Panel>
            ))}
          </div>

          <div className="w-[340px] shrink-0">
            <Panel
              title={t("panelAlerts")}
              accent="#ffb020"
              className="h-full"
              badge={<span className="text-slate-600 text-[10px]">{alerts.length}</span>}
            >
              <AlertsFeed alerts={alerts} onSelect={setSelected} />
            </Panel>
          </div>
        </section>

        {/* الرسوم + الأدوات */}
        <section className="flex-1 min-h-0 flex gap-2">
          <div className="flex-[3] min-w-0">
            <ChartsArea symbol={selected} />
          </div>

          <div className="flex-[2] min-w-0 panel">
            <div className="flex border-b border-base-700 shrink-0">
              <TabBtn active={tab === "ai"} onClick={() => setTab("ai")}>
                {t("aiTab")}
              </TabBtn>
              <TabBtn active={tab === "news"} onClick={() => setTab("news")}>
                {t("newsTab")} {snap?.news.length ? `(${snap.news.length})` : ""}
              </TabBtn>
            </div>
            <div className="flex-1 min-h-0">
              {tab === "ai" ? (
                <AiConsole onSelect={setSelected} />
              ) : (
                <NewsPanel news={snap?.news ?? []} onSelect={setSelected} />
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "px-3 py-1.5 text-[12px] font-semibold",
        active
          ? "text-neon-cyan border-b-2 border-neon-cyan bg-base-800"
          : "text-slate-500 hover:text-slate-300"
      )}
    >
      {children}
    </button>
  );
}

// تحويل التنبيه لنص عربي منطوق (حسب نوعه)
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
