import { createFileRoute } from "@tanstack/react-router";
import { useBudget, Row, PctInput, money } from "@/lib/budget-context";

export const Route = createFileRoute("/_app/income")({
  component: IncomePage,
  head: () => ({ meta: [{ title: "BUDGET QUEST — Income & Taxes" }] }),
});

function IncomePage() {
  const { income, setIncome, hysaPct, setHysaPct, k401Pct, setK401Pct,
    rothPct, setRothPct, studentLoan, setStudentLoan, calc } = useBudget();

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
