import React from "react";
import { CheckCircle2, ClipboardList, RotateCcw, Sparkles, X, ArrowLeftRight, Tag, CalendarDays, Wallet } from "lucide-react";
import PenniSelect from "./PenniSelect";
import CategoryCombobox from "./CategoryCombobox";

/** Fixed-height, independent rail for frequent filters; advanced controls stay in the existing sheet. */
export default function TransactionFilterRail({
  filters, accounts, categories, activeView, counts,
  onFilterChange, onViewChange, onClear, onClose, onClassify, onCategoryCreated,
}) {
  const quickViews = [
    { key:"all", label:"All transactions", icon:ClipboardList, count:counts?.all },
    { key:"unapproved", label:"Needs review", icon:CheckCircle2, count:counts?.unapproved },
    { key:"uncategorized", label:"Uncategorized", icon:Tag, count:counts?.uncategorized },
    { key:"transfers", label:"Transfers", icon:ArrowLeftRight, count:counts?.transfers },
  ];
  return (
    <section className="penni-filter-rail" aria-label="Transaction filter sidebar">
      <header className="penni-filter-rail-heading">
        <div>
          <h2>Filters</h2>
          <p>Find and review faster</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Collapse filter sidebar" title="Collapse filters">
          <X size={15} />
        </button>
      </header>
      <div className="penni-filter-rail-scroll">
        <div className="penni-filter-rail-block">
          <p className="penni-filter-rail-label">Quick views</p>
          <div className="penni-filter-quick-views">
            {quickViews.map(({key,label,icon:Icon,count}) => (
              <button key={key} type="button"
                onClick={() => onViewChange(key)}
                className={activeView === key ? "is-active" : ""}
                aria-pressed={activeView === key}>
                <Icon size={15} aria-hidden="true" />
                <span>{label}</span>
                {Number.isFinite(Number(count)) && <small>{count}</small>}
              </button>
            ))}
          </div>
          <p className="penni-filter-rail-note">Counts are for the current month.</p>
        </div>
        <div className="penni-filter-rail-block">
          <label className="penni-filter-rail-label" htmlFor="workspace-filter-account"><Wallet size={13} /> Account</label>
          <PenniSelect id="workspace-filter-account" aria-label="Filter account in sidebar"
            value={filters.account_id} onChange={event=>onFilterChange("account_id",event.target.value)}>
            <option value="">All accounts</option>
            {accounts.map(account => <option value={account.account_id} key={account.account_id}>{account.name}</option>)}
          </PenniSelect>
        </div>
        <div className="penni-filter-rail-block">
          <span className="penni-filter-rail-label"><Tag size={13} /> Category</span>
          <CategoryCombobox
            label="Filter category in sidebar" value={filters.category}
            onChange={value=>onFilterChange("category",value)}
            categories={categories} placeholder="All categories" allowClear
            onCategoryCreated={onCategoryCreated}
          />
        </div>
        <div className="penni-filter-rail-block">
          <label className="penni-filter-rail-label" htmlFor="workspace-filter-status">Approval</label>
          <PenniSelect id="workspace-filter-status" aria-label="Filter approval in sidebar"
            value={filters.approval_status} onChange={event=>onFilterChange("approval_status",event.target.value)}>
            <option value="">Any status</option>
            <option value="approved">Approved</option>
            <option value="unapproved">Needs review</option>
            <option value="failed">Failed</option>
          </PenniSelect>
        </div>
        <div className="penni-filter-rail-block">
          <span className="penni-filter-rail-label"><CalendarDays size={13} /> Date range</span>
          <label className="penni-filter-rail-date">
            <span>From</span>
            <input type="date" aria-label="Transaction filter start date" value={filters.date_from}
              onChange={event=>onFilterChange("date_from",event.target.value)} />
          </label>
          <label className="penni-filter-rail-date">
            <span>To</span>
            <input type="date" aria-label="Transaction filter end date" value={filters.date_to}
              onChange={event=>onFilterChange("date_to",event.target.value)} />
          </label>
        </div>
        <div className="penni-filter-rail-bottom">
          <button type="button" className="penni-filter-rail-ai" onClick={onClassify}>
            <Sparkles size={15} aria-hidden="true" /> Classify uncategorized
          </button>
          <button type="button" className="penni-filter-rail-clear" onClick={onClear}>
            <RotateCcw size={14} aria-hidden="true" /> Reset filters
          </button>
        </div>
      </div>
    </section>
  );
}
