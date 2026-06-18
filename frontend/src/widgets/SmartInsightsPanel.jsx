import React from "react";
import AIInsightPanel from "../components/AIInsightPanel";

export default React.memo(function SmartInsightsPanel() {
  return (
    <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl shadow-card overflow-hidden">
      <div className="px-5 pt-5 pb-2">
        <p className="label-overline text-emerald">Smart Insights</p>
        <h2 className="text-lg sm:text-xl tracking-tight font-medium mt-0.5">AI-powered financial analysis</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Personalised insights based on your spending patterns, budget health, and income trends.
        </p>
      </div>
      <div className="px-5 pb-5">
        <AIInsightPanel
          title="AI Insights"
          subtitle="What's happening with your money"
          endpoint="/ai/insights/dashboard"
        />
      </div>
    </div>
  );
});
