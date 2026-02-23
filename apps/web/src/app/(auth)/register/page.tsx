"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import type { ApiResponse, User } from "@private-tweet/types";

export default function RegisterPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    inviteCode: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post<ApiResponse<User>>("/api/auth/register", form);
      router.push("/feed");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-900 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-8 text-slate-100">Create account</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          {(
            [
              { id: "username", label: "Username", type: "text", autoComplete: "username" },
              { id: "email", label: "Email", type: "email", autoComplete: "email" },
              { id: "password", label: "Password", type: "password", autoComplete: "new-password" },
              { id: "inviteCode", label: "Invite code", type: "text", autoComplete: "off" },
            ] as const
          ).map(({ id, label, type, autoComplete }) => (
            <div key={id}>
              <label className="block text-sm font-medium mb-1 text-slate-300" htmlFor={id}>
                {label}
              </label>
              <input
                id={id}
                type={type}
                required
                autoComplete={autoComplete}
                value={form[id]}
                onChange={set(id)}
                className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          ))}
          {error && (
            <p className="text-sm text-red-400 bg-red-900/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-500 hover:bg-brand-600 text-white font-medium rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-50"
          >
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>
        <p className="text-center text-sm text-slate-400 mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-brand-400 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
