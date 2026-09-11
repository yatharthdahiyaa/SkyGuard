import React, { useState } from 'react';
import { Clock, ChevronRight } from '../icons';

interface DateRangePickerProps {
  value: string;
  onChange: (val: string) => void;
  presets?: string[];
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  value,
  onChange,
  presets = ['1h', '24h', '7d', '30d', 'custom']
}) => {
  return (
    <div className="date-range-picker-root font-mono">
      <div className="picker-icon-slot">
        <Clock size={12} className="text-secondary" />
      </div>
      <div className="picker-buttons-strip">
        {presets.map((p) => {
          const isActive = value.toLowerCase() === p.toLowerCase();
          return (
            <button
              key={p}
              type="button"
              className={`picker-preset-btn ${isActive ? 'active' : ''}`}
              onClick={() => onChange(p)}
            >
              {p.toUpperCase()}
            </button>
          );
        })}
      </div>
    </div>
  );
};
