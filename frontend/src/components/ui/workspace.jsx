import React from "react";
import { LayoutGrid, List } from "lucide-react";

// One layout vocabulary for the Penni finance workspaces. Content and workflows
// remain page-specific; spacing, controls and accessible states do not.
export function WorkspaceHeader({ title, description, actions }) {
  return (
    <header className="penni-inner-page-header workspace-page-header flex shrink-0 flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="penni-inner-title text-[26px] font-semibold leading-tight tracking-[-0.035em]">{title}</h1>
        {description && <p className="penni-inner-description mt-2 text-[13px] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function WorkspaceMetrics({ children, columns = 3 }) {
  return (
    <div className={`workspace-metrics grid shrink-0 grid-cols-2 gap-3 ${columns === 4 ? "lg:grid-cols-4" : "md:grid-cols-3"}`}>
      {children}
    </div>
  );
}

export function WorkspaceMetric({ label, value, note, icon: Icon, tone = "emerald", progress, className = "" }) {
  const toneStyle = tone === "ruby" ? "bg-ruby/10 text-ruby" : tone === "topaz" ? "bg-topaz/10 text-topaz" : "bg-emerald/10 text-emerald";
  return (
    <div className={`surface workspace-metric min-w-0 rounded-[20px] p-4 ${className}`}>
      <div className="flex min-h-[58px] items-center gap-3">
        {Icon && <span className={`grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl ${toneStyle}`}><Icon className="h-[18px] w-[18px]" /></span>}
        <div className="min-w-0">
          <p className="text-[10.5px] text-muted-foreground">{label}</p>
          <p className="money-tabular mt-0.5 break-words text-[23px] font-semibold leading-none tracking-[-0.03em]">{value}</p>
          {note && <p className="mt-1.5 text-[10px] text-muted-foreground">{note}</p>}
        </div>
      </div>
      {progress != null && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.max(0,Math.min(100,Number(progress)||0))} aria-label={label}>
        <div className={`h-full rounded-full ${tone === "ruby" ? "bg-ruby" : tone === "topaz" ? "bg-topaz" : "bg-emerald"}`} style={{ width: `${Math.min(100,Math.max(0,Number(progress)||0))}%` }} />
      </div>}
    </div>
  );
}

export function WorkspaceTabs({ tabs, active, onChange, label = "View", className = "" }) {
  return (
    <div role="tablist" aria-label={label} className={`no-scrollbar flex min-h-[44px] min-w-0 flex-1 items-center gap-4 overflow-x-auto overflow-y-hidden whitespace-nowrap border-b border-border ${className}`}>
      {tabs.map(tab => <button key={tab.key} role="tab" aria-selected={active === tab.key} type="button" onClick={() => onChange(tab.key)}
        className={`inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 text-[12px] transition-colors ${active === tab.key ? "font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
        {tab.label}<span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active === tab.key ? "bg-emerald/10 text-emerald" : "bg-secondary text-muted-foreground"}`}>{tab.count}</span>
      </button>)}
    </div>
  );
}

export function WorkspaceViewToggle({ value, onChange, label = "View layout" }) {
  return <div role="group" aria-label={label} className="flex shrink-0 overflow-hidden rounded-[8px] border border-border bg-card">
    <button type="button" onClick={() => onChange("list")} aria-label="List view" aria-pressed={value === "list"}
      className={`grid h-8 w-8 place-items-center transition ${value === "list" ? "bg-emerald/10 text-emerald" : "text-muted-foreground hover:text-foreground"}`}><List className="h-3.5 w-3.5" /></button>
    <button type="button" onClick={() => onChange("grid")} aria-label="Grid view" aria-pressed={value === "grid"}
      className={`grid h-8 w-8 place-items-center border-l border-border transition ${value === "grid" ? "bg-emerald/10 text-emerald" : "text-muted-foreground hover:text-foreground"}`}><LayoutGrid className="h-3.5 w-3.5" /></button>
  </div>;
}

export function WorkspaceBlank({ title, description, action, error = false }) {
  return <div className="grid min-h-[180px] flex-1 place-content-center justify-items-center gap-2 p-6 text-center">
    <p className={`text-sm font-semibold ${error ? "text-ruby" : "text-foreground"}`}>{title}</p>
    {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
    {action && <div className="mt-2">{action}</div>}
  </div>;
}

export function WorkspaceSkeleton({ rows = 6 }) {
  return <div role="status" aria-label="Loading data" className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4 animate-pulse">
    {Array.from({ length: rows }, (_,i)=><div key={i} className="flex items-center gap-3">
      <span className="h-9 w-9 shrink-0 rounded-lg bg-secondary" />
      <div className="flex-1 space-y-2"><div className="h-2.5 w-[45%] rounded bg-secondary"/><div className="h-2 w-[30%] rounded bg-secondary/70"/></div>
      <span className="h-2.5 w-16 rounded bg-secondary"/>
    </div>)}
    <span className="sr-only">Loading…</span>
  </div>;
}
