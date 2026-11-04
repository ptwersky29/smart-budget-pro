import React, { useState, useEffect } from "react";
import { api } from "../lib/api";
import { Landmark, Calculator, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { PageHeader } from "../components/ui/page";
import { formatCurrency } from "../lib/format";

export default function UKTools() {
  useEffect(() => { document.title = "UK Tools | Penni"; }, []);
  const [uc, setUc] = useState({ monthly_earnings: 0, children: 0, housing_cost: 0, couple: false, has_disability: false, result: null, busy: false });
  const [tax, setTax] = useState({ annual_income: 35000, result: null, busy: false });

  const runUC = async () => {
    setUc({ ...uc, busy: true });
    const { monthly_earnings, children, housing_cost, couple, has_disability } = uc;
    try { const { data } = await api.post("/uk/universal-credit", { monthly_earnings, children, housing_cost, couple, has_disability }); setUc({ ...uc, result: data, busy: false }); }
    catch { toast.error("Could not calculate UC estimate"); setUc({ ...uc, busy: false }); }
  };
  const runTax = async () => {
    setTax({ ...tax, busy: true });
    try { const { data } = await api.post("/uk/hmrc-estimate", { annual_income: Number(tax.annual_income) }); setTax({ ...tax, result: data, busy: false }); }
    catch { toast.error("Could not calculate tax estimate"); setTax({ ...tax, busy: false }); }
  };

  return (
    <div className="page-stack pb-4" data-testid="uk-tools-root">
      <PageHeader eyebrow="UK money" title="UK tools" description="Quick estimates for Universal Credit and HMRC tax, without the guesswork." />
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="surface min-w-0 p-4 sm:p-6">
          <div className="mb-4 flex items-center gap-2"><Landmark className="h-4 w-4 text-primary" /><h2 className="text-base font-semibold">Universal Credit estimate</h2></div>
          <p className="mb-4 text-xs leading-relaxed text-muted-foreground">Illustrative monthly estimate only. Eligibility and payment depend on your circumstances and current government rules.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field min="0" step="0.01" inputMode="decimal" label="Monthly earnings (£)" testid="uc-earn" value={uc.monthly_earnings} onChange={(v)=>setUc({...uc, monthly_earnings:Number(v)})} />
            <Field min="0" step="1" label="Children" testid="uc-children" value={uc.children} onChange={(v)=>setUc({...uc, children:Number(v)})} />
            <Field min="0" step="0.01" inputMode="decimal" label="Housing cost (£)" testid="uc-housing" value={uc.housing_cost} onChange={(v)=>setUc({...uc, housing_cost:Number(v)})} />
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={uc.couple} onChange={(e)=>setUc({...uc, couple:e.target.checked})} data-testid="uc-couple"/> Couple</label>
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={uc.has_disability} onChange={(e)=>setUc({...uc, has_disability:e.target.checked})} data-testid="uc-disability"/> Disability</label>
          </div>
          <Button onClick={runUC} disabled={uc.busy} data-testid="uc-calc" variant="primary" size="pill" className="mt-4">
            {uc.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Estimate"}
          </Button>
          {uc.result && (
            <div role="status" aria-live="polite" className="mt-6 space-y-1.5 rounded-xl bg-secondary/40 p-4">
              <p className="label-overline">Monthly UC estimate</p>
              <p className="money-tabular text-[clamp(22px,5vw,32px)] font-semibold text-foreground">{formatCurrency(uc.result.estimated_monthly_uc)}</p>
              <div className="text-xs text-muted-foreground space-y-0.5 pt-2">
                {Object.entries(uc.result.breakdown || {}).map(([k,v])=>(<div key={k} className="flex justify-between gap-3"><span>{k.replace(/_/g," ")}</span><span className="money-tabular text-right">{formatCurrency(v)}</span></div>))}
              </div>
            </div>
          )}
        </div>

        <div className="surface min-w-0 p-4 sm:p-6">
          <div className="mb-4 flex items-center gap-2"><Calculator className="h-4 w-4 text-primary" /><h2 className="text-base font-semibold">HMRC tax estimate</h2></div>
          <p className="mb-4 text-xs leading-relaxed text-muted-foreground">Illustrative annual take-home pay, not an official HMRC assessment.</p>
          <Field min="0" step="0.01" inputMode="decimal" label="Annual income (£)" testid="tax-income" value={tax.annual_income} onChange={(v)=>setTax({...tax, annual_income:v})} />
          <Button onClick={runTax} disabled={tax.busy} data-testid="tax-calc" variant="primary" size="pill" className="mt-4">
            {tax.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Estimate"}
          </Button>
          {tax.result && (
            <div role="status" aria-live="polite" className="mt-6 space-y-1.5 rounded-xl bg-secondary/40 p-4">
              <p className="label-overline">Take-home (annual)</p>
              <p className="money-tabular text-[clamp(22px,5vw,32px)] font-semibold text-foreground">{formatCurrency(tax.result.take_home)}</p>
              <p className="text-xs text-muted-foreground">{formatCurrency(tax.result.monthly_take_home)}/month · {tax.result.effective_rate_pct}% effective rate</p>
              <div className="text-xs text-muted-foreground space-y-0.5 pt-2">
                <div className="flex justify-between"><span>Income tax</span><span>{formatCurrency(tax.result.income_tax)}</span></div>
                <div className="flex justify-between"><span>National Insurance</span><span>{formatCurrency(tax.result.national_insurance)}</span></div>
                <div className="flex justify-between"><span>Personal allowance</span><span>{formatCurrency(tax.result.personal_allowance)}</span></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const Field = ({label, testid, value, onChange, min = "0", step = "1", inputMode = "numeric"}) => (
  <div>
    <label htmlFor={testid} className="label-overline">{label}</label>
    <input id={testid} data-testid={testid} type="number" min={min} step={step} inputMode={inputMode}
      value={value} onChange={(e) => onChange(e.target.value)}
      className="mt-1 h-11 w-full rounded-xl border border-border bg-secondary/50 px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/30" />
  </div>
);
