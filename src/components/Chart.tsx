"use client";
import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type UTCTimestamp,
} from "lightweight-charts";
import type { OHLCV } from "@/engine/types";
import type { ChartMeta } from "@/engine/engine";

// رسم شمعدان واحد (إطار محدّد) مع حجم ومستويات أفقية.
export default function Chart({
  bars,
  meta,
  title,
}: {
  bars: OHLCV[];
  meta: ChartMeta | null;
  title: string;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);

  // إنشاء الرسم مرة واحدة
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: "#0b0f15" },
        textColor: "#64748b",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.03)" },
        horzLines: { color: "rgba(255,255,255,0.03)" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#161c26" },
      timeScale: { borderColor: "#161c26", timeVisible: true, secondsVisible: false },
      width: el.clientWidth,
      height: el.clientHeight,
    });
    const candle = chart.addCandlestickSeries({
      upColor: "#1cff9b",
      downColor: "#ff2d55",
      borderUpColor: "#1cff9b",
      borderDownColor: "#ff2d55",
      wickUpColor: "#1cff9b",
      wickDownColor: "#ff2d55",
    });
    const vol = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    chart.priceScale("vol").applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    chartRef.current = chart;
    candleRef.current = candle;
    volRef.current = vol;

    const ro = new ResizeObserver(() => {
      chart.resize(el.clientWidth, el.clientHeight);
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  // تحديث البيانات والمستويات
  useEffect(() => {
    const candle = candleRef.current;
    const vol = volRef.current;
    if (!candle || !vol) return;

    candle.setData(
      bars.map((b) => ({
        time: Math.floor(b.t / 1000) as UTCTimestamp,
        open: b.o,
        high: b.h,
        low: b.l,
        close: b.c,
      }))
    );
    vol.setData(
      bars.map((b) => ({
        time: Math.floor(b.t / 1000) as UTCTimestamp,
        value: b.v,
        color: b.c >= b.o ? "rgba(28,255,155,0.35)" : "rgba(255,45,85,0.35)",
      }))
    );

    // إعادة بناء المستويات الأفقية
    for (const l of linesRef.current) candle.removePriceLine(l);
    linesRef.current = [];
    if (meta) {
      const add = (price: number, color: string, titleTxt: string) => {
        if (!Number.isFinite(price) || price <= 0) return;
        linesRef.current.push(
          candle.createPriceLine({
            price,
            color,
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: titleTxt,
          })
        );
      };
      add(meta.vwap, "#ffb020", "VWAP");
      add(meta.dayHigh, "#ff2d55", "HoD");
      add(meta.premktHigh, "#a855f7", "PM-H");
      add(meta.prevClose, "#64748b", "PC");
    }
    chartRef.current?.timeScale().fitContent();
  }, [bars, meta]);

  return (
    <div className="panel flex-1 min-w-0">
      <div className="panel-title">
        <span>{title}</span>
        <span className="text-slate-600 text-[10px]">{meta?.symbol ?? ""}</span>
      </div>
      <div ref={elRef} className="flex-1 min-h-0" />
    </div>
  );
}
