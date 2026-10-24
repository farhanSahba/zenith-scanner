"use client";
import clsx from "clsx";
import type { ReactNode } from "react";

export default function Panel({
  title,
  accent,
  badge,
  children,
  className,
}: {
  title: string;
  accent?: string;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("panel", className)}>
      <div className="panel-title" style={accent ? { color: accent } : undefined}>
        <span className="truncate">{title}</span>
        {badge}
      </div>
      {children}
    </div>
  );
}
