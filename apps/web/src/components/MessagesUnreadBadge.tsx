"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

export function MessagesUnreadBadge() {
  const [count, setCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);

  // Initial fetch + polling every 30 s
  useEffect(() => {
    let cancelled = false;

    async function fetchCount() {
      try {
        const res = await api.get<{ data: { count: number } }>(
          "/api/messages/unread-count"
        );
        if (!cancelled) setCount(res.data.count);
      } catch {
        // ignore
      }
    }

    fetchCount();
    const interval = setInterval(fetchCount, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Listen on the shared WS for new_message / messages_read events
  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000";
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let destroyed = false;

    function connect() {
      ws = new WebSocket(`${wsUrl}/ws`);
      wsRef.current = ws;

      ws.onmessage = (evt) => {
        try {
          const event = JSON.parse(evt.data as string) as {
            type: string;
          };
          if (event.type === "new_message") {
            setCount((c) => c + 1);
          } else if (event.type === "messages_read") {
            // Re-fetch to get accurate count
            api
              .get<{ data: { count: number } }>("/api/messages/unread-count")
              .then((r) => setCount(r.data.count))
              .catch(() => undefined);
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        if (!destroyed) {
          reconnectTimer = setTimeout(connect, 3_000);
        }
      };
    }

    connect();

    return () => {
      destroyed = true;
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  if (count === 0) return null;

  return (
    <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
      {count > 9 ? "9+" : count}
    </span>
  );
}
