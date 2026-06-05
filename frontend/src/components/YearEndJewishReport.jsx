import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { Download, Loader2, TrendingDown, TrendingUp, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "../components/ui/button";

/**
 * Year-End Jewish Finance Report Component
 * Displays comprehensive Maaser and Holiday budget summaries for the year
 */
export default function YearEndJewishReport({ year }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const currentYear = year || new Date().getFullYear();

  useEffect(() => {
    const loadReport = async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/jewish/reports/jewish-finance-year-end?year=${currentYear}`);
        setReport(data);
      } catch (error) {
        toast.error("Could not load year-end report");
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    loadReport();
  }, [currentYear]);

  const handleDownloadPDF = async () => {
    setDownloading(true);
    try {
      const response = await api.get(
        `/jewish/reports/download/year-end-${currentYear}.pdf`,
        { responseType: "blob" }
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `jewish-finance-${currentYear}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success("Report downloaded");
    } catch (error) {
      toast.error("Could not download report");
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return <div className="h-32 bg-secondary/40 rounded-xl animate-pulse" />;
  }

  if (!report) {
    return (
      <div className="rounded-xl border-2 border-dashed border-border p-8 text-center">
        <AlertCircle className="h-10 w-10 mx-auto mb-2 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">No report available for {currentYear}</p>
      </div>
    );
  }

  const maaser = report.sections.maaser;
  const holidays = report.sections.holidays;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Year-End Report {currentYear}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Generated {new Date(report.generated_at).toLocaleDateString()}
          </p>
        </div>
        <Button
          variant="primary" size="pill"
          onClick={handleDownloadPDF}
          disabled={downloading}
        >
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Download PDF
        </Button>
      </div>

      {/* Maaser Section */}
      <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl p-6 shadow-card">
        <h3 className="text-lg font-semibold mb-4">Maaser & Tzedakah ({maaser.percent}%)</h3>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="rounded-xl border border-border bg-secondary/30 p-4 text-center">
            <p className="label-overline">Income</p>
            <p className="mt-2 text-2xl font-semibold text-emerald">£{maaser.total_income.toFixed(2)}</p>
          </div>
          <div className="rounded-xl border border-border bg-secondary/30 p-4 text-center">
            <p className="label-overline">Obligation</p>
            <p className="mt-2 text-2xl font-semibold text-topaz">£{maaser.obligation.toFixed(2)}</p>
          </div>
          <div className="rounded-xl border border-border bg-secondary/30 p-4 text-center">
            <p className="label-overline">Given</p>
            <p className="mt-2 text-2xl font-semibold text-emerald">£{maaser.total_given.toFixed(2)}</p>
          </div>
          <div className={`rounded-xl border border-border bg-secondary/30 p-4 text-center`}>
            <p className="label-overline">Status</p>
            <p className={`mt-2 text-lg font-semibold capitalize ${
              maaser.status === "fulfilled" ? "text-emerald" :
              maaser.status === "overfunded" ? "text-emerald" :
              "text-ruby"
            }`}>
              {maaser.status}
            </p>
          </div>
        </div>

        {/* Balance */}
        {maaser.balance_owed > 0 && (
          <div className="rounded-xl border-l-4 border-l-ruby bg-ruby/5 p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-ruby shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-ruby">Balance Outstanding</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                You are still obligated for <strong>£{maaser.balance_owed.toFixed(2)}</strong>
              </p>
            </div>
          </div>
        )}

        {maaser.credit > 0 && (
          <div className="rounded-xl border-l-4 border-l-emerald bg-emerald/5 p-4 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-emerald">Over-fulfilled</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                You have given <strong>£{maaser.credit.toFixed(2)}</strong> more than obligated
              </p>
            </div>
          </div>
        )}

        {/* Monthly Breakdown */}
        {Object.keys(maaser.monthly_breakdown).length > 0 && (
          <div className="mt-6">
            <h4 className="font-medium text-sm mb-3">Monthly Breakdown</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-2">Month</th>
                    <th className="text-right py-2">Income</th>
                    <th className="text-right py-2">Given</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(maaser.monthly_breakdown).map(([month, data]) => (
                    <tr key={month} className="border-b border-border/50">
                      <td className="py-2">{new Date(month + "-01").toLocaleDateString("en-US", { month: "long", year: "numeric" })}</td>
                      <td className="text-right">£{data.income.toFixed(2)}</td>
                      <td className="text-right text-emerald font-medium">£{data.given.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Holiday Budgets Section */}
      {holidays.holidays.length > 0 && (
        <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl p-6 shadow-card">
          <h3 className="text-lg font-semibold mb-4">Holiday Budgets</h3>

          {/* Summary KPIs */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="rounded-xl border border-border bg-secondary/30 p-4 text-center">
              <p className="label-overline">Budgeted</p>
              <p className="mt-2 text-xl font-semibold">£{holidays.summary.total_budgeted.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-border bg-secondary/30 p-4 text-center">
              <p className="label-overline">Spent</p>
              <p className="mt-2 text-xl font-semibold text-topaz">£{holidays.summary.total_spent.toFixed(2)}</p>
            </div>
            <div className={`rounded-xl border border-border bg-secondary/30 p-4 text-center`}>
              <p className="label-overline">Balance</p>
              <p className={`mt-2 text-xl font-semibold ${
                holidays.summary.total_balance >= 0 ? "text-emerald" : "text-ruby"
              }`}>
                £{Math.abs(holidays.summary.total_balance).toFixed(2)}
              </p>
            </div>
          </div>

          {/* Holiday Items */}
          <div className="space-y-3">
            {holidays.holidays.map((holiday) => (
              <div key={holiday.name} className="rounded-xl border border-border p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-medium capitalize">{holiday.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {holiday.percentage}% of budget spent
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    holiday.status === "within"
                      ? "bg-emerald/10 text-emerald"
                      : "bg-ruby/10 text-ruby"
                  }`}>
                    {holiday.status === "within" ? "Within budget" : "Over budget"}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="flex-1">
                    <div className="bg-secondary rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          holiday.status === "within" ? "bg-emerald" : "bg-ruby"
                        }`}
                        style={{ width: `${Math.min(holiday.percentage, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right whitespace-nowrap">
                    <p className="font-medium">£{holiday.spent.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">of £{holiday.budgeted.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
