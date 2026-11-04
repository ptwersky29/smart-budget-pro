import React, { useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

/**
 * Penni-styled replacement for HTML select. Supports existing <option> and
 * <optgroup> children and the native onChange({target:{value,name}}) contract.
 */
export default function PenniSelect({
  children, value, defaultValue = "", onChange, className = "", disabled,
  name, id, required, title, "aria-label": ariaLabel, placeholder,
  ...rest
}) {
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listboxId = React.useId();
  const options = useMemo(() => {
    const items = [];
    const walk = (nodes, group = "") => {
      React.Children.forEach(nodes, (node) => {
        if (!React.isValidElement(node)) return;
        if (node.type === React.Fragment) return walk(node.props.children, group);
        if (node.type === "optgroup") return walk(node.props.children, node.props.label || "");
        if (node.type !== "option") return;
        const label = String(node.props.label ?? flatten(node.props.children));
        items.push({
          value: String(node.props.value ?? label),
          label, group, disabled: Boolean(node.props.disabled),
        });
      });
    };
    walk(children);
    return items;
  }, [children]);
  const current = String(value !== undefined && value !== null ? value : uncontrolled);
  const selected = options.find((option) => option.value === current);
  const visible = options.filter((option) =>
    !query || (option.label + " " + option.group).toLowerCase().includes(query.toLowerCase())
  );
  const choose = (next) => {
    if (value === undefined) setUncontrolled(next);
    onChange?.({ target: { value: next, name, id } });
    setOpen(false);
    setQuery("");
  };
  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(""); }}>
      <PopoverTrigger asChild>
        <button type="button" id={id} name={name} title={title} disabled={disabled}
          role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listboxId : undefined}
          aria-label={ariaLabel || title || name || "Choose option"}
          aria-required={required || undefined}
          className={`flex min-w-0 items-center justify-between gap-2 text-left ${className || "h-10 w-full rounded-xl border border-border bg-card px-3 text-sm"}`}
          {...rest}>
          <span className={`min-w-0 flex-1 truncate ${selected ? "" : "text-muted-foreground"}`}>{selected?.label || placeholder || "Select..."}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" collisionPadding={12} avoidCollisions sideOffset={5}
        className="z-[100] w-[var(--radix-popover-trigger-width)] min-w-[min(200px,90vw)] max-w-[min(90vw,360px)] max-h-[min(75dvh,var(--radix-popover-content-available-height))] overflow-y-auto rounded-xl border border-border bg-popover p-1.5 shadow-xl">
        {options.length > 7 && (
          <div className="mb-1 flex h-9 items-center gap-2 rounded-lg border border-border bg-secondary/40 px-2.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()} placeholder="Search options..."
              aria-label="Search options"
              className="w-full min-w-0 bg-transparent text-xs outline-none placeholder:text-muted-foreground" />
          </div>
        )}
        <div id={listboxId} role="listbox" aria-label={ariaLabel || title || name || "Options"}
          onKeyDown={(event) => {
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
            const items = Array.from(event.currentTarget.querySelectorAll('[role="option"]:not([disabled])'));
            if (!items.length) return;
            const currentIndex = items.indexOf(document.activeElement);
            const nextIndex = event.key === "Home" ? 0 :
              event.key === "End" ? items.length - 1 :
              event.key === "ArrowDown" ? Math.min(currentIndex + 1, items.length - 1) :
              Math.max(currentIndex - 1, 0);
            event.preventDefault();
            items[nextIndex]?.focus();
          }}
          className="subtle-scroll max-h-[min(55vh,340px)] overflow-y-auto overscroll-contain">
          {visible.map((option, index) => (
            <React.Fragment key={option.value + ":" + index}>
              {option.group && (index === 0 || option.group !== visible[index - 1].group) &&
                <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{option.group}</p>}
              <button type="button" role="option" aria-selected={current === option.value}
                disabled={option.disabled} onClick={() => choose(option.value)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-emerald/10 focus-visible:bg-emerald/10 disabled:opacity-40 ${current === option.value ? "bg-emerald/10 font-semibold text-emerald" : "text-foreground"}`}>
                <span className="min-w-0 break-words">{option.label}</span>
                {current === option.value && <Check className="h-4 w-4 shrink-0" />}
              </button>
            </React.Fragment>
          ))}
          {visible.length === 0 && <p className="p-4 text-center text-xs text-muted-foreground">No matching options</p>}
        </div>
      </PopoverContent>
      {name && <input type="hidden" name={name} value={current} />}
    </Popover>
  );
}
function flatten(node) {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flatten).join("");
  return React.isValidElement(node) ? flatten(node.props.children) : "";
}
