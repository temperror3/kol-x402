import { useEffect, useState } from 'react';
import { getSummary, getConfidenceDistribution, exportAccounts } from '../api/client';
import type { SummaryResponse, ConfidenceDistribution, Category } from '../types';
import StatsCard from '../components/StatsCard';
import CategoryPieChart from '../components/charts/CategoryPieChart';
import ConfidenceHistogram from '../components/charts/ConfidenceHistogram';

const CATEGORY_COLORS: Record<Category, string> = {
  KOL: '#9333ea',
  DEVELOPER: '#2563eb',
  ACTIVE_USER: '#16a34a',
  UNCATEGORIZED: '#6b7280',
};

const UsersIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const StarIcon = () => (
  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
  </svg>
);

const CodeIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
  </svg>
);

const UserIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

export default function Analytics() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [confidence, setConfidence] = useState<ConfidenceDistribution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportCategory, setExportCategory] = useState<Category | ''>('');

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const [summaryData, confidenceData] = await Promise.all([
          getSummary(),
          getConfidenceDistribution(),
        ]);
        setSummary(summaryData);
        setConfidence(confidenceData);
      } catch (err) {
        setError('Failed to load analytics data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const handleExport = async () => {
    try {
      setExporting(true);
      await exportAccounts(exportCategory || undefined);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-indigo-100 flex items-center justify-center animate-pulse">
            <svg className="w-8 h-8 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="text-slate-500 font-medium">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (error || !summary || !confidence) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-rose-700">
        <div className="flex items-center gap-3">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="font-medium">{error || 'Failed to load data'}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Analytics</h1>
          <p className="text-slate-500 mt-1">Insights and data visualization</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 bg-white border border-slate-200 rounded-xl shadow-sm">
            <span className="text-sm text-slate-500">Last updated:</span>
            <span className="ml-2 text-sm font-medium text-slate-700">Just now</span>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatsCard
          title="Total Accounts"
          value={summary.total}
          color="indigo"
          icon={<UsersIcon />}
          variant="gradient"
        />
        <StatsCard
          title="KOLs"
          value={summary.byCategory.KOL}
          subtitle={`${summary.percentages.KOL}%`}
          color="amber"
          icon={<StarIcon />}
        />
        <StatsCard
          title="Developers"
          value={summary.byCategory.DEVELOPER}
          subtitle={`${summary.percentages.DEVELOPER}%`}
          color="cyan"
          icon={<CodeIcon />}
        />
        <StatsCard
          title="Active Users"
          value={summary.byCategory.ACTIVE_USER}
          subtitle={`${summary.percentages.ACTIVE_USER}%`}
          color="emerald"
          icon={<UserIcon />}
        />
        <StatsCard
          title="Uncategorized"
          value={summary.byCategory.UNCATEGORIZED}
          subtitle={`${summary.percentages.UNCATEGORIZED}%`}
          color="slate"
        />
      </div>

      {/* Main Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CategoryPieChart data={summary.byCategory} />
        <ConfidenceHistogram data={confidence.overall} title="Overall Confidence Distribution" />
      </div>

      {/* Per-Category Confidence */}
      <div>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-800">Confidence by Category</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {(['KOL', 'DEVELOPER', 'ACTIVE_USER', 'UNCATEGORIZED'] as const).map((cat) => (
            <ConfidenceHistogram
              key={cat}
              data={confidence.byCategory[cat]}
              title={cat === 'UNCATEGORIZED' ? 'Uncategorized' : cat}
              color={CATEGORY_COLORS[cat]}
            />
          ))}
        </div>
      </div>

      {/* Export Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Export Data</h2>
            <p className="text-sm text-slate-500">Download account data as CSV file for further analysis</p>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-slate-600 mb-2">Category Filter</label>
            <select
              value={exportCategory}
              onChange={(e) => setExportCategory(e.target.value as Category | '')}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
            >
              <option value="">All Categories</option>
              <option value="KOL">KOL</option>
              <option value="DEVELOPER">Developer</option>
              <option value="ACTIVE_USER">Active User</option>
              <option value="UNCATEGORIZED">Uncategorized</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium rounded-xl hover:from-indigo-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-500/25"
            >
              {exporting ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Exporting...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Export CSV
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
