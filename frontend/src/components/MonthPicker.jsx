import { ChevronLeft, ChevronRight } from "lucide-react";

export const YIDDISH = {
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

export default function MonthPicker({ label, onPrev, onNext, onToday, isToday, children }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex h-[36px] items-center rounded-[10px] border border-border bg-card px-1 shadow-[0_1px_2px_hsl(var(--foreground)/0.03)]">
        <button
          type="button"
          onClick={onPrev}
          className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="min-w-[112px] px-1 text-center text-[12px] font-medium">
          {label}
        </span>
        <button
          type="button"
          onClick={onNext}
          className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          aria-label="Next month"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      {!isToday && onToday && (
        <button
          type="button"
          onClick={onToday}
          className="text-[11px] font-medium text-muted-foreground transition hover:text-foreground"
        >
          Back to today
        </button>
      )}
      {children}
    </div>
  );
}
