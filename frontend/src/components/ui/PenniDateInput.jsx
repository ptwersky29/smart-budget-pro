import * as React from "react";
import { CalendarDays, ChevronDown, X } from "lucide-react";
import { format, isValid, parseISO } from "date-fns";
import { cn } from "../../lib/utils";
import { Calendar } from "./calendar";
import { Popover, PopoverTrigger, PopoverContent } from "./popover";
import "./penni-calendar.css";

/** Shared calendar field used by transaction forms, budget dates and date filters.
 * Values remain YYYY-MM-DD and onChange retains the input-style event contract.
 */
const PenniDateInput = React.forwardRef(function PenniDateInput({
  value = "", onChange, onValueChange, className, id, name, disabled,
  placeholder = "Choose date", "aria-label": ariaLabel, min, max,
  required, onBlur, autoFocus, ...rest
}, ref) {
  const [open, setOpen] = React.useState(false);
  const parsed = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseISO(value) : undefined;
  const selected = parsed && isValid(parsed) ? parsed : undefined;
  const minDate = min && isValid(parseISO(min)) ? parseISO(min) : undefined;
  const maxDate = max && isValid(parseISO(max)) ? parseISO(max) : undefined;
  const [month, setMonth] = React.useState(selected || new Date());

  React.useEffect(() => {
    if (open) setMonth(selected || new Date());
  }, [open, value]);

  const select = (date) => {
    if (!date) return;
    const next = format(date, "yyyy-MM-dd");
    onChange?.({ target: { value: next, name, id }, currentTarget: { value: next, name, id } });
    onValueChange?.(next);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          {...rest}
          ref={ref}
          id={id}
          type="button"
          disabled={disabled}
          autoFocus={autoFocus}
          onBlur={onBlur}
          aria-label={ariaLabel || "Choose date"}
          aria-required={required || undefined}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={cn(
            "penni-date-trigger flex h-11 min-w-0 w-full items-center gap-2 rounded-xl border border-border/70 bg-card px-3 text-left text-sm text-foreground shadow-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
        >
          <CalendarDays className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className={cn("min-w-0 flex-1 truncate", !selected && "text-muted-foreground")}>
            {selected ? format(selected, "dd MMM yyyy") : placeholder}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      {name && <input type="hidden" name={name} value={value || ""} />}
      <PopoverContent
        side="bottom" align="start" sideOffset={8} collisionPadding={12} style={{ zIndex: 10060 }}
        className="penni-calendar-popover w-auto max-w-[calc(100vw-24px)] rounded-[20px] border border-border/80 bg-popover p-3 shadow-[0_18px_55px_rgba(36,28,89,.17)]"
      >
        <Calendar
          mode="single"
          selected={selected}
          month={month}
          onMonthChange={setMonth}
          onSelect={select}
          disabled={date => (minDate && date < minDate) || (maxDate && date > maxDate)}
          initialFocus
          className="penni-calendar-widget p-1"
        />
        <div className="mt-2 flex items-center justify-between border-t border-border/70 pt-2">
          <button type="button" className="rounded-lg px-3 py-2 text-xs font-medium text-primary hover:bg-primary/10"
            onClick={() => { const today = new Date(); if ((!minDate || today >= minDate) && (!maxDate || today <= maxDate)) select(today); }}>Today</button>
          {value && !required && <button type="button" className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-secondary"
            onClick={() => { onChange?.({ target: { value: "", name, id }, currentTarget: { value: "", name, id } }); onValueChange?.(""); setOpen(false); }}>
            <X className="h-3 w-3" /> Clear
          </button>}
        </div>
      </PopoverContent>
    </Popover>
  );
});

export default PenniDateInput;
