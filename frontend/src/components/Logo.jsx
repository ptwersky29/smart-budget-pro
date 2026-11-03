import React from "react";

/**
 * Penni brandmark in the supplied Penny fintech visual language.
 * Retains the same size API used by the original app and authentication pages.
 */
export default function Logo({ size = "md", className = "" }) {
  const sizes = {
    sm: "h-8 w-8 text-[21px]",
    md: "h-10 w-10 text-[26px]",
    sidebar: "h-[42px] w-[42px] text-[27px]",
    lg: "h-16 w-16 text-[42px]",
  };
  return (
    <span aria-hidden="true"
      className={"relative inline-grid shrink-0 select-none place-items-center rounded-full font-semibold text-white " +
        (sizes[size] || size) + " " + className}
      style={{
        background: "radial-gradient(circle at 30% 25%, #ffd2a1 0%, #e48b4a 38%, #b4551f 78%, #8c3f14 100%)",
        boxShadow: "inset 0 1px 2px rgba(255,255,255,.55), inset 0 -3px 6px rgba(80,25,0,.35), 0 4px 14px -4px rgba(180,85,31,.6)",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      }}>
      p
    </span>
  );
}
