import React from "react";

export default function Logo({ size = "md", className = "" }) {
  const sizeClasses = {
    sm: "w-8 h-8",
    md: "w-10 h-10",
    lg: "w-16 h-16",
  };

  const currentSizeClass = sizeClasses[size] || size;

  return (
    <svg 
      className={`${currentSizeClass} ${className} shrink-0 select-none`}
      viewBox="0 0 120 120" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="logo-classic-green" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0F4C3A" />
          <stop offset="100%" stop-color="#062E22" />
        </linearGradient>
        <linearGradient id="logo-warm-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#F59E0B" />
          <stop offset="100%" stop-color="#D97706" />
        </linearGradient>
      </defs>

      <circle cx="60" cy="60" r="54" fill="url(#logo-classic-green)" />
      
      <circle cx="60" cy="60" r="48" stroke="url(#logo-warm-gold)" stroke-width="1.5" />
      <circle cx="60" cy="60" r="45" stroke="#FFFFFF" stroke-opacity="0.1" stroke-width="1" />

      <path d="M42 74 C36 68 36 52 46 42" stroke="url(#logo-warm-gold)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M42 74 C38 72 38 68 42 68 C44 70 44 72 42 74 Z" fill="url(#logo-warm-gold)" />
      <path d="M39 65 C35 63 36 59 40 59 C41 61 41 63 39 65 Z" fill="url(#logo-warm-gold)" />
      <path d="M38 55 C35 52 36 48 40 49 C40 51 40 53 38 55 Z" fill="url(#logo-warm-gold)" />
      <path d="M41 46 C39 43 41 39 45 40 C45 42 44 44 41 46 Z" fill="url(#logo-warm-gold)" />

      <path d="M78 74 C84 68 84 52 74 42" stroke="url(#logo-warm-gold)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M78 74 C82 72 82 68 78 68 C76 70 76 72 78 74 Z" fill="url(#logo-warm-gold)" />
      <path d="M81 65 C85 63 84 59 80 59 C79 61 79 63 81 65 Z" fill="url(#logo-warm-gold)" />
      <path d="M82 55 C85 52 84 48 80 49 C80 51 80 53 82 55 Z" fill="url(#logo-warm-gold)" />
      <path d="M79 46 C81 43 79 39 75 40 C75 42 76 44 79 46 Z" fill="url(#logo-warm-gold)" />

      <text x="60" y="74" font-family="Georgia, 'Times New Roman', serif" font-size="44" font-weight="bold" fill="#FFFFFF" text-anchor="middle">P</text>
      
      <path d="M60 32 L61.5 35 L64.5 35 L62 36.5 L63 39.5 L60 38 L57 39.5 L58 36.5 L55.5 35 L58.5 35 Z" fill="url(#logo-warm-gold)" />
    </svg>
  );
}
