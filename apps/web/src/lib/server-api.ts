import { cookies } from "next/headers";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export async function serverFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("access_token")?.value;

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Cookie: `access_token=${accessToken}` } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((err as { message?: string }).message ?? res.statusText);
  }

  return res.json() as Promise<T>;
}

/** Decode current user from the access_token cookie (no signature verification — trust middleware). */
export async function getCurrentUser(): Promise<{
  sub: string;
  username: string;
  role: string;
} | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;
  if (!token) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString()
    );
    return payload as { sub: string; username: string; role: string };
  } catch {
    return null;
  }
}
