import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useBudget, Row, money } from "@/lib/budget-context";

export const Route = createFileRoute("/_app/")({
  component: Overview,
  head: () => ({ meta: [{ title: "BUDGET QUEST — Overview" }] }),
});

const POCKET_COLORS = [
  "oklch(0.80 0.18 50)", "oklch(0.76 0.20 30)", "oklch(0.82 0.16 70)",
  "oklch(0.84 0.14 88)", "oklch(0.74 0.22 18)", "oklch(0.78 0.15 60)",
];

function Overview() {
  const { calc, pocket, income } = useBudget();
  const [view, setView] = useState<"monthly" | "yearly">("monthly");
  const divisor = view === "monthly" ? 12 : 1;
  const fmt = (n: number) => money(n / divisor);

  const chartData = [
    { name: "Taxes", value: calc.taxes, color: "var(--life)" },
    { name: "HYSA", value: calc.hysa, color: "var(--mana)" },
    { name: "401(k)", value: calc.k401, color: "var(--xp)" },
    { name: "Roth IRA", value: calc.roth, color: "var(--coin)" },
    { name: "Student Loans", value: calc.studentLoan, color: "var(--danger)" },
    { name: "Pocket", value: calc.pocketYr, color: "var(--pocket)" },
    ...pocket.map((p, i) => ({
      name: p.name, value: p.amount * 12,
      color: POCKET_COLORS[i % POCKET_COLORS.length],
    })),
  ].filter((d) => d.value > 0);

  return (
    <section className="pixel-box scanlines">
      <div className="flex items-center justify-between">
        <h2 className="text-sm md:text-base text-accent">▶ STATUS MAP</h2>
        <div className="flex gap-2">
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
        <Row label="Unspent" v={fmt(calc.remaining)} bold
          className={calc.remaining < 0 ? "text-destructive" : "text-primary"} />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Link to="/income" className="pixel-btn text-center">▶ EDIT INCOME</Link>
        <Link to="/goals" className="pixel-btn coin text-center">★ MY GOALS</Link>
      </div>
    </section>
  );
}
