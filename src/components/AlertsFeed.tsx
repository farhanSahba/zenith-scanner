"use client";
import clsx from "clsx";
import type { Alert } from "@/engine/types";
import { fmtClockLocal, fmtPrice } from "@/lib/format";
import { useLang, type TKey } from "@/lib/i18n";

export default function AlertsFeed({
  alerts,
  onSelect,
}: {
  alerts: Alert[];
  onSelect: (sym: string) => void;
}) {
  const { t } = useLang();
  return (
    <div dir="ltr" className="overflow-auto flex-1">
      <table className="w-full border-collapse text-[11px] tnum">
        <thead className="sticky top-0 bg-base-750 text-slate-400">
          <tr>
            <th className="px-1.5 py-1 text-left font-semibold">{t("colName")}</th>
            <th className="px-1.5 py-1 text-left font-semibold">{t("colReason")}</th>
            <th className="px-1.5 py-1 text-right font-semibold">{t("colPrice")}</th>
            <th className="px-1.5 py-1 text-right font-semibold">{t("colWarn")}</th>
            <th className="px-1.5 py-1 text-right font-semibold">{t("colTime")}</th>
          </tr>
        </thead>
        <tbody>
          {alerts.length === 0 && (
            <tr>
              <td colSpan={5} className="px-2 py-3 text-center text-slate-600">
                {t("alertsWaiting")}
              </td>
            </tr>
          )}
          {alerts.map((a) => (
            <tr
              key={a.id}
              onClick={() => onSelect(a.symbol)}
              className="cursor-pointer border-b border-base-800 hover:bg-base-700/40"
            >
              <td
                className={clsx(
                  "px-1.5 py-[3px] text-left font-bold",
                  a.tone === "bull" ? "text-neon-green" : a.tone === "bear" ? "text-neon-red" : "text-slate-200"
                )}
              >
                {a.symbol}
              </td>
              <td
                className={clsx(
                  "px-1.5 py-[3px] text-left",
                  a.tone === "bull" ? "text-neon-green/90" : a.tone === "bear" ? "text-neon-red/90" : "text-slate-300"
                )}
              >
                {a.tier === "early" && (
                  <span className="text-neon-amber mr-1" title={t("tierEarly")}>
                    ⚡
                  </span>
                )}
                {reasonLabel(a, t)}
              </td>
              <td className="px-1.5 py-[3px] text-right text-slate-200">{fmtPrice(a.price)}</td>
              <td className="px-1.5 py-[3px] text-right text-neon-amber">{a.warning ?? ""}</td>
              <td className="px-1.5 py-[3px] text-right text-slate-500">{fmtClockLocal(a.time)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// سبب التنبيه مترجَماً حسب نوعه (مع إبقاء النِّسب كما هي)
function reasonLabel(a: Alert, t: (k: TKey) => string): string {
  switch (a.kind) {
    case "toHod":
      return t("reasonToHod");
    case "approachHod":
      return t("reasonApproachHod");
    case "surge":
      return a.reason.replace("انفجار حجم", t("reasonSurge"));
    case "new":
      return a.reason.replace("مرشّح جديد", t("reasonNewCand"));
    case "dilution":
      return t("reasonDilution");
    default:
      return a.reason === "To HoD" ? t("reasonToHod") : a.reason;
  }
}
