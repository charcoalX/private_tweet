const API_BASE =
  typeof window === "undefined"
    ? (process.env.API_URL ?? "http://localhost:3001")
    : ""; // browser uses relative /api/* via Next.js rewrites

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public body?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    credentials: "include", // send httpOnly cookies
    headers: {
      // Only set Content-Type when there is a body to avoid Fastify rejecting bodyless POST/DELETE
      ...(options.body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    // Attempt silent refresh
    const refreshed = await tryRefresh();
    if (refreshed) {
      // Retry original request once
      const retry = await fetch(url, {
        ...options,
        credentials: "include",
        headers: {
          ...(options.body !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
          ...options.headers,
        },
      });
      if (retry.ok) return retry.json() as Promise<T>;
    }
    // Redirect to login
    if (typeof window !== "undefined") {
      window.location.href = `/login?from=${encodeURIComponent(window.location.pathname)}`;
    }
    throw new ApiError(401, "Unauthorized");
  }

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    const message =
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof (body as Record<string, unknown>).message === "string"
        ? (body as { message: string }).message
        : res.statusText;
    throw new ApiError(res.status, message, body);
  }

  return res.json() as Promise<T>;
}

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Convenience methods ────────────────────────────────────────────────────────

export const api = {
  get: <T>(path: string, init?: RequestInit) =>
    request<T>(path, { ...init, method: "GET" }),

  post: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>(path, {
      ...init,
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  patch: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>(path, {
      ...init,
      method: "PATCH",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(path: string, init?: RequestInit) =>
    request<T>(path, { ...init, method: "DELETE" }),
};
