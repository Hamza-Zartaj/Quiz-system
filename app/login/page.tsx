"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpenCheck, Loader2, Sparkles } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-normal text-slate-950 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10";
const labelClass = "grid gap-2 text-sm font-medium text-slate-700";

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/dashboard");
        router.refresh();
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
          emailRedirectTo: `${window.location.origin}/auth/callback`
        }
      });
      if (error) throw error;

      if (data.session) {
        router.push("/dashboard");
        router.refresh();
      } else {
        setMessage("Check your email to confirm the teacher account.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.20),_transparent_32%),linear-gradient(135deg,#f8fafc_0%,#eef2ff_48%,#ecfeff_100%)] px-4 py-10">
      <section className="w-full max-w-[440px] overflow-hidden rounded-2xl border border-white/80 bg-white/90 shadow-2xl shadow-slate-200/80 backdrop-blur">
        <div className="border-b border-slate-100 px-7 pb-5 pt-7">
          <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-600 text-white shadow-lg shadow-cyan-600/25">
            <BookOpenCheck size={28} />
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">
            <Sparkles size={14} /> Teacher workspace
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Quiz System</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Build, publish, print, and grade quizzes from one focused classroom control room.
          </p>
        </div>

        <div className="px-7 py-6">
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1">
            <button
              type="button"
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${mode === "signin" ? "bg-white text-cyan-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              onClick={() => setMode("signin")}
            >
              Login
            </button>
            <button
              type="button"
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${mode === "signup" ? "bg-white text-cyan-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              onClick={() => setMode("signup")}
            >
              Sign up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="grid gap-4">
            {mode === "signup" && (
              <label className={labelClass}>
                Teacher name
                <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} required />
              </label>
            )}
            <label className={labelClass}>
              Email
              <input
                className={inputClass}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label className={labelClass}>
              Password
              <input
                className={inputClass}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={6}
                required
              />
            </label>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-600/20 transition hover:bg-cyan-700 disabled:opacity-60"
              disabled={loading}
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {mode === "signin" ? "Login" : "Create Account"}
            </button>
          </form>

          {message && (
            <p className="mt-5 rounded-lg border border-cyan-200 bg-cyan-50 px-3.5 py-3 text-sm font-medium text-cyan-900">
              {message}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}