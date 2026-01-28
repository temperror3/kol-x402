import { useEffect, useState } from 'react';
import { getConfigurations } from '../api/client';
import type { ConfigurationWithStats } from '../types';

interface ConfigurationSelectorProps {
  value: string | null;
  onChange: (configId: string | null) => void;
  /** If true, show an "All" option that passes null */
  showAllOption?: boolean;
  className?: string;
}

export default function ConfigurationSelector({
  value,
  onChange,
  showAllOption = false,
  className = '',
}: ConfigurationSelectorProps) {
  const [list, setList] = useState<ConfigurationWithStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getConfigurations()
      .then((res) => {
        if (!cancelled) setList(res.data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <select
        className={`rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-700 text-sm ${className}`}
        disabled
      >
        <option>Loading…</option>
      </select>
    );
  }

  return (
    <select
      value={value ?? (showAllOption ? '' : list.find((c) => c.is_default)?.id ?? '')}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === '' ? null : v);
      }}
      className={`rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-700 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${className}`}
    >
      {showAllOption && <option value="">All configurations</option>}
      {list.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
          {c.is_default ? ' (default)' : ''}
        </option>
      ))}
    </select>
  );
}
