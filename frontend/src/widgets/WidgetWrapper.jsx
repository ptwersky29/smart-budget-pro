import React from "react";

export default React.memo(function WidgetWrapper({ title, subtitle, visibility = true, config = {}, children, className = "", actions }) {
  if (!visibility) return null;
  return (
    <div className={`rounded-2xl border border-border bg-card/90 backdrop-blur-xl shadow-card ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/70">
          <div>
            {title && <p className="label-overline">{title}</p>}
            {subtitle && <p className="text-sm font-medium mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
      )}
      <div className={title ? "" : ""}>{children}</div>
    </div>
  );
});
