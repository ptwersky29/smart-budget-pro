import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { cn } from "../../lib/utils";

export const Surface = React.forwardRef(function Surface(
  { as: Comp = "div", className, padded = false, children, ...props },
  ref,
) {
  return (
    <Comp
      ref={ref}
      className={cn("surface", padded && "p-5 sm:p-6", className)}
      {...props}
    >
      {children}
    </Comp>
  );
});

export function SurfaceHeader({
  title,
  subtitle,
  actions,
  icon: Icon,
  className,
  compact = false,
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4",
        compact ? "px-4 py-3 sm:px-5" : "p-5 pb-0 sm:p-6 sm:pb-0",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald/10 text-emerald">
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
        <div className="min-w-0">
          {title ? (
            <h2 className="truncate text-[15px] font-semibold tracking-[-0.02em]">
              {title}
            </h2>
          ) : null}
          {subtitle ? (
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  backTo,
  onBack,
  className,
  children,
}) {
  const backControl = backTo ? (
    <Link
      to={backTo}
      className="grid h-9 w-9 place-items-center rounded-full border border-border/70 bg-card text-muted-foreground transition hover:text-foreground"
      aria-label="Go back"
    >
      <ArrowLeft className="h-4 w-4" />
    </Link>
  ) : onBack ? (
    <button
      type="button"
      onClick={onBack}
      className="grid h-9 w-9 place-items-center rounded-full border border-border/70 bg-card text-muted-foreground transition hover:text-foreground"
      aria-label="Go back"
    >
      <ArrowLeft className="h-4 w-4" />
    </button>
  ) : null;

  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {backControl}
        <div className="min-w-0">
          {eyebrow ? (
            <p className="label-overline text-emerald">{eyebrow}</p>
          ) : null}
          <h1 className="text-[clamp(1.55rem,2.4vw,2.15rem)] font-semibold leading-[1.1] tracking-[-0.045em]">
            {title}
          </h1>
          {description ? (
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
          {children}
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
      ) : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "emerald",
  delta,
  deltaTone = "neutral",
  children,
  className,
  testid,
}) {
  const tones = {
    emerald: "bg-emerald/10 text-emerald",
    topaz: "bg-topaz/10 text-topaz",
    ruby: "bg-ruby/10 text-ruby",
    blue: "bg-blue-500/10 text-blue-500",
    violet: "bg-violet-500/10 text-violet-500",
  };
  const deltaTones = {
    up: "text-emerald",
    down: "text-ruby",
    neutral: "text-muted-foreground",
  };

  return (
    <div
      data-testid={testid}
      className={cn(
        "surface surface-hover flex min-w-0 flex-col p-4 sm:p-[1.1rem]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </p>
        {Icon ? (
          <span className={cn("grid h-8 w-8 place-items-center rounded-xl", tones[tone] || tones.emerald)}>
            <Icon className="h-3.5 w-3.5" />
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex min-w-0 items-baseline gap-2">
        <p className="money-tabular truncate text-[clamp(1.35rem,2.4vw,1.8rem)] font-semibold leading-none">
          {value}
        </p>
        {delta ? (
          <span className={cn("shrink-0 text-[11px] font-semibold", deltaTones[deltaTone] || deltaTones.neutral)}>
            {delta}
          </span>
        ) : null}
      </div>
      {detail ? (
        <p className="mt-1.5 truncate text-[11px] text-muted-foreground">{detail}</p>
      ) : null}
      {children ? <div className="mt-auto pt-3">{children}</div> : null}
    </div>
  );
}

export function IconWell({ icon: Icon, tone = "emerald", className }) {
  const tones = {
    emerald: "bg-emerald/10 text-emerald",
    topaz: "bg-topaz/10 text-topaz",
    ruby: "bg-ruby/10 text-ruby",
    blue: "bg-blue-500/10 text-blue-500",
    neutral: "bg-secondary text-muted-foreground",
  };
  return (
    <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", tones[tone] || tones.emerald, className)}>
      <Icon className="h-4 w-4" />
    </span>
  );
}

export function SegmentedControl({ value, onChange, options, className }) {
  return (
    <div className={cn("inline-flex items-center rounded-full border border-border/70 bg-secondary/50 p-0.5", className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "h-7 rounded-full px-3 text-[11px] font-medium transition-colors",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={active}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function EmptyPanel({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-10 text-center", className)}>
      {Icon ? (
        <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-emerald/10 text-emerald">
          <Icon className="h-5 w-5" />
        </span>
      ) : null}
      <p className="text-sm font-semibold">{title}</p>
      {description ? (
        <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
