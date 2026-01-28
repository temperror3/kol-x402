import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSummary, getConfidenceDistribution, getCampaignAnalytics } from '../api/client';
import { useCampaign } from '../contexts/CampaignContext';
import type { SummaryResponse, ConfidenceDistribution, CampaignAnalytics } from '../types';
import StatsCard from '../components/StatsCard';
import CategoryPieChart from '../components/charts/CategoryPieChart';
import ConfidenceHistogram from '../components/charts/ConfidenceHistogram';

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

export default function Dashboard() {
  const { currentCampaign } = useCampaign();
  const [summary, setSummary] = useState<SummaryResponse | CampaignAnalytics | null>(null);
  const [confidence, setConfidence] = useState<ConfidenceDistribution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);

        if (currentCampaign) {
          // Fetch campaign-specific analytics and confidence (scoped to this campaign only)
          const [campaignAnalytics, confidenceData] = await Promise.all([
            getCampaignAnalytics(currentCampaign.id),
            getConfidenceDistribution(currentCampaign.id),
          ]);
          setSummary(campaignAnalytics);
          setConfidence(confidenceData);
        } else {
          // Fallback to global summary
          const [summaryData, confidenceData] = await Promise.all([
            getSummary(),
            getConfidenceDistribution(),
          ]);
          setSummary(summaryData);
          setConfidence(confidenceData);
        }
      } catch (err) {
        setError('Failed to load dashboard data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [currentCampaign]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-indigo-100 flex items-center justify-center animate-pulse">
            <svg className="w-8 h-8 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <p className="text-slate-500 font-medium">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error || !summary) {
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

  // Helper to check if data is campaign analytics
  const isCampaignAnalytics = (data: SummaryResponse | CampaignAnalytics): data is CampaignAnalytics => {
    return 'campaign' in data;
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-slate-500 mt-1">
            {currentCampaign
              ? `Insights for "${currentCampaign.name}" campaign`
              : 'Overview of your KOL discovery'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/accounts"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-600 font-medium hover:bg-slate-50 transition-colors shadow-sm"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            View All
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Total Accounts"
          value={summary.total.toLocaleString()}
          icon={<UsersIcon />}
          color="indigo"
          variant="gradient"
        />
        <StatsCard
          title="KOLs Discovered"
          value={summary.byCategory.KOL}
          subtitle={`${summary.percentages.KOL}% of total`}
          icon={<StarIcon />}
          color="amber"
        />
        <StatsCard
          title="Developers"
          value={summary.byCategory.DEVELOPER}
          subtitle={`${summary.percentages.DEVELOPER}% of total`}
          icon={<CodeIcon />}
          color="cyan"
        />
        <StatsCard
          title="Active Users"
          value={summary.byCategory.ACTIVE_USER}
          subtitle={`${summary.percentages.ACTIVE_USER}% of total`}
          icon={<UserIcon />}
          color="emerald"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CategoryPieChart data={summary.byCategory} />
        {confidence && <ConfidenceHistogram data={confidence.overall || []} />}
      </div>

      {/* Top Accounts */}
      <div>
        <h2 className="text-xl font-bold text-slate-800 mb-6">Top Performers by Category</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Top KOLs */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-violet-500 to-purple-600 px-6 py-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Top KOLs</h3>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/20 rounded-full text-white text-xs font-medium">
                  <StarIcon />
                  {summary.topAccounts.KOL?.length || 0}
                </span>
              </div>
            </div>
            <div className="p-4 space-y-3">
              {(summary.topAccounts.KOL || []).map((account, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center text-white font-bold text-sm">
                      {idx + 1}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800">{account.display_name}</p>
                      <p className="text-sm text-slate-500">@{account.username}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-violet-600">
                      {(account.confidence * 100).toFixed(0)}%
                    </p>
                    <p className="text-xs text-slate-400">
                      {account.followers?.toLocaleString()} followers
                    </p>
                  </div>
                </div>
              ))}
              {(!summary.topAccounts.KOL || summary.topAccounts.KOL.length === 0) && (
                <p className="text-center text-slate-400 py-4">No KOLs found yet</p>
              )}
            </div>
            <div className="px-4 pb-4">
              <Link
                to="/accounts?category=KOL"
                className="block w-full text-center py-2.5 bg-violet-50 hover:bg-violet-100 text-violet-600 font-medium rounded-xl transition-colors"
              >
                View all KOLs
              </Link>
            </div>
          </div>

          {/* Top Developers */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Top Developers</h3>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/20 rounded-full text-white text-xs font-medium">
                  <CodeIcon />
                  {summary.topAccounts.DEVELOPER?.length || 0}
                </span>
              </div>
            </div>
            <div className="p-4 space-y-3">
              {(summary.topAccounts.DEVELOPER || []).map((account, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold text-sm">
                      {idx + 1}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800">{account.display_name}</p>
                      <p className="text-sm text-slate-500">@{account.username}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-blue-600">
                      {(account.confidence * 100).toFixed(0)}%
                    </p>
                    {account.has_github && (
                      <p className="text-xs text-emerald-500">Has GitHub</p>
                    )}
                  </div>
                </div>
              ))}
              {(!summary.topAccounts.DEVELOPER || summary.topAccounts.DEVELOPER.length === 0) && (
                <p className="text-center text-slate-400 py-4">No developers found yet</p>
              )}
            </div>
            <div className="px-4 pb-4">
              <Link
                to="/accounts?category=DEVELOPER"
                className="block w-full text-center py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-600 font-medium rounded-xl transition-colors"
              >
                View all Developers
              </Link>
            </div>
          </div>

          {/* Top Active Users */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Top Active Users</h3>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/20 rounded-full text-white text-xs font-medium">
                  <UserIcon />
                  {summary.topAccounts.ACTIVE_USER?.length || 0}
                </span>
              </div>
            </div>
            <div className="p-4 space-y-3">
              {(summary.topAccounts.ACTIVE_USER || []).map((account, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-bold text-sm">
                      {idx + 1}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800">{account.display_name}</p>
                      <p className="text-sm text-slate-500">@{account.username}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-emerald-600">
                      {(account.confidence * 100).toFixed(0)}%
                    </p>
                  </div>
                </div>
              ))}
              {(!summary.topAccounts.ACTIVE_USER || summary.topAccounts.ACTIVE_USER.length === 0) && (
                <p className="text-center text-slate-400 py-4">No active users found yet</p>
              )}
            </div>
            <div className="px-4 pb-4">
              <Link
                to="/accounts?category=ACTIVE_USER"
                className="block w-full text-center py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 font-medium rounded-xl transition-colors"
              >
                View all Active Users
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
