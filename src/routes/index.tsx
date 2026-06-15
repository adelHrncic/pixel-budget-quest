import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "BUDGET QUEST - Retro Money Manager" },
      { name: "description", content: "An 8-bit retro budgeting app with pie chart, IL taxes, HYSA, 401k, Roth IRA, student loans, pocket money & goals." },
    ],
  }),
});

type PocketItem = { id: string; name: string; amount: number; recurring?: boolean; month?: string };
type Allocations = { taxes: number; hysa: number; k401: number; roth: number; studentLoan: number; pocket: number };
type Paycheck = { id: string; amount: number; received_at: string; allocations: Allocations };
type Goal = { id: string; name: string; target_amount: number; current_amount: number; deadline: string | null; start_date: string | null };
type PaymentDue = { id: string; name: string; amount: number; due_date: string };

const ALLOC_KEYS: (keyof Allocations)[] = ["taxes", "hysa", "k401", "roth", "studentLoan", "pocket"];
const ALLOC_LABELS: Record<keyof Allocations, string> = {
  taxes: "Taxes", hysa: "HYSA", k401: "401(k)", roth: "Roth IRA", studentLoan: "Loans", pocket: "Pocket",
};
const ALLOC_COLORS: Record<keyof Allocations, string> = {
  taxes: "var(--life)", hysa: "var(--mana)", k401: "var(--xp)",
  roth: "var(--coin)", studentLoan: "var(--danger)", pocket: "var(--pocket)",
};

const IL_RATE = 0.0495;
function federalTax(income: number, pretax: number) {
  const taxable = Math.max(0, income - pretax - 14600);
  const brackets: [number, number][] = [
    [11600, 0.10], [47150, 0.12], [100525, 0.22], [191950, 0.24],
    [243725, 0.32], [609350, 0.35], [Infinity, 0.37],
  ];
  let tax = 0, last = 0;
  for (const [cap, rate] of brackets) {
    if (taxable > cap) { tax += (cap - last) * rate; last = cap; }
    else { tax += (taxable - last) * rate; break; }
  }
  return Math.max(0, tax);
}
const money = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTH_NAMES = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const currentMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const formatMonthKey = (k: string) => {
  const [y, m] = k.split("-");
  return `${MONTH_NAMES[Number(m) - 1] ?? "?"} ${y}`;
};

type Tab = "overview" | "income" | "pocket" | "goals" | "calendar";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "overview", label: "OVERVIEW", icon: "◆" },
  { id: "income", label: "INCOME", icon: "$" },
  { id: "pocket", label: "POCKET", icon: "▣" },
  { id: "goals", label: "GOALS", icon: "★" },
  { id: "calendar", label: "CALENDAR", icon: "▦" },
];

const POCKET_COLORS = [
  "oklch(0.80 0.18 50)", "oklch(0.76 0.20 30)", "oklch(0.82 0.16 70)",
  "oklch(0.84 0.14 88)", "oklch(0.74 0.22 18)", "oklch(0.78 0.15 60)",
];

