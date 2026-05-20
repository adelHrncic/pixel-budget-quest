import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useBudget, money, ALLOC_KEYS, ALLOC_LABELS, ALLOC_COLORS, type Allocations } from "@/lib/budget-context";

export const Route = createFileRoute("/_app/paychecks")({
  component: PaychecksPage,
  head: () => ({ meta: [{ title: "BUDGET QUEST — Paychecks" }] }),
});

function PaychecksPage() {
  const { paychecks, addPaycheck, removePaycheck, allocatePaycheck, totals } = useBudget();
  const [pcAmount, setPcAmount] = useState<number | "">("");
  const [pcDate, setPcDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const submit = async () => {
    if (!pcAmount || Number(pcAmount) <= 0) return;
    await addPaycheck(Number(pcAmount), pcDate);
    setPcAmount("");
  };

  const growthData = (() => {
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
  })();

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
        <button className="pixel-btn coin" onClick={submit}>+ LOG IT</button>
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
                <button className="pixel-btn danger !p-1 !text-[0.55rem]" onClick={() => removePaycheck(p.id)}>X</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
