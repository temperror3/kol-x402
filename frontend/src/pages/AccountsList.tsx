import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getAccounts } from '../api/client';
import type { Account, Category, PaginatedResponse, AccountFilters } from '../types';
import AccountTable from '../components/AccountTable';
import Pagination from '../components/Pagination';

export default function AccountsList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<PaginatedResponse<Account> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const page = parseInt(searchParams.get('page') || '1', 10);
  const category = searchParams.get('category') as Category | null;
  const minConfidence = searchParams.get('minConfidence');
  const hasGithub = searchParams.get('hasGithub');
  const orderBy = searchParams.get('orderBy') as AccountFilters['orderBy'] || 'ai_confidence';
  const orderDir = searchParams.get('orderDir') as 'asc' | 'desc' || 'desc';

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const filters: AccountFilters = {
          category: category || undefined,
          minConfidence: minConfidence ? parseFloat(minConfidence) : undefined,
          hasGithub: hasGithub ? hasGithub === 'true' : undefined,
          orderBy,
          orderDir,
        };
        const result = await getAccounts(filters, page, 20);
        setData(result);
      } catch (err) {
        setError('Failed to load accounts');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [page, category, minConfidence, hasGithub, orderBy, orderDir]);

  const updateFilter = (key: string, value: string | null) => {
    const newParams = new URLSearchParams(searchParams);
    if (value === null || value === '') {
      newParams.delete(key);
    } else {
      newParams.set(key, value);
    }
    newParams.set('page', '1');
    setSearchParams(newParams);
  };

  const handleSort = (field: string) => {
    if (orderBy === field) {
      updateFilter('orderDir', orderDir === 'desc' ? 'asc' : 'desc');
    } else {
      const newParams = new URLSearchParams(searchParams);
      newParams.set('orderBy', field);
      newParams.set('orderDir', 'desc');
      newParams.set('page', '1');
      setSearchParams(newParams);
    }
  };

  const handlePageChange = (newPage: number) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('page', String(newPage));
    setSearchParams(newParams);
  };

  const activeFiltersCount = [category, minConfidence, hasGithub].filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Accounts</h1>
          <p className="text-slate-500 mt-1">Browse and filter discovered accounts</p>
        </div>
        {data && (
          <div className="text-sm text-slate-500 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
            <span className="font-semibold text-slate-700">{data.pagination.total}</span> accounts found
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
        <div className="flex items-center gap-2 mb-4">
          <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <span className="font-semibold text-slate-700">Filters</span>
          {activeFiltersCount > 0 && (
            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-600 text-xs font-medium rounded-full">
              {activeFiltersCount} active
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-sm font-medium text-slate-600 mb-2">Category</label>
            <select
              value={category || ''}
              onChange={(e) => updateFilter('category', e.target.value || null)}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
            >
              <option value="">All Categories</option>
              <option value="KOL">KOL</option>
              <option value="DEVELOPER">Developer</option>
              <option value="ACTIVE_USER">Active User</option>
              <option value="UNCATEGORIZED">Uncategorized</option>
            </select>
          </div>

          <div className="flex-1 min-w-[180px]">
            <label className="block text-sm font-medium text-slate-600 mb-2">Min Confidence</label>
            <select
              value={minConfidence || ''}
              onChange={(e) => updateFilter('minConfidence', e.target.value || null)}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
            >
              <option value="">Any Confidence</option>
              <option value="0.9">90%+</option>
              <option value="0.8">80%+</option>
              <option value="0.7">70%+</option>
              <option value="0.5">50%+</option>
            </select>
          </div>

          <div className="flex-1 min-w-[180px]">
            <label className="block text-sm font-medium text-slate-600 mb-2">Has GitHub</label>
            <select
              value={hasGithub || ''}
              onChange={(e) => updateFilter('hasGithub', e.target.value || null)}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
            >
              <option value="">Any</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => setSearchParams(new URLSearchParams())}
              className="px-4 py-2.5 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
            >
              Clear All
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-indigo-100 flex items-center justify-center animate-pulse">
              <svg className="w-6 h-6 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <p className="text-slate-500">Loading accounts...</p>
          </div>
        </div>
      ) : error ? (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-rose-700">
          <div className="flex items-center gap-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-medium">{error}</span>
          </div>
        </div>
      ) : data ? (
        <>
          <AccountTable
            accounts={data.data}
            onSort={handleSort}
            sortField={orderBy}
            sortDir={orderDir}
          />

          <Pagination
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            onPageChange={handlePageChange}
          />
        </>
      ) : null}
    </div>
  );
}
