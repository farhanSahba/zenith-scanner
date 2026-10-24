"use client";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import Chart from "./Chart";
import type { OHLCV } from "@/engine/types";
import type { ChartMeta } from "@/engine/engine";
import { fmtPrice, fmtPct, fmtFloat } from "@/lib/format";
import { useLang } from "@/lib/i18n";

interface ChartData {
  bars1: OHLCV[];
  bars15: OHLCV[];
  meta: ChartMeta;
}

export default function ChartsArea({ symbol }: { symbol: string | null }) {
  const { t } = useLang();
  const [data, setData] = useState<ChartData | null>(null);
  const [narr, setNarr] = useState<{ loading: boolean; text?: string; ai?: boolean }>({
    loading: false,
  });
  const symRef = useRef(symbol);
  symRef.current = symbol;

  useEffect(() => {
    setNarr({ loading: false });
    if (!symbol) {
      setData(null);
      return;
    }
    let active = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/chart?symbol=${encodeURIComponent(symbol)}`);
        if (!res.ok) return;
        const d = (await res.json()) as ChartData;
        if (active && symRef.current === symbol) setData(d);
      } catch {
        /* تجاهل */
      }
    };
    load();
    const t = setInterval(load, 1500);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [symbol]);

  async function readSetup() {
    if (!symbol) return;
    setNarr({ loading: true });
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "narrate", symbol }),
      });
      const d = await res.json();
      setNarr({ loading: false, text: d.text, ai: d.ai });
    } catch {
      setNarr({ loading: false, text: "تعذّرت القراءة" });
    }
  }

  const m = data?.meta;

  return (
    <div className="flex flex-col h-full gap-2">
      {/* ترويسة الرمز */}
      <div className="flex items-center gap-3 px-3 h-10 bg-base-850 border border-base-700 rounded shrink-0" dir="ltr">
        {m ? (
          <>
            <span className="font-black text-slate-100">{m.symbol}</span>
            <span className={clsx("tnum", m.changePct >= 0 ? "text-neon-green" : "text-neon-red")}>
              {fmtPrice(m.price)} ({fmtPct(m.changePct)})
            </span>
            <Meta label="VWAP" v={fmtPrice(m.vwap)} />
            <Meta label="HoD" v={fmtPrice(m.dayHigh)} />
            <Meta label="PM-H" v={fmtPrice(m.premktHigh)} />
            <Meta label="ATR" v={m.atr.toFixed(3)} />
            <Meta label="Float" v={fmtFloat(m.float)} />
            <div className="ms-auto flex items-center gap-2">
              <button
                onClick={() =>
                  window.open(
                    `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(m.symbol)}`,
                    "_blank",
                    "noopener"
                  )
                }
                className="text-[11px] px-2.5 py-1 rounded bg-base-800 text-slate-300 border border-base-700 hover:text-white hover:border-slate-500"
                title={t("tvOpen")}
              >
                📈 TradingView
              </button>
              <button
                onClick={readSetup}
                className="text-[11px] px-2.5 py-1 rounded bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/30 hover:bg-neon-cyan/25"
              >
                {t("chartReadSetup")}
              </button>
            </div>
          </>
        ) : (
          <span className="text-slate-500 text-[12px]">{t("chartSelectHint")}</span>
        )}
      </div>

      {/* قراءة السيتَب */}
      {(narr.loading || narr.text) && (
        <div className="px-3 py-2 bg-base-850 border border-neon-cyan/20 rounded text-[12px] text-slate-300 whitespace-pre-line shrink-0">
          {narr.loading ? (
            <span className="text-slate-500">{t("chartReading")}</span>
          ) : (
            <>
              {narr.ai === false && (
                <span className="text-[10px] text-slate-600 block mb-1">{t("chartRuleNote")}</span>
              )}
              {narr.text}
            </>
          )}
        </div>
      )}

      {/* الفريمان */}
      <div className="flex gap-2 flex-1 min-h-0">
        <Chart bars={data?.bars15 ?? []} meta={m ?? null} title={t("tf15")} />
        <Chart bars={data?.bars1 ?? []} meta={m ?? null} title={t("tf1")} />
      </div>
    </div>
  );
}

function Meta({ label, v }: { label: string; v: string }) {
  return (
    <span className="text-[11px] text-slate-500">
      {label} <span className="text-slate-300 tnum">{v}</span>
    </span>
  );
}
