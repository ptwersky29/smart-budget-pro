import React from "react";

export default function PageLoader() {
  return (
    <div className="min-h-screen grid place-items-center bg-background">
      <div className="flex items-center gap-3 text-muted-foreground">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald border-t-transparent" />
        <span className="text-sm">Loading...</span>
      </div>
    </div>
  );
}