function Index() {
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>("overview");
  const [scrolled, setScrolled] = useState(false);

  const [hourlyRate, setHourlyRate] = useState<number>(() => {
    if (typeof window === "undefined") return 25;
    return Number(localStorage.getItem("hourlyRate")) || 25;
  });
  const [hoursPerWeek, setHoursPerWeek] = useState<number>(() => {
    if (typeof window === "undefined") return 40;
    return Number(localStorage.getItem("hoursPerWeek")) || 40;
  });
  const income = hourlyRate * hoursPerWeek * 52;
  const [hysaPct, setHysaPct] = useState(28);
  const [k401Pct, setK401Pct] = useState(10);
  const [rothPct, setRothPct] = useState(15);
  const [studentLoan, setStudentLoan] = useState(4800);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("hourlyRate", String(hourlyRate));
  }, [hourlyRate]);
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("hoursPerWeek", String(hoursPerWeek));
  }, [hoursPerWeek]);
  const [pocket, setPocket] = useState<PocketItem[]>([
    { id: "1", name: "Rent", amount: 1400 },
    { id: "2", name: "Groceries", amount: 450 },
    { id: "3", name: "Gas", amount: 180 },
    { id: "4", name: "Fun", amount: 220 },
  ]);
  const [paychecks, setPaychecks] = useState<Paycheck[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [paymentDues, setPaymentDues] = useState<PaymentDue[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("paymentDues") || "[]"); } catch { return []; }
  });
  const [daysMissed, setDaysMissed] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    return Number(localStorage.getItem("daysMissed")) || 0;
  });
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("daysMissed", String(daysMissed));
  }, [daysMissed]);
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("paymentDues", JSON.stringify(paymentDues));
  }, [paymentDues]);

  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) { setUserId(null); nav({ to: "/login" }); }
      else { setUserId(session.user.id); setUserEmail(session.user.email ?? ""); }
    });
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { nav({ to: "/login" }); return; }
      const uid = data.session.user.id;
      setUserId(uid);
      setUserEmail(data.session.user.email ?? "");
      const [{ data: row }, { data: pcs }, { data: gs }] = await Promise.all([
        supabase.from("budgets").select("*").eq("user_id", uid).maybeSingle(),
        supabase.from("paychecks").select("id, amount, received_at, allocations").eq("user_id", uid).order("received_at", { ascending: true }),
        (supabase as any).from("goals").select("*").eq("user_id", uid).order("created_at", { ascending: true }),
      ]);
      if (row) {
        setHysaPct(Number(row.hysa_pct));
        setK401Pct(Number(row.k401_pct));
        setRothPct(Number(row.roth_pct));
        setStudentLoan(Number(row.student_loan));
        setPocket(Array.isArray(row.pocket) ? (row.pocket as PocketItem[]) : []);
      }
      if (pcs) setPaychecks(pcs.map((p) => ({
        id: p.id, amount: Number(p.amount),
        received_at: p.received_at as string,
        allocations: p.allocations as Allocations,
      })));
      if (gs) setGoals((gs as any[]).map((g) => ({
        id: g.id, name: g.name,
        target_amount: Number(g.target_amount),
        current_amount: Number(g.current_amount),
        deadline: g.deadline,
        start_date: g.start_date ?? null,
      })));
      setLoaded(true);
    });
    return () => sub.subscription.unsubscribe();
  }, [nav]);

  useEffect(() => {
    if (!loaded || !userId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      supabase.from("budgets").upsert({
        user_id: userId, income,
        hysa_pct: hysaPct, k401_pct: k401Pct, roth_pct: rothPct,
        student_loan: studentLoan, pocket: pocket as never,
        updated_at: new Date().toISOString(),
      }).then(({ error }) => { if (error) console.error("save error", error); });
    }, 600);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [loaded, userId, income, hysaPct, k401Pct, rothPct, studentLoan, pocket]);

  const signOut = async () => { await supabase.auth.signOut(); nav({ to: "/login" }); };

  // Calculate next payday (every Wednesday)
  const getNextPayday = (from: Date = new Date()) => {
    const date = new Date(from);
    const day = date.getDay();
    const daysUntilWednesday = (3 - day + 7) % 7 || 7; // 3 = Wednesday
    date.setDate(date.getDate() + daysUntilWednesday);
    return date;
  };

  const nextPayday = getNextPayday();
  const daysUntilPaycheck = Math.ceil((nextPayday.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));

  // Count Wednesdays (paydays) in the current month so monthly figures
  // reflect that specific month's actual paychecks, not yearly / 12.
  const wednesdaysThisMonth = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    let count = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      if (new Date(y, m, d).getDay() === 3) count++;
    }
    return count;
  }, []);

  const calc = useMemo(() => {
    const weeklyGross = income / 52;
    const weeklyTaxes = weeklyGross * 0.199;
    const weeklyNet = weeklyGross - weeklyTaxes;

    // Flat 19.9% tax — deducted first.
    const taxes = income * 0.199;
    const net = Math.max(0, income - taxes);

    // All allocations are percentages of NET pay.
    const hysa = net * (hysaPct / 100);
    const k401 = net * (k401Pct / 100);
    const roth = net * (rothPct / 100);

    const thisMonth = currentMonthKey();
    const pocketMo = pocket.reduce((s, p) => {
      if (p.recurring !== false) return s + p.amount;
      return (p.month ?? thisMonth) === thisMonth ? s + p.amount : s;
    }, 0);
    const pocketYr = pocket.reduce((s, p) => s + (p.recurring !== false ? p.amount * 12 : p.amount), 0);

    // Monthly figures based on actual paychecks this month
    const monthlyGross = weeklyGross * wednesdaysThisMonth;
    const monthlyTaxes = weeklyTaxes * wednesdaysThisMonth;
    const monthlyNet = weeklyNet * wednesdaysThisMonth;
    const hysaMo = monthlyNet * (hysaPct / 100);
    const k401Mo = monthlyNet * (k401Pct / 100);
    const rothMo = monthlyNet * (rothPct / 100);
    const studentLoanMo = studentLoan / 12;
    const remainingMo = monthlyNet - (hysaMo + k401Mo + rothMo + studentLoanMo + pocketMo);

    const fixedYrNoTax = hysa + k401 + roth + studentLoan;
    const allocated = fixedYrNoTax + pocketYr;
    const remaining = net - allocated;

    return {
      hysa, k401, roth, taxes, net, fed: taxes, il: 0, ss: 0, medicare: 0,
      pocketMo, pocketYr, allocated, remaining, remainingMo, studentLoan,
      weeklyGross, weeklyNet, weeklyTaxes,
      monthlyGross, monthlyNet, monthlyTaxes,
      hysaMo, k401Mo, rothMo, studentLoanMo,
      wednesdaysThisMonth,
    };
  }, [income, hysaPct, k401Pct, rothPct, studentLoan, pocket, wednesdaysThisMonth]);


  const allocatePaycheck = (amount: number): Allocations => {
    if (income <= 0 || amount <= 0) return { taxes: 0, hysa: 0, k401: 0, roth: 0, studentLoan: 0, pocket: 0 };
    const r = amount / income;
    return {
      taxes: calc.taxes * r, hysa: calc.hysa * r, k401: calc.k401 * r,
      roth: calc.roth * r, studentLoan: studentLoan * r, pocket: calc.pocketYr * r,
    };
  };

  const totals = useMemo(() => {
    const t: Allocations = { taxes: 0, hysa: 0, k401: 0, roth: 0, studentLoan: 0, pocket: 0 };
    let sum = 0;
    for (const p of paychecks) {
      sum += p.amount;
      for (const k of ALLOC_KEYS) t[k] += p.allocations?.[k] ?? 0;
    }
    return { sum, t };
  }, [paychecks]);

  // tab change → scroll to top of content
  const tabsBarRef = useRef<HTMLDivElement>(null);
  const changeTab = (t: Tab) => {
    setTab(t);
    setTimeout(() => {
      tabsBarRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <header className="mx-auto mb-6 max-w-6xl text-center">
        <div className="label-pixel mb-2">★ PLAYER 1 ★</div>
        <h1 className="text-2xl md:text-4xl text-primary" style={{ textShadow: "4px 4px 0 #000" }}>
          BUDGET QUEST
        </h1>
        <p className="mt-2 text-muted-foreground">~ press start to manage your gold ~ <span className="blink">_</span></p>
        <div className="mt-2 label-pixel text-accent">▣ {formatMonthKey(currentMonthKey())} ▣</div>
        <div className="mt-3 inline-block rounded-lg px-3 py-2" style={{
          background: "linear-gradient(135deg, rgba(100,200,255,0.2) 0%, rgba(120,80,200,0.2) 100%)",
          border: "2px solid var(--border)"
        }}>
          <div className="text-sm font-mono text-accent">💰 Payday: {nextPayday.toLocaleDateString()} ({daysUntilPaycheck}d)</div>
        </div>
        {userId && (
          <div className="mt-3 flex items-center justify-center gap-3 flex-wrap text-sm">
            <span className="text-accent truncate max-w-[200px]">● {userEmail}</span>
            <button className="pixel-btn danger" onClick={signOut}>LOG OUT</button>
            {!loaded && <span className="text-muted-foreground blink">loading save...</span>}
          </div>
        )}
      </header>

      {/* STICKY FLOATING NAV */}
      <div ref={tabsBarRef} className="sticky top-3 z-40 mx-auto mb-6 max-w-6xl">
        <div
          className="pixel-box-sm flex items-center justify-between gap-1 overflow-x-auto !p-2"
          style={{
            background: "var(--card)",
            boxShadow: scrolled
              ? "0 8px 0 #000, 0 0 0 3px var(--border), 0 0 28px color-mix(in oklab, var(--accent) 50%, transparent)"
              : "0 6px 0 #000, 0 0 0 3px var(--border)",
            transition: "box-shadow 0.2s, transform 0.2s",
            transform: scrolled ? "scale(0.97)" : "scale(1)",
          }}
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => changeTab(t.id)}
              className={`pixel-btn flex-1 min-w-fit whitespace-nowrap !text-[0.6rem] md:!text-xs ${tab === t.id ? "coin" : ""}`}
            >
              <span className="mr-1">{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-6xl">
        {!loaded ? (
          <div className="pixel-box text-center text-muted-foreground blink">~ loading save file ~</div>
        ) : tab === "overview" ? (
          <OverviewTab calc={calc} pocket={pocket} income={income} onJump={changeTab} />
        ) : tab === "income" ? (
          <IncomeTab
            hourlyRate={hourlyRate} setHourlyRate={setHourlyRate}
            hoursPerWeek={hoursPerWeek} setHoursPerWeek={setHoursPerWeek}
            income={income}
            hysaPct={hysaPct} setHysaPct={setHysaPct}
            k401Pct={k401Pct} setK401Pct={setK401Pct}
            rothPct={rothPct} setRothPct={setRothPct}
            studentLoan={studentLoan} setStudentLoan={setStudentLoan}
            calc={calc}
            daysMissed={daysMissed} setDaysMissed={setDaysMissed}
          />
        ) : tab === "pocket" ? (
          <PocketTab pocket={pocket} setPocket={setPocket} pocketMo={calc.pocketMo} pocketYr={calc.pocketYr} pocketLeftMo={calc.remainingMo} pocketLeftYr={calc.remaining} />
        ) : tab === "goals" ? (
          <GoalsTab goals={goals} setGoals={setGoals} userId={userId} />
        ) : (
          <CalendarTab paymentDues={paymentDues} setPaymentDues={setPaymentDues} />
        )}
      </div>

      <footer className="mx-auto mt-10 max-w-6xl text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} BUDGET QUEST — federal tax estimates only. consult a wizard.
      </footer>
    </main>
  );
}

/* ---------------- OVERVIEW ---------------- */
function OverviewTab({ calc, pocket, income, onJump }: {
  calc: ReturnType<typeof useMemo> extends infer T ? any : any;
  pocket: PocketItem[]; income: number; onJump: (t: Tab) => void;
}) {
  const [view, setView] = useState<"weekly" | "monthly" | "yearly">("monthly");
  const fmt = (n: number) => money(n);

  // Pick the right time-bucket per view. Monthly reflects THIS month's
  // actual paychecks (weekly net × Wednesdays in the current month),
  // not yearly/12.
  const slices = view === "weekly"
    ? {
        taxes: calc.weeklyTaxes,
        hysa: calc.hysa / 52,
        k401: calc.k401 / 52,
        roth: calc.roth / 52,
        studentLoan: calc.studentLoan / 52,
        pocket: (calc.pocketMo * 12) / 52,
        net: calc.weeklyNet,
        remaining: calc.weeklyNet - (calc.hysa / 52 + calc.k401 / 52 + calc.roth / 52 + calc.studentLoan / 52 + (calc.pocketMo * 12) / 52),
      }
    : view === "monthly"
    ? {
        taxes: calc.monthlyTaxes,
        hysa: calc.hysaMo,
        k401: calc.k401Mo,
        roth: calc.rothMo,
        studentLoan: calc.studentLoanMo,
        pocket: calc.pocketMo,
        net: calc.monthlyNet,
        remaining: calc.remainingMo,
      }
    : {
        taxes: calc.taxes,
        hysa: calc.hysa,
        k401: calc.k401,
        roth: calc.roth,
        studentLoan: calc.studentLoan,
        pocket: calc.pocketYr,
        net: calc.net,
        remaining: calc.remaining,
      };

  const chartData = [
    { name: "Taxes", value: slices.taxes, color: "oklch(0.58 0.22 280)" },
    { name: "HYSA", value: slices.hysa, color: "oklch(0.65 0.25 220)" },
    { name: "401(k)", value: slices.k401, color: "oklch(0.72 0.22 185)" },
    { name: "Roth IRA", value: slices.roth, color: "oklch(0.76 0.20 200)" },
    { name: "Student Loans", value: slices.studentLoan, color: "oklch(0.60 0.20 260)" },
    { name: "Planned Pocket", value: slices.pocket, color: "oklch(0.70 0.18 240)" },
    { name: "Pocket Money Left", value: Math.max(0, slices.remaining), color: "oklch(0.80 0.22 165)" },
  ].filter((d) => d.value > 0);

  void income;
  void pocket;

  const viewLabel = view === "weekly" ? "weekly" : view === "monthly"
    ? `${formatMonthKey(currentMonthKey())} · ${calc.wednesdaysThisMonth} paychecks`
    : "yearly";

  return (
    <section className="pixel-box scanlines">
      <div className="flex items-center justify-between">
        <h2 className="text-sm md:text-base text-accent">▶ STATUS MAP</h2>
        <div className="flex gap-2">
          <button className={`pixel-btn ${view === "weekly" ? "coin" : ""}`} onClick={() => setView("weekly")}>WK</button>
          <button className={`pixel-btn ${view === "monthly" ? "coin" : ""}`} onClick={() => setView("monthly")}>MO</button>
          <button className={`pixel-btn ${view === "yearly" ? "coin" : ""}`} onClick={() => setView("yearly")}>YR</button>
        </div>
      </div>

      <div className="mt-2 text-xs text-muted-foreground text-center">~ {viewLabel} ~</div>

      <div className="my-4 h-72 rounded-lg" style={{
        background: "linear-gradient(135deg, rgba(120,80,200,0.1) 0%, rgba(100,60,180,0.05) 100%)",
        padding: "1rem",
        border: "3px solid var(--border)",
        boxShadow: "inset 0 0 20px rgba(120,80,200,0.1), 0 8px 20px rgba(0,0,0,0.3)"
      }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%"
              outerRadius={110} innerRadius={50} stroke="#000" strokeWidth={3}
              animationBegin={0} animationDuration={800} animationEasing="ease-out">
              {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "3px solid var(--border)",
                fontFamily: "var(--font-mono)",
                borderRadius: "4px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.3)"
              }}
              formatter={(v) => fmt(Number(v))}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-base">
        {chartData.map((d) => (
          <li key={d.name} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 border-2 border-foreground" style={{ background: d.color }} />
              {d.name}
            </span>
            <span className="text-accent">{fmt(d.value)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 pixel-box-sm">
        <Row label={`Net Income (${view})`} v={fmt(slices.net)} />
        <Row label="Taxes withheld" v={fmt(slices.taxes)} />
        <Row label="Allocated" v={fmt(slices.hysa + slices.k401 + slices.roth + slices.studentLoan + slices.pocket)} />
        <Row label="Pocket Money Left" v={fmt(slices.remaining)} bold
          className={slices.remaining < 0 ? "text-destructive" : "text-primary"} />
      </div>


      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <button className="pixel-btn" onClick={() => onJump("income")}>$ EDIT INCOME</button>
        <button className="pixel-btn coin" onClick={() => onJump("goals")}>★ MY GOALS</button>
      </div>
    </section>
  );
}

/* ---------------- INCOME ---------------- */
function IncomeTab({ hourlyRate, setHourlyRate, hoursPerWeek, setHoursPerWeek, income,
  hysaPct, setHysaPct, k401Pct, setK401Pct,
  rothPct, setRothPct, studentLoan, setStudentLoan, calc,
  daysMissed, setDaysMissed }: any) {
  const weeklyGross = hourlyRate * hoursPerWeek;
  const weeklyNet = weeklyGross * (1 - 0.199);
  const hoursPerDay = hoursPerWeek / 5;
  const missedIncome = hourlyRate * hoursPerDay * daysMissed;
  const missedNet = missedIncome * (1 - 0.199);
  const adjustedMonthlyGross = calc.monthlyGross - missedIncome;
  const adjustedMonthlyNet = calc.monthlyNet - missedNet;

  return (
    <section className="pixel-box space-y-5">
      <h2 className="text-sm md:text-base text-accent">▶ INCOME & ALLOCATIONS</h2>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label-pixel">Hourly Rate $</label>
          <input type="number" step="0.01" className="pixel-input mt-1" value={hourlyRate}
            onChange={(e) => setHourlyRate(Number(e.target.value) || 0)} />
        </div>
        <div>
          <label className="label-pixel">Hours / Week</label>
          <input type="number" step="0.5" className="pixel-input mt-1" value={hoursPerWeek}
            onChange={(e) => setHoursPerWeek(Number(e.target.value) || 0)} />
        </div>
      </div>

      <div className="pixel-box-sm space-y-1 text-base">
        <div className="label-pixel mb-2">Gross Pay</div>
        <Row label="Per week" v={money(weeklyGross)} />
        <Row label="Per month" v={money(income / 12)} />
        <Row label="Per year" v={money(income)} bold />
      </div>

      <div className="pixel-box-sm space-y-1 text-base">
        <div className="label-pixel mb-2">Net Pay (after 19.9% tax)</div>
        <Row label="Per paycheck (weekly)" v={money(weeklyNet)} bold className="text-accent" />
        <Row label="Per month" v={money(calc.net / 12)} />
        <Row label="Per year" v={money(calc.net)} />
      </div>

      {/* Days missed this month */}
      <div className="pixel-box-sm space-y-3" style={{ borderColor: "oklch(0.65 0.25 220)", boxShadow: "4px 4px 0 oklch(0.65 0.25 220 / 0.3)" }}>
        <div className="label-pixel mb-1" style={{ color: "oklch(0.65 0.25 220)" }}>Days Missed This Month</div>
        <div className="text-xs text-muted-foreground mb-2">Unpaid holidays + unpaid sick days</div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label-pixel">Days Missed</label>
            <input type="number" min={0} step={0.5} className="pixel-input mt-1" value={daysMissed}
              onChange={(e) => setDaysMissed(Math.max(0, Number(e.target.value) || 0))} />
          </div>
          <div className="flex flex-col justify-center text-base space-y-1">
            <Row label="Lost gross" v={money(missedIncome)} className="text-destructive" />
            <Row label="Lost net" v={money(missedNet)} className="text-destructive" />
          </div>
        </div>
        {daysMissed > 0 && (
          <div className="space-y-1 text-base pt-1 border-t border-dashed border-border">
            <div className="label-pixel mb-1 text-[0.5rem]">Adjusted This Month</div>
            <Row label="Gross (adjusted)" v={money(Math.max(0, adjustedMonthlyGross))} />
            <Row label="Net (adjusted)" v={money(Math.max(0, adjustedMonthlyNet))} bold className="text-accent" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <PctInput label="HYSA % of net" value={hysaPct} set={setHysaPct} />
        <PctInput label="401(k) % of net" value={k401Pct} set={setK401Pct} />
        <PctInput label="Roth IRA % of net" value={rothPct} set={setRothPct} />
        <div>
          <label className="label-pixel">Loans /yr</label>
          <input type="number" className="pixel-input mt-1" value={studentLoan}
            onChange={(e) => setStudentLoan(Number(e.target.value) || 0)} />
        </div>
      </div>

      <div className="pixel-box-sm space-y-1 text-base">
        <div className="label-pixel mb-2">Tax (flat 19.9%)</div>
        <Row label="Per week" v={money(calc.taxes / 52)} />
        <Row label="Per month" v={money(calc.taxes / 12)} />
        <Row label="Per year" v={money(calc.taxes)} bold />
      </div>

      <div className="pixel-box-sm grid sm:grid-cols-3 gap-3 text-base">
        <Row label="HYSA /yr" v={money(calc.hysa)} />
        <Row label="401(k) /yr" v={money(calc.k401)} />
        <Row label="Roth /yr" v={money(calc.roth)} />
      </div>
    </section>
  );
}

/* ---------------- POCKET ---------------- */
function PocketTab({ pocket, setPocket, pocketMo, pocketYr, pocketLeftMo, pocketLeftYr }: { pocket: PocketItem[]; setPocket: (p: PocketItem[]) => void; pocketMo: number; pocketYr: number; pocketLeftMo: number; pocketLeftYr: number }) {
  const [newName, setNewName] = useState("");
  const [newAmt, setNewAmt] = useState<number | "">("");
  const [newRecurring, setNewRecurring] = useState(true);

  const add = () => {
    if (!newName || !newAmt) return;
    setPocket([...pocket, {
      id: Date.now().toString(),
      name: newName,
      amount: Number(newAmt),
      recurring: newRecurring,
      month: newRecurring ? undefined : currentMonthKey(),
    }]);
    setNewName(""); setNewAmt(""); setNewRecurring(true);
  };
  const upd = (id: string, amount: number) =>
    setPocket(pocket.map((p) => p.id === id ? { ...p, amount } : p));
  const toggleRecurring = (id: string) =>
    setPocket(pocket.map((p) => {
      if (p.id !== id) return p;
      const nextRecurring = p.recurring === false ? true : false;
      return { ...p, recurring: nextRecurring, month: nextRecurring ? undefined : (p.month ?? currentMonthKey()) };
    }));
  const rm = (id: string) => setPocket(pocket.filter((p) => p.id !== id));

  const isRecurring = (p: PocketItem) => p.recurring !== false;
  const thisMonth = currentMonthKey();

  return (
    <section className="pixel-box">
      <h2 className="text-sm md:text-base text-accent mb-4">▶ POCKET MONEY INVENTORY — {formatMonthKey(thisMonth)}</h2>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {pocket.map((p) => {
          const itemMonth = p.month ?? thisMonth;
          const isThisMonth = isRecurring(p) || itemMonth === thisMonth;
          return (
          <div key={p.id} className="pixel-box-sm float-up" style={{ opacity: isThisMonth ? 1 : 0.55 }}>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-lg" style={{ color: "var(--pocket)" }}>● {p.name}</span>
              <button className="pixel-btn danger !p-1 !text-[0.55rem]" onClick={() => rm(p.id)}>X</button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="label-pixel">$/mo</span>
              <input type="number" className="pixel-input" value={p.amount}
                onChange={(e) => upd(p.id, Number(e.target.value) || 0)} />
            </div>
            <button
              className={`mt-2 text-[0.55rem] px-2 py-1 border-2 border-foreground cursor-pointer ${isRecurring(p) ? "bg-primary text-primary-foreground" : "bg-destructive text-destructive-foreground"}`}
              onClick={() => toggleRecurring(p.id)}
            >
              {isRecurring(p) ? "⟲ RECURRING" : `✕ ONE-TIME · ${formatMonthKey(itemMonth)}`}
            </button>
            <div className="mt-1 text-sm text-muted-foreground">
              {isRecurring(p)
                ? `= ${money(p.amount * 12 / 52)} / wk · ${money(p.amount * 12)} / yr`
                : `= ${money(p.amount)} total · ${isThisMonth ? "this month" : "past month"}`}
            </div>
          </div>
          );
        })}

        <div className="pixel-box-sm border-dashed">
          <div className="label-pixel mb-2">+ Add Item</div>
          <input className="pixel-input mb-2" placeholder="name" value={newName}
            onChange={(e) => setNewName(e.target.value)} maxLength={30} />
          <input className="pixel-input mb-2" type="number" placeholder="$/month"
            value={newAmt} onChange={(e) => setNewAmt(e.target.value === "" ? "" : Number(e.target.value))} />
          <button
            className={`mb-2 text-[0.55rem] px-2 py-1 border-2 border-foreground cursor-pointer w-full ${newRecurring ? "bg-primary text-primary-foreground" : "bg-destructive text-destructive-foreground"}`}
            onClick={() => setNewRecurring(!newRecurring)}
          >
            {newRecurring ? "⟲ RECURRING" : "✕ ONE-TIME"}
          </button>
          <button className="pixel-btn w-full" onClick={add}>ADD</button>
        </div>
      </div>

      <div className="mt-5 pixel-box-sm flex flex-wrap items-center justify-between gap-3">
        <span className="label-pixel">Pocket Total</span>
        <span className="text-xl text-accent">
          {money(pocketMo * 12 / 52)} / wk · {money(pocketMo)} / mo · {money(pocketYr)} / yr
        </span>
      </div>

      <div className="mt-3 pixel-box-sm flex flex-wrap items-center justify-between gap-3">
        <span className="label-pixel">Pocket Money You Can Allocate</span>
        <span className={pocketLeftYr < 0 ? "text-xl text-destructive" : "text-xl text-primary"}>
          {money(pocketLeftMo * 12 / 52)} / wk · {money(pocketLeftMo)} / mo · {money(pocketLeftYr)} / yr
        </span>
      </div>
    </section>
  );
}

/* ---------------- PAYCHECKS ---------------- */
function PaychecksTab({ paychecks, setPaychecks, userId, allocatePaycheck, totals }: {
  paychecks: Paycheck[]; setPaychecks: React.Dispatch<React.SetStateAction<Paycheck[]>>;
  userId: string | null; allocatePaycheck: (a: number) => Allocations; totals: { sum: number; t: Allocations };
}) {
  const [pcAmount, setPcAmount] = useState<number | "">("");
  const [pcDate, setPcDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const add = async () => {
    if (!userId || !pcAmount || Number(pcAmount) <= 0) return;
    const amt = Number(pcAmount);
    const alloc = allocatePaycheck(amt);
    const { data, error } = await supabase.from("paychecks")
      .insert({ user_id: userId, amount: amt, received_at: pcDate, allocations: alloc as never })
      .select("id, amount, received_at, allocations").single();
    if (error) { console.error(error); return; }
    setPaychecks((prev) => [...prev, {
      id: data.id, amount: Number(data.amount),
      received_at: data.received_at as string,
      allocations: data.allocations as Allocations,
    }].sort((a, b) => a.received_at.localeCompare(b.received_at)));
    setPcAmount("");
  };
  const rm = async (id: string) => {
    const { error } = await supabase.from("paychecks").delete().eq("id", id);
    if (error) { console.error(error); return; }
    setPaychecks((prev) => prev.filter((p) => p.id !== id));
  };

  const growthData = useMemo(() => {
    const running: Allocations = { taxes: 0, hysa: 0, k401: 0, roth: 0, studentLoan: 0, pocket: 0 };
    let total = 0;
    return paychecks.map((p) => {
      for (const k of ALLOC_KEYS) running[k] += p.allocations?.[k] ?? 0;
      total += p.amount;
      return {
        date: p.received_at, Total: Math.round(total),
        Taxes: Math.round(running.taxes), HYSA: Math.round(running.hysa),
        "401(k)": Math.round(running.k401), "Roth IRA": Math.round(running.roth),
        Loans: Math.round(running.studentLoan), Pocket: Math.round(running.pocket),
      };
    });
  }, [paychecks]);

  return (
    <section className="pixel-box scanlines">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <h2 className="text-sm md:text-base text-accent">▶ QUEST LOG · PAYCHECKS</h2>
        <span className="text-sm text-muted-foreground">
          total earned: <span className="text-accent">{money(totals.sum)}</span>
        </span>
      </div>

      <div className="pixel-box-sm grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <label className="label-pixel">Amount Earned</label>
          <input type="number" className="pixel-input mt-1" placeholder="$ this paycheck"
            value={pcAmount} onChange={(e) => setPcAmount(e.target.value === "" ? "" : Number(e.target.value))} />
        </div>
        <div>
          <label className="label-pixel">Date</label>
          <input type="date" className="pixel-input mt-1" value={pcDate} onChange={(e) => setPcDate(e.target.value)} />
        </div>
        <button className="pixel-btn coin" onClick={add}>+ LOG IT</button>
      </div>

      {pcAmount !== "" && Number(pcAmount) > 0 && (
        <div className="mt-3 pixel-box-sm">
          <div className="label-pixel mb-2">Preview Split</div>
          <ul className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-1 text-base">
            {(() => {
              const prev = allocatePaycheck(Number(pcAmount));
              return ALLOC_KEYS.map((k) => (
                <li key={k} className="flex justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 border-2 border-foreground" style={{ background: ALLOC_COLORS[k] }} />
                    {ALLOC_LABELS[k]}
                  </span>
                  <span className="text-accent">{money(prev[k])}</span>
                </li>
              ));
            })()}
          </ul>
        </div>
      )}

      {growthData.length > 0 ? (
        <div className="my-5 h-72">
          <ResponsiveContainer>
            <LineChart data={growthData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" />
              <XAxis dataKey="date" stroke="var(--foreground)" tick={{ fontSize: 10, fontFamily: "var(--font-mono)" }} />
              <YAxis stroke="var(--foreground)" tick={{ fontSize: 10, fontFamily: "var(--font-mono)" }} tickFormatter={(v) => `$${v}`} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "3px solid var(--border)", fontFamily: "var(--font-mono)", borderRadius: 0 }} formatter={(v) => money(Number(v))} />
              <Legend wrapperStyle={{ fontFamily: "var(--font-mono)", fontSize: 12 }} />
              <Line type="monotone" dataKey="Total" stroke="var(--accent)" strokeWidth={3} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Taxes" stroke="var(--life)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="HYSA" stroke="var(--mana)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="401(k)" stroke="var(--xp)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Roth IRA" stroke="var(--coin)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Loans" stroke="var(--danger)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Pocket" stroke="var(--pocket)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="my-5 pixel-box-sm text-center text-muted-foreground">
          ~ no paychecks logged yet · log one to start the growth chart ~
        </div>
      )}

      {paychecks.length > 0 && (
        <div className="pixel-box-sm">
          <div className="label-pixel mb-2">Running Totals</div>
          <ul className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-1 text-base">
            {ALLOC_KEYS.map((k) => (
              <li key={k} className="flex justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 border-2 border-foreground" style={{ background: ALLOC_COLORS[k] }} />
                  {ALLOC_LABELS[k]}
                </span>
                <span className="text-accent">{money(totals.t[k])}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {paychecks.length > 0 && (
        <div className="mt-4 pixel-box-sm">
          <div className="label-pixel mb-2">History</div>
          <ul className="space-y-1 max-h-56 overflow-auto text-sm">
            {[...paychecks].reverse().map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 border-b border-dashed border-border pb-1">
                <span><span className="text-accent">{p.received_at}</span> · {money(p.amount)}</span>
                <button className="pixel-btn danger !p-1 !text-[0.55rem]" onClick={() => rm(p.id)}>X</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/* ---------------- GOALS ---------------- */
function GoalsTab({ goals, setGoals, userId }: {
  goals: Goal[]; setGoals: React.Dispatch<React.SetStateAction<Goal[]>>; userId: string | null;
}) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState<number | "">("");
  const [current, setCurrent] = useState<number | "">("");
  const [startDate, setStartDate] = useState("");
  const [deadline, setDeadline] = useState("");

  const add = async () => {
    if (!userId || !name || !target) return;
    const { data, error } = await (supabase as any).from("goals").insert({
      user_id: userId, name,
      target_amount: Number(target),
      current_amount: Number(current) || 0,
      start_date: startDate || null,
      deadline: deadline || null,
    }).select("*").single();
    if (error) { console.error(error); return; }
    setGoals((prev) => [...prev, {
      id: data.id, name: data.name,
      target_amount: Number(data.target_amount),
      current_amount: Number(data.current_amount),
      start_date: data.start_date ?? null,
      deadline: data.deadline,
    }]);
    setName(""); setTarget(""); setCurrent(""); setStartDate(""); setDeadline("");
  };

  const upd = async (id: string, patch: Partial<Omit<Goal, "id">>) => {
    setGoals((prev) => prev.map((g) => g.id === id ? { ...g, ...patch } as Goal : g));
    const { error } = await (supabase as any).from("goals").update(patch).eq("id", id);
    if (error) console.error(error);
  };
  const rm = async (id: string) => {
    const { error } = await (supabase as any).from("goals").delete().eq("id", id);
    if (error) { console.error(error); return; }
    setGoals((prev) => prev.filter((g) => g.id !== id));
  };

  return (
    <section className="pixel-box">
      <h2 className="text-sm md:text-base text-accent mb-4">▶ SIDE QUESTS · GOALS</h2>

      <div className="pixel-box-sm border-dashed mb-5">
        <div className="label-pixel mb-2">+ New Quest</div>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          <div>
            <label className="label-pixel">Name</label>
            <input className="pixel-input mt-1" placeholder="New car..."
              value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          </div>
          <div>
            <label className="label-pixel">Target $</label>
            <input type="number" className="pixel-input mt-1" placeholder="10000"
              value={target} onChange={(e) => setTarget(e.target.value === "" ? "" : Number(e.target.value))} />
          </div>
          <div>
            <label className="label-pixel">Already Saved</label>
            <input type="number" className="pixel-input mt-1" placeholder="0"
              value={current} onChange={(e) => setCurrent(e.target.value === "" ? "" : Number(e.target.value))} />
          </div>
          <div>
            <label className="label-pixel">Start Date</label>
            <input type="date" className="pixel-input mt-1" value={startDate}
              onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="label-pixel">End Date</label>
            <input type="date" className="pixel-input mt-1" value={deadline}
              onChange={(e) => setDeadline(e.target.value)} />
          </div>
        </div>
        <button className="pixel-btn coin w-full mt-3" onClick={add}>★ ACCEPT QUEST</button>
      </div>

      {goals.length === 0 ? (
        <div className="pixel-box-sm text-center text-muted-foreground">
          ~ no quests yet · add a goal to start saving ~
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {goals.map((g) => <GoalCard key={g.id} g={g} onUpdate={upd} onRemove={rm} />)}
        </div>
      )}
    </section>
  );
}

function GoalCard({ g, onUpdate, onRemove }: {
  g: Goal; onUpdate: (id: string, p: Partial<Omit<Goal, "id">>) => void; onRemove: (id: string) => void;
}) {
  const remaining = Math.max(0, g.target_amount - g.current_amount);
  const pct = g.target_amount > 0 ? Math.min(100, (g.current_amount / g.target_amount) * 100) : 0;
  const done = remaining <= 0;

  const today = new Date();
  let daily = 0, weekly = 0, monthly = 0, daysLeft = 0;
  if (g.deadline) {
    const dl = new Date(g.deadline + "T00:00:00");
    daysLeft = Math.max(0, Math.ceil((dl.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
    if (daysLeft > 0 && !done) {
      daily = remaining / daysLeft;
      weekly = remaining / (daysLeft / 7);
      monthly = remaining / (daysLeft / 30);
    }
  }

  return (
    <div className="pixel-box-sm float-up space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-lg text-accent">★ {g.name}</div>
          <div className="text-xs text-muted-foreground">
            {g.start_date ? `started ${g.start_date} · ` : ""}
            {g.deadline ? `due ${g.deadline} · ${daysLeft} days left` : "no end date set"}
          </div>
        </div>
        <button className="pixel-btn danger !p-1 !text-[0.55rem]" onClick={() => onRemove(g.id)}>X</button>
      </div>

      <div className="relative h-6 border-2 border-foreground bg-background overflow-hidden">
        <div className="h-full transition-all"
          style={{ width: `${pct}%`, background: done ? "var(--xp)" : "var(--coin)" }} />
        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-foreground">
          {money(g.current_amount)} / {money(g.target_amount)} ({pct.toFixed(0)}%)
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label-pixel">Target $</label>
          <input type="number" className="pixel-input mt-1" value={g.target_amount}
            onChange={(e) => onUpdate(g.id, { target_amount: Number(e.target.value) || 0 })} />
        </div>
        <div>
          <label className="label-pixel">Saved $</label>
          <input type="number" className="pixel-input mt-1" value={g.current_amount}
            onChange={(e) => onUpdate(g.id, { current_amount: Number(e.target.value) || 0 })} />
        </div>
        <div>
          <label className="label-pixel">Start Date</label>
          <input type="date" className="pixel-input mt-1" value={g.start_date ?? ""}
            onChange={(e) => onUpdate(g.id, { start_date: e.target.value || null })} />
        </div>
        <div>
          <label className="label-pixel">End Date</label>
          <input type="date" className="pixel-input mt-1" value={g.deadline ?? ""}
            onChange={(e) => onUpdate(g.id, { deadline: e.target.value || null })} />
        </div>
      </div>

      {done ? (
        <div className="pixel-box-sm text-center" style={{ color: "var(--xp)" }}>
          ✓ QUEST COMPLETE!
        </div>
      ) : g.deadline && daysLeft > 0 ? (
        <div className="pixel-box-sm space-y-1 text-base">
          <div className="label-pixel mb-1">Save This Much</div>
          <Row label="Per day" v={money(daily)} />
          <Row label="Per week" v={money(weekly)} bold className="text-accent" />
          <Row label="Per month" v={money(monthly)} />
          <Row label="Remaining" v={money(remaining)} />
        </div>
      ) : g.deadline ? (
        <div className="pixel-box-sm text-center text-destructive">⚠ deadline passed — extend it!</div>
      ) : (
        <div className="pixel-box-sm text-center text-muted-foreground text-sm">
          set a deadline to see weekly / monthly targets
        </div>
      )}
    </div>
  );
}

/* ---------------- CALENDAR ---------------- */
function CalendarTab({ paymentDues, setPaymentDues }: {
  paymentDues: PaymentDue[];
  setPaymentDues: React.Dispatch<React.SetStateAction<PaymentDue[]>>;
}) {
  const [newName, setNewName] = useState("");
  const [newAmt, setNewAmt] = useState<number | "">("");
  const [newDate, setNewDate] = useState("");
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const [viewY, viewM] = viewDate.split("-").map(Number);
  const firstDay = new Date(viewY, viewM - 1, 1).getDay();
  const daysInMonth = new Date(viewY, viewM, 0).getDate();
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === viewY && today.getMonth() + 1 === viewM;

  const add = () => {
    if (!newName || !newDate) return;
    setPaymentDues((prev) => [...prev, {
      id: Date.now().toString(),
      name: newName,
      amount: Number(newAmt) || 0,
      due_date: newDate,
    }]);
    setNewName(""); setNewAmt(""); setNewDate("");
  };
  const rm = (id: string) => setPaymentDues((prev) => prev.filter((p) => p.id !== id));

  const paymentsThisMonth = paymentDues.filter((p) => {
    const [y, m] = p.due_date.split("-").map(Number);
    return y === viewY && m === viewM;
  });

  const paymentsByDay: Record<number, PaymentDue[]> = {};
  for (const p of paymentsThisMonth) {
    const day = Number(p.due_date.split("-")[2]);
    if (!paymentsByDay[day]) paymentsByDay[day] = [];
    paymentsByDay[day].push(p);
  }

  const prevMonth = () => {
    const d = new Date(viewY, viewM - 2, 1);
    setViewDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const nextMonth = () => {
    const d = new Date(viewY, viewM, 1);
    setViewDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const totalDue = paymentsThisMonth.reduce((s, p) => s + p.amount, 0);
  const DAYS = ["SUN","MON","TUE","WED","THU","FRI","SAT"];

  return (
    <section className="pixel-box space-y-5">
      <h2 className="text-sm md:text-base text-accent">▶ PAYMENT CALENDAR</h2>

      {/* Add payment form */}
      <div className="pixel-box-sm border-dashed">
        <div className="label-pixel mb-2">+ Add Payment Due</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label-pixel">Name</label>
            <input className="pixel-input mt-1" placeholder="Rent..."
              value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={30} />
          </div>
          <div>
            <label className="label-pixel">Amount $</label>
            <input type="number" className="pixel-input mt-1" placeholder="0"
              value={newAmt} onChange={(e) => setNewAmt(e.target.value === "" ? "" : Number(e.target.value))} />
          </div>
          <div>
            <label className="label-pixel">Due Date</label>
            <input type="date" className="pixel-input mt-1" value={newDate}
              onChange={(e) => setNewDate(e.target.value)} />
          </div>
        </div>
        <button className="pixel-btn coin w-full mt-3" onClick={add}>+ ADD PAYMENT</button>
      </div>

      {/* Month nav */}
      <div className="flex items-center justify-between gap-2">
        <button className="pixel-btn" onClick={prevMonth}>◀ PREV</button>
        <span className="label-pixel text-accent">{formatMonthKey(viewDate)}</span>
        <button className="pixel-btn" onClick={nextMonth}>NEXT ▶</button>
      </div>

      {/* Calendar grid */}
      <div className="pixel-box-sm !p-2">
        <div className="grid grid-cols-7 gap-[2px] mb-1">
          {DAYS.map((d) => (
            <div key={d} className="text-center text-[0.5rem] text-muted-foreground py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-[2px]">
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const payments = paymentsByDay[day] ?? [];
            const isToday = isCurrentMonth && today.getDate() === day;
            return (
              <div
                key={day}
                className="min-h-[52px] p-[3px] border border-border flex flex-col gap-[2px]"
                style={{
                  background: isToday ? "oklch(0.65 0.25 220 / 0.2)" : payments.length ? "oklch(0.58 0.22 280 / 0.15)" : "var(--card)",
                  borderColor: isToday ? "oklch(0.65 0.25 220)" : payments.length ? "oklch(0.58 0.22 280)" : "var(--border)",
                }}
              >
                <span className="text-[0.55rem] font-bold" style={{ color: isToday ? "oklch(0.65 0.25 220)" : "var(--muted-foreground)" }}>
                  {day}
                </span>
                {payments.map((p) => (
                  <div
                    key={p.id}
                    className="text-[0.45rem] px-[2px] py-[1px] truncate cursor-pointer"
                    style={{ background: "oklch(0.58 0.22 280 / 0.5)", color: "oklch(0.90 0.05 220)" }}
                    title={`${p.name} — ${money(p.amount)}`}
                    onClick={() => rm(p.id)}
                  >
                    {p.name}{p.amount > 0 ? ` $${p.amount}` : ""}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Payment list for this month */}
      {paymentsThisMonth.length > 0 ? (
        <div className="pixel-box-sm">
          <div className="label-pixel mb-2">Due This Month · {money(totalDue)} total</div>
          <ul className="space-y-1">
            {paymentsThisMonth.sort((a, b) => a.due_date.localeCompare(b.due_date)).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 border-b border-dashed border-border pb-1 text-base">
                <span>
                  <span className="text-accent">{p.due_date.split("-")[2]}</span>
                  {" · "}<span style={{ color: "oklch(0.76 0.20 200)" }}>{p.name}</span>
                  {p.amount > 0 && <span className="ml-2 text-muted-foreground">{money(p.amount)}</span>}
                </span>
                <button className="pixel-btn danger !p-1 !text-[0.55rem]" onClick={() => rm(p.id)}>X</button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="pixel-box-sm text-center text-muted-foreground">
          ~ no payments due this month · add one above ~
        </div>
      )}

      {/* All upcoming payments */}
      {paymentDues.filter((p) => p.due_date >= new Date().toISOString().slice(0, 10)).length > 0 && (
        <div className="pixel-box-sm">
          <div className="label-pixel mb-2">Upcoming All</div>
          <ul className="space-y-1 max-h-40 overflow-auto text-sm">
            {paymentDues
              .filter((p) => p.due_date >= new Date().toISOString().slice(0, 10))
              .sort((a, b) => a.due_date.localeCompare(b.due_date))
              .map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 border-b border-dashed border-border pb-1">
                <span>
                  <span className="text-accent">{p.due_date}</span>
                  {" · "}{p.name}
                  {p.amount > 0 && <span className="ml-2 text-muted-foreground">{money(p.amount)}</span>}
                </span>
                <button className="pixel-btn danger !p-1 !text-[0.55rem]" onClick={() => rm(p.id)}>X</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function PctInput({ label, value, set }: { label: string; value: number; set: (n: number) => void }) {
  return (
    <div>
      <label className="label-pixel">{label}</label>
      <input type="number" className="pixel-input mt-1" value={value} min={0} max={100}
        onChange={(e) => set(Number(e.target.value) || 0)} />
    </div>
  );
}

function Row({ label, v, bold, className = "" }: { label: string; v: string; bold?: boolean; className?: string }) {
  return (
    <div className={`flex items-center justify-between ${bold ? "font-bold" : ""} ${className}`}>
      <span>{label}</span><span>{v}</span>
    </div>
  );
}
