"use client";

interface Props {
  data: number[];
  className?: string;
  stroke?: string;
  fill?: string;
  height?: number;
}

export function Sparkline({
  data,
  className = "",
  stroke = "currentColor",
  fill = "currentColor",
  height = 40,
}: Props) {
  if (data.length < 2) return null;
  const width = 100;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);

  const points = data.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return [x, y] as const;
  });

  const linePath = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");
  const areaPath = `${linePath} L${width} ${height} L0 ${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={`w-full ${className}`}
      style={{ height }}
      aria-hidden="true"
    >
      <path d={areaPath} fill={fill} opacity="0.12" />
      <path d={linePath} stroke={stroke} strokeWidth="1.5" fill="none" />
      <circle
        cx={points[points.length - 1][0]}
        cy={points[points.length - 1][1]}
        r="1.8"
        fill={stroke}
      />
    </svg>
  );
}
