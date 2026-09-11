import React from 'react';

interface LoadingSkeletonProps {
  rows?: number;
  height?: number;
  className?: string;
}

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({
  rows = 4,
  height = 36,
  className = ''
}) => {
  return (
    <div className={`skeleton-container ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div 
          key={i} 
          className="skeleton-loading skeleton-bar" 
          style={{ height, marginBottom: 8 }} 
        />
      ))}
    </div>
  );
};
