import React from 'react';
import { TimeRange } from '../../types/telemetry';
import { Clock } from 'lucide-react';

interface TimeRangePickerProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
  presets?: TimeRange[];
}

export const TimeRangePicker: React.FC<TimeRangePickerProps> = ({
  value,
  onChange,
  presets = ['1h', '24h', '7d', '30d', 'custom']
}) => {
  return (
    <div className="time-range-picker">
      <div className="time-picker-icon">
        <Clock size={12} className="text-secondary" />
      </div>
      <div className="time-range-segmented font-mono">
        {presets.map((preset) => {
          const isActive = value === preset;
          return (
            <button
              key={preset}
              type="button"
              className={`time-range-btn ${isActive ? 'active' : ''}`}
              onClick={() => onChange(preset)}
            >
              {preset.toUpperCase()}
            </button>
          );
        })}
      </div>
    </div>
  );
};
