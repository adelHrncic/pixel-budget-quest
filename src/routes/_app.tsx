import { createFileRoute, Outlet, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { BudgetProvider, useBudget } from "@/lib/budget-context";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

const TABS = [
  { to: "/", label: "OVERVIEW", icon: "◆" },
  { to: "/income", label: "INCOME", icon: "$" },
  { to: "/pocket", label: "POCKET", icon: "▣" },
  { to: "/paychecks", label: "PAYCHECKS", icon: "▶" },
  { to: "/goals", label: "GOALS", icon: "★" },
] as const;

function AppLayout() {
  const nav = useNavigate();
  const onUnauthed = useCallback(() => { nav({ to: "/login" }); }, [nav]);
  return (
    <BudgetProvider onUnauthed={onUnauthed}>
      <Shell />
    </BudgetProvider>
  );
}

function Shell() {
  const { userId, userEmail, loaded, signOut } = useBudget();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <header className="mx-auto mb-6 max-w-6xl text-center">
        <div className="label-pixel mb-2">★ PLAYER 1 ★</div>
        <h1 className="text-2xl md:text-4xl text-primary" style={{ textShadow: "4px 4px 0 #000" }}>
          BUDGET QUEST
        </h1>
        <p className="mt-2 text-muted-foreground">~ press start to manage your gold ~ <span className="blink">_</span></p>
        {userId && (
          <div className="mt-3 flex items-center justify-center gap-3 flex-wrap text-sm">
            <span className="text-accent truncate max-w-[200px]">● {userEmail}</span>
            <button className="pixel-btn danger" onClick={signOut}>LOG OUT</button>
            {!loaded && <span className="text-muted-foreground blink">loading save...</span>}
          </div>
        )}
      </header>

      {/* FLOATING NAV */}
      <nav
        className={`sticky top-3 z-40 mx-auto mb-8 max-w-6xl transition-all duration-200 ${
          scrolled ? "scale-95" : ""
        }`}
      >
        <div
          className="pixel-box-sm flex items-center justify-between gap-1 overflow-x-auto !p-2"
          style={{
            background: "var(--card)",
            boxShadow: scrolled
              ? "0 8px 0 #000, 0 0 0 3px var(--border), 0 0 24px color-mix(in oklab, var(--accent) 40%, transparent)"
              : "0 6px 0 #000, 0 0 0 3px var(--border)",
          }}
        >
          {TABS.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              activeOptions={{ exact: true }}
              className="pixel-btn flex-1 min-w-fit whitespace-nowrap text-center !text-[0.6rem] md:!text-xs"
              activeProps={{ className: "pixel-btn coin flex-1 min-w-fit whitespace-nowrap text-center !text-[0.6rem] md:!text-xs" }}
            >
              <span className="mr-1">{t.icon}</span>{t.label}
            </Link>
          ))}
        </div>
      </nav>

      <div className="mx-auto max-w-6xl">
        {loaded ? <Outlet /> : (
          <div className="pixel-box text-center text-muted-foreground blink">~ loading save file ~</div>
        )}
      </div>

      <footer className="mx-auto mt-10 max-w-6xl text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} BUDGET QUEST — federal tax estimates only. consult a wizard.
      </footer>
    </main>
  );
}
