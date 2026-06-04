import React from "react";
import Skeleton from "./ui/Skeleton";

export default function PageLoader() {
  return (
    <div className="min-h-screen bg-background p-6 space-y-6">
      <Skeleton className="h-4 w-48" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
