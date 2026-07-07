import React from "react";

export default React.memo(function WidgetWrapper({ title, subtitle, visibility = true, config = {}, children, className = "", actions }) {
  if (!visibility) return null;
  return (
    <div className={`rounded-lg border border-border bg-card/95 backdrop-blur-xl shadow-card ring-1 ring-white/40 dark:ring-white/5 ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/70">
          <div>
            {title && <p className="label-overline">{title}</p>}
            {subtitle && <p className="text-sm font-medium mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
      )}
      <div>{children}</div>
    </div>
  );
});
