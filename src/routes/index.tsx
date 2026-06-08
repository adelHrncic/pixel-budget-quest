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
type Goal = { id: string; name: string; target_amount: number; current_amount: number; deadline: string | null };

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

type Tab = "overview" | "income" | "pocket" | "paychecks" | "goals";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "overview", label: "OVERVIEW", icon: "◆" },
  { id: "income", label: "INCOME", icon: "$" },
  { id: "pocket", label: "POCKET", icon: "▣" },
  { id: "paychecks", label: "PAYCHECKS", icon: "▶" },
  { id: "goals", label: "GOALS", icon: "★" },
];

const POCKET_COLORS = [
  "oklch(0.80 0.18 50)", "oklch(0.76 0.20 30)", "oklch(0.82 0.16 70)",
  "oklch(0.84 0.14 88)", "oklch(0.74 0.22 18)", "oklch(0.78 0.15 60)",
];

function Index() {
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>("overview");
  const [scrolled, setScrolled] = useState(false);

  const [income, setIncome] = useState(75000);
  const [hysaPct, setHysaPct] = useState(10);
  const [k401Pct, setK401Pct] = useState(10);
  const [rothPct, setRothPct] = useState(5);
  const [studentLoan, setStudentLoan] = useState(4800);
  const [pocket, setPocket] = useState<PocketItem[]>([
    { id: "1", name: "Rent", amount: 1400 },
    { id: "2", name: "Groceries", amount: 450 },
    { id: "3", name: "Gas", amount: 180 },
    { id: "4", name: "Fun", amount: 220 },
  ]);
  const [paychecks, setPaychecks] = useState<Paycheck[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);

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
        setIncome(Number(row.income));
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

  const calc = useMemo(() => {
    const hysa = income * (hysaPct / 100);
    const k401 = income * (k401Pct / 100);
    const roth = income * (rothPct / 100);
    const fed = federalTax(income, k401);
    const il = Math.max(0, income - k401) * IL_RATE;
    const ss = Math.min(income, 168600) * 0.062;
    const medicare = income * 0.0145;
    const taxes = income * 0.199;
    const thisMonth = currentMonthKey();
    const pocketMo = pocket.reduce((s, p) => {
      if (p.recurring !== false) return s + p.amount;
      return (p.month ?? thisMonth) === thisMonth ? s + p.amount : s;
    }, 0);
    const pocketYr = pocket.reduce((s, p) => s + (p.recurring !== false ? p.amount * 12 : p.amount), 0);
    const fixedYr = taxes + hysa + k401 + roth + studentLoan;
    const allocated = fixedYr + pocketYr;
    const remaining = income - allocated;
    const remainingMo = income / 12 - fixedYr / 12 - pocketMo;
    return { hysa, k401, roth, taxes, fed, il, ss, medicare, pocketMo, pocketYr, allocated, remaining, remainingMo, studentLoan };
  }, [income, hysaPct, k401Pct, rothPct, studentLoan, pocket]);

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
            income={income} setIncome={setIncome}
            hysaPct={hysaPct} setHysaPct={setHysaPct}
            k401Pct={k401Pct} setK401Pct={setK401Pct}
            rothPct={rothPct} setRothPct={setRothPct}
            studentLoan={studentLoan} setStudentLoan={setStudentLoan}
            calc={calc}
          />
        ) : tab === "pocket" ? (
          <PocketTab pocket={pocket} setPocket={setPocket} pocketMo={calc.pocketMo} pocketYr={calc.pocketYr} pocketLeftMo={calc.remainingMo} pocketLeftYr={calc.remaining} />
        ) : tab === "paychecks" ? (
          <PaychecksTab
            paychecks={paychecks} setPaychecks={setPaychecks}
            userId={userId} allocatePaycheck={allocatePaycheck} totals={totals}
          />
        ) : (
          <GoalsTab goals={goals} setGoals={setGoals} userId={userId} />
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
  const divisor = view === "weekly" ? 52 : view === "monthly" ? 12 : 1;
  const fmt = (n: number) => money(n / divisor);

  const chartData = [
    { name: "Taxes", value: calc.taxes, color: "var(--life)" },
    { name: "HYSA", value: calc.hysa, color: "var(--mana)" },
    { name: "401(k)", value: calc.k401, color: "var(--xp)" },
    { name: "Roth IRA", value: calc.roth, color: "var(--coin)" },
    { name: "Student Loans", value: calc.studentLoan, color: "var(--danger)" },
    { name: "Planned Pocket", value: calc.pocketYr, color: "var(--pocket)" },
    { name: "Pocket Money Left", value: Math.max(0, calc.remaining), color: "var(--accent)" },
  ].filter((d) => d.value > 0);



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

      <div className="my-4 h-72">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%"
              outerRadius={110} innerRadius={50} stroke="#000" strokeWidth={3}>
              {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            <Tooltip
              contentStyle={{ background: "var(--card)", border: "3px solid var(--border)", fontFamily: "var(--font-mono)", borderRadius: 0 }}
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
        <Row label={`Income (${view})`} v={fmt(income)} />
        <Row label="Allocated" v={fmt(calc.allocated)} />
        <Row label="Pocket Money Left" v={fmt(calc.remaining)} bold
          className={calc.remaining < 0 ? "text-destructive" : "text-primary"} />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <button className="pixel-btn" onClick={() => onJump("income")}>$ EDIT INCOME</button>
        <button className="pixel-btn" onClick={() => onJump("paychecks")}>▶ LOG PAYCHECK</button>
        <button className="pixel-btn coin" onClick={() => onJump("goals")}>★ MY GOALS</button>
      </div>
    </section>
  );
}

