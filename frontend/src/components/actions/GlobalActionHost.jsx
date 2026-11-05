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
import NativePopup from "../ui/NativePopup";
import NotificationSettings from "../settings/NotificationSettings";
import StatementAction from "./StatementAction";
import { BudgetActionForm, BudgetActionPreview, AccountActionPreview, ReportsActionPreview, SearchTransactionsAction, SplitTransactionAction, PairTransferAction } from "./FinanceActions";

const CategoryManager = lazy(() => import("../../pages/CategoryManager"));
const today = () => new Date().toISOString().slice(0,10);
const emptyTransaction = (account_id="") => ({
  description:"", date:today(), amount:"", category:"", merchant:"", notes:"",
  account_id, is_income:false, is_transfer:false, entry_mode:"standard",
  budget_type:"", occasion:"", exclude_from_maaser:false, split_lines:[],
  transfer_to_account_id:"", transfer_outgoing_id:"", transfer_incoming_id:"", transfer_flow¶»§q«^