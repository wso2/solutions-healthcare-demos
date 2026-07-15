"use client";

import { useEffect, useState } from "react";

export function AppHeader({ lastPollAt }: { lastPollAt: number | null }) {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, []);

  const displayed = lastPollAt ?? now;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[rgba(0,0,0,0.08)] bg-white px-6">
      <div className="flex items-center gap-3">
        {/* Mock's exact loop-with-pulse logo mark. */}
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#FF7300"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0"
          aria-hidden="true"
        >
          <path d="M20 12a8 8 0 1 1-2.34-5.66" />
          <path d="M20 3v4h-4" />
          <path d="M8.5 12h2l1-2.4 1.6 4.4 1-2h1.9" />
        </svg>
        <span className="text-[15px] font-bold tracking-[-0.2px]">Care Loop</span>
      </div>
      <span className="font-mono text-[11px] text-[rgba(0,0,0,0.45)]">
        last update {new Date(displayed).toLocaleTimeString([], { hour12: false })}
      </span>
    </header>
  );
}
