import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export const PageHeader = React.memo(function PageHeader({ eyebrow, title, description, actions, meta, className = "", ...props }) {
  return (
    <div {...props} className={`rounded-2xl border border-border bg-card/90 backdrop-blur-xl p-6 lg:p-8 shadow-modal ${className}`}>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl space-y-3">
          {eyebrow && <p className="label-overline text-emerald">{eyebrow}</p>}
          <h1 className="text-4xl lg:text-5xl tracking-tight font-semibold leading-[1.05]">{title}</h1>
          {description && <p className="text-sm lg:text-base text-muted-foreground leading-relaxed max-w-2xl">{description}</p>}
          {meta && <div className="flex flex-wrap gap-2 pt-1">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
});

export const SectionCard = React.memo(function SectionCard({ eyebrow, title, description, actions, children, className = "", contentClassName = "", ...props }) {
  return (
    <section {...props} className={`rounded-2xl border border-border bg-card/90 backdrop-blur-xl shadow-card ${className}`}>
      {(eyebrow || title || description || actions) && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between p-6 border-b border-border/70">
          <div className="max-w-2xl space-y-1.5">
            {eyebrow && <p className="label-overline text-emerald">{eyebrow}</p>}
            {title && <h2 className="text-xl lg:text-2xl tracking-tight font-medium">{title}</h2>}
            {description && <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={`p-6 ${contentClassName}`}>{children}</div>
    </section>
  );
});

export const MetricCard = React.memo(function MetricCard({ label, value, icon: Icon, tone = "emerald", detail, className = "", ...props }) {
  const toneClasses = tone === "ruby" ? "text-ruby bg-ruby/10" : tone === "topaz" ? "text-topaz bg-topaz/10" : "text-emerald bg-emerald/10";
  return (
    <div {...props} className={`rounded-[1.5rem] border border-border bg-card/90 backdrop-blur-xl p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="label-overline">{label}</p>
        {Icon && <span className={`grid h-9 w-9 place-items-center rounded-full ${toneClasses}`}><Icon className="h-4 w-4" /></span>}
      </div>
      <p className="mt-3 text-3xl lg:text-4xl tracking-tight font-semibold leading-none">{value}</p>
      {detail && <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{detail}</p>}
    </div>
  );
});

export const EmptyState = React.memo(function EmptyState({ icon: Icon, title, description, action, className = "", ...props }) {
  return (
    <div {...props} className={`rounded-2xl border border-dashed border-border bg-card/70 backdrop-blur-xl p-10 text-center ${className}`}>
      {Icon && <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-muted-foreground"><Icon className="h-6 w-6" /></div>}
      <h3 className="text-xl tracking-tight font-medium">{title}</h3>
      {description && <p className="mt-2 text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed">{description}</p>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
});

export function ActionLink({ to, label, variant = "primary", icon: Icon = ArrowRight, className = "" }) {
  const styles = variant === "secondary"
    ? "border border-border text-muted-foreground hover:text-foreground hover:bg-secondary/60"
    : "gradient-emerald text-white hover:opacity-95";
  return (
    <Link
      to={to}
      className={`btn-pill h-11 px-5 text-sm ${styles} ${className}`}
    >
      {label}
      <Icon className="ml-2 h-4 w-4" />
    </Link>
  );
}
