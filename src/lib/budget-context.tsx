import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PocketItem = { id: string; name: string; amount: number };
export type Allocations = { taxes: number; hysa: number; k401: number; roth: number; studentLoan: number; pocket: number };
export type Paycheck = { id: string; amount: number; received_at: string; allocations: Allocations };
export type Goal = { id: string; name: string; target_amount: number; current_amount: number; deadline: string | null };

export const ALLOC_KEYS: (keyof Allocations)[] = ["taxes", "hysa", "k401", "roth", "studentLoan", "pocket"];
export const ALLOC_LABELS: Record<keyof Allocations, string> = {
  taxes: "Taxes", hysa: "HYSA", k401: "401(k)", roth: "Roth IRA", studentLoan: "Loans", pocket: "Pocket",
};
export const ALLOC_COLORS: Record<keyof Allocations, string> = {
  taxes: "var(--life)", hysa: "var(--mana)", k401: "var(--xp)",
  roth: "var(--coin)", studentLoan: "var(--danger)", pocket: "var(--pocket)",
};

export const IL_RATE = 0.0495;
export function federalTax(income: number, pretax: number) {
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
export const money = (n: number) =>
  "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });

type Ctx = {
  loaded: boolean;
  userId: string | null;
  userEmail: string;
  signOut: () => Promise<void>;

  income: number; setIncome: (n: number) => void;
  hysaPct: number; setHysaPct: (n: number) => void;
  k401Pct: number; setK401Pct: (n: number) => void;
  rothPct: number; setRothPct: (n: number) => void;
  studentLoan: number; setStudentLoan: (n: number) => void;

  pocket: PocketItem[];
  addPocket: (name: string, amount: number) => void;
  updatePocket: (id: string, amount: number) => void;
  removePocket: (id: string) => void;

  paychecks: Paycheck[];
  addPaycheck: (amount: number, date: string) => Promise<void>;
  removePaycheck: (id: string) => Promise<void>;
  allocatePaycheck: (amount: number) => Allocations;

  goals: Goal[];
  addGoal: (g: Omit<Goal, "id">) => Promise<void>;
  updateGoal: (id: string, patch: Partial<Omit<Goal, "id">>) => Promise<void>;
  removeGoal: (id: string) => Promise<void>;

  calc: {
    hysa: number; k401: number; roth: number;
    taxes: number; fed: number; il: number; ss: number; medicare: number;
    pocketYr: number; allocated: number; remaining: number; studentLoan: number;
  };
  totals: { sum: number; t: Allocations };
};

const BudgetCtx = createContext<Ctx | null>(null);

export function useBudget() {
  const c = useContext(BudgetCtx);
  if (!c) throw new Error("useBudget must be inside BudgetProvider");
  return c;
}

export function BudgetProvider({ children, onUnauthed }: { children: ReactNode; onUnauthed: () => void }) {
  const [income, setIncome] = useState(75000);
  const [hysaPct, setHysaPct] = useState(10);
  const [k401Pct, setK401Pct] = useState(10);
  const [rothPct, setRothPct] = useState(5);
  const [studentLoan, setStudentLoan] = useState(4800);
  const [pocket, setPocket] = useState<PocketItem[]>([]);
  const [paychecks, setPaychecks] = useState<Paycheck[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) { setUserId(null); onUnauthed(); }
      else { setUserId(session.user.id); setUserEmail(session.user.email ?? ""); }
    });
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { onUnauthed(); return; }
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
      } else {
        setPocket([
          { id: "1", name: "Rent", amount: 1400 },
          { id: "2", name: "Groceries", amount: 450 },
          { id: "3", name: "Gas", amount: 180 },
          { id: "4", name: "Fun", amount: 220 },
        ]);
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
  }, [onUnauthed]);

  // Debounced budget save
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

  const calc = useMemo(() => {
    const hysa = income * (hysaPct / 100);
    const k401 = income * (k401Pct / 100);
    const roth = income * (rothPct / 100);
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

  const ctx: Ctx = {
    loaded, userId, userEmail,
    signOut: async () => { await supabase.auth.signOut(); onUnauthed(); },
    income, setIncome, hysaPct, setHysaPct, k401Pct, setK401Pct,
    rothPct, setRothPct, studentLoan, setStudentLoan,
    pocket,
    addPocket: (name, amount) => setPocket((p) => [...p, { id: Date.now().toString(), name, amount }]),
    updatePocket: (id, amount) => setPocket((p) => p.map((x) => x.id === id ? { ...x, amount } : x)),
    removePocket: (id) => setPocket((p) => p.filter((x) => x.id !== id)),
    paychecks,
    addPaycheck: async (amount, date) => {
      if (!userId || amount <= 0) return;
      const alloc = allocatePaycheck(amount);
      const { data, error } = await supabase.from("paychecks")
        .insert({ user_id: userId, amount, received_at: date, allocations: alloc as never })
        .select("id, amount, received_at, allocations").single();
      if (error) { console.error(error); return; }
      setPaychecks((prev) => [...prev, {
        id: data.id, amount: Number(data.amount),
        received_at: data.received_at as string,
        allocations: data.allocations as Allocations,
      }].sort((a, b) => a.received_at.localeCompare(b.received_at)));
    },
    removePaycheck: async (id) => {
      const { error } = await supabase.from("paychecks").delete().eq("id", id);
      if (error) { console.error(error); return; }
      setPaychecks((prev) => prev.filter((p) => p.id !== id));
    },
    allocatePaycheck,
    goals,
    addGoal: async (g) => {
      if (!userId) return;
      const { data, error } = await (supabase as any).from("goals").insert({
        user_id: userId, name: g.name,
        target_amount: g.target_amount, current_amount: g.current_amount, deadline: g.deadline,
      }).select("*").single();
      if (error) { console.error(error); return; }
      setGoals((prev) => [...prev, {
        id: data.id, name: data.name,
        target_amount: Number(data.target_amount),
        current_amount: Number(data.current_amount),
        deadline: data.deadline,
      }]);
    },
    updateGoal: async (id, patch) => {
      setGoals((prev) => prev.map((g) => g.id === id ? { ...g, ...patch } as Goal : g));
      const { error } = await (supabase as any).from("goals").update(patch).eq("id", id);
      if (error) console.error(error);
    },
    removeGoal: async (id) => {
      const { error } = await (supabase as any).from("goals").delete().eq("id", id);
      if (error) { console.error(error); return; }
      setGoals((prev) => prev.filter((g) => g.id !== id));
    },
    calc, totals,
  };

  return <BudgetCtx.Provider value={ctx}>{children}</BudgetCtx.Provider>;
}

export function Row({ label, v, bold, className = "" }: { label: string; v: string; bold?: boolean; className?: string }) {
  return (
    <div className={`flex items-center justify-between ${bold ? "font-bold" : ""} ${className}`}>
      <span>{label}</span><span>{v}</span>
    </div>
  );
}

export function PctInput({ label, value, set }: { label: string; value: number; set: (n: number) => void }) {
  return (
    <div>
      <label className="label-pixel">{label}</label>
      <input type="number" className="pixel-input mt-1" value={value} min={0} max={100}
        onChange={(e) => set(Number(e.target.value) || 0)} />
    </div>
  );
}
