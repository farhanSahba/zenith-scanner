import type { ColorLevel } from "@/engine/types";

// خريطة مستوى اللون → أصناف Tailwind للنص
export function levelText(level: ColorLevel): string {
  switch (level) {
    case "neon":
      return "text-neon-green glow-green font-bold";
    case "green":
      return "text-neon-green";
    case "neutral":
      return "text-slate-300";
    case "amber":
      return "text-neon-amber";
    case "red":
      return "text-neon-red";
    default:
      return "text-slate-400";
  }
}

// خلفية خفيفة للخلايا النيون (إبراز)
export function levelBg(level: ColorLevel): string {
  return level === "neon" ? "bg-neon-green/10" : "";
}
