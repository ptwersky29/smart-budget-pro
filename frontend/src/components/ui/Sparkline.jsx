import React, { useId, useMemo } from "react";

export default function Sparkline({
  values = [],
  stroke = "hsl(var(--emerald))",
  height = 30,
  className = "",
  fill = true,
}) {
  const gradientId = useId().replace(/:/g, "");
  const points = useMemo(() => {
    const clean = values.map((value) => Number(value)).filter(Number.isFinite);
    if (clean.length < 2) return null;
    const width = 120;
    const min = Math.min(...clean);
    const max = Math.max(...clean);
    const spread = max - min || 1;
    const step = width / (clean.length - 1);
    return clean.map((value, index) => {
      const x = index * step;
      const y = height - 3 - ((value - min) / spread) * (height - 7);
      return [x, y];
    });
  }, [values, height]);

  if (!points) {
    return <div className={className} style={{ height }} aria-hidden="true" />;
  }

  const line = points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${line} L${points[points.length - 1][0].toFixed(2)},${height} L0,${height} Z`;

  return (
    <svg
      viewBox={`0 0 120 ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      {fill ? (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.16" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradientId})`} />
        </>
      ) : null}
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
