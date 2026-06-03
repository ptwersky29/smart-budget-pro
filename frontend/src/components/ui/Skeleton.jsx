import React from "react";

export default function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-xl bg-secondary/50 ${className}`} />;
}

export const SkeletonCard = React.memo(function SkeletonCard({ className = "" }) {
  return (
    <div className={`rounded-[1.5rem] border border-border bg-card/90 backdrop-blur-xl p-5 shadow-card ${className}`}>
      <Skeleton className="h-3 w-16 mb-3" />
      <Skeleton className="h-8 w-32" />
    </div>
  );
});

export const SkeletonChart = React.memo(function SkeletonChart({ className = "" }) {
  return (
    <div className={`rounded-2xl border border-border bg-card/90 backdrop-blur-xl p-6 shadow-card ${className}`}>
      <Skeleton className="h-4 w-24 mb-4" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
});

export const SkeletonTable = React.memo(function SkeletonTable({ rows = 5, className = "" }) {
  return (
    <div className={`space-y-4 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center space-x-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-[250px]" />
            <Skeleton className="h-4 w-[200px]" />
          </div>
        </div>
      ))}
    </div>
  );
});
