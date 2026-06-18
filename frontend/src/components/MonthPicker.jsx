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
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <button
        onClick={onPrev}
        className="p-1 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
        aria-label="Previous month"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="text-base font-semibold min-w-[150px] text-center leading-snug">
        {label}
      </span>
      <button
        onClick={onNext}
        className="p-1 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
        aria-label="Next month"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
      {!isToday && onToday && (
        <button
          onClick={onToday}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
        >
          Back to today
        </button>
      )}
      {children}
    </div>
  );
}
