"use client";
import clsx from "clsx";
import type { SymbolSnapshot } from "@/engine/types";
import { levelText, levelBg } from "@/lib/levels";
import { fmtPrice, fmtVol } from "@/lib/format";

const LABELS: Record<string, string> = {
  name: "Name",
  price: "Price",
  gap: "Gap",
  volume: "Vol",
  float: "Float",
  zenV: "ZenV",
  zenP: "ZenP",
  zenVR: "ZenVR",
  atrSprd: "AtrSprd",
  atrVwap: "AtrVwap",
  atrHoD: "AtrHoD",
  twoMin: "2Min%",
  floatRot: "Rot",
};

// الأعمدة المحسوبة التي تُقرأ مباشرة من s.cells
const CELL_KEYS = new Set([
  "gap",
  "float",
  "zenV",
  "zenP",
  "zenVR",
  "atrSprd",
  "atrVwap",
  "atrHoD",
  "twoMin",
  "floatRot",
]);

export default function ScannerTable({
  rows,
  cols,
  selected,
  onSelect,
}: {
  rows: SymbolSnapshot[];
  cols: string[];
  selected?: string;
  onSelect: (sym: string) => void;
}) {
  return (
    <div dir="ltr" className="overflow-auto flex-1">
      <table className="w-full border-collapse text-[11px] tnum">
        <thead className="sticky top-0 z-10">
          <tr className="bg-base-750 text-slate-400">
            {cols.map((c) => (
              <th
                key={c}
                className={clsx(
                  "px-1.5 py-1 font-semibold text-right first:text-left whitespace-nowrap",
                  c === "name" && "text-left"
                )}
              >
                {LABELS[c] ?? c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={cols.length}
                className="px-2 py-3 text-center text-slate-600 text-[11px]"
              >
                — لا مرشّحين الآن —
              </td>
            </tr>
          )}
          {rows.map((s) => (
            <tr
              key={s.symbol}
              onClick={() => onSelect(s.symbol)}
              className={clsx(
                "cursor-pointer border-b border-base-800 hover:bg-base-700/40",
                s.allGreen && "row-allgreen",
                selected === s.symbol && "ring-1 ring-inset ring-neon-cyan/60 bg-base-700/30"
              )}
            >
              {cols.map((c) => (
                <Cell key={c} col={c} s={s} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ col, s }: { col: string; s: SymbolSnapshot }) {
  if (col === "name") {
    return (
      <td className="px-1.5 py-[3px] text-left font-bold text-slate-100 whitespace-nowrap">
        {s.symbol}
      </td>
    );
  }
  if (col === "price") {
    return (
      <td
        className={clsx(
          "px-1.5 py-[3px] text-right",
          s.changePct >= 0 ? "text-neon-green" : "text-neon-red"
        )}
      >
        {fmtPrice(s.price)}
      </td>
    );
  }
  if (col === "volume") {
    return (
      <td className="px-1.5 py-[3px] text-right text-sky-300">
        {fmtVol(s.volume)}
      </td>
    );
  }
  if (CELL_KEYS.has(col)) {
    const cell = s.cells[col];
    return (
      <td
        className={clsx(
          "px-1.5 py-[3px] text-right",
          levelText(cell?.level ?? "neutral"),
          levelBg(cell?.level ?? "neutral")
        )}
      >
        {cell?.text ?? "—"}
      </td>
    );
  }
  return <td className="px-1.5 py-[3px] text-right text-slate-400">—</td>;
}
