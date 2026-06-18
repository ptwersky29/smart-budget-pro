import React, { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

const YIDDISH = {
  "Nissan": "\u05e0\u05d9\u05e1\u05df",
  "Iyar": "\u05d0\u05d9\u05d9\u05e8",
  "Sivan": "\u05e1\u05d9\u05d5\u05df",
  "Tammuz": "\u05ea\u05de\u05d5\u05d6",
  "Av": "\u05d0\u05d1",
  "Elul": "\u05d0\u05dc\u05d5\u05dc",
  "Tishrei": "\u05ea\u05e9\u05e8\u05d9",
  "Cheshvan": "\u05de\u05e8\u05d7\u05e9\u05d5\u05df",
  "Kislev": "\u05db\u05e1\u05dc\u05d5",
  "Teves": "\u05d8\u05d1\u05ea",
  "Shevat": "\u05e9\u05d1\u05d8",
  "Adar": "\u05d0\u05d3\u05e8",
  "Adar 1": "\u05d0\u05d3\u05e8 \u05e8\u05d0\u05e9\u05d5\u05df",
  "Adar 2": "\u05d0\u05d3\u05e8 \u05e9\u05e0\u05d9",
};

export default React.memo(function MonthStrip({ selectedMonth, onMonthSelect }) {
  const [months, setMonths] = useState([]);
  const [loading, setLoading] = useState(true);
  const stripRef = useRef(null);
  const selectedRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    api.get("/jewish/hebcal/months")
      .then(({ data }) => { if (mounted) { setMonths(data.months || []); setLoading(false); } })
      .catch(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const centerSelected = useCallback(() => {
    if (!stripRef.current || !selectedRef.current) return;
    const container = stripRef.current;
    const selected = selectedRef.current;
    container.scrollLeft =
      selected.offsetLeft - container.clientWidth / 2 + selected.offsetWidth / 2;
  }, []);

  useEffect(() => {
    if (!loading && months.length > 0) {
      const timer = setTimeout(centerSelected, 80);
      return () => clearTimeout(timer);
    }
  }, [selectedMonth, loading, months, centerSelected]);

  useEffect(() => {
    const onResize = () => centerSelected();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [centerSelected]);

  const scrollTo = useCallback((dir) => {
    if (!stripRef.current) return;
    const amount = dir === "left" ? -300 : 300;
    stripRef.current.scrollBy({ left: amount, behavior: "smooth" });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-12 rounded-xl border border-border bg-card/50">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (months.length === 0) return null;

  return (
    <div className="relative group">
      {/* Chevron buttons */}
      <button
        onClick={() => scrollTo("left")}
        className="absolute left-0 top-0 bottom-0 z-10 w-8 flex items-center justify-center bg-gradient-to-r from-background to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Scroll left"
      >
        <ChevronLeft className="h-4 w-4 text-muted-foreground" />
      </button>
      <button
        onClick={() => scrollTo("right")}
        className="absolute right-0 top-0 bottom-0 z-10 w-8 flex items-center justify-center bg-gradient-to-l from-background to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Scroll right"
      >
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </button>

      {/* Strip */}
      <div
        ref={stripRef}
        className="flex gap-1 overflow-x-auto scroll-smooth scrollbar-hide border-b border-border"
      >
        {months.map((m) => {
          const isSelected =
            selectedMonth?.hebrew_month === m.hebrew_month &&
            selectedMonth?.hebrew_year === m.hebrew_year;
          return (
            <button
              key={`${m.hebrew_year}-${m.hebrew_month}`}
              ref={isSelected ? selectedRef : null}
              data-selected={isSelected}
              onClick={() => onMonthSelect(m)}
              className={`relative shrink-0 px-4 py-2.5 text-xs font-medium whitespace-nowrap transition-colors
                ${isSelected ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <span className="tabular-nums">
                <span dir="rtl" lang="he" className="inline-block">{YIDDISH[m.month_name] || m.month_name}</span>
                {" "}{m.hebrew_year}
              </span>
              {isSelected && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-emerald rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
});
