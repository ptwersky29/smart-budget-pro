import React, { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "sonner";
import {
  CreditCard, ExternalLink, XCircle, Save, Trash2,
} from "lucide-react";
import { SectionCard } from "../ui/layout";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import ConfirmModal from "../ui/ConfirmModal";

export default React.memo(function AccountSettings() {
  const { user, refresh } = useAuth();
  const [subscription, setSubscription] = useState(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [pwForm, setPwForm] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [pwBusy, setPwBusy] = useState(false);

  const loadSubscription = useCallback(async () => {
    try {
      const { data } = await api.get("/billing/subscription");
      setSubscription(data);
    } catch { setSubscription(null); }
  }, []);

  useEffect(() => { loadSubscription(); }, [loadSubscription]);

  const openPortal = async () => {
    setPortalBusy(true);
    try {
      const { data } = await api.post("/billing/portal");
      window.location.href = data.url;
    } catch { toast.error("Could not open billing portal"); }
    finally { setPortalBusy(false); }
  };

  const doCancelSub = async () => {
    setConfirmOpen(false);
    setCancelBusy(true);
    try {
      await api.post("/billing/cancel");
      toast.success("Subscription will cancel at period end");
      await loadSubscription();
    } catch { toast.error("Could not cancel"); }
    finally { setCancelBusy(false); }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (pwForm.new_password !== pwForm.confirm_password) {
      toast.error("Passwords do not match");
      return;
    }
    setPwBusy(true);
    try {
      await api.post("/auth/change-password", {
        current_password: pwForm.current_password,
        new_password: pwForm.new_password,
      });
      toast.success("Password updated");
      setPwForm({ current_password: "", new_password: "", confirm_password: "" });
    } catch { toast.error("Could not change password"); }
    finally { setPwBusy(false); }
  };

  return (
    <>
      {/* Profile */}
      <SectionCard eyebrow="Account" title="Profile" description="Your basic account information.">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <Label className="text-xs text-muted-foreground">Name</Label>
            <p className="text-sm font-medium mt-0.5">{user?.name || "—"}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Email</Label>
            <p className="text-sm font-medium mt-0.5">{user?.email}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Member since</Label>
            <p className="text-sm font-medium mt-0.5">
              {user?.created_at ? new Date(user.created_at).toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : "—"}
            </p>
          </div>
        </div>
      </SectionCard>

      {/* Security */}
      <SectionCard eyebrow="Account" title="Security" description="Update your password and manage security.">
        <form onSubmit={changePassword} className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <Label className="label-overline">Current Password</Label>
              <Input type="password" required value={pwForm.current_password}
                onChange={(e) => setPwForm({ ...pwForm, current_password: e.target.value })}
                className="mt-1 w-full" placeholder="••••••••" />
            </div>
            <div>
              <Label className="label-overline">New Password</Label>
              <Input type="password" required value={pwForm.new_password}
                onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })}
                className="mt-1 w-full" placeholder="Min 8 characters" minLength={8} />
            </div>
            <div className="flex items-end">
              <div className="w-full">
                <Label className="label-overline">Confirm New Password</Label>
                <Input type="password" required value={pwForm.confirm_password}
                  onChange={(e) => setPwForm({ ...pwForm, confirm_password: e.target.value })}
                  className="mt-1 w-full" placeholder="Repeat password" minLength={8} />
              </div>
            </div>
          </div>
          <Button variant="primary" size="pill" disabled={pwBusy}>
            <Save className="h-4 w-4" /> {pwBusy ? "Updating…" : "Update Password"}
          </Button>
        </form>
      </SectionCard>

      {/* Subscription */}
      <SectionCard eyebrow="Account" title="Subscription & Billing" description="Manage your plan and payment details.">
        {!subscription ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Plan</Label>
                <p className="text-sm font-medium mt-0.5 capitalize">{subscription.is_premium ? "Premium" : "Free"}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Status</Label>
                <p className="text-sm font-medium mt-0.5 capitalize">{subscription.subscription_status || (subscription.on_trial ? "Trialing" : "Active")}</p>
              </div>
              {subscription.current_period_end && (
                <div>
                  <Label className="text-xs text-muted-foreground">{subscription.cancel_at_period_end ? "Cancels on" : "Next billing"}</Label>
                  <p className="text-sm font-medium mt-0.5">
                    {new Date(subscription.current_period_end).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                </div>
              )}
            </div>

            {subscription.cancel_at_period_end && (
              <div className="rounded-xl border border-ruby/30 bg-ruby/5 px-4 py-3 text-sm text-ruby">
                Cancellation scheduled — you keep access until period end.
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              {subscription.is_premium && !subscription.is_admin && (
                <Button variant="outlinePill" size="pill" onClick={openPortal} disabled={portalBusy}>
                  <CreditCard className="h-4 w-4" />
                  {portalBusy ? "Opening…" : "Manage billing"}
                  <ExternalLink className="h-3 w-3" />
                </Button>
              )}
              {subscription.is_premium && !subscription.cancel_at_period_end && !subscription.is_admin && (
                <Button variant="danger" size="pill" onClick={() => setConfirmOpen(true)} disabled={cancelBusy}>
                  <XCircle className="h-4 w-4" />
                  {cancelBusy ? "…" : "Cancel subscription"}
                </Button>
              )}
            </div>
          </div>
        )}
      </SectionCard>

      {/* Danger Zone */}
      <SectionCard eyebrow="Account" title="Danger Zone" description="Irreversible actions for your account.">
        <div className="rounded-xl border border-ruby/20 bg-ruby/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-ruby">Delete Account</p>
              <p className="text-xs text-muted-foreground">Permanently delete your account and all data. This cannot be undone.</p>
            </div>
            <Button variant="danger" size="pill" disabled>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </div>
        </div>
      </SectionCard>

      <ConfirmModal
        open={confirmOpen}
        title="Cancel subscription?"
        message="You'll keep Premium access until the end of the current billing period. This cannot be undone."
        confirmLabel="Yes, cancel subscription"
        onConfirm={doCancelSub}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
});
