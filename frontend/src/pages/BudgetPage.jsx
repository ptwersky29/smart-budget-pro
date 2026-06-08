import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { RefreshCw, Wallet, ShoppingCart, Calendar } from "lucide-react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { PageHeader, SectionCard } from "../components/ui/layout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Button } from "../components/ui/button";
import BudgetSummaryCards from "../components/BudgetSummaryCards";
import BudgetAlertBar from "../components/BudgetAlertBar";
import EverydaySpending from "../components/EverydaySpending";
import PlannedEvents from "../components/PlannedEvents";
import { useSwipe } from "../hooks/useSwipe";

const TABS = [
  { value: "overview", label: "This Month", icon: Wallet },
  { value: "spending", label: "Everyday Spending", icon: ShoppingCart },
  { value: "events", label: "Planned Events", icon: Calendar },
];

export default React.memo(function BudgetPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab") || "overview";
  const validTab = TABS.find((t) => t.value === tabFromUrl) ? tabFromUrl : "overview";
  const [activeTab, setActiveTab] = useState(validTab);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState([]);
  const contentRef = useRef(null);

  const setTab = useCallback((tab) => {
    setActiveTab(tab);
    setSearchParams({ tab }, { replace: true });
  }, [setSearchParams]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const month = format(now, "yyyy-MM");
      const res = await api.get(`/budget-system/this-month?month=${month}`);
      setData(res.data);
      setAlerts(res.data.alerts || []);
    } catch (err) {
      toast.error("Failed to load budget data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const swipeHandlers = useSwipe(
    () => {
      const idx = TABS.findIndex((t) => t.value === activeTab);
      if (idx < TABS.length - 1) setTab(TABS[idx + 1].value);
    },
    () => {
      const idx = TABS.findIndex((t) => t.value === activeTab);
      if (idx > 0) setTab(TABS[idx - 1].value);
    },
    50
  );

  const dismissAlert = useCallback((idx) => {
    setAlerts((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Finance"
        title="Budgets"
        description="Track spending, plan ahead, and stay in control."
        actions={
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      <Tabs value={activeTab} onValueChange={setTab} className="space-y-6">
        <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl -mx-4 sm:-mx-6 px-4 sm:px-6 pb-2">
          <TabsList className="w-full sm:w-auto">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="flex-1 sm:flex-initial gap-1.5">
                <t.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{t.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div ref={contentRef} {...swipeHandlers} className="min-h-[300px]">
          <TabsContent value="overview" className="space-y-6 mt-0">
            <BudgetSummaryCards data={data} loading={loading} />
            <BudgetAlertBar alerts={alerts} onDismiss={dismissAlert} />
            {!loading && data && (
              <SectionCard title="Quick Actions" description="Common budget tasks">
                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" size="sm" onClick={() => setTab("spending")}>
                    <ShoppingCart className="h-4 w-4 mr-1.5" />
                    View spending categories
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setTab("events")}>
                    <Calendar className="h-4 w-4 mr-1.5" />
                    View planned events
                  </Button>
                </div>
              </SectionCard>
            )}
          </TabsContent>

          <TabsContent value="spending" className="space-y-6 mt-0">
            <SectionCard
              eyebrow="Everyday"
              title="Spending Categories"
              description="Day-to-day budget categories and progress."
            >
              <EverydaySpending data={data?.everyday_spending} loading={loading} />
            </SectionCard>
          </TabsContent>

          <TabsContent value="events" className="space-y-6 mt-0">
            <SectionCard
              eyebrow="Planned"
              title="Events & Occasions"
              description="Holidays, simchas, and other planned expenses."
            >
              <PlannedEvents data={data?.events} loading={loading} />
            </SectionCard>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
});
