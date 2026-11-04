import React from "react";

/**
 * Penni's indigo P artwork. This single brand asset is shared with the
 * browser favicon and installable-app icons; no hand-drawn CSS substitutes.
 */
export default function Logo({ size = "md", className = "" }) {
  const sizes = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    sidebar: "h-[42px] w-[42px]",
    lg: "h-16 w-16",
  };
  return (
    <img
      src="/penni-mark.png"
      alt="Penni"
      width={192}
      height={192}
      decoding="async"
      draggable={false}
      className={`inline-block shrink-0 select-none object-contain drop-shadow-[0_3px_7px_rgba(65,45,194,0.16)] ${sizes[size] || size} ${className}`}
    />
  );
}
