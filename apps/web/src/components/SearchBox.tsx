"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SearchBox() {
  const [query, setQuery] = useState("");
  const router = useRouter();

  function submit() {
    const q = query.trim();
    if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <div className="relative">
      <input
        type="text"
        placeholder="Search…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        className="bg-surface-700 text-slate-100 rounded-lg pl-8 pr-3 py-1.5 text-sm outline-none placeholder-slate-500 focus:ring-1 focus:ring-brand-500 w-32 focus:w-44 transition-all duration-200"
      />
      {/* search icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
    </div>
  );
}
