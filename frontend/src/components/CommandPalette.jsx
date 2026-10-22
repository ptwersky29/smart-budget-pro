import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { CommandDialog, CommandInput, CommandList, CommandGroup, CommandItem, CommandEmpty, CommandSeparator } from "./ui/command";
import {
  LayoutDashboard, Receipt, PiggyBank, TrendingUp, Star,
  Landmark, FileText, Settings, RefreshCcw, Plus, Search, Sparkles,
  MoreHorizontal, MessageSquare, Plug2, Upload,
} from "lucide-react";

const COMMAND_GROUPS = [
  {
    label: "Navigation",
    group: "nav",
    items: [
      { key: "nav-dashboard", label: "Dashboard", icon: LayoutDashboard, to: "/dashboard" },
      { key: "nav-transactions", label: "Transactions", icon: Receipt, to: "/transactions" },
      { key: "nav-budgets", label: "Budgets", icon: PiggyBank, to: "/budgets" },
      { key: "nav-accounts", label: "Accounts & Import", icon: Upload, to: "/accounts" },
      { key: "nav-reports", label: "Reports", icon: FileText, to: "/reports" },
      { key: "nav-subscriptions", label: "Subscriptions", icon: RefreshCcw, to: "/subscriptions" },
      { key: "nav-statements", label: "Statements", icon: FileText, to: "/statements" },
      { key: "nav-investments", label: "Investments", icon: TrendingUp, to: "/investments" },
      { key: "nav-jewish", label: "Jewish Tools", icon: Star, to: "/jewish" },
      { key: "nav-uk", label: "UK Benefits", icon: Landmark, to: "/uk-tools" },
      { key: "nav-connections", label: "Bank Connections", icon: Plug2, to: "/connections" },
      { key: "nav-sms", label: "SMS Import", icon: MessageSquare, to: "/sms" },
      { key: "nav-more", label: "More Tools", icon: MoreHorizontal, to: "/more" },
      { key: "nav-settings", label: "Settings", icon: Settings, to: "/settings" },
    ]
  },
  {
    label: "Quick Actions",
    group: "actions",
    items: [
      { key: "action-new-tx", label: "New transaction", icon: Plus, action: "new-transaction" },
      { key: "action-search-tx", label: "Search transactions", icon: Search, action: "search-transactions" },
      { key: "action-ai", label: "Ask Penni AI", icon: Sparkles, action: "open-assistant" },
    ]
  },
];

export default function CommandPalette({ open, onOpenChange }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filteredGroups, setFilteredGroups] = useState(COMMAND_GROUPS);

  useEffect(() => {
    if (!search) {
      setFilteredGroups(COMMAND_GROUPS);
      return;
    }

    const query = search.toLowerCase();
    const filtered = COMMAND_GROUPS.map(group => ({
      ...group,
      items: group.items.filter(item =>
        item.label.toLowerCase().includes(query) ||
        (item.to && item.to.includes(query))
      )
    })).filter(group => group.items.length > 0);

    setFilteredGroups(filtered);
  }, [search]);

  const handleSelect = useCallback((item) => {
    if (item.to) {
      navigate(item.to);
    } else if (item.action) {
      window.dispatchEvent(new CustomEvent("command-action", { detail: { action: item.action } }));
    }
    onOpenChange(false);
    setSearch("");
  }, [navigate, onOpenChange]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search pages, settings or actions..."
        value={search}
        onValueChange={setSearch}
        autoFocus
      />
      <CommandList>
        {filteredGroups.length === 0 ? (
          <CommandEmpty>No results found.</CommandEmpty>
        ) : (
          <>
            {filteredGroups.map((group, idx) => (
              <React.Fragment key={group.group}>
                {idx > 0 && <CommandSeparator />}
                <CommandGroup heading={group.label}>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <CommandItem
                        key={item.key}
                        value={item.label}
                        onSelect={() => handleSelect(item)}
                      >
                        <Icon className="mr-2 h-4 w-4" />
                        <span>{item.label}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </React.Fragment>
            ))}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
