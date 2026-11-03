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
        background: "linear-gradient(145deg, var(--penni-accent, #5b5cf0), #8b5cf6)",
        boxShadow: "0 8px 18px -9px rgba(91,92,240,.7), inset 0 1px 0 rgba(255,255,255,.25)",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      }}>
      p
    </span>
  );
}
