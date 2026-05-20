import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "BUDGET QUEST - Retro Money Manager" },
      { name: "description", content: "An 8-bit retro budgeting app with pie chart, IL taxes, HYSA, 401k, Roth IRA, student loans & pocket money." },
    ],
  }),
});

type PocketItem = { id: string; name: string; amount: number };

// Illinois flat income tax 2024: 4.95%
const IL_RATE = 0.0495;
// Federal estimate (simplified single filer brackets 2024)
function federalTax(income: number, pretax: number) {
  const taxable = Math.max(0, income - pretax - 14600); // std deduction
  const brackets: [number, number][] = [
    [11600, 0.10],
    [47150, 0.12],
    [100525, 0.22],
    [191950, 0.24],
    [243725, 0.32],
    [609350, 0.35],
    [Infinity, 0.37],
  ];
  let tax = 0, last = 0;
  for (const [cap, rate] of brackets) {
    if (taxable > cap) { tax += (cap - last) * rate; last = cap; }
    else { tax += (taxable - last) * rate; break; }
  }
  return Math.max(0, tax);
}
// FICA: 6.2% SS up to 168600 + 1.45% Medicare
function fica(income: number) {
  return Math.min(income, 168600) * 0.062 + income * 0.0145;
}

const money = (n: number) =>
  "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });

