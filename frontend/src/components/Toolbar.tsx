import type { DatePeriod, Filter } from '../types';

const FILTERS: Filter[] = ['all', 'To Do', 'In Progress', 'Done', 'Overdue'];

const PERIODS: { value: DatePeriod; label: string }[] = [
  { value: 'all', label: 'Any date' },
  { value: 'today', label: 'Due today' },
  { value: 'custom', label: 'Date range' },
];

interface Props {
  filter: Filter;
  search: string;
  period: DatePeriod;
  from: string;
  to: string;
  onFilter: (f: Filter) => void;
  onSearch: (s: string) => void;
  onPeriod: (p: DatePeriod) => void;
  onFrom: (d: string) => void;
  onTo: (d: string) => void;
}

export default function Toolbar({
  filter,
  search,
  period,
  from,
  to,
  onFilter,
  onSearch,
  onPeriod,
  onFrom,
  onTo,
}: Props) {
  return (
    <div className="toolbar">
      <div className="filter-row">
        {FILTERS.map((f) => (
          <button
            key={f}
            className={'filter-btn' + (filter === f ? ' active' : '')}
            onClick={() => onFilter(f)}
          >
            {f === 'all' ? 'All' : f}
          </button>
        ))}
      </div>
      <div className="filter-row">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            className={'filter-btn' + (period === p.value ? ' active' : '')}
            onClick={() => onPeriod(p.value)}
          >
            {p.label}
          </button>
        ))}
        {period === 'custom' && (
          <div className="date-range">
            <input
              type="date"
              aria-label="From date"
              value={from}
              onChange={(e) => onFrom(e.target.value)}
            />
            <span className="muted-sm">to</span>
            <input
              type="date"
              aria-label="To date"
              value={to}
              onChange={(e) => onTo(e.target.value)}
            />
          </div>
        )}
      </div>
      <input
        type="text"
        className="search"
        placeholder="Search name, tags, category…"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
      />
    </div>
  );
}
