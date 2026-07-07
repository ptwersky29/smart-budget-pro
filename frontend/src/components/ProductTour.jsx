import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Compass, X } from "lucide-react";
import { Button } from "./ui/button";

const STORAGE_KEY = "penni.productTour.v1";

const steps = [
  {
    selector: "[data-tour='sidebar']",
    title: "Your money map",
    body: "Move between accounts, budgets, reports, settings, and specialist tools from one consistent navigation rail.",
    placement: "right",
  },
  {
    selector: "[data-tour='route-header']",
    title: "Page context",
    body: "Every workspace keeps the current page, key action, notifications, search, and theme controls in the same place.",
    placement: "bottom",
  },
  {
    selector: "[data-tour='command-search']",
    title: "Jump quickly",
    body: "Use search to move anywhere or start common actions without hunting through menus.",
    placement: "bottom",
  },
  {
    selector: "[data-tour='main-content']",
    title: "Focused work area",
    body: "Pages share the same spacing, card treatment, and responsive width so dashboards, lists, and settings feel connected.",
    placement: "top",
  },
  {
    selector: "[data-tour='quick-add']",
    title: "Save faster",
    body: "Add a transaction from anywhere, classify it, and keep moving. Your tour progress is saved automatically too.",
    placement: "left",
  },
];

function readSavedStep() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (parsed.completed) return { open: false, index: 0 };
    return { open: parsed.started === true, index: Number(parsed.index) || 0 };
  } catch {
    return { open: false, index: 0 };
  }
}

function saveTourState(next) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export default function ProductTour() {
  const initial = useMemo(readSavedStep, []);
  const [open, setOpen] = useState(initial.open);
  const [index, setIndex] = useState(initial.index);
  const [targetRect, setTargetRect] = useState(null);

  const step = steps[Math.min(index, steps.length - 1)];

  useEffect(() => {
    const start = () => {
      setIndex(0);
      setOpen(true);
      saveTourState({ started: true, index: 0, completed: false });
    };
    window.addEventListener("product-tour:start", start);
    return () => window.removeEventListener("product-tour:start", start);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    saveTourState({ started: true, index, completed: false });

    const updateTarget = () => {
      const candidates = Array.from(document.querySelectorAll(step.selector));
      const target = candidates.find((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }) || candidates[0];
      if (!target) {
        setTargetRect(null);
        return;
      }
      target.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      const rect = target.getBoundingClientRect();
      setTargetRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
    };

    updateTarget();
    const timer = window.setTimeout(updateTarget, 260);
    window.addEventListener("resize", updateTarget);
    window.addEventListener("scroll", updateTarget, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", updateTarget);
      window.removeEventListener("scroll", updateTarget, true);
    };
  }, [index, open, step.selector]);

  if (!open) return null;

  const finish = () => {
    saveTourState({ started: false, index: 0, completed: true });
    setOpen(false);
  };

  const skip = () => {
    saveTourState({ started: false, index, completed: false });
    setOpen(false);
  };

  const goNext = () => {
    if (index === steps.length - 1) finish();
    else setIndex((value) => value + 1);
  };

  const panelStyle = (() => {
    if (!targetRect) {
      return { position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
    }

    const gap = 14;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(360, viewportWidth - 32);
    const leftForCenter = targetRect.left + targetRect.width / 2 - width / 2;
    const clampLeft = Math.min(Math.max(16, leftForCenter), viewportWidth - width - 16);

    if (step.placement === "right" && targetRect.left + targetRect.width + width + gap < viewportWidth) {
      return { position: "absolute", left: targetRect.left + targetRect.width + gap, top: Math.max(16, targetRect.top) };
    }
    if (step.placement === "left" && targetRect.left - width - gap > 16) {
      return { position: "absolute", left: targetRect.left - width - gap, top: Math.max(16, targetRect.top) };
    }
    if (step.placement === "top" && targetRect.top - 220 > 16) {
      return { position: "absolute", left: clampLeft, top: targetRect.top - 220 };
    }
    return {
      position: "absolute",
      left: clampLeft,
      top: Math.min(targetRect.top + targetRect.height + gap, viewportHeight - 240),
    };
  })();

  return (
    <div className="product-tour fixed inset-0 z-[80] pointer-events-none" aria-live="polite">
      <div className="absolute inset-0 bg-foreground/45 backdrop-blur-[1px]" />
      {targetRect && (
        <div
          className="product-tour__ring"
          style={{
            top: targetRect.top - 8,
            left: targetRect.left - 8,
            width: targetRect.width + 16,
            height: targetRect.height + 16,
          }}
        />
      )}
      <section
        className="product-tour__panel pointer-events-auto w-[calc(100vw-2rem)] max-w-[360px] rounded-lg border border-border bg-card p-4 shadow-modal"
        style={panelStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-tour-title"
      >
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald/10 text-emerald">
            <Compass className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Step {index + 1} of {steps.length}
            </p>
            <h2 id="product-tour-title" className="mt-1 text-base font-semibold tracking-tight">
              {step.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
          </div>
          <button
            type="button"
            onClick={skip}
            className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Close walk-through"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 h-1.5 rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-emerald transition-all duration-200"
            style={{ width: `${((index + 1) / steps.length) * 100}%` }}
          />
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <Button
            variant="outlinePill"
            size="pillSm"
            onClick={() => setIndex((value) => Math.max(0, value - 1))}
            disabled={index === 0}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <Button variant="primary" size="pillSm" onClick={goNext}>
            {index === steps.length - 1 ? (
              <>
                <Check className="h-4 w-4" />
                Done
              </>
            ) : (
              <>
                Next
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </section>
    </div>
  );
}
