"use client";

import { useRouter } from "next/navigation";

export function BackButton() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.back()}
      className="text-sm text-slate-400 hover:text-slate-100 transition-colors"
    >
      ← Back
    </button>
  );
}
