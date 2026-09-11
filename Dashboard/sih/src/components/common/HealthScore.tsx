import React from 'react';

interface HealthScoreProps {
  score: number; // 0 to 100
  showBar?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const HealthScore: React.FC<HealthScoreProps> = ({
  score,
  showBar = true,
  size = 'md'
}) => {
  const colorClass = score >= 85 ? 'text-emerald-400' : score >= 60 ? 'text-amber-400' : 'text-critical';
  const barColor = score >= 85 ? 'var(--state-healthy)' : score >= 60 ? 'var(--state-warning)' : 'var(--state-critical)';

  return (
    <div className={`health-score-container size-${size} font-mono`}>
      <div className="health-score-top">
        <span className={`health-score-number ${colorClass}`}>{score}</span>
        <span className="health-score-max text-muted">/100</span>
      </div>
      {showBar && (
        <div className="health-score-bar-track">
          <div 
            className="health-score-bar-fill" 
            style={{ width: `${Math.min(100, Math.max(0, score))}%`, backgroundColor: barColor }} 
          />
        </div>
      )}
    </div>
  );
};
