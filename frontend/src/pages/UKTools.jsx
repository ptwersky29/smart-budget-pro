import React, { useState, useEffect } from "react";
import { api } from "../lib/api";
import { Landmark, Calculator, Loader2 } from "lucide-react";
import { PageHeader } from "../components/ui/layout";

export default function UKTools() {
  useEffect(() => { document.title = "UK Tools | FinanceAI"; }, []);
  const [uc, setUc] = useState({ monthly_earnings: 0, children: 0, housing_cost: 0, couple: false, has_disability: false, result: null, busy: false });
  const [tax, setTax] = useState({ annual_income: 35000, result: null, busy: false });

  const runUC = async () => {
    setUc({ ...uc, busy: true });
    try { const { data } = await api.post("/uk/universal-credit", uc); setUc({ ...uc, result: data, busy: false }); }
    catch { setUc({ ...uc, busy: false }); }
  };
  const runTax = async () => {
    setTax({ ...tax, busy: true });
    try { const { data } = await api.post("/uk/hmrc-estimate", { annual_income: Number(tax.annual_income) }); setTax({ ...tax, result: data, busy: false }); }
    catch { setTax({ ...tax, busy: false }); }
  };

  return (
    <div className="space-y-8" data-testid="uk-tools-root">
      <PageHeader
        eyebrow="Tools"
        title="Benefits & tax, demystified."
        description="Simple UK calculators with a cleaner layout and clear outputs."
      />

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 mb-4"><Landmark className="h-4 w-4 text-emerald" /><p className="label-overline">Universal Credit estimate</p></div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Monthly earnings (£)" testid="uc-earn" value={uc.monthly_earnings} onChange={(v)=>setUc({...uc, monthly_earnings:Number(v)})} />
            <Field label="Children" testid="uc-children" value={uc.children} onChange={(v)=>setUc({...uc, children:Number(v)})} />
            <Field label="Housing cost (£)" testid="uc-housing" value={uc.housing_cost} onChange={(v)=>setUc({...uc, housing_cost:Number(v)})} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={uc.couple} onChange={(e)=>setUc({...uc, couple:e.target.checked})} data-testid="uc-couple"/> Couple</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={uc.has_disability} onChange={(e)=>setUc({...uc, has_disability:e.target.checked})} data-testid="uc-disability"/> Disability</label>
          </div>
          <button onClick={runUC} disabled={uc.busy} data-testid="uc-calc" className="btn-pill gradient-emerald text-white mt-4 text-sm disabled:opacity-50">
            {uc.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Estimate"}
          </button>
          {uc.result && (
            <div className="mt-6 p-4 rounded-xl bg-secondary/40 space-y-1.5">
              <p className="label-overline">Monthly UC estimate</p>
              <p className="text-3xl tracking-tight font-medium text-emerald">£{uc.result.estimated_monthly_uc.toFixed(2)}</p>
              <div className="text-xs text-muted-foreground space-y-0.5 pt-2">
                {Object.entries(uc.result.breakdown).map(([k,v])=>(<div key={k} className="flex justify-between"><span>{k.replace(/_/g," ")}</span><span>£{v}</span></div>))}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 mb-4"><Calculator className="h-4 w-4 text-emerald" /><p className="label-overline">HMRC tax estimate</p></div>
          <Field label="Annual income (£)" testid="tax-income" value={tax.annual_income} onChange={(v)=>setTax({...tax, annual_income:v})} />
          <button onClick={runTax} disabled={tax.busy} data-testid="tax-calc" className="btn-pill gradient-emerald text-white mt-4 text-sm disabled:opacity-50">
            {tax.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Estimate"}
          </button>
          {tax.result && (
            <div className="mt-6 p-4 rounded-xl bg-secondary/40 space-y-1.5">
              <p className="label-overline">Take-home (annual)</p>
              <p className="text-3xl tracking-tight font-medium text-emerald">£{tax.result.take_home.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">£{tax.result.monthly_take_home}/mo · {tax.result.effective_rate_pct}% effective rate</p>
              <div className="text-xs text-muted-foreground space-y-0.5 pt-2">
                <div className="flex justify-between"><span>Income tax</span><span>£{tax.result.income_tax.toLocaleString()}</span></div>
                <div className="flex justify-between"><span>National Insurance</span><span>£{tax.result.national_insurance.toLocaleString()}</span></div>
                <div className="flex justify-between"><span>Personal allowance</span><span>£{tax.result.personal_allowance.toLocaleString()}</span></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const Field = ({label, testid, value, onChange}) => (
  <div>
    <label className="label-overline">{label}</label>
    <input data-testid={testid} type="number" value={value} onChange={(e)=>onChange(e.target.value)} className="mt-1 w-full h-11 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-ring focus:outline-none" />
  </div>
);
