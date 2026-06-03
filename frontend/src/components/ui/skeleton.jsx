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
