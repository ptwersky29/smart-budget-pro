import React, { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ChevronDown, ChevronUp, Clock3, Loader2, Sparkles, AlertCircle } from "lucide-react";
import { useClassification } from "../contexts/ClassificationContext";

const ACTIVE = new Set(["queued", "running"]);

export default function ClassificationIndicator() {
  const { jobs } = useClassification();
  const [expanded, setExpanded] = useState(false);
  const now = Date.now();
  const relevant = jobs.filter((job) =>
    ACTIVE.has(job.status) ||
    (job.completed_at && now - new Date(job.completed_at).getTime() < 3 * 60_000)
  );
  if (!relevant.length) return null;

  const pending = relevant.filter((job) => ACTIVE.has(job.status)).length;
  const finished = relevant.length - pending;
  const failed = relevant.filter((job) => job.status === "failed").length;
  const percent = Math.round((finished / relevant.length) * 100);

  return (
    <section role="status" aria-live="polite" aria-label="Background AI classification"
      className="fixed bottom-[78px] right-3 z-[45] w-[min(346px,calc(100vw-24px))] rounded-2xl border border-border/80 bg-card/95 p-3 shadow-xl backdrop-blur-xl md:bottom-5 md:right-5">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet/10 text-violet">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> :
            failed ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-foreground">AI classification</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {pending ? `${finished} done · ${pending} in progress` :
              failed ? `${finished - failed} done · ${failed} need retry` : `${finished} completed`}
          </p>
        </div>
        <button type="button" onClick={() => setExpanded((value) => !value)}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-secondary"
          aria-label={expanded ? "Hide classification jobs" : "Show classification jobs"}
          aria-expanded={expanded}>
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-secondary" aria-label={`${percent}% processed`}>
        <div className="h-full rounded-full bg-[var(--penni-accent)] transition-[width] duration-300" style={{ width: `${percent}%` }} />
      </div>
      {expanded && (
        <div className="mt-3 space-y-2 border-t border-border/70 pt-3">
          <div className="max-h-48 space-y-2 overflow-y-auto">
            {relevant.slice(0, 10).map((job) => (
              <div className="flex items-start gap-2 text-[11px]" key={job.job_id}>
                {job.status === "running" ? <Loader2 className="mt-0.5 h-3.5 w-3.5 animate-spin text-violet" /> :
                  job.status === "queued" ? <Clock3 className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" /> :
                  job.status === "completed" ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-emerald" /> :
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 text-topaz" />}
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {job.result?.category || "Transaction"} · {
                    job.status === "completed" ? (job.result?.source?.startsWith("history_") ? "Matched past transactions" : job.result?.source === "ai" ? "AI suggestion · review" : job.result?.needs_review ? "Needs review" : "Suggested") :
                    job.status === "queued" ? "Queued" :
                    job.status === "running" ? "Classifying" :
                    job.status === "failed" ? "Retry available" : "Changed — skipped"
                  }
                </span>
              </div>
            ))}
          </div>
          <Link to="/transactions" className="flex items-center gap-1 text-xs font-medium text-[var(--penni-accent)] hover:underline">
            <Sparkles className="h-3.5 w-3.5" /> View transactions
          </Link>
        </div>
      )}
    </section>
  );
}
