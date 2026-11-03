import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Building2, Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError } from "../../lib/api";
import { useActions } from "../../contexts/ActionContext";
import { useCategories } from "../../contexts/CategoriesContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "../ui/sheet";
import { Button } from "../ui/button";
import TransactionForm from "../TransactionForm";
import TransactionInspectorPanel from "../TransactionInspectorPanel";
import AccountFormModal from "../AccountFormModal";
import NotificationSettings from "../settings/NotificationSettings";
import StatementAction from "./StatementAction";
import { BudgetActionForm, BudgetActionPreview, AccountActionPreview, ReportsActionPreview, SearchTransactionsAction, SplitTransactionAction, PairTransferAction } from "./FinanceActions";

const CategoryManager = lazy(() => import("../../pages/CategoryManager"));
const today = () => new Date().toISOString().slice(0,10);
const emptyTransaction = (account_id="") => ({
  description:"", date:today(), amount:"", category:"", merchant:"", notes:"",
  account_id, is_income:false, is_transfer:false, entry_mode:"standard",
  budget_type:"", occasion:"", exclude_from_maaser:false,
});
const PANEL_TITLES = {
  "transaction-info":"Transaction details", "budget-new":"Create budget", "budget-edit":"Edit budget",
  "budget-info":"Budget details", "account-info":"Account details", "statement-import":"Import statement",
  "categories":"Manage categories", "reports":"Spending report", "alerts":"Notification settings",
  "transaction-search":"Search transactions", "bank-connect":"Connect bank", "accounts-overview":"All accounts", "transaction-split":"Split transaction", "transaction-transfer":"Pair transfer"
};

