import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useBudget, money, Row, type Goal } from "@/lib/budget-context";

export const Route = createFileRoute("/_app/goals")({
  component: GoalsPage,
  head: () => ({ meta: [{ title: "BUDGET QUEST — Goals" }] }),
});

function daysBetween(a: Date, b: Date) {
  return Math.max(0, Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
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
    daysLeft = daysBetween(today, dl);
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

      {/* progress bar */}
      <div className="relative h-5 border-2 border-foreground bg-background overflow-hidden">
        <div className="h-full transition-all"
          style={{ width: `${pct}%`, background: done ? "var(--xp)" : "var(--coin)" }} />
        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold mix-blend-difference text-white">
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
        <div className="pixel-box-sm text-center text-xp" style={{ color: "var(--xp)" }}>
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

function GoalsPage() {
  const { goals, addGoal, updateGoal, removeGoal } = useBudget();
  const [name, setName] = useState("");
  const [target, setTarget] = useState<number | "">("");
  const [current, setCurrent] = useState<number | "">("");
  const [deadline, setDeadline] = useState("");

  const submit = async () => {
    if (!name || !target) return;
    await addGoal({
      name,
      target_amount: Number(target),
      current_amount: Number(current) || 0,
      deadline: deadline || null,
    });
    setName(""); setTarget(""); setCurrent(""); setDeadline("");
  };

  return (
    <section className="pixel-box">
      <h2 className="text-sm md:text-base text-accent mb-4">▶ SIDE QUESTS · GOALS</h2>

      <div className="pixel-box-sm border-dashed mb-5">
        <div className="label-pixel mb-2">+ New Quest</div>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <label className="label-pixel">Name</label>
            <input className="pixel-input mt-1" placeholder="New car, vacation..."
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
        <button className="pixel-btn coin w-full mt-3" onClick={submit}>★ ACCEPT QUEST</button>
      </div>

      {goals.length === 0 ? (
        <div className="pixel-box-sm text-center text-muted-foreground">
          ~ no quests yet · add a goal to start saving ~
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {goals.map((g) => (
            <GoalCard key={g.id} g={g} onUpdate={updateGoal} onRemove={removeGoal} />
          ))}
        </div>
      )}
    </section>
  );
}