/* ---------------- INCOME ---------------- */
function IncomeTab({ income, setIncome, hysaPct, setHysaPct, k401Pct, setK401Pct,
  rothPct, setRothPct, studentLoan, setStudentLoan, calc }: any) {
  return (
    <section className="pixel-box space-y-5">
      <h2 className="text-sm md:text-base text-accent">▶ INCOME & ALLOCATIONS</h2>

      <div>
        <label className="label-pixel">Yearly Income</label>
        <input type="number" className="pixel-input mt-1" value={income}
          onChange={(e) => setIncome(Number(e.target.value) || 0)} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <PctInput label="HYSA %" value={hysaPct} set={setHysaPct} />
        <PctInput label="401(k) %" value={k401Pct} set={setK401Pct} />
        <PctInput label="Roth IRA %" value={rothPct} set={setRothPct} />
        <div>
          <label className="label-pixel">Loans /yr</label>
          <input type="number" className="pixel-input mt-1" value={studentLoan}
            onChange={(e) => setStudentLoan(Number(e.target.value) || 0)} />
        </div>
      </div>

      <div className="pixel-box-sm space-y-1 text-base">
        <div className="label-pixel mb-2">Tax Breakdown /mo</div>
        <Row label="Federal" v={money(calc.fed / 12)} />
        <Row label="Illinois (4.95%)" v={money(calc.il / 12)} />
        <Row label="Social Security (6.2%)" v={money(calc.ss / 12)} />
        <Row label="Medicare (1.45%)" v={money(calc.medicare / 12)} />
        <div className="mt-2 border-t-2 border-dashed border-border pt-2">
          <Row label="Total /mo" v={money(calc.taxes / 12)} bold />
          <Row label="Effective rate"
            v={`${income > 0 ? ((calc.taxes / income) * 100).toFixed(2) : "0.00"}%`} />
        </div>
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
          {money(pocketLeftYr / 52)} / wk · {money(pocketLeftYr / 12)} / mo · {money(pocketLeftYr)} / yr
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
  const [deadline, setDeadline] = useState("");

  const add = async () => {
    if (!userId || !name || !target) return;
    const { data, error } = await (supabase as any).from("goals").insert({
      user_id: userId, name,
      target_amount: Number(target),
      current_amount: Number(current) || 0,
      deadline: deadline || null,
    }).select("*").single();
    if (error) { console.error(error); return; }
    setGoals((prev) => [...prev, {
      id: data.id, name: data.name,
      target_amount: Number(data.target_amount),
      current_amount: Number(data.current_amount),
      deadline: data.deadline,
    }]);
    setName(""); setTarget(""); setCurrent(""); setDeadline("");
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
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
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
            <label className="label-pixel">Deadline</label>
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
            {g.deadline ? `due ${g.deadline} · ${daysLeft} days left` : "no deadline set"}
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

      <div className="grid grid-cols-3 gap-2">
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
          <label className="label-pixel">Deadline</label>
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
