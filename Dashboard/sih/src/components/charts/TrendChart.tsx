import React from 'react';

interface TrendChartProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
  showArea?: boolean;
}

export const TrendChart: React.FC<TrendChartProps> = ({
  data,
  color = '#3b82f6',
  width = 100,
  height = 24,
  showArea = true
}) => {
  if (!data || data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * (width - 4) + 2;
    const y = height - ((val - min) / range) * (height - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const pathD = `M ${points.join(' L ')}`;
  const areaD = `${pathD} L ${width - 2},${height} L 2,${height} Z`;

  return (
    <svg width={width} height={height} className="sparkline-trend-svg" viewBox={`0 0 ${width} ${height}`}>
      {showArea && (
        <path d={areaD} fill={color} opacity="0.15" />
      )}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
