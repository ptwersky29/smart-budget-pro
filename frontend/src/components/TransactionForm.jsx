import React, { useEffect, useState } from "react";
import { ArrowDownUp, ArrowLeftRight, Check, ChevronDown, ChevronUp, Loader2, Plus, ReceiptText, Sparkles, Split, Trash2 } from "lucide-react";
import { api, formatApiError } from "../lib/api";
import NativePopup from "./ui/NativePopup";
import PenniSelect from "./PenniSelect";
import CategoryCombobox from "./CategoryCombobox";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { formatCurrency } from "../lib/format";

const moneyCents = value => Math.round((Number(value) || 0) * 100);
const freshRow = () => ({ id: Math.random().toString(36).slice(2), category: "", amount: "", description: "" });
const fieldLabel = "mb-1.5 block text-xs font-medium text-muted-foreground";
const modes = [{ value: "standard", label: "Standard", Icon: ReceiptText }, { value: "split", label: "Split", Icon: Split }, { value: "transfer", label: "Transfer", Icon: ArrowLeftRight }];

export default function TransactionForm({
  open, editingId, form, setForm, selectedCats = [], onClose, onSubmit,
  saving = false, onClassify, classifying, classification, onClearClassification,
  saveAsRecurring, setSaveAsRecurring, onCategoryCreated,
  accounts = [], accountsLoading, validationError,
}) {
  const [more, setMore] = useState(false);
  const [matches, setMatches] = useState([]);
  const [matchesTotal, setMatchesTotal] = useState(0);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchError, setMatchError] = useState("");
  const mode = form.entry_mode || "standard";
  const pairExisting = mode === "transfer" && form.transfer_flow === "pair";
  const update = fields => setForm({ ...form, ...fields });
  const splitRows = Array.isArray(form.split_lines) && form.split_lines.length ? form.split_lines : [freshRow(), freshRow()];
  const updateSplit = (index, changes) => update({ split_lines: splitRows.map((line, i) => i === index ? { ...line, ...changes } : line) });
  const totalCents = moneyCents(form.amount);
  const allocated = splitRows.reduce((total, line) => total + moneyCents(line.amount), 0);
  const remaining = totalCents - allocated;
  const availableAccounts = Array.isArray(accounts) ? accounts : [];
  const chosenFrom = availableAccounts.find(a => a.account_id === form.account_id);
  const chosenTo = availableAccounts.find(a => a.account_id === form.transfer_to_account_id);
  const sourceTx = matches.find(t => t.transaction_id === form.transfer_outgoing_id);
  const targetTx = matches.find(t => t.transaction_id === form.transfer_incoming_id);
  const pairValid = Boolean(sourceTx && targetTx &&
    sourceTx.account_id !== targetTx.account_id &&
    !sourceTx.transfer_pair_id && !targetTx.transfer_pair_id &&
    (sourceTx.currency || "GBP") === (targetTx.currency || "GBP") &&
    moneyCents(sourceTx.amount) === -moneyCents(targetTx.amount) &&
    moneyCents(sourceTx.amount) < 0);
  const categories = (Array.isArray(selectedCats) ? selectedCats : []).filter(c => c && typeof c.name === "string" && !c.is_archived);
  const quickCategories = categories.slice(0, 4);
  const canClassify = Boolean(form.description?.trim()) && totalCents > 0 && !editingId && !classifying && mode === "standard";
  const setMode = value => {
    update({
      entry_mode: value, is_transfer: value === "transfer",
      split_lines: value === "split" ? (Array.isArray(form.split_lines) && form.split_lines.length >= 2 ? form.split_lines : [freshRow(), freshRow()]) : form.split_lines,
      transfer_flow: form.transfer_flow || "new",
      is_income: value === "transfer" ? false : form.is_income,
    });
  };

  useEffect(() => {
    if (!open || !pairExisting) return;
    let active = true;
    setMatchesLoading(true);
    setMatchError("");
    api.get("/transactions", { params: { limit: 1000, offset: 0 } })
      .then(({ data }) => {
        if (!active) return;
        setMatches(data.transactions || []);
        setMatchesTotal(Number(data.total) || 0);
      })
      .catch(error => { if (active) setMatchError(formatApiError(error) || "Could not load transactions"); })
      .finally(() => { if (active) setMatchesLoading(false); });
    return () => { active = false; };
  }, [open, pairExisting]);

  const loadMore = async () => {
    setMatchesLoading(true);
    try {
      const { data } = await api.get("/transactions", { params: { limit: 1000, offset: matches.length } });
      setMatches(rows => [...rows, ...(data.transactions || [])]);
      setMatchesTotal(Number(data.total) || 0);
    } catch(error) {
      setMatchError(formatApiError(error) || "Could not load older transactions");
    } finally {
      setMatchesLoading(false);
    }
  };

  if (!open) return null;

  const accountPicker = (id, value, onValue, emptyLabel, options = availableAccounts) => (
    <PenniSelect id={id} value={value || ""} onChange={event => onValue(event.target.value)}
      className="penni-composer-control h-11 w-full" aria-label="Choose option" required>
      <option value="">{emptyLabel}</option>
      {options.map(account => <option key={account.account_id} value={account.account_id}>
        {account.name} ({formatCurrency(account.balance || 0)})
      </option>)}
    </PenniSelect>
  );

  const renderAccount = () => accountsLoading ? (
    <div className="penni-composer-control flex h-11 items-center gap-2 text-xs text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading accounts…
    </div>
  ) : !availableAccounts.length ? (
    <div className="penni-composer-control flex h-11 items-center text-xs text-ruby">No accounts found</div>
  ) : accountPicker("tx-account", form.account_id, value => update({account_id: value}), "Select account…");

  const candidates = matches.filter(t => !t.transfer_pair_id && t.tx_type !== "transfer" && t.transaction_id);
  const choiceLabel = tx => [
    String(tx.date || "").slice(0, 10),
    tx.description || tx.merchant || "Transaction",
    formatCurrency(tx.amount),
    availableAccounts.find(a => a.account_id === tx.account_id)?.name || "Account",
  ].filter(Boolean).join(" · ");

  return <NativePopup open={open} onClose={onClose} size="md" showHeader
    className="penni-transaction-popup penni-composer"
    bodyClassName="penni-transaction-body"
    title={editingId ? "Edit transaction" : "New transaction"}
    description="A clear view of every movement of money.">
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <form id="penni-transaction-form" noValidate onSubmit={onSubmit}
        aria-label={editingId ? "Edit transaction details" : "New transaction details"}
        className="penni-transaction-fields min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-5 pt-4 sm:px-6">
        <div className="penni-composer-segments grid grid-cols-3 gap-1" role="group" aria-label="Transaction mode">
          {modes.map(({ value, label, Icon }) => (
            <button key={value} type="button" aria-pressed={mode === value}
              onClick={() => setMode(value)}
              className={"penni-composer-segment " + (mode === value ? "is-active" : "")}>
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
        {mode !== "transfer" && <div className="penni-composer-kind grid grid-cols-2 gap-1" role="group" aria-label="Transaction type">
          {[{ label: "Expense", value: false }, { label: "Income", value: true }].map(item => (
            <button type="button" key={item.label} aria-pressed={Boolean(form.is_income) === item.value}
              onClick={() => update({is_income: item.value, is_transfer: false})}
              className={"penni-composer-kind-option " + (Boolean(form.is_income) === item.value ? "is-active" : "")}>{item.label}</button>
          ))}
        </div>}

        {!pairExisting && <div className="penni-composer-amount">
          <label htmlFor="tx-amount" className="text-xs font-medium text-muted-foreground">{mode === "transfer" ? "Amount to transfer" : "Transaction amount"}</label>
          <div className="flex items-center justify-center gap-2">
            <span className="text-2xl font-semibold text-muted-foreground">{mode === "transfer" ? "" : form.is_income ? "+" : "−"}£</span>
            <input id="tx-amount" data-testid="tx-amount" type="number" min="0" step="0.01" inputMode="decimal"
              aria-label="Amount" placeholder="0.00" value={form.amount}
              onChange={event => {update({amount: event.target.value});onClearClassification?.();}}
              className="min-w-0 w-[min(180px,54vw)] bg-transparent text-center text-[clamp(32px,6vw,48px)] font-semibold tracking-tight tabular-nums text-foreground outline-none placeholder:text-muted-foreground/35" />
          </div>
        </div>}
        {mode === "transfer" && !editingId && <div className="penni-composer-kind grid grid-cols-2 gap-1" role="group" aria-label="Transfer method">
          <button type="button" aria-pressed={!pairExisting} className={"penni-composer-kind-option " + (!pairExisting ? "is-active" : "")}
            onClick={() => update({transfer_flow: "new"})}>New transfer</button>
          <button type="button" aria-pressed={pairExisting} className={"penni-composer-kind-option " + (pairExisting ? "is-active" : "")}
            onClick={() => update({transfer_flow: "pair"})}>Pair existing</button>
        </div>}
        {!pairExisting && <div>
          <label htmlFor="tx-desc" className={fieldLabel}>{mode === "transfer" ? "Description" : form.is_income ? "Received from" : "Merchant / description"}{mode !== "transfer" && <span className="text-ruby"> *</span>}</label>
          <Input id="tx-desc" data-testid="tx-desc" value={form.description || ""}
            onChange={event => {update({description: event.target.value});onClearClassification?.();}}
            placeholder={mode === "transfer" ? "Transfer between accounts" : "e.g. Sainsbury's, Salary, Electricity"}
            className="penni-composer-control h-11 w-full" />
        </div>}

        {mode === "standard" && <section className="space-y-2" aria-label="Category">
          <div className="flex items-center justify-between">
            <span className={fieldLabel}>Category</span>
            {canClassify && <button type="button" disabled={classifying} onClick={() => onClassify?.({description:form.description,amount:Number(form.amount)})}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary"><Sparkles className="h-3.5 w-3.5"/>{classifying?"Suggesting…":"Suggest with AI"}</button>}
          </div>
          {quickCategories.length > 0 && <div className="grid grid-cols-2 gap-2" role="group" aria-label="Quick categories">
            {quickCategories.map(c => <button key={c.category_id || c.name} type="button" aria-pressed={form.category === c.name}
              onClick={() => update({ category: c.name })}
              className={"penni-composer-category " + (form.category === c.name ? "is-active" : "")}>
              <span className="text-lg" aria-hidden="true">{c.emoji || "◦"}</span>
              <span className="min-w-0 flex-1 break-words text-left">{c.display_name || c.label || c.name}</span>
              {form.category === c.name && <Check className="h-4 w-4 shrink-0"/>}
            </button>)}
          </div>}
          <CategoryCombobox value={form.category} onChange={category => update({ category })}
            categories={selectedCats} onCategoryCreated={onCategoryCreated}
            className="penni-composer-control h-11 w-full" placeholder="Search or choose category…" />
          {classification?.suggestions?.length > 0 && <div className="space-y-1.5 rounded-xl border border-border p-3">
            <p className="text-xs font-medium text-muted-foreground">AI suggestions</p>
            {classification.suggestions.slice(0, 3).map(s => <button key={s.category} type="button"
              className="flex w-full justify-between rounded-lg p-2 text-left text-sm hover:bg-secondary"
              onClick={() => update({category:s.category,budget_type:s.budget_type||"",occasion:s.occasion||"",merchant:s.merchant||""})}>
              {s.category}<span className="text-muted-foreground">{Math.round((s.confidence||0)*100)}%</span>
            </button>)}
            <label className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
              <input type="checkbox" checked={Boolean(saveAsRecurring)} onChange={event=>setSaveAsRecurring?.(event.target.checked)}/> Save as recurring
            </label>
          </div>}
        </section>}

        {mode === "split" && <section className="space-y-3" aria-label="Split allocation">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Split allocation</span>
            <span className="text-xs text-muted-foreground">{splitRows.length} categories</span>
          </div>
          <div className="penni-composer-split-list space-y-2">
            {splitRows.map((line, index) => <div className="penni-composer-split-row" key={line.id || index}>
              <span className="penni-composer-row-number">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <CategoryCombobox label={"Category for split " + (index + 1)}
                  value={line.category} onChange={category => updateSplit(index, {category})}
                  categories={selectedCats} className="penni-composer-control h-10 w-full"
                  placeholder="Choose category…"/>
              </div>
              <div className="relative w-[112px] shrink-0">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
                <Input type="number" min="0" step="0.01" inputMode="decimal"
                  aria-label={"Amount for split " + (index + 1)}
                  value={line.amount} onChange={event => updateSplit(index, {amount:event.target.value})}
                  className="penni-composer-control h-10 w-full pl-6 text-right tabular-nums" placeholder="0.00"/>
              </div>
              <button type="button" aria-label={"Remove split " + (index + 1)}
                disabled={splitRows.length <= 2}
                onClick={() => update({split_lines:splitRows.filter((_,i)=>i!==index)})}
                className="penni-composer-remove" title="Remove category"><Trash2 className="h-4 w-4"/></button>
            </div>)}
          </div>
          <button type="button" className="penni-composer-add flex w-full items-center justify-center gap-2"
            disabled={splitRows.length >= 50}
            onClick={() => update({ split_lines:[...splitRows, freshRow()] })}>
            <Plus className="h-4 w-4"/> Add another category
          </button>
          <div className="penni-composer-breakdown space-y-2">
            <div className="flex justify-between text-xs"><span className="text-muted-foreground">Allocated</span><strong className="tabular-nums">{formatCurrency(allocated / 100)} of {formatCurrency(totalCents / 100)}</strong></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-border"><div className={"h-full rounded-full transition-all duration-200 " + (remaining === 0 && totalCents > 0 ? "bg-emerald" : "bg-primary")} style={{width: totalCents ? Math.min(100, allocated / totalCents * 100) + "%" : "0%"}}/></div>
            <div aria-live="polite" className={"flex items-center justify-between text-xs " + (remaining === 0 && totalCents > 0 ? "text-emerald" : "text-muted-foreground")}>
              <span>{remaining === 0 && totalCents > 0 ? "Fully allocated" : remaining < 0 ? "Over allocated" : "Remaining"}</span>
              <strong className="tabular-nums">{formatCurrency(Math.abs(remaining) / 100)}</strong>
            </div>
          </div>
        </section>}

        {mode === "transfer" && !pairExisting && <section className="space-y-3" aria-label="Transfer accounts">
          <div><label htmlFor="tx-account" className={fieldLabel}>From account <span className="text-ruby">*</span></label>{renderAccount()}</div>
          <div className="flex justify-center"><button type="button" aria-label="Swap transfer accounts" className="penni-composer-swap"
            onClick={() => update({account_id:form.transfer_to_account_id || "",transfer_to_account_id:form.account_id || ""})}><ArrowDownUp className="h-4 w-4"/></button></div>
          <div><label htmlFor="tx-to-account" className={fieldLabel}>To account <span className="text-ruby">*</span></label>
            {accountPicker("tx-to-account", form.transfer_to_account_id, value => update({transfer_to_account_id:value}), "Select destination…",
              availableAccounts.filter(a=>a.account_id !== form.account_id))}
          </div>
          <div className="penni-composer-breakdown space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">{chosenFrom?.name || "Source"}</span><strong>−{formatCurrency(Number(form.amount)||0)}</strong></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{chosenTo?.name || "Destination"}</span><strong className="text-emerald">+{formatCurrency(Number(form.amount)||0)}</strong></div>
            <p className="text-muted-foreground">Both entries are created and linked together. Transfers don't count as spending or income.</p>
          </div>
        </section>}

        {pairExisting && <section className="space-y-3" aria-label="Pair existing transactions">
          <p className="text-xs text-muted-foreground">Link two transactions already in Penni, without changing their balances or creating duplicates.</p>
          <div><label className={fieldLabel} htmlFor="tx-pair-out">Outgoing transaction</label>
            <PenniSelect id="tx-pair-out" value={form.transfer_outgoing_id || ""}
              onChange={event=>update({transfer_outgoing_id:event.target.value})}
              className="penni-composer-control h-11 w-full">
              <option value="">Choose outgoing transaction…</option>
              {candidates.filter(t=>moneyCents(t.amount)<0).map(t=><option key={t.transaction_id} value={t.transaction_id}>{choiceLabel(t)}</option>)}
            </PenniSelect></div>
          <div><label className={fieldLabel} htmlFor="tx-pair-in">Incoming transaction</label>
            <PenniSelect id="tx-pair-in" value={form.transfer_incoming_id || ""}
              onChange={event=>update({transfer_incoming_id:event.target.value})}
              className="penni-composer-control h-11 w-full">
              <option value="">Choose incoming transaction…</option>
              {candidates.filter(t=>moneyCents(t.amount)>0 && (!sourceTx || (t.account_id!==sourceTx.account_id && moneyCents(t.amount)===-moneyCents(sourceTx.amount)))).map(t=><option key={t.transaction_id} value={t.transaction_id}>{choiceLabel(t)}</option>)}
            </PenniSelect></div>
          {sourceTx && targetTx && <p aria-live="polite" className={"text-xs " + (pairValid ? "text-emerald" : "text-ruby")}>{pairValid ? "Ready to pair — equal amounts in two different accounts." : "The entries must have equal opposite amounts, separate accounts, and matching currencies."}</p>}
          {matchError && <p role="alert" className="text-xs text-ruby">{matchError}</p>}
          {matchesTotal > matches.length && <Button type="button" variant="outlinePill" disabled={matchesLoading} onClick={loadMore} className="w-full">
            {matchesLoading ? "Loading…" : "Search older transactions"}
          </Button>}
          {matchesLoading && <p className="text-xs text-muted-foreground">Loading transactions…</p>}
        </section>}

        {mode !== "transfer" && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label htmlFor="tx-account" className={fieldLabel}>Account <span className="text-ruby">*</span></label>{renderAccount()}</div>
          <div><label htmlFor="tx-date" className={fieldLabel}>Date <span className="text-ruby">*</span></label>
            <Input id="tx-date" type="date" value={form.date || ""}
              onChange={event=>update({date:event.target.value})}
              className="penni-composer-control h-11 w-full text-sm"/></div>
        </div>}
        {mode === "transfer" && !pairExisting && <div><label htmlFor="tx-date" className={fieldLabel}>Transfer date</label>
          <Input id="tx-date" type="date" value={form.date || ""} onChange={event=>update({date:event.target.value})}
            className="penni-composer-control h-11 w-full text-sm"/></div>}
        {mode !== "transfer" && form.is_income && <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={Boolean(form.exclude_from_maaser)} onChange={event=>update({exclude_from_maaser:event.target.checked})}/> Exclude from Maaser tithe
        </label>}
        <button type="button" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground" aria-expanded={more} onClick={()=>setMore(!more)}>
          {more ? <ChevronUp className="h-4 w-4"/>:<ChevronDown className="h-4 w-4"/>} Additional details
        </button>
        {more && <div className="space-y-3 rounded-xl border border-border bg-secondary/20 p-3">
          <div><label className={fieldLabel} htmlFor="tx-notes">Notes</label>
            <textarea id="tx-notes" value={form.notes || ""} onChange={event=>update({notes:event.target.value})}
              className="penni-composer-control min-h-20 w-full py-2.5" placeholder="Optional notes…"/></div>
          {mode === "standard" && <>
            <div><label className={fieldLabel}>Budget type</label>
              <PenniSelect value={form.budget_type || ""} onChange={event=>update({budget_type:event.target.value})}
                className="penni-composer-control h-11 w-full">
                <option value="">Optional</option>
                {["day_to_day","yom_tov","holiday","simcha","other"].map(x=><option key={x} value={x}>{x.replace(/_/g," ")}</option>)}
              </PenniSelect></div>
            <Input placeholder="Occasion (optional)" value={form.occasion || ""} onChange={event=>update({occasion:event.target.value})} className="penni-composer-control h-11 w-full"/>
            <Input placeholder="Merchant name (optional)" value={form.merchant || ""} onChange={event=>update({merchant:event.target.value})} className="penni-composer-control h-11 w-full"/>
          </>}
        </div>}
      </form>
      {validationError && <p id="penni-transaction-save-error" role="alert" className="mx-5 mb-2 rounded-xl border border-ruby/20 bg-ruby/10 px-3 py-2 text-xs font-medium text-ruby">{validationError}</p>}
      <div className="penni-transaction-footer flex shrink-0 items-center gap-3 border-t border-border px-5 py-3 sm:px-6">
        <Button type="button" variant="outlinePill" size="sm" onClick={onClose} className="flex-1">Cancel</Button>
        <Button type="submit" form="penni-transaction-form" variant="primary" size="sm" data-testid="tx-submit"
          disabled={saving || (mode==="split" && (remaining!==0 || totalCents<=0 || splitRows.length<2)) || (pairExisting && !pairValid)}
          aria-describedby={validationError ? "penni-transaction-save-error" : undefined}
          className="flex-[1.5] font-semibold">
          {saving ? "Saving…" : editingId ? "Save changes" : pairExisting ? "Pair transactions" : mode==="transfer" ? "Create transfer" : mode==="split" ? "Save split transaction" : "Add transaction"}
        </Button>
      </div>
    </div>
  </NativePopup>;
}
