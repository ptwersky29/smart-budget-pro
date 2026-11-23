import React, { useCallback, useEffect, useState, useRef } from "react";
import { api, formatApiError } from "../lib/api";
import { useSearchParams, Link } from "react-router-dom";
import { Building2, Loader2, CheckCircle2, XCircle, RefreshCcw, Trash2, ArrowRight, AlertCircle, Clock, Wallet, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, MetricCard, PageToolbar, SectionCard } from "../components/ui/layout";
import Skeleton from "../components/ui/Skeleton";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { formatShortDate, formatDateTime } from "../lib/format";
import BankCardMockup from "../components/BankCardMockup";
import AddManualAccountModal from "../components/AddManualAccountModal";
import { PageHeader, Surface } from "../components/ui/page";

export default function Connections() {
  useEffect(() => { document.title = "Bank Connections | Penni"; }, []);
  const [searchParams] = useSearchParams();
  const params = searchParams.toString();
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const [conns, setConns] = useState([]);
  const [manualAccounts, setManualAccounts] = useState([]);
  const [syncLogs, setSyncLogs] = useState([]);
  const [totalTx, setTotalTx] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [initialSync, setInitialSync] = useState(false);
  const [initialSyncPhase, setInitialSyncPhase] ¶»§q«^