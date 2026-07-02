import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "./button";

export const PageHeader = React.memo(function PageHeader({ eyebrow, title, description, actions, meta, children, className = "", ...props }) {
  return (
    <div {...props} className={`relative rounded-lg border border-border bg-card/95 backdrop-blur-xl p-5 sm:p-6 lg:p-7 shadow-card ${className}`}>
      <div className="relative flex flex-col gap-4 lg:gap-6 lg:flex-row lg:items-end lg:justify-between z-10">
        <div className="max-w-3xl space-y-2 lg:space-y-3">
          {eyebrow && <p className="label-overline text-emerald">{eyebrow}</p>}
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold leading-[1.08]">{title}</h1>
          {description && <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">{description}</p>}
          {meta && <div className="flex flex-wrap gap-2 pt-1">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {children}
    </div>
  );
});

export const SectionCard = React.memo(function SectionCard({ eyebrow, title, description, actions, children, className = "", contentClassName = "", ...props }) {
  return (
    <section {...props} className={`rounded-lg border border-border bg-card/95 backdrop-blur-xl shadow-card ${className}`}>
      {(eyebrow || title || description || actions) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between p-4 sm:p-6 border-b border-border/70">
          <div className="max-w-2xl space-y-1">
            {eyebrow && <p className="label-overline text-emerald">{eyebrow}</p>}
            {title && <h2 className="text-lg sm:text-xl lg:text-2xl tracking-tight font-medium">{title}</h2>}
            {description && <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      <div className={`p-4 sm:p-6 ${contentClassName}`}>{children}</div>
    </section>
  );
});

export const MetricCard = React.memo(function MetricCard({ label, value, icon: Icon, tone = "emerald", detail, testid, className = "", ...props }) {
  const toneClasses = tone === "ruby" ? "text-ruby bg-ruby/10" : tone === "topaz" ? "text-topaz bg-topaz/10" : "text-emerald bg-emerald/10";
  return (
    <div {...props} data-testid={testid} className={`rounded-lg border border-border bg-card/95 backdrop-blur-xl p-4 sm:p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="label-overline">{label}</p>
        {Icon && <span className={`grid h-8 w-8 sm:h-9 sm:w-9 place-items-center rounded-lg ${toneClasses}`}><Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" /></span>}
      </div>
      <p className="mt-2 sm:mt-3 text-xl sm:text-2xl lg:text-3xl font-semibold leading-none">{value}</p>
      {detail && <div className="mt-1.5 sm:mt-2 text-xs text-muted-foreground leading-relaxed">{detail}</div>}
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
    <div {...props} className={`rounded-lg border border-dashed border-border bg-card/80 backdrop-blur-xl p-8 sm:p-10 text-center ${className}`}>
      {Icon && <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-lg bg-secondary text-muted-foreground"><Icon className="h-6 w-6" /></div>}
      <h3 className="text-xl tracking-tight font-medium">{title}</h3>
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
