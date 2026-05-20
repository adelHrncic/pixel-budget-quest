import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({
  component: Login,
  head: () => ({ meta: [{ title: "BUDGET QUEST - Sign In" }] }),
});

function Login() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) nav({ to: "/" });
    });
  }, [nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    const fn =
      mode === "signin"
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
    const { error } = await fn;
    setLoading(false);
    if (error) setErr(error.message);
    else nav({ to: "/" });
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="pixel-box w-full max-w-md space-y-5 scanlines">
        <div className="text-center">
          <div className="label-pixel mb-2">★ PLAYER LOGIN ★</div>
          <h1 className="text-xl md:text-2xl text-primary" style={{ textShadow: "3px 3px 0 #000" }}>
            BUDGET QUEST
          </h1>
          <p className="mt-2 text-muted-foreground">~ insert coin to continue <span className="blink">_</span></p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            className={`pixel-btn flex-1 ${mode === "signin" ? "coin" : ""}`}
            onClick={() => setMode("signin")}
          >
            SIGN IN
          </button>
          <button
            type="button"
            className={`pixel-btn flex-1 ${mode === "signup" ? "coin" : ""}`}
            onClick={() => setMode("signup")}
          >
            NEW GAME
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="label-pixel">Email</label>
            <input
              type="email"
              required
              className="pixel-input mt-1"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="label-pixel">Password</label>
            <input
              type="password"
              required
              minLength={6}
              className="pixel-input mt-1"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {err && <div className="text-destructive text-sm">! {err}</div>}
          <button type="submit" className="pixel-btn w-full coin" disabled={loading}>
            {loading ? "..." : mode === "signin" ? "▶ START" : "▶ CREATE"}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {mode === "signin" ? "no save file?" : "have a save?"}{" "}
          <button
            className="text-accent underline"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin" ? "new game" : "sign in"}
          </button>
        </p>
      </div>
    </main>
  );
}
