import React, { useEffect, useState } from "react";
import { api, API } from "../lib/api";
import { getToken } from "../lib/storage";
import { useAuth } from "../contexts/AuthContext";
import { ShieldCheck, Download, Loader2, Lock, AlertCircle, Sparkles, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import AIInsightPanel from "../components/AIInsightPanel";
import { PageHeader, SectionCard } from "../components/ui/layout";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../components/ui/dropdown-menu";
import { Button } from "../components/ui/button";

const ICONS = {
  alert: AlertCircle, sparkle: Sparkles,
};

const GRADE_COLOURS = {
  A: "text-emerald", B: "text-emerald", C: "text-topaz", D: "text-topaz", F: "text-ruby",
};

export default function Reports() {
  useEffect(() => { document.title = "Reports | FinanceAI"; }, []);
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const today = () => new Date().toISOString().slice(0, 10);
  const firstOfMonth = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };
  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo, setDateTo] = useState(today);

  useEffect(() => { (async () => {
    try { const { data } = await api.get("/dashboard/overview", { params: { date_from: dateFrom, date_to: dateTo } }); setData(data); } catch { toast.error("Could not load report data"); }
  })(); }, [dateFrom, dateTo]);

  const isPremium = user?.tier === "premium" || user?.role === "admin";

  const download = async (kind) => {
    if (!isPremium) { toast.error("Premium feature — upgrade to download PDF reports."); return; }
    setBusy(kind);
    try {
      const token = getToken("access_token") || localStorage.getItem("financeai_token");
      const res = await fetch(`${API}/reports/${kind}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") || "";
      const m = cd.match(/filename="([^"]+)"/);
      const filename = m ? m[1] : `financeai-${kind}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; document.body.appendChild(a); a.click();
      a.remove(); URL.revokeObjectURL(url);
      toast.success("Report downloaded");
    } catch (e) {
      console.error("download failed", e);
      toast.error("Download failed");
    }
    finally { setBusy(null); }
  };

  const downloadCsv = async () => {
    if (!isPremium) { toast.error("Premium feature — upgrade to download CSV reports."); return; }
    setBusy("csv-monthly");
    try {
      const token = getToken("access_token") || localStorage.getItem("financeai_token");
      const res = await fetch(`${API}/reports/monthly?format=csv&date_from=${dateFrom}&date_to=${dateTo}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `financeai-${dateFrom}-${dateTo}.csv`; document.body.appendChild(a); a.click();
      a.remove(); URL.revokeObjectURL(url);
      toast.success("CSV downloaded");
    } catch (e) {
      toast.error("CSV download failed");
    } finally { setBusy(null); }
  };

  if (!data) return (
    <div className="space-y-8" data-testid="reports-loading">
      <div className="animate-pulse space-y-4">
        <div className="h-4 w-32 rounded bg-secondary" />
        <div className="h-8 w-64 rounded bg-secondary" />
        <div className="h-4 w-96 rounded bg-secondary" />
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="h-4 w-24 rounded bg-secondary" />
          <div className="h-16 w-32 rounded bg-secondary" />
          <div className="h-3 rounded-full bg-secondary" />
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="h-12 rounded bg-secondary" />
          <div className="h-12 rounded bg-secondary" />
          <div className="h-12 rounded bg-secondary" />
        </div>
      </div>
    </div>
  );
  const topSpend = data.categories?.[0];
  const subs = data.categories?.find(c=>c.name==="subscriptions");

  return (
    <div className="space-y-8" data-testid="reports-root">
      <PageHeader
        eyebrow="Overview"
        title="Your financial health, explained."
        description="A cleaner monthly readout with health score, insights, and premium PDF reports."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <label className="text-[11px] sm:text-xs text-muted-foreground">From</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="h-10 px-2 sm:px-3 rounded-xl bg-secondary/50 border border-transparent text-xs sm:text-sm focus:border-ring focus:outline-none w-[130px] sm:w-auto" />
              <label className="text-[11px] sm:text-xs text-muted-foreground">To</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="h-10 px-2 sm:px-3 rounded-xl bg-secondary/50 border border-transparent text-xs sm:text-sm focus:border-ring focus:outline-none w-[130px] sm:w-auto" />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant={isPremium ? "primary" : "outlinePill"} size="pill">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Download <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => download("monthly")} disabled={busy === "monthly"}>
                  This month PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => download("yearly")} disabled={busy === "yearly"}>
                  This year PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => download("full")} disabled={busy === "full"}>
                  Full snapshot PDF
                </DropdownMenuItem>
                {isPremium && (
                  <DropdownMenuItem onClick={() => downloadCsv()} disabled={busy === "csv-monthly"}>
                    CSV export
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      {!isPremium && (
        <div className="rounded-2xl border border-dashed border-emerald/40 bg-emerald/5 p-4 flex items-center gap-3" data-testid="reports-paywall">
          <Lock className="h-4 w-4 text-emerald" />
          <p className="text-sm">PDF reports are a Premium feature. <a href="/pricing" className="text-emerald hover:underline">Upgrade for £5/mo</a> to download monthly, yearly, and full snapshots.</p>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 sm:gap-3">
          <ShieldCheck className="h-4 w-4 text-emerald shrink-0" />
          <p className="label-overline">Health score</p>
          <span className="ml-auto text-2xl sm:text-3xl tracking-tight font-light">{data.health_score}<span className="text-xs sm:text-sm text-muted-foreground">/100</span></span>
        </div>
        <div className="mt-3 sm:mt-4 h-2 bg-secondary rounded-full overflow-hidden">
          <div className="h-full gradient-emerald" style={{width: `${data.health_score}%`}} />
        </div>
        <div className="mt-3 sm:mt-4 flex flex-wrap items-center gap-x-4 sm:gap-x-6 gap-y-1.5 sm:gap-y-2 text-xs sm:text-sm">
          <span>Savings rate: <span className="text-emerald font-medium">{data.savings_rate}%</span></span>
          <span>Top spend: <span className="font-medium">{topSpend ? `${topSpend.name} · £${topSpend.value.toFixed(0)}` : "—"}</span></span>
          <span>Subscriptions: <span className="font-medium">{subs ? `£${subs.value.toFixed(2)}/mo` : "None detected"}</span></span>
          <span>Cash flow: <span className="font-medium">£{data.balance.toLocaleString()}</span></span>
        </div>
      </div>

      <SectionCard eyebrow="Savings" title="AI savings suggestions">
        <ul className="mt-4 space-y-3 text-sm">
          <li className="flex gap-3"><span className="text-emerald">→</span> Cancel unused subscriptions could save <span className="text-emerald font-medium">£{(subs?.value || 0).toFixed(2)}</span> / mo.</li>
          <li className="flex gap-3"><span className="text-emerald">→</span> Aim to keep {topSpend?.name || "your top category"} below 30% of monthly spend.</li>
          <li className="flex gap-3"><span className="text-emerald">→</span> Set aside 10% of net income for Maaser before discretionary spend.</li>
          <li className="flex gap-3"><span className="text-emerald">→</span> Build an emergency fund of 3-6 months expenses before increasing investments.</li>
        </ul>
      </SectionCard>

      <AIInsightPanel
        title="AI Monthly Report"
        subtitle="Plain-English review of your month"
        endpoint="/ai/insights/report"
        body={{ year: new Date().getFullYear(), month: new Date().getMonth() + 1 }}
        render={(d) => (
          <div className="mt-5 space-y-5">
            {d.month_grade && (
              <div className="flex items-center gap-4">
                <div className={`text-6xl tracking-tight font-light ${GRADE_COLOURS[d.month_grade] || "text-foreground"}`}>{d.month_grade}</div>
                <div className="flex-1">
                  <p className="label-overline">Month grade</p>
                  {d.metrics && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Income £{d.metrics.income?.toFixed(2)} · Spend £{d.metrics.spend?.toFixed(2)} · Saved {d.metrics.savings_rate_pct}%
                    </p>
                  )}
                </div>
              </div>
            )}
            {d.narrative && (
              <div className="prose prose-sm max-w-none text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                {d.narrative}
              </div>
            )}
            {d.highlights?.length > 0 && (
              <div>
                <p className="label-overline mb-3">Highlights</p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {d.highlights.map((h, i) => {
                    const Icon = ICONS[h.icon] || Sparkles;
                    return (
                      <div key={i} className="flex items-start gap-2 p-3 rounded-lg bg-secondary/30">
                        <Icon className="h-4 w-4 mt-0.5 text-emerald flex-shrink-0" />
                        <p className="text-sm">{h.text}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      />
    </div>
  );
}


