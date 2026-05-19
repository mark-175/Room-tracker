import type { Filter } from '../types';

const FILTERS: Filter[] = ['all', 'To Do', 'In Progress', 'Done', 'Overdue'];

interface Props {
  filter: Filter;
  search: string;
  onFilter: (f: Filter) => void;
  onSearch: (s: string) => void;
}

export default function Toolbar({
  filter,
  search,
  onFilter,
  onSearch,
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
