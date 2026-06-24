import React from "react";
import { Link } from "react-router-dom";
import { Plus, Building2, PiggyBank, TrendingUp } from "lucide-react";

export default React.memo(function QuickActionsPanel() {
  return (
    <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl shadow-card p-5">
      <p className="label-overline mb-3">Quick actions</p>
      <div className="grid grid-cols-2 gap-3">
        <Link to="/transactions" className="flex flex-col items-center gap-1.5 p-4 rounded-xl border border-border hover:border-emerald/30 bg-secondary/20 hover:bg-emerald/5 transition-colors text-center">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald/10 text-emerald"><Plus className="h-4 w-4" /></span>
          <span className="text-xs font-medium leading-tight">Add transaction</span>
        </Link>
        <Link to="/accounts" className="flex flex-col items-center gap-1.5 p-4 rounded-xl border border-border hover:border-emerald/30 bg-secondary/20 hover:bg-emerald/5 transition-colors text-center">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald/10 text-emerald"><Building2 className="h-4 w-4" /></span>
          <span className="text-xs font-medium leading-tight">Connect bank</span>
        </Link>
        <Link to="/budgets" className="flex flex-col items-center gap-1.5 p-4 rounded-xl border border-border hover:border-topaz/30 bg-secondary/20 hover:bg-topaz/5 transition-colors text-center">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-topaz/10 text-topaz"><PiggyBank className="h-4 w-4" /></span>
          <span className="text-xs font-medium leading-tight">Budgets</span>
        </Link>
        <Link to="/investments" className="flex flex-col items-center gap-1.5 p-4 rounded-xl border border-border hover:border-topaz/30 bg-secondary/20 hover:bg-topaz/5 transition-colors text-center">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-topaz/10 text-topaz"><TrendingUp className="h-4 w-4" /></span>
          <span className="text-xs font-medium leading-tight">Investments</span>
        </Link>
      </div>
    </div>
  );
});
