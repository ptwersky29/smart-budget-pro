import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { isPublicDemo } from "../lib/demoSession";

const ClassificationContext = createContext(null);
const ACTIVE = new Set(["queued", "running"]);
const FINISHED = new Set(["completed", "failed", "skipped"]);

function mergeJobs(current, incoming) {
  const byTransaction = new Map();
  // Newly submitted work must immediately replace an earlier completed state.
  current.forEach((job) => byTransaction.set(job.transaction_id, job));
  incoming.forEach((job) => byTransaction.set(job.transaction_id, job));
  return Array.from(byTransaction.values());
}

export function ClassificationProvider({ children }) {
  const [jobs, setJobs] = useState([]);
  const stateRef = useRef(new Map());
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (isPublicDemo() || inFlight.current) return;
    inFlight.current = true;
    try {
      const response = await api.get("/classification/jobs");
      // The API returns newest first; keep only the most recent attempt per transaction.
      const seen = new Set();
      const serverJobs = (response.data.jobs || []).filter((job) => {
        if (seen.has(job.transaction_id)) return false;
        seen.add(job.transaction_id);
        return true;
      });
      const previously = stateRef.current;
      const completedJobs = [];
      for (const job of serverJobs) {
        const old = previously.get(job.transaction_id);
        if (old && ACTIVE.has(old) && FINISHED.has(job.status)) {
          if (job.status === "completed" && job.result) completedJobs.push(job);
        }
      }
      stateRef.current = new Map(serverJobs.map((job) => [job.transaction_id, job.status]));
      // Retain only in-flight optimistic requests not yet echoed by the server.
      setJobs(prev => {
        const next = [
          ...prev.filter(job => job.optimistic && !serverJobs.some(item => item.transaction_id === job.transaction_id)),
          ...serverJobs,
        ];
        if (next.length === prev.length && next.every((job,i) =>
          job.job_id === prev[i].job_id && job.status === prev[i].status &&
          job.completed_at === prev[i].completed_at)) return prev;
        return next;
      });
      for (const job of completedJobs) {
        const result = job.result;
        const record = {
          transaction_id: job.transaction_id,
          ai_suggested_categories: {suggestions:result.suggestions || []},
          ai_selected_category: result.category || null,
          ...(result.applied && result.category ? {
            category:result.category, category_approval_status:"unapproved",
          } : {}),
        };
        window.dispatchEvent(new CustomEvent("penni:data-changed", {
          detail:{entity:"transactions",operation:"classified",record},
        }));
      }
    } catch {
      // Background polling must not interrupt work elsewhere in Penni.
    } finally {
      inFlight.current = false;
    }
  }, []);

  const hasActiveJobs = jobs.some((job) => ACTIVE.has(job.status));

  useEffect(() => {
    if (isPublicDemo()) return undefined;
    refresh();
    return undefined;
  }, [refresh]);

  useEffect(() => {
    if (isPublicDemo() || !hasActiveJobs) return undefined;
    const interval = window.setInterval(refresh, 5000);
    return () => window.clearInterval(interval);
  }, [refresh, hasActiveJobs]);

  const enqueue = useCallback(async (ids) => {
    const uniqueIds = [...new Set(ids)].filter(Boolean);
    if (isPublicDemo()) throw new Error("Classification is disabled in demo mode");
    if (!uniqueIds.length) return { queued: 0, already_queued: 0, skipped: 0 };
    const optimistic = uniqueIds.map((transaction_id) => ({
      job_id: `pending-${transaction_id}`,
      transaction_id, status: "queued", optimistic: true,
      created_at: new Date().toISOString(),
    }));
    for (const id of uniqueIds) stateRef.current.set(id, "queued");
    setJobs((prev) => mergeJobs(prev, optimistic));
    try {
      const { data } = await api.post("/classification/jobs", { transaction_ids: uniqueIds });
      setJobs((prev) => [
        ...prev.filter((job) => !uniqueIds.includes(job.transaction_id)),
        ...(data.jobs || []),
      ]);
      for (const job of data.jobs || []) stateRef.current.set(job.transaction_id, job.status);
      void refresh();
      return data;
    } catch (error) {
      setJobs((prev) => prev.filter((job) => !uniqueIds.includes(job.transaction_id) || !job.optimistic));
      uniqueIds.forEach((id) => stateRef.current.delete(id));
      throw error;
    }
  }, [refresh]);

  const enqueueUncategorized = useCallback(async (filters = {}) => {
    if (isPublicDemo()) throw new Error("Classification is disabled in demo mode");
    const { data } = await api.post("/classification/uncategorized", {
      date_from: filters.date_from || null,
      date_to: filters.date_to || null,
      account_id: filters.account_id || null,
      search: filters.search || null,
    });
    setJobs((prev) => mergeJobs(prev, data.jobs || []));
    for (const job of data.jobs || []) stateRef.current.set(job.transaction_id, job.status);
    void refresh();
    return data;
  }, [refresh]);

  const jobsByTransaction = useMemo(
    () => Object.fromEntries(jobs.map((job) => [job.transaction_id, job])),
    [jobs],
  );
  const value = useMemo(
    () => ({ jobs, jobsByTransaction, enqueue, enqueueUncategorized, refresh }),
    [jobs, jobsByTransaction, enqueue, enqueueUncategorized, refresh],
  );
  return <ClassificationContext.Provider value={value}>{children}</ClassificationContext.Provider>;
}

export function useClassification() {
  const value = useContext(ClassificationContext);
  if (!value) throw new Error("ClassificationProvider is missing");
  return value;
}
