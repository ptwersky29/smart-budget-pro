import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { api, formatApiError } from "../lib/api";
import {
  BarChart3,
  Loader2,
  X,
  TrendingUp,
  TrendingDown,
  Minus,
  CalendarDays,
  Search,
  ArrowRight,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import CategoryBadge from "./CategoryBadge";
import { formatCurrency, formatShortDate } from "../lib/format";

function toIsoString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getPresetDates(presetKey) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  if (presetKey === "this_month") {
    const aFrom = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    const aTo = toIsoString(now);

    const prevMonthStart = new Date(y, m - 1, 1);
    const prevMonthEnd = new Date(y, m, 0);
    const bFrom = toIsoString(prevMonthStart);
    const bTo = toIsoString(prevMonthEnd);

    return { aFrom, aTo, bFrom, bTo, aName: "This Month", bName: "Last Month" };
  }

  if (presetKey === "last_30_days") {
    const aToDate = new Date();
    const aFromDate = new Date();
    aFromDate.setDate(aFromDate.getDate() - 29);

    const bToDate = new Date();
    bToDate.setDate(bToDate.getDate() - 30);
    const bFromDate = new Date();
    bFromDate.setDate(bFromDate.getDate() - 59);

    return {
      aFrom: toIsoString(aFromDate),
      aTo: toIsoString(aToDate),
      bFrom: toIsoString(bFromDate),
      bTo: toIsoString(bToDate),
      aName: "Last 30 Days",
      bName: "Prior 30 Days",
    };
  }

  if (presetKey === "quarter") {
    const q = Math.floor(m / 3);
    const aFromDate = new Date(y, q * 3, 1);
    const aToDate = now;

    const prevQStart = new Date(y, (q - 1) * 3, 1);
    const prevQEnd = new Date(y, q * 3, 0);

    return {
      aFrom: toIsoString(aFromDate),
      aTo: toIsoString(aToDate),
      bFrom: toIsoString(prevQStart),
      bTo: toIsoString(prevQEnd),
      aName: `Q${q + 1} ${y}`,
      bName: `Q${q === 0 ? 4 : q} ${q === 0 ? y - 1 : y}`,
    };
  }

  if (presetKey === "year") {
    const aFrom = `${y}-01-01`;
    const aTo = toIsoString(now);
    const bFrom = `${y - 1}-01-01`;
    const bTo = `${y - 1}-12-31`;

    return { aFrom, aTo, bFrom, bTo, aName: `${y} YTD`, bName: `${y - 1}` };
  }

  return null;
}

function SpendChangeBadge({ pct }) {
  if (pct == null || isNaN(pct)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        <Minus className="h-3 w-3" /> No change
      </span>
    );
  }
  const isLowerSpend = pct < 0;
  if (pct === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        <Minus className="h-3 w-3" /> 0.0%
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
        isLowerSpend
          ? "bg-emerald/10 text-emerald"
          : "bg-ruby/10 text-ruby"
      }`}
    >
      {isLowerSpend ? (
        <TrendingDown className="h-3 w-3" />
      ) : (
        <TrendingUp className="h-3 w-3" />
      )}
      {isLowerSpend ? "" : "+"}
      {pct.toFixed(1)}%
    </span>
  );
}

function IncomeChangeBadge({ pct }) {
  if (pct == null || isNaN(pct)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        <Minus className="h-3 w-3" /> No change
      </span>
    );
  }
  const isHigherIncome = pct > 0;
  if (pct === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        <Minus className="h-3 w-3" /> 0.0%
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
        isHigherIncome
          ? "bg-emerald/10 text-emerald"
          : "bg-ruby/10 text-ruby"
      }`}
    >
      {isHigherIncome ? (
        <TrendingUp className="h-3 w-3" />
      ) : (
        <TrendingDown className="h-3 w-3" />
      )}
      {isHigherIncome ? "+" : ""}
      {pct.toFixed(1)}%
    </span>
  );
}

export default function ComparePeriods({ open, onClose }) {
  const initialPreset = "this_month";
  const initialDates = useMemo(() => getPresetDates(initialPreset), []);

  const [preset, setPreset] = useState(initialPreset);
  const [aFrom, setAFrom] = useState(initialDates.aFrom);
  const [aTo, setATo] = useState(initialDates.aTo);
  const [bFrom, setBFrom] = useState(initialDates.bFrom);
  const [bTo, setBTo] = useState(initialDates.bTo);
  const [aLabel, setALabel] = useState(initialDates.aName);
  const [bLabel, setBLabel] = useState(initialDates.bName);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [categorySearch, setCategorySearch] = useState("");

  const runComparison = useCallback(async (af, at, bf, bt) => {
    setLoading(true);
    try {
      const { data } = await api.get("/analytics/compare-periods", {
        params: {
          period_a_from: af,
          period_a_to: at,
          period_b_from: bf,
          period_b_to: bt,
        },
      });
      setResult(data);
    } catch (e) {
      toast.error(
        formatApiError(e?.response?.data?.detail) || "Comparison failed",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      const dates = getPresetDates("this_month");
      setPreset("this_month");
      setAFrom(dates.aFrom);
      setATo(dates.aTo);
      setBFrom(dates.bFrom);
      setBTo(dates.bTo);
      setALabel(dates.aName);
      setBLabel(dates.bName);
      setCategorySearch("");
      runComparison(dates.aFrom, dates.aTo, dates.bFrom, dates.bTo);
    }
  }, [open, runComparison]);

  const handleSelectPreset = (key) => {
    setPreset(key);
    if (key === "custom") return;
    const dates = getPresetDates(key);
    if (!dates) return;
    setAFrom(dates.aFrom);
    setATo(dates.aTo);
    setBFrom(dates.bFrom);
    setBTo(dates.bTo);
    setALabel(dates.aName);
    setBLabel(dates.bName);
    runComparison(dates.aFrom, dates.aTo, dates.bFrom, dates.bTo);
  };

  const handleApplyCustom = (e) => {
    e?.preventDefault?.();
    if (!aFrom || !aTo || !bFrom || !bTo) {
      toast.error("Please specify all dates");
      return;
    }
    setALabel("Period A");
    setBLabel("Period B");
    runComparison(aFrom, aTo, bFrom, bTo);
  };

  const filteredCategories = useMemo(() => {
    if (!result?.category_breakdown) return [];
    const search = categorySearch.trim().toLowerCase();
    if (!search) return result.category_breakdown;
    return result.category_breakdown.filter((cat) =>
      cat.category.toLowerCase().includes(search),
    );
  }, [result?.category_breakdown, categorySearch]);

  const maxCategorySpend = useMemo(() => {
    if (!result?.category_breakdown?.length) return 1;
    let max = 1;
    result.category_breakdown.forEach((c) => {
      if (c.a_spend > max) max = c.a_spend;
      if (c.b_spend > max) max = c.b_spend;
    });
    return max;
  }, [result?.category_breakdown]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const spendDiff = result ? result.period_a.spend - result.period_b.spend : 0;
  const incomeDiff = result ? result.period_a.income - result.period_b.income : 0;

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Compare periods"
    >
      <div
        className="my-auto rounded-2xl border border-border bg-card shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-[fadeUp_0.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4 bg-card/80">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-topaz/10 text-topaz">
              <BarChart3 className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-base font-semibold tracking-tight text-foreground">
                Compare Periods
              </h3>
              <p className="text-xs text-muted-foreground">
                Side-by-side spending and income trend analysis
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Preset Selector Bar */}
        <div className="border-b border-border bg-secondary/20 px-5 py-2.5 flex flex-wrap items-center gap-1.5">
          {[
            { id: "this_month", label: "This Month vs Last" },
            { id: "last_30_days", label: "Last 30 Days" },
            { id: "quarter", label: "Quarterly" },
            { id: "year", label: "Year-to-Date" },
            { id: "custom", label: "Custom Dates" },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelectPreset(item.id)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                preset === item.id
                  ? "bg-foreground text-background shadow-sm"
                  : "bg-card text-muted-foreground border border-border hover:text-foreground hover:bg-secondary/60"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Custom Range Inputs (if preset === 'custom') */}
        {preset === "custom" && (
          <form
            onSubmit={handleApplyCustom}
            className="border-b border-border bg-secondary/10 px-5 py-3.5 space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl border border-border bg-card p-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-2">
                  Period A (Current)
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-1">
                      From
                    </label>
                    <Input
                      type="date"
                      value={aFrom}
                      onChange={(e) => setAFrom(e.target.value)}
                      className="h-8 text-xs"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-1">
                      To
                    </label>
                    <Input
                      type="date"
                      value={aTo}
                      onChange={(e) => setATo(e.target.value)}
                      className="h-8 text-xs"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-2">
                  Period B (Comparison)
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-1">
                      From
                    </label>
                    <Input
                      type="date"
                      value={bFrom}
                      onChange={(e) => setBFrom(e.target.value)}
                      className="h-8 text-xs"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-1">
                      To
                    </label>
                    <Input
                      type="date"
                      value={bTo}
                      onChange={(e) => setBTo(e.target.value)}
                      className="h-8 text-xs"
                      required
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={loading}
                className="h-8 text-xs font-semibold gap-1.5"
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <BarChart3 className="h-3.5 w-3.5" />
                )}
                {loading ? "Comparing..." : "Apply Range"}
              </Button>
            </div>
          </form>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading ? (
            <div className="py-16 text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-topaz" />
              <p className="text-sm font-medium text-muted-foreground">
                Crunching comparative figures...
              </p>
            </div>
          ) : result ? (
            <>
              {/* Comparative Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Period A */}
                <div className="rounded-2xl border border-border bg-card/60 p-4 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="inline-block rounded-md bg-topaz/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-topaz">
                        {aLabel}
                      </span>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatShortDate(aFrom)} – {formatShortDate(aTo)}
                      </p>
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">
                      {result.period_a.count} txs
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/60">
                    <div>
                      <span className="text-[11px] text-muted-foreground block">
                        Spend
                      </span>
                      <span className="text-lg font-bold text-ruby money-tabular">
                        {formatCurrency(result.period_a.spend)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-muted-foreground block">
                        Income
                      </span>
                      <span className="text-lg font-bold text-emerald money-tabular">
                        {formatCurrency(result.period_a.income)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-2 border-t border-border/40">
                    <span className="text-muted-foreground">Net Cash Flow</span>
                    <span
                      className={`font-semibold money-tabular ${
                        result.period_a.income - result.period_a.spend >= 0
                          ? "text-emerald"
                          : "text-ruby"
                      }`}
                    >
                      {formatCurrency(
                        result.period_a.income - result.period_a.spend,
                        { signed: true },
                      )}
                    </span>
                  </div>
                </div>

                {/* Period B */}
                <div className="rounded-2xl border border-border bg-card/60 p-4 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="inline-block rounded-md bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {bLabel}
                      </span>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatShortDate(bFrom)} – {formatShortDate(bTo)}
                      </p>
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">
                      {result.period_b.count} txs
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/60">
                    <div>
                      <span className="text-[11px] text-muted-foreground block">
                        Spend
                      </span>
                      <span className="text-lg font-bold text-ruby money-tabular">
                        {formatCurrency(result.period_b.spend)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-muted-foreground block">
                        Income
                      </span>
                      <span className="text-lg font-bold text-emerald money-tabular">
                        {formatCurrency(result.period_b.income)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-2 border-t border-border/40">
                    <span className="text-muted-foreground">Net Cash Flow</span>
                    <span
                      className={`font-semibold money-tabular ${
                        result.period_b.income - result.period_b.spend >= 0
                          ? "text-emerald"
                          : "text-ruby"
                      }`}
                    >
                      {formatCurrency(
                        result.period_b.income - result.period_b.spend,
                        { signed: true },
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Delta highlights */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-border bg-secondary/25 p-3 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-medium text-muted-foreground block">
                      Spending Variance
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {spendDiff <= 0 ? "Saved " : "Spent extra "}
                      <span className="font-semibold text-foreground">
                        {formatCurrency(Math.abs(spendDiff))}
                      </span>
                    </span>
                  </div>
                  <SpendChangeBadge pct={result.spend_change_pct} />
                </div>

                <div className="rounded-xl border border-border bg-secondary/25 p-3 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-medium text-muted-foreground block">
                      Income Variance
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {incomeDiff >= 0 ? "Increased by " : "Decreased by "}
                      <span className="font-semibold text-foreground">
                        {formatCurrency(Math.abs(incomeDiff))}
                      </span>
                    </span>
                  </div>
                  <IncomeChangeBadge pct={result.income_change_pct} />
                </div>
              </div>

              {/* Category Breakdown */}
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-4 border-b border-border bg-secondary/10">
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Category Breakdown
                    </h4>
                    <p className="text-[11px] text-muted-foreground">
                      Showing category-level spending changes
                    </p>
                  </div>
                  <div className="relative w-full sm:w-48">
                    <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <Input
                      type="text"
                      placeholder="Filter categories..."
                      value={categorySearch}
                      onChange={(e) => setCategorySearch(e.target.value)}
                      className="h-8 pl-8 text-xs bg-background"
                    />
                  </div>
                </div>

                {filteredCategories.length === 0 ? (
                  <div className="py-12 text-center text-xs text-muted-foreground">
                    No matching categories found in this comparison.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border text-left text-[11px] font-medium text-muted-foreground bg-secondary/5">
                          <th className="py-2.5 px-4 font-medium">Category</th>
                          <th className="py-2.5 px-3 text-right font-medium">
                            {aLabel}
                          </th>
                          <th className="py-2.5 px-3 text-right font-medium">
                            {bLabel}
                          </th>
                          <th className="py-2.5 px-3 text-right font-medium">
                            Variance
                          </th>
                          <th className="py-2.5 px-4 text-right font-medium">
                            Change
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {filteredCategories.map((cat) => {
                          const diff = cat.a_spend - cat.b_spend;
                          const aWidthPct = Math.min(
                            100,
                            Math.round((cat.a_spend / maxCategorySpend) * 100),
                          );
                          const bWidthPct = Math.min(
                            100,
                            Math.round((cat.b_spend / maxCategorySpend) * 100),
                          );

                          return (
                            <tr
                              key={cat.category}
                              className="hover:bg-secondary/20 transition-colors"
                            >
                              <td className="py-2.5 px-4">
                                <div className="space-y-1">
                                  <CategoryBadge
                                    category={cat.category}
                                    size="sm"
                                  />
                                  <div className="flex items-center gap-1.5 pt-0.5 max-w-[140px]">
                                    <div className="h-1 w-full bg-secondary rounded-full overflow-hidden flex">
                                      <div
                                        className="bg-ruby/80 h-full rounded-full transition-all"
                                        style={{ width: `${aWidthPct}%` }}
                                        title={`${aLabel}: ${formatCurrency(cat.a_spend)}`}
                                      />
                                    </div>
                                    <div className="h-1 w-full bg-secondary rounded-full overflow-hidden flex">
                                      <div
                                        className="bg-muted-foreground/40 h-full rounded-full transition-all"
                                        style={{ width: `${bWidthPct}%` }}
                                        title={`${bLabel}: ${formatCurrency(cat.b_spend)}`}
                                      />
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right font-semibold text-foreground money-tabular">
                                {formatCurrency(cat.a_spend)}
                              </td>
                              <td className="py-2.5 px-3 text-right text-muted-foreground money-tabular">
                                {formatCurrency(cat.b_spend)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-medium money-tabular">
                                <span
                                  className={
                                    diff > 0
                                      ? "text-ruby"
                                      : diff < 0
                                        ? "text-emerald"
                                        : "text-muted-foreground"
                                  }
                                >
                                  {diff > 0 ? "+" : ""}
                                  {formatCurrency(diff)}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 text-right">
                                <SpendChangeBadge pct={cat.change_pct} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Select a date range to generate a comparison.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-3 bg-card flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {result
              ? `Comparing ${result.period_a.count + result.period_b.count} total records`
              : "Ready"}
          </span>
          <Button
            type="button"
            variant="outlinePill"
            size="sm"
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
