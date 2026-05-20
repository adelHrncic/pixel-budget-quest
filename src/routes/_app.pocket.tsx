import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useBudget, money } from "@/lib/budget-context";

export const Route = createFileRoute("/_app/pocket")({
  component: PocketPage,
  head: () => ({ meta: [{ title: "BUDGET QUEST — Pocket Money" }] }),
});

function PocketPage() {
  const { pocket, addPocket, updatePocket, removePocket, calc } = useBudget();
  const [newName, setNewName] = useState("");
  const [newAmt, setNewAmt] = useState<number | "">("");

  const submit = () => {
    if (!newName || !newAmt) return;
    addPocket(newName, Number(newAmt));
    setNewName(""); setNewAmt("");
  };

  return (
    <section className="pixel-box">
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
          <button className="pixel-btn w-full" onClick={submit}>ADD</button>
        </div>
      </div>

      <div className="mt-5 pixel-box-sm flex flex-wrap items-center justify-between gap-3">
        <span className="label-pixel">Pocket Total</span>
        <span className="text-xl text-accent">
          {money(pocket.reduce((s, p) => s + p.amount, 0))} / mo · {money(calc.pocketYr)} / yr
        </span>
      </div>
    </section>
  );
}
