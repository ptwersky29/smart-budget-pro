import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "./button";

export const PageToolbar = React.memo(function PageToolbar({ children, className = "", ...props }) {
  return (
    <div {...props} className={`relative flex flex-wrap items-center gap-2 ${className}`}>
      {children}
    </div>
  );
});

export const SectionCard = React.memo(function SectionCard({ eyebrow, title, description, actions, children, className = "", contentClassName = "", ...props }) {
  return (
    <section {...props} className={`glass-panel rounded-[1.5rem] ${className}`}>
      {(eyebrow || title || description || actions) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between p-5 sm:p-6 border-b border-white/40 dark:border-white/5">
          <div className="max-w-2xl space-y-1">
            {eyebrow && <p className="label-overline text-emerald">{eyebrow}</p>}
            {title && <h2 className="text-lg sm:text-xl lg:text-2xl tracking-[-0.03em] font-semibold">{title}</h2>}
            {description && <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      <div className={`p-5 sm:p-6 ${contentClassName}`}>{children}</div>
    </section>
  );
});

export const MetricCard = React.memo(function MetricCard({ label, value, icon: Icon, tone = "emerald", detail, testid, className = "", ...props }) {
  const toneClasses = tone === "ruby" ? "text-ruby bg-ruby/10" : tone === "topaz" ? "text-topaz bg-topaz/10" : "text-emerald bg-emerald/10";
  return (
    <div {...props} data-testid={testid} className={`glass-tile rounded-[1.35rem] p-4 sm:p-5 transition-all duration-300 hover:-translate-y-1 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="label-overline">{label}</p>
        {Icon && <span className={`grid h-8 w-8 sm:h-9 sm:w-9 place-items-center rounded-xl ${toneClasses}`}><Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" /></span>}
      </div>
      <p className="mt-2 sm:mt-3 text-2xl font-bold tracking-[-0.04em] leading-none tabular-nums">{value}</p>
      {detail && <div className="mt-2 text-xs text-muted-foreground leading-relaxed">{detail}</div>}
    </div>
  );
});

export const SectionHeading = React.memo(function SectionHeading({ icon: Icon, label, actions, className = "" }) {
  return (
    <div className={`flex items-center justify-between gap-2 ${className}`}>
      <div className="flex items-center gap-2.5">
        {Icon && <span className="grid h-6 w-6 place-items-center rounded-md bg-emerald/10 text-emerald"><Icon className="h-3 w-3" /></span>}
        <h3 className="label-overline text-muted-foreground m-0">{label}</h3>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
});

export const EmptyState = React.memo(function EmptyState({ icon: Icon, title, description, action, className = "", ...props }) {
  return (
    <div {...props} className={`glass-panel rounded-[1.75rem] p-8 sm:p-10 text-center ${className}`}>
      {Icon && <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-white/55 dark:bg-white/10 text-emerald shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"><Icon className="h-6 w-6" /></div>}
      <h3 className="text-xl tracking-[-0.03em] font-semibold">{title}</h3>
      {description && <p className="mt-2 text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed">{description}</p>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
});

export function ActionLink({ to, label, variant = "primary", icon: Icon = ArrowRight, className = "" }) {
  return (
    <Link to={to} className={className}>
      <Button variant={variant === "secondary" ? "outlinePill" : "primary"} size="pill">
        {label}
        <Icon className="ml-2 h-4 w-4" />
      </Button>
    </Link>
  );
}
