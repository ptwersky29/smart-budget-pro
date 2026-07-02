import React, { useCallback, useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { toast } from "sonner";
import {
  Users, Shield, Flag, Search, X, ChevronDown, ChevronRight,
  Loader2, ChevronLeft, ChevronRight as ChevronRightIcon, Activity,
  UserCheck, UserX,
} from "lucide-react";
import { PageHeader, SectionCard, MetricCard } from "../components/ui/layout";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";

function UserRow({ u, busy, onToggleDisable, onSetRole, onSetTier }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr className="border-b border-border hover:bg-secondary/40 cursor-pointer" onClick={() => setExpanded((p) => !p)}>
        <td className="px-6 py-3">
          <button className="p-1 text-muted-foreground hover:text-foreground">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </td>
        <td className="px-6 py-3 max-w-[200px] truncate font-medium">{u.email}</td>
        <td className="px-6 py-3 text-muted-foreground">{u.name || "—"}</td>
        <td className="px-6 py-3">
          <select
            value={u.role}
            onChange={(e) => onSetRole(u.user_id, e.target.value)}
            disabled={busy[`role-${u.user_id}`]}
            onClick={(e) => e.stopPropagation()}
            className="h-8 rounded-lg bg-secondary/50 border border-transparent px-2 text-xs font-medium focus:border-ring focus:outline-none disabled:opacity-50"
          >
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
        </td>
        <td className="px-6 py-3">
          <select
            value={u.tier}
            onChange={(e) => onSetTier(u.user_id, e.target.value)}
            disabled={busy[`tier-${u.user_id}`]}
            onClick={(e) => e.stopPropagation()}
            className="h-8 rounded-lg bg-secondary/50 border border-transparent px-2 text-xs font-medium focus:border-ring focus:outline-none disabled:opacity-50"
          >
            <option value="free">free</option>
            <option value="premium">premium</option>
          </select>
        </td>
        <td className="px-6 py-3">
          {u.disabled ? (
            <Badge variant="destructive">Disabled</Badge>
          ) : (
            <Badge variant="secondary">Active</Badge>
          )}
        </td>
        <td className="px-6 py-3 text-xs text-muted-foreground">
          {u.created_at?.slice(0, 10) || "—"}
        </td>
        <td className="px-6 py-3 text-right">
          <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            <Button
              variant={u.disabled ? "primary" : "danger"}
              size="pillSm"
              onClick={() => onToggleDisable(u.user_id)}
              disabled={busy[`disable-${u.user_id}`]}
            >
              {busy[`disable-${u.user_id}`] ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : u.disabled ? (
                <UserCheck className="h-3 w-3" />
              ) : (
                <UserX className="h-3 w-3" />
              )}
              {u.disabled ? "Enable" : "Disable"}
            </Button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-secondary/10">
          <td colSpan={8} className="px-6 py-4">
            <div className="grid sm:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="label-overline text-xs mb-1">User ID</p>
                <p className="font-mono text-xs text-muted-foreground">{u.user_id}</p>
              </div>
              <div>
                <p className="label-overline text-xs mb-1">Onboarded</p>
                <p>{u.onboarded ? <Badge variant="secondary" className="text-emerald border-emerald/30">Yes</Badge> : <Badge variant="outline">No</Badge>}</p>
              </div>
              <div>
                <p className="label-overline text-xs mb-1">Subscription</p>
                <p className="capitalize">{u.tier === "premium" ? "Premium" : "Free"}</p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function AdminDashboard() {
  useEffect(() => { document.title = "Admin | Penni"; }, []);

  const [stats, setStats] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [users, setUsers] = useState([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [flags, setFlags] = useState([]);
  const [busy, setBusy] = useState({});
  const [newFlag, setNewFlag] = useState({ flag: "", description: "" });

  const limit = 20;

  const loadStats = useCallback(async () => {
    try {
      const res = await api.get("/admin/dashboard");
      setStats(res.data);
      setRecentActivity(res.data.recent_activity || []);
    } catch { /* stats non-critical */ }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const res = await api.get("/admin/users", { params: { offset, limit } });
      setUsers(res.data.users);
      setTotalUsers(res.data.total);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Could not load users");
    }
  }, [offset]);

  const loadFlags = useCallback(async () => {
    try {
      const res = await api.get("/admin/feature-flags");
      setFlags(res.data.flags);
    } catch { /* flags non-critical */ }
  }, []);

  useEffect(() => { loadStats(); loadUsers(); loadFlags(); }, [loadStats, loadUsers, loadFlags]);

  const toggleDisable = async (userId) => {
    setBusy((p) => ({ ...p, [`disable-${userId}`]: true }));
    try {
      const res = await api.put(`/admin/users/${userId}/toggle-disable`);
      const disabled = res.data.disabled;
      setUsers((prev) => prev.map((u) => u.user_id === userId ? { ...u, disabled } : u));
      toast.success(disabled ? "User disabled" : "User enabled");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally { setBusy((p) => ({ ...p, [`disable-${userId}`]: false })); }
  };

  const setRole = async (userId, role) => {
    setBusy((p) => ({ ...p, [`role-${userId}`]: true }));
    try {
      await api.put(`/admin/users/${userId}/role`, { params: { role } });
      setUsers((prev) => prev.map((u) => u.user_id === userId ? { ...u, role } : u));
      toast.success(`Role set to ${role}`);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally { setBusy((p) => ({ ...p, [`role-${userId}`]: false })); }
  };

  const setTier = async (userId, tier) => {
    setBusy((p) => ({ ...p, [`tier-${userId}`]: true }));
    try {
      await api.put(`/admin/users/${userId}/tier`, { params: { tier } });
      setUsers((prev) => prev.map((u) => u.user_id === userId ? { ...u, tier } : u));
      toast.success(`Tier set to ${tier}`);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally { setBusy((p) => ({ ...p, [`tier-${userId}`]: false })); }
  };

  const toggleFlag = async (flagId, currentEnabled) => {
    setBusy((p) => ({ ...p, [`flag-${flagId}`]: true }));
    try {
      await api.put(`/admin/feature-flags/${flagId}`, { flag: "", enabled: !currentEnabled });
      setFlags((prev) => prev.map((f) => f.id === flagId ? { ...f, enabled: !currentEnabled } : f));
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally { setBusy((p) => ({ ...p, [`flag-${flagId}`]: false })); }
  };

  const createFlag = async (e) => {
    e.preventDefault();
    if (!newFlag.flag.trim()) return;
    setBusy((p) => ({ ...p, "create-flag": true }));
    try {
      await api.post("/admin/feature-flags", {
        flag: newFlag.flag.trim(),
        enabled: true,
        description: newFlag.description.trim() || null,
      });
      setNewFlag({ flag: "", description: "" });
      toast.success("Flag created");
      await loadFlags();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally { setBusy((p) => ({ ...p, "create-flag": false })); }
  };

  const deleteFlag = async (flagId) => {
    setBusy((p) => ({ ...p, [`del-flag-${flagId}`]: true }));
    try {
      await api.delete(`/admin/feature-flags/${flagId}`);
      setFlags((prev) => prev.filter((f) => f.id !== flagId));
      toast.success("Flag deleted");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally { setBusy((p) => ({ ...p, [`del-flag-${flagId}`]: false })); }
  };

  const filteredUsers = users.filter((u) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!u.email?.toLowerCase().includes(q) && !u.name?.toLowerCase().includes(q)) return false;
    }
    if (roleFilter !== "all" && u.role !== roleFilter) return false;
    if (statusFilter === "active" && u.disabled) return false;
    if (statusFilter === "disabled" && !u.disabled) return false;
    return true;
  });

  const totalPages = Math.ceil(totalUsers / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Admin"
        title="Admin Panel"
        description="Manage users, feature flags, and view system stats."
      />

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard label="Total Users" value={stats.stats.total_users} icon={Users} tone="emerald" />
          <MetricCard label="Active (30d)" value={stats.stats.active_users_30d} icon={Users} tone="emerald" />
          <MetricCard label="Transactions" value={stats.stats.total_transactions.toLocaleString()} icon={Shield} tone="emerald" />
          <MetricCard label="Income" value={`£${stats.stats.total_income?.toLocaleString()}`} tone="emerald" />
          <MetricCard label="Spending" value={`£${stats.stats.total_spending?.toLocaleString()}`} tone="ruby" />
          <MetricCard label="Open Tickets" value={stats.stats.open_support_tickets} tone="topaz" />
        </div>
      )}

      <SectionCard
        eyebrow="Management"
        title={`Users (${totalUsers})`}
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by email or name..."
                className="pl-9 w-48 text-sm"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="h-11 rounded-xl bg-secondary/50 border border-transparent px-3 text-xs font-medium focus:border-ring focus:outline-none"
            >
              <option value="all">All roles</option>
              <option value="user">Users</option>
              <option value="admin">Admins</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-11 rounded-xl bg-secondary/50 border border-transparent px-3 text-xs font-medium focus:border-ring focus:outline-none"
            >
              <option value="all">All status</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
        }
      >
        <div className="overflow-x-auto -mx-6 -mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border bg-secondary/30">
                <th className="px-6 py-3 font-medium w-10"></th>
                <th className="px-6 py-3 font-medium">Email</th>
                <th className="px-6 py-3 font-medium">Name</th>
                <th className="px-6 py-3 font-medium">Role</th>
                <th className="px-6 py-3 font-medium">Tier</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Joined</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-sm text-muted-foreground">
                    {search || roleFilter !== "all" || statusFilter !== "all" ? "No users match your filters." : "No users found."}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <UserRow
                    key={u.user_id}
                    u={u}
                    busy={busy}
                    onToggleDisable={toggleDisable}
                    onSetRole={setRole}
                    onSetTier={setTier}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 border-t border-border mt-4">
            <p className="text-xs text-muted-foreground">
              Page {currentPage} of {totalPages} ({totalUsers} total, {filteredUsers.length} shown)
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outlinePill"
                size="pillSm"
                onClick={() => setOffset((p) => Math.max(0, p - limit))}
                disabled={offset === 0}
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </Button>
              <Button
                variant="outlinePill"
                size="pillSm"
                onClick={() => setOffset((p) => p + limit)}
                disabled={offset + limit >= totalUsers}
              >
                Next <ChevronRightIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </SectionCard>

      {recentActivity.length > 0 && (
        <SectionCard eyebrow="Audit" title="Recent Activity" description="Latest admin actions and system events.">
          <div className="space-y-1 -mx-6 -mb-4">
            {recentActivity.map((a, i) => (
              <div key={i} className="flex items-center gap-3 px-6 py-2.5 text-sm border-b border-border last:border-0">
                <Activity className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="font-medium text-xs capitalize">{a.action?.replace(/_/g, " ")}</span>
                <span className="text-muted-foreground text-xs truncate">
                  {a.user_id && <span className="font-mono">{a.user_id?.slice(0, 16)}…</span>}
                  {a.resource && <span> on {a.resource}</span>}
                </span>
                <span className="ml-auto text-xs text-muted-foreground shrink-0">
                  {a.at?.slice(0, 16).replace("T", " ")}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard eyebrow="Configuration" title="Feature Flags" description="Toggle features on/off globally or per-user.">
        <form onSubmit={createFlag} className="flex items-end gap-3 mb-6 pb-6 border-b border-border">
          <div className="flex-1">
            <label className="label-overline text-xs mb-1 block">Flag name</label>
            <Input
              value={newFlag.flag}
              onChange={(e) => setNewFlag((p) => ({ ...p, flag: e.target.value }))}
              placeholder="e.g. bank_sync"
              className="text-sm"
              required
            />
          </div>
          <div className="flex-1">
            <label className="label-overline text-xs mb-1 block">Description</label>
            <Input
              value={newFlag.description}
              onChange={(e) => setNewFlag((p) => ({ ...p, description: e.target.value }))}
              placeholder="Optional description"
              className="text-sm"
            />
          </div>
          <Button variant="primary" size="pill" disabled={busy["create-flag"] || !newFlag.flag.trim()}>
            {busy["create-flag"] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}
            Add Flag
          </Button>
        </form>

        {flags.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No feature flags defined.</p>
        ) : (
          <div className="space-y-2">
            {flags.map((f) => (
              <div key={f.id} className="flex items-center gap-4 rounded-xl bg-secondary/20 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{f.flag}</p>
                  {f.description && (
                    <p className="text-xs text-muted-foreground truncate">{f.description}</p>
                  )}
                  {f.user_id && (
                    <p className="text-xs text-muted-foreground font-mono">User: {f.user_id?.slice(0, 16)}…</p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {f.enabled ? (
                    <Badge variant="secondary" className="text-emerald border-emerald/30">Enabled</Badge>
                  ) : (
                    <Badge variant="destructive">Disabled</Badge>
                  )}
                  <Button
                    variant={f.enabled ? "danger" : "primary"}
                    size="pillSm"
                    onClick={() => toggleFlag(f.id, f.enabled)}
                    disabled={busy[`flag-${f.id}`]}
                  >
                    {busy[`flag-${f.id}`] ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : f.enabled ? (
                      "Disable"
                    ) : (
                      "Enable"
                    )}
                  </Button>
                  <button
                    onClick={() => deleteFlag(f.id)}
                    disabled={busy[`del-flag-${f.id}`]}
                    className="p-2 text-muted-foreground hover:text-ruby disabled:opacity-50"
                    title="Delete flag"
                  >
                    {busy[`del-flag-${f.id}`] ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <X className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
