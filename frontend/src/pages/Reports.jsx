import React, { useEffect, useState } from "react";
import { api, API } from "../lib/api";
import { getToken } from "../lib/storage";
import { useAuth } from "../contexts/AuthContext";
import { FileText, TrendingDown, TrendingUp, ShieldCheck, Download, Loader2, Lock, AlertCircle, Sparkles, Wallet } from "lucide-react";
import { toast } from "sonner";
import AIInsightPanel from "../components/AIInsightPanel";
import { PageHeader, SectionCard } from "../components/ui/layout";

const ICONS = {
  "trending-up": TrendingUp, "trending-down": TrendingDown,
  alert: AlertCircle, sparkle: Sparkles, wallet: Wallet,
};

const GRADE_COLOURS = {
  A: "text-emerald", B: "text-emerald", C: "text-topaz", D: "text-topaz", F: "text-ruby",
};

export default function Reports() {
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
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">From</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="h-10 px-3 rounded-xl bg-secondary/50 border border-transparent text-sm focus:border-ring focus:outline-none" />
              <label className="text-xs text-muted-foreground">To</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="h-10 px-3 rounded-xl bg-secondary/50 border border-transparent text-sm focus:border-ring focus:outline-none" />
            </div>
            {[
              {kind: "monthly", label: "This month"},
              {kind: "yearly", label: "This year"},
              {kind: "full", label: "Full snapshot"},
            ].map(({kind, label}) => (
              <button key={kind} onClick={() => download(kind)} disabled={busy === kind} data-testid={`download-${kind}`}
                className={`btn-pill h-11 px-4 text-sm ${isPremium ? "gradient-emerald text-white" : "border border-border bg-card/80 text-muted-foreground"} disabled:opacity-50`}>
                {busy === kind ? <Loader2 className="h-4 w-4 animate-spin" /> : isPremium ? <Download className="h-4 w-4 mr-2"/> : <Lock className="h-4 w-4 mr-2"/>}
                {label} PDF
              </button>
            ))}
            {isPremium && [
              {kind: "csv-monthly", label: "CSV"},
            ].map(({kind, label}) => (
              <button key={kind} onClick={() => downloadCsv()} disabled={busy === kind} className="btn-pill h-11 px-4 text-sm border border-border bg-card/80 text-muted-foreground disabled:opacity-50 hover:bg-secondary/60">
                {busy === kind ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 mr-2"/>}
                {label}
              </button>
            ))}
          </div>
        }
      />

      {!isPremium && (
        <div className="rounded-2xl border border-dashed border-emerald/40 bg-emerald/5 p-4 flex items-center gap-3" data-testid="reports-paywall">
          <Lock className="h-4 w-4 text-emerald" />
          <p className="text-sm">PDF reports are a Premium feature. <a href="/pricing" className="text-emerald hover:underline">Upgrade for £5/mo</a> to download monthly, yearly, and full snapshots.</p>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <SectionCard className="lg:col-span-2" contentClassName="pt-0">
          <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald" /><p className="label-overline">Health score</p></div>
          <div className="flex items-end gap-4 mt-4">
            <p className="text-7xl tracking-tight font-light leading-none">{data.health_score}</p>
            <p className="text-2xl tracking-tight text-muted-foreground mb-2">/ 100</p>
          </div>
          <div className="h-3 bg-secondary rounded-full mt-6 overflow-hidden">
            <div className="h-full gradient-emerald" style={{width: `${data.health_score}%`}} />
          </div>
          <p className="text-sm text-muted-foreground mt-4 leading-relaxed">
            Your savings rate is <span className="text-emerald font-medium">{data.savings_rate}%</span>. {data.savings_rate >= 20 ? "Excellent discipline." : data.savings_rate >= 10 ? "Solid — push for 20%." : "Tighten discretionary spend this month."}
          </p>
        </SectionCard>

        <SectionCard contentClassName="space-y-4">
          <ReportRow icon={TrendingDown} title="Top spend" value={topSpend ? `${topSpend.name} · £${topSpend.value.toFixed(0)}` : "—"} />
          <ReportRow icon={FileText} title="Subscriptions" value={subs ? `£${subs.value.toFixed(2)} / mo` : "None detected"} />
          <ReportRow icon={TrendingUp} title="Cash flow" value={`£${data.balance.toLocaleString()}`} />
        </SectionCard>
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

const ReportRow = ({icon: Icon, title, value}) => (
  <div className="flex items-center gap-3">
    <div className="w-10 h-10 rounded-xl bg-secondary grid place-items-center"><Icon className="h-4 w-4 text-emerald" /></div>
    <div className="flex-1"><p className="label-overline">{title}</p><p className="text-sm font-medium mt-0.5">{value}</p></div>
  </div>
);
