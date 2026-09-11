import React from 'react';
import { Search, X } from '../icons';

interface FilterOption {
  label: string;
  value: string;
}

interface FilterSelect {
  key: string;
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (val: string) => void;
}

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchPlaceholder?: string;
  selects?: FilterSelect[];
  totalCount?: number;
  filteredCount?: number;
  itemNoun?: string;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  searchQuery,
  onSearchChange,
  searchPlaceholder = 'Search...',
  selects = [],
  totalCount,
  filteredCount,
  itemNoun = 'items'
}) => {
  return (
    <div className="filter-bar panel font-mono">
      <div className="search-input-wrapper">
        <Search size={13} className="text-secondary" />
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="filter-search-input font-mono"
        />
        {searchQuery && (
          <button onClick={() => onSearchChange('')} className="clear-search-btn">
            <X size={12} />
          </button>
        )}
      </div>

      <div className="filter-selectors-group">
        {selects.map((sel) => (
          <div key={sel.key} className="filter-select-item">
            <span className="filter-label">{sel.label}:</span>
            <select
              value={sel.value}
              onChange={(e) => sel.onChange(e.target.value)}
              className="filter-select font-mono"
            >
              {sel.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {totalCount !== undefined && filteredCount !== undefined && (
        <div className="filter-count-label text-muted">
          SHOWING {filteredCount} OF {totalCount} {itemNoun.toUpperCase()}
        </div>
      )}
    </div>
  );
};
