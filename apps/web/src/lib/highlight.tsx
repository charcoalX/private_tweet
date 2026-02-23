import type { ReactNode } from "react";

/**
 * Splits `text` on every case-insensitive occurrence of `query` and wraps
 * each match in a styled <mark> element.
 * Returns plain text when query is empty or contains no regex-safe characters.
 */
export function Highlight({
  text,
  query,
}: {
  text: string;
  query: string;
}): ReactNode {
  if (!text) return null;
  const q = query.trim();
  if (!q) return <>{text}</>;

  // Escape regex special characters so user input is treated as a literal string
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // The capture group causes split() to include matched substrings in the result
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));

  // With one capture group, parts alternate: [non-match, match, non-match, match, …]
  // Odd indices are always the matched (captured) substrings.
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span
            key={i}
            style={{ backgroundColor: "#166534", color: "#d1fae5", borderRadius: "3px", padding: "0 2px" }}
          >
            {part}
          </span>
        ) : (
          part
        )
      )}
    </>
  );
}
