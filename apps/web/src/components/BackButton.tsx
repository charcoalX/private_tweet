"use client";

import { useRouter } from "next/navigation";

export function BackButton() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.back()}
      className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
    >
      ← 返回
    </button>
  );
}
