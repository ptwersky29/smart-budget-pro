import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  BarChart3,
  ChevronRight,
  CreditCard,
  FileText,
  Landmark,
  LifeBuoy,
  Link2,
  MessageSquare,
  RefreshCcw,
  Settings2,
  Shield,
  Sparkles,
  Star,
  Tags,
  TrendingUp,
  Upload,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useAssistant } from "../contexts/AssistantContext";
import { PageHeader, Surface, SurfaceHeader } from "../components/ui/page";
import { Button } from "../components/ui/button";
import { APP_NAME } from "../data/constants";

function SettingRow({ to, icon: Icon, title, description, badge }) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 border-b border-border/50 px-4 py-3 last:border-0 transition hover:bg-secondary/35 sm:px-5"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-secondary/70 text-muted-foreground transition group-hover:bg-emerald/10 group-hover:text-emerald">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium">{title}</span>
          {badge ? (
            <span className="rounded-full bg-topaz/12 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-topaz">
              {badge}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{description}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 transition group-hover:translate-x-0.5 group-hover:text-foreground" />
    </Link>
  );
}

function Section({ title, children }) {
  return (
    <Surface className="overflow-hidden">
      <SurfaceHeader title={title} compact />
      <div className="mt-2 border-t border-border/50">{children}</div>
    </Surface>
  );
}

export default function MorePage() {
  const { user } = useAuth();
  const { openAssistant } = useAssistant();
  const initials = (user?.name?.[0] || user?.email?.[0] || "P").toUpperCase();
  const plan = user?.tier || "free";

  return (
    <div className="page-stack pb-4" data-testid="more-root">
      <PageHeader
        eyebrow="Workspace"
        title="More"
        description="Everything beyond the day-to-day ledger, kept out of your way until you need it."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]">
        <div className="space-y-4">
          <Surface className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald text-base font-semibold text-white shadow-md shadow-emerald/20">
                {initials}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{user?.name || "Penni member"}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
                  {plan} plan
                </p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              {plan !== "pro" && plan !== "premium" ? (
                <Button asChild variant="outlinePill" size="sm">
                  <Link to="/pricing">
                    <ArrowUpRight className="h-3.5 w-3.5" />
                    Upgrade
                  </Link>
                </Button>
              ) : null}
              <Button asChild variant="primary" size="sm">
                <Link to="/settings">
                  <Settings2 className="h-3.5 w-3.5" />
                  Settings
                </Link>
              </Button>
            </div>
          </Surface>

          <Section title="Money & planning">
            <SettingRow to="/reports" icon={BarChart3} title="Reports" description="Understand cash flow, categories and trends" />
            <SettingRow to="/subscriptions" icon={RefreshCcw} title="Subscriptions" description="Recurring payments and renewals" />
            <SettingRow to="/statements" icon={FileText} title="Statements" description="Upload and reconcile bank statements" />
            <SettingRow to="/investments" icon={TrendingUp} title="Investments" description="Projections and long-term planning" />
          </Section>

          <Section title="Life & specialist tools">
            <SettingRow to="/jewish" icon={Star} title="Jewish Tools" description="Maaser, Tzedakah and holiday planning" />
            <SettingRow to="/uk-tools" icon={Landmark} title="UK Benefits" description="Calculators and UK finance helpers" />
          </Section>

          <Section title="Connections & data">
            <SettingRow to="/connections" icon={Link2} title="Bank connections" description="Manage Open Banking links and sync" />
            <SettingRow to="/integrations" icon={Sparkles} title="Integrations" description="AI providers, messaging and more" />
            <SettingRow to="/sms" icon={MessageSquare} title="SMS import" description="Turn bank texts into transactions" />
            <SettingRow to="/accounts" icon={Upload} title="Import" description="Accounts, CSV and statement files" />
          </Section>

          <Section title="Account">
            <SettingRow to="/settings" icon={Settings2} title="Settings" description="Profile, security, AI and preferences" />
            <SettingRow to="/settings/categories" icon={Tags} title="Categories" description="Names, colours and spending labels" />
            <SettingRow to="/pricing" icon={CreditCard} title="Plan & billing" description="Compare plans and manage billing" />
            {user?.role === "admin" ? (
              <SettingRow to="/admin" icon={Shield} title="Admin panel" description="Users, feature flags and system settings" />
            ) : null}
          </Section>
        </div>

        <aside className="space-y-4">
          <div className="relative overflow-hidden rounded-[1.25rem] bg-[#123c30] p-5 text-white shadow-[0_24px_50px_-34px_rgba(10,42,32,0.9)]">
            <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
            <div className="relative">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white/12 ring-1 ring-white/15">
                <Sparkles className="h-5 w-5 text-[#f3c970]" />
              </span>
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Penni AI</p>
              <h2 className="mt-1 text-lg font-semibold leading-tight tracking-[-0.03em]">A calmer way to understand your money.</h2>
              <p className="mt-2 text-xs leading-relaxed text-white/65">
                Ask about spending, budgets or unusual transactions. Your data is only shared when you allow it.
              </p>
              <button
                type="button"
                onClick={() => openAssistant()}
                className="mt-4 inline-flex h-9 items-center gap-2 rounded-full bg-white px-4 text-xs font-semibold text-[#123c30] transition hover:bg-white/90"
              >
                Open assistant
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <Surface className="p-5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-topaz/10 text-topaz">
              <LifeBuoy className="h-4 w-4" />
            </span>
            <h2 className="mt-3 text-sm font-semibold">Need a hand?</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Find answers about your account, connections and privacy in Settings, or ask Penni AI for help.
            </p>
            <Button asChild variant="outlinePill" size="sm" className="mt-4">
              <Link to="/settings">Open help & support</Link>
            </Button>
          </Surface>

          <div className="px-2 text-center text-[10px] text-muted-foreground">
            {APP_NAME} · Your penny, planned.
          </div>
        </aside>
      </div>
    </div>
  );
}
