"use client";
import { useEffect, useState } from "react";
import type { Snapshot } from "@/engine/types";

// يشترك في بث SSE ويعيد آخر snapshot + حالة الاتصال.
export function useStream(): { snap: Snapshot | null; connected: boolean } {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const es = new EventSource("/api/stream");
    es.onopen = () => setConnected(true);
    es.onmessage = (e) => {
      try {
        setSnap(JSON.parse(e.data) as Snapshot);
        setConnected(true);
      } catch {
        /* تجاهل أجزاء غير مكتملة */
      }
    };
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, []);

  return { snap, connected };
}