function Index() {
  const [income, setIncome] = useState(75000);
  const [hysaPct, setHysaPct] = useState(10);
  const [k401Pct, setK401Pct] = useState(10);
  const [rothPct, setRothPct] = useState(5);
  const [studentLoan, setStudentLoan] = useState(4800); // yearly
  const [pocket, setPocket] = useState<PocketItem[]>([
    { id: "1", name: "Rent", amount: 1400 },
    { id: "2", name: "Groceries", amount: 450 },
    { id: "3", name: "Gas", amount: 180 },
    { id: "4", name: "Fun", amount: 220 },
  ]);
  const [newName, setNewName] = useState("");
  const [newAmt, setNewAmt] = useState<number | "">("");
  const [view, setView] = useState<"monthly" | "yearly">("monthly");
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const nav = useNavigate();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auth gate + initial load
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) {
        setUserId(null);
        nav({ to: "/login" });
      } else {
        setUserId(session.user.id);
        setUserEmail(session.user.email ?? "");
      }
    });
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        nav({ to: "/login" });
        return;
      }
      const uid = data.session.user.id;
      setUserId(uid);
      setUserEmail(data.session.user.email ?? "");
      const { data: row } = await supabase
        .from("budgets")
        .select("*")
        .eq("user_id", uid)
        .maybeSingle();
      if (row) {
        setIncome(Number(row.income));
        setHysaPct(Number(row.hysa_pct));
        setK401Pct(Number(row.k401_pct));
        setRothPct(Number(row.roth_pct));
        setStudentLoan(Number(row.student_loan));
        setPocket(Array.isArray(row.pocket) ? (row.pocket as PocketItem[]) : []);
      }
      setLoaded(true);
    });
    return () => sub.subscription.unsubscribe();
  }, [nav]);

  // Debounced save
  useEffect(() => {
    if (!loaded || !userId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      supabase.from("budgets").upsert({
        user_id: userId,
        income,
        hysa_pct: hysaPct,
        k401_pct: k401Pct,
        roth_pct: rothPct,
        student_loan: studentLoan,
        pocket: pocket as never,
        updated_at: new Date().toISOString(),
      }).then(({ error }) => {
        if (error) console.error("save error", error);
      });
    }, 600);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [loaded, userId, income, hysaPct, k401Pct, rothPct, studentLoan, pocket]);

  const signOut = async () => {
    await supabase.auth.signOut();
    nav({ to: "/login" });
  };

  const calc = useMemo(() => {
    const hysa = income * (hysaPct / 100);
    const k401 = income * (k401Pct / 100);
    const roth = income * (rothPct / 100);
    // Traditional 401(k) reduces taxable income; Roth does not
    const fed = federalTax(income, k401);
    const il = Math.max(0, income - k401) * IL_RATE;
    const ss = Math.min(income, 168600) * 0.062;
    const medicare = income * 0.0145;
    const taxes = fed + il + ss + medicare;
    const pocketYr = pocket.reduce((s, p) => s + p.amount, 0) * 12;
    const allocated = taxes + hysa + k401 + roth + studentLoan + pocketYr;
    const remaining = income - allocated;
    return { hysa, k401, roth, taxes, fed, il, ss, medicare, pocketYr, allocated, remaining, studentLoan };
  }, [income, hysaPct, k401Pct, rothPct, studentLoan, pocket]);

  const divisor = view === "monthly" ? 12 : 1;
  const fmt = (n: number) => money(n / divisor);

  const POCKET_COLORS = [
    "oklch(0.80 0.18 50)",
    "oklch(0.76 0.20 30)",
    "oklch(0.82 0.16 70)",
    "oklch(0.84 0.14 88)",
    "oklch(0.74 0.22 18)",
    "oklch(0.78 0.15 60)",
  ];

  const chartData = [
    { name: "Taxes", value: calc.taxes, color: "var(--life)" },
    { name: "HYSA", value: calc.hysa, color: "var(--mana)" },
    { name: "401(k)", value: calc.k401, color: "var(--xp)" },
    { name: "Roth IRA", value: calc.roth, color: "var(--coin)" },
    { name: "Student Loans", value: calc.studentLoan, color: "var(--danger)" },
    ...pocket.map((p, i) => ({
      name: p.name,
      value: p.amount * 12,
      color: POCKET_COLORS[i % POCKET_COLORS.length],
    })),
  ].filter((d) => d.value > 0);

  const addPocket = () => {
    if (!newName || !newAmt) return;
    setPocket([...pocket, { id: Date.now().toString(), name: newName, amount: Number(newAmt) }]);
    setNewName("");
    setNewAmt("");
  };
  const updatePocket = (id: string, amount: number) =>
    setPocket(pocket.map((p) => (p.id === id ? { ...p, amount } : p)));
  const removePocket = (id: string) => setPocket(pocket.filter((p) => p.id !== id));

  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <header className="mx-auto mb-8 max-w-6xl relative text-center">
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

      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-2">
        {/* INPUTS */}
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
              <Row
                label="Effective rate"
                v={`${income > 0 ? ((calc.taxes / income) * 100).toFixed(2) : "0.00"}%`}
              />
            </div>
          </div>
        </section>

        {/* CHART */}
        <section className="pixel-box scanlines">
          <div className="flex items-center justify-between">
            <h2 className="text-sm md:text-base text-accent">▶ STATUS MAP</h2>
            <div className="flex gap-2">
              <button className={`pixel-btn ${view === "monthly" ? "coin" : ""}`} onClick={() => setView("monthly")}>MO</button>
              <button className={`pixel-btn ${view === "yearly" ? "coin" : ""}`} onClick={() => setView("yearly")}>YR</button>
            </div>
          </div>

          <div className="my-4 h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                  outerRadius={100} innerRadius={45} stroke="#000" strokeWidth={3}>
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
            <Row
              label="Unspent"
              v={fmt(calc.remaining)}
              bold
              className={calc.remaining < 0 ? "text-destructive" : "text-primary"}
            />
          </div>
        </section>

        {/* POCKET MONEY */}
        <section className="pixel-box lg:col-span-2">
          <h2 className="text-sm md:text-base text-accent mb-4">▶ POCKET MONEY INVENTORY</h2>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pocket.map((p) => (
              <div key={p.id} className="pixel-box-sm float-up">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-lg" style={{ color: "var(--pocket)" }}>● {p.name}</span>
                  <button className="pixel-btn danger !p-1 !text-[0.55rem]" onClick={() => removePocket(p.id)}>X</button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="label-pixel">$/mo</span>
                  <input type="number" className="pixel-input" value={p.amount}
                    onChange={(e) => updatePocket(p.id, Number(e.target.value) || 0)} />
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  = {money(p.amount * 12)} / yr
                </div>
              </div>
            ))}

            <div className="pixel-box-sm border-dashed">
              <div className="label-pixel mb-2">+ Add Item</div>
              <input className="pixel-input mb-2" placeholder="name" value={newName}
                onChange={(e) => setNewName(e.target.value)} maxLength={30} />
              <input className="pixel-input mb-2" type="number" placeholder="$/month"
                value={newAmt} onChange={(e) => setNewAmt(e.target.value === "" ? "" : Number(e.target.value))} />
              <button className="pixel-btn w-full" onClick={addPocket}>ADD</button>
            </div>
          </div>

          <div className="mt-5 pixel-box-sm flex flex-wrap items-center justify-between gap-3">
            <span className="label-pixel">Pocket Total</span>
            <span className="text-xl text-accent">
              {money(pocket.reduce((s, p) => s + p.amount, 0))} / mo · {money(calc.pocketYr)} / yr
            </span>
          </div>
        </section>
      </div>

      <footer className="mx-auto mt-10 max-w-6xl text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} BUDGET QUEST — federal tax estimates only. consult a wizard.
      </footer>
    </main>
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
      <span>{label}</span>
      <span>{v}</span>
    </div>
  );
}
