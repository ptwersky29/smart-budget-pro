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
  const [matchError, setMatch¶»§q«^