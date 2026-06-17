import React from "react";
import { HeartPulse } from "lucide-react";
import { MetricCard } from "../components/ui/layout";

export default React.memo(function HealthScoreCard({ overview }) {
  if (!overview) return null;
  return (
    <MetricCard label="Health" value={`${overview.health_score}`} icon={HeartPulse} tone="topaz"
      detail={
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-muted-foreground">/ 100</span>
          <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden max-w-[80px]">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald to-topaz" style={{ width: `${overview.health_score}%` }} />
          </div>
        </div>
      } />
  );
});
