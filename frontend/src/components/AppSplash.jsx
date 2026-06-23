import React from "react";

export default function AppSplash({ text = "Loading…" }) {
  return (
    <div className="min-h-screen bg-background grid place-items-center p-6">
      <div className="text-center fade-up">
        <div className="mx-auto w-16 h-16 rounded-[1.25rem] gradient-emerald grid place-items-center text-white shadow-xl shadow-emerald/20 mb-4">
          <span className="text-2xl font-bold">£</span>
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">FinanceAI</h1>
        <p className="text-sm text-muted-foreground mt-1">Premium money workspace</p>
        <div className="flex items-center justify-center gap-1 mt-5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald animate-[pulse_1s_ease-in-out_infinite]" />
          <span className="h-1.5 w-1.5 rounded-full bg-emerald animate-[pulse_1s_ease-in-out_infinite_0.2s]" />
          <span className="h-1.5 w-1.5 rounded-full bg-emerald animate-[pulse_1s_ease-in-out_infinite_0.4s]" />
          <span className="sr-only">{text}</span>
        </div>
      </div>
    </div>
  );
}