export default function GlobalActionHost() {
  const { active, openAction, closeAction, changed } = useActions();
  const { categories, version } = useCategories();
  const [accounts, setAccounts] = useState([]);
  const [accountLoading, setAccountLoading] = useState(false);
  const [transactionForm, setTransactionForm] = useState(emptyTransaction);
  const [connecting, setConnecting] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [classification, setClassification] = useState(null);
  const [saveAsRecurring, setSaveAsRecurring] = useState(false);
  const [savingTransaction, setSavingTransaction] = useState(false);
  const savingRef = useRef(false);
  const [fromDate,setFromDate] = useState(() => {const d=new Date();d.setDate(d.getDate()-90);return d.toISOString().slice(0,10)});

  const type = active?.type;
  const payload = active?.payload || {};
  const item = payload.transaction;
  const isTxForm = type === "transaction-new" || type === "transaction-edit";
  const isAccountForm = type === "account-new";
  const isInfo = type === "transaction-info" || type === "account-info" || type === "budget-info";
  const isLarge = type === "categories" || type === "statement-import" || type === "reports";
  useEffect(() => {
    if (!isTxForm && type !== "statement-import" && type !== "account-info" && type !== "transaction-info" && type !== "accounts-overview") return;
    let alive = true;
    setAccountLoading(true);
    api.get("/accounts").then(({data})=>{if(alive)setAccounts(data.accounts||[])}).catch(()=>{if(alive)toast.error("Could not load accounts")})
      .finally(()=>{if(alive)setAccountLoading(false)});
    return()=>{alive=false};
  }, [type]);
  useEffect(() => {
    if (!isTxForm) return;
    setClassification(null);
    setSaveAsRecurring(false);
    if (type==="transaction-edit" && item) {
      setTransactionForm({...emptyTransaction(item.account_id||""), description:item.description||"",date:String(item.date||today()).slice(0,10),
        amount:String(Math.abs(Number(item.amount)||0)), category:item.category||"",merchant:item.merchant||"",notes:item.notes||"",
        account_id:item.account_id||"",is_income:Number(item.amount)>0,is_transfer:!!(item.is_transfer || item.tx_type === "transfer"),
        exclude_from_maaser:!!item.exclude_from_maaser,budget_type:item.budget_type||"",occasion:item.occasion||"",
        balance_type:item.balance_type||"available",pending:!!item.pending,tags:item.tags||null});
    } else setTransactionForm(emptyTransaction(payload.accountId || ""));
  }, [type, active?.key]);

  const classifyTransaction = async ({ description, amount }) => {
    setClassifying(true);
    try {
      const { data } = await api.post("/budget-system/classify", { description, amount });
      setClassification(data);
    } catch(e) { toast.error(formatApiError(e.response?.data?.detail) || "Could not classify transaction"); }
    finally { setClassifying(false); }
  };
  const afterSave = (entity) => { changed(entity); closeAction(); };
  const saveTransaction = async event => {
    event?.preventDefault?.();
    if (savingRef.current) return;
    const amount = Number(transactionForm.amount);
    if (!transactionForm.account_id) {toast.error("Choose an account");return;}
    if (!Number.isFinite(amount) || amount<=0) {toast.error("Enter an amount greater than zero");return;}
    const body={description:transactionForm.description,amount:transactionForm.is_income?Math.abs(amount):-Math.abs(amount),
      category:transactionForm.category||undefined,date:transactionForm.date||today(),account_id:transactionForm.account_id,
      merchant:transactionForm.merchant||undefined,notes:transactionForm.notes||undefined,
      is_income:!!transactionForm.is_income,is_transfer:!!transactionForm.is_transfer};
    savingRef.current = true;
    setSavingTransaction(true);
    try {
      let createdTransaction = null;
      if (type==="transaction-edit" && item?.transaction_id) {
        await api.patch(`/transactions/${item.transaction_id}`, {...body, exclude_from_maaser: !!transactionForm.exclude_from_maaser});
      } else if (transactionForm.entry_mode === "split" || transactionForm.entry_mode === "transfer") {
        const {data} = await api.post("/transactions", {...body, exclude_from_maaser: transactionForm.entry_mode === "transfer" || !!transactionForm.exclude_from_maaser});
        createdTransaction = data;
      } else if (classification || transactionForm.budget_type) {
        const suggestions = classification?.suggestions || [];
        const chosenIndex = suggestions.findIndex(s=>s.category === transactionForm.category);
        await api.post("/budget-system/approve", {
          description:body.description?.trim() || "Transaction", amount:body.amount,
          budget_type:transactionForm.budget_type || suggestions[0]?.budget_type || "day_to_day",
          occasion:transactionForm.occasion || suggestions[0]?.occasion || "Monthly Living",
          category:body.category || suggestions[0]?.category || "uncategorized", merchant:body.merchant || suggestions[0]?.merchant || "",
          account_id:body.account_id, suggestion_id:classification?.suggestion_id || null,
          suggestion_index:chosenIndex>=0 ? chosenIndex : null, save_as_recurring:saveAsRecurring
        });
      } else {
        await api.post("/transactions", {...body, exclude_from_maaser: !!transactionForm.exclude_from_maaser});
      }
      toast.success(type==="transaction-edit"?"Transaction updated":"Transaction added");
      if (createdTransaction?.transaction_id && (transactionForm.entry_mode === "split" || transactionForm.entry_mode === "transfer")) {
        changed("transactions");
        openAction(transactionForm.entry_mode === "split" ? "transaction-split" : "transaction-transfer", {transaction:createdTransaction});
        return;
      }
      afterSave("transactions");
    } catch(e){toast.error(formatApiError(e.response?.data?.detail)||"Could not save transaction");}
    finally { savingRef.current = false; setSavingTransaction(false); }
  };
  const connectBank = async () => {
    setConnecting(true);
    try {
      const {data}=await api.get("/truelayer/auth-url",{params:fromDate?{from_date:fromDate}:{}});
      if (!data.auth_url) throw new Error("Authorization link is missing");
      window.location.assign(data.auth_url); // OAuth requires provider navigation
    } catch(e){toast.error(formatApiError(e.response?.data?.detail)||"Could not connect bank");setConnecting(false);}
  };
  if (!active) return null;
  if (isTxForm) return <TransactionForm key={active.key} open={true} editingId={type==="transaction-edit"?item?.transaction_id:null}
    form={transactionForm} setForm={setTransactionForm} selectedCats={categories}
    onClose={closeAction} onSubmit={saveTransaction} accounts={accounts} accountsLoading={accountLoading}
    onClassify={classifyTransaction} classifying={classifying} classification={classification}
    onClearClassification={() => setClassification(null)}
    saveAsRecurring={saveAsRecurring} setSaveAsRecurring={setSaveAsRecurring} saving={savingTransaction}/>;
  if (isAccountForm) return <AccountFormModal key={active.key} open onClose={closeAction} onCreated={()=>changed("accounts")} />;

  return <Sheet open={Boolean(active)} onOpenChange={open=>{if(!open)closeAction()}}>
    <SheetContent side="right" variant={isInfo || type==="accounts-overview" || type==="transaction-search" ? "panel" : "modal"} size={isLarge?"lg":"md"} className={`flex w-full flex-col overflow-hidden p-0 ${isLarge?"sm:max-w-[min(940px,92vw)]":isInfo?"sm:max-w-[440px]":"sm:max-w-lg"}`}>
      <SheetHeader className="shrink-0 border-b border-border bg-card px-5 py-5 pr-14 text-left">
        <SheetTitle className="text-base">{PANEL_TITLES[type] || "Penni action"}</SheetTitle>
        <SheetDescription>Complete this action without leaving your current page.</SheetDescription>
      </SheetHeader>
      <div className="subtle-scroll min-h-0 flex-1 overflow-y-auto p-4 sm:p-5" key={active.key}>
        {type==="transaction-split" && <SplitTransactionAction transaction={payload.transaction} categories={categories} onSaved={()=>afterSave("transactions")}/>}
        {type==="transaction-transfer" && <PairTransferAction transaction={payload.transaction} onSaved={()=>afterSave("transactions")}/>}
        {type==="transaction-info" && <TransactionInspectorPanel transaction={item}
          account={accounts.find(a=>a.account_id===item?.account_id)}
          onClose={closeAction} onEdit={transaction=>openAction("transaction-edit",{transaction})}/>}
        {type==="budget-new" && <BudgetActionForm category={payload.category} month={payload.month} categories={categories} onSaved={()=>afterSave("budgets")}/>}
        {type==="budget-edit" && <BudgetActionForm budget={payload.budget} categories={categories} onSaved={()=>afterSave("budgets")}/>}
        {type==="budget-info" && <BudgetActionPreview budget={payload.budget}
          onEdit={()=>openAction("budget-edit",{budget:payload.budget})}
          onCreate={()=>openAction("budget-new")}/>}
        {type==="accounts-overview" && <div className="space-y-2">
          {accounts.map(account => <button key={account.account_id} type="button" onClick={() => openAction("account-info", {accountId:account.account_id, account})}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-border p-3 text-left hover:bg-secondary/40">
            <span className="truncate text-sm font-medium">{account.name}</span>
            <span className="shrink-0 text-sm font-semibold">£{Number(account.balance||0).toFixed(2)}</span>
          </button>)}
          {!accounts.length && <p className="py-6 text-center text-xs text-muted-foreground">{accountLoading?"Loading accounts…":"No accounts yet"}</p>}
          <Button variant="outlinePill" className="w-full" onClick={() => openAction("account-new")}>Add account</Button>
        </div>}
        {type==="account-info" && <AccountActionPreview accountId={payload.accountId||payload.account?.account_id}
          account={payload.account} onAddTransaction={accountId=>openAction("transaction-new",{accountId})} onClose={closeAction}/>}
        {type==="statement-import" && <StatementAction initialDraft={payload.draft} initialAccountId={payload.accountId}
          accounts={accounts} onSaved={()=>afterSave("transactions")}/>}
        {type==="categories" && <Suspense fallback={<p className="p-4 text-xs text-muted-foreground">Loading categories…</p>}><CategoryManager /></Suspense>}
        {type==="reports" && <ReportsActionPreview />}
        {type==="alerts" && <NotificationSettings />}
        {type==="transaction-search" && <SearchTransactionsAction month={payload.month} onInspect={transaction=>openAction("transaction-info",{transaction})}/>}
        {type==="bank-connect" && <div className="space-y-4">
          <div className="rounded-xl border border-border bg-secondary/30 p-4"><Building2 className="h-6 w-6 text-emerald"/><p className="mt-3 text-sm font-semibold">Secure Open Banking connection</p>
            <p className="mt-1 text-xs text-muted-foreground">You will be taken to your bank's secure authorization screen, then returned to Penni.</p></div>
          <div><label className="mb-1.5 block text-xs font-medium">Import transactions from</label>
            <input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)} className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm"/></div>
          <Button variant="primary" onClick={connectBank} disabled={connecting} className="w-full">
            {connecting?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Wallet className="mr-2 h-4 w-4"/>} Continue to bank
          </Button>
        </div>}
      </div>
    </SheetContent>
  </Sheet>;
}
