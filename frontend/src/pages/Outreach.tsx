import { useEffect, useState } from 'react';
import { getOutreachRecommendations } from '../api/client';
import type { OutreachResponse, OutreachRecommendation, Category } from '../types';
import CategoryBadge from '../components/CategoryBadge';

export default function Outreach() {
  const [data, setData] = useState<OutreachResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<Category | ''>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const result = await getOutreachRecommendations(filterCategory || undefined, 50);
        setData(result);
      } catch (err) {
        setError('Failed to load outreach recommendations');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [filterCategory]);

  const copyTemplate = async (recommendation: OutreachRecommendation) => {
    try {
      await navigator.clipboard.writeText(recommendation.recommendation.template);
      setCopiedId(recommendation.account.username);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const priorityConfig = {
    high: {
      bg: 'bg-rose-50',
      border: 'border-rose-200',
      text: 'text-rose-700',
      badge: 'bg-rose-100 text-rose-800 border-rose-300',
      dot: 'bg-rose-500',
    },
    medium: {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      text: 'text-amber-700',
      badge: 'bg-amber-100 text-amber-800 border-amber-300',
      dot: 'bg-amber-500',
    },
    low: {
      bg: 'bg-slate-50',
      border: 'border-slate-200',
      text: 'text-slate-600',
      badge: 'bg-slate-100 text-slate-700 border-slate-300',
      dot: 'bg-slate-400',
    },
  };

  const PriorityBadge = ({ priority }: { priority: 'high' | 'medium' | 'low' }) => (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border ${priorityConfig[priority].badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${priorityConfig[priority].dot}`}></span>
      {priority.charAt(0).toUpperCase() + priority.slice(1)} Priority
    </span>
  );

  const RecommendationCard = ({ item }: { item: OutreachRecommendation }) => (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 hover:shadow-md hover:border-slate-200 transition-all">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold text-lg">
            {item.account.display_name?.charAt(0) || '?'}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-slate-800">{item.account.display_name}</p>
              <CategoryBadge category={item.account.category} size="sm" />
            </div>
            <p className="text-sm text-slate-500">@{item.account.username}</p>
          </div>
        </div>
        <PriorityBadge priority={item.recommendation.priority} />
      </div>

      {item.account.bio && (
        <p className="mt-4 text-sm text-slate-600 line-clamp-2 leading-relaxed">{item.account.bio}</p>
      )}

      <div className="mt-4 flex gap-4 text-sm">
        <span className="flex items-center gap-1.5 text-slate-500">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {item.account.followers_count.toLocaleString()} followers
        </span>
        <span className="flex items-center gap-1.5 text-slate-500">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {(item.account.confidence * 100).toFixed(0)}% confidence
        </span>
      </div>

      <div className="mt-5 p-4 bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl">
        <div className="flex items-center gap-2 mb-2">
          <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <p className="text-sm font-semibold text-indigo-800">Recommended Action</p>
        </div>
        <p className="text-sm text-indigo-700">{item.recommendation.action}</p>
      </div>

      <div className="mt-5">
        <p className="text-sm font-medium text-slate-700 mb-2">Message Template</p>
        <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600 leading-relaxed border border-slate-100">
          {item.recommendation.template}
        </div>
        <div className="mt-3 flex gap-3">
          <button
            onClick={() => copyTemplate(item)}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-all ${
              copiedId === item.account.username
                ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
            }`}
          >
            {copiedId === item.account.username ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy Message
              </>
            )}
          </button>
          <a
            href={item.account.twitter_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            Open X
          </a>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-indigo-100 flex items-center justify-center animate-pulse">
            <svg className="w-8 h-8 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <p className="text-slate-500 font-medium">Loading recommendations...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
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
          <h1 className="text-3xl font-bold text-slate-800">Outreach</h1>
          <p className="text-slate-500 mt-1">Prioritized recommendations for engagement</p>
        </div>
        <div className="px-4 py-2 bg-white border border-slate-200 rounded-xl shadow-sm">
          <span className="text-sm font-semibold text-slate-700">{data.total}</span>
          <span className="text-sm text-slate-500 ml-1">recommendations</span>
        </div>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span className="font-medium text-slate-700">Filter by Category:</span>
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value as Category | '')}
            className="px-4 py-2.5 border border-slate-200 rounded-xl bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
          >
            <option value="">All Categories</option>
            <option value="KOL">KOL</option>
            <option value="DEVELOPER">Developer</option>
            <option value="ACTIVE_USER">Active User</option>
          </select>
        </div>
      </div>

      {/* Priority Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-rose-50 to-rose-100 border border-rose-200 rounded-2xl p-5 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="w-2.5 h-2.5 bg-rose-500 rounded-full"></span>
            <p className="text-sm font-medium text-rose-600">High Priority</p>
          </div>
          <p className="text-3xl font-bold text-rose-800">{data.byPriority.high.length}</p>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-2xl p-5 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="w-2.5 h-2.5 bg-amber-500 rounded-full"></span>
            <p className="text-sm font-medium text-amber-600">Medium Priority</p>
          </div>
          <p className="text-3xl font-bold text-amber-800">{data.byPriority.medium.length}</p>
        </div>
        <div className="bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 rounded-2xl p-5 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="w-2.5 h-2.5 bg-slate-400 rounded-full"></span>
            <p className="text-sm font-medium text-slate-600">Low Priority</p>
          </div>
          <p className="text-3xl font-bold text-slate-700">{data.byPriority.low.length}</p>
        </div>
      </div>

      {/* High Priority Section */}
      {data.byPriority.high.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-800">High Priority ({data.byPriority.high.length})</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {data.byPriority.high.map((item, idx) => (
              <RecommendationCard key={idx} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* Medium Priority Section */}
      {data.byPriority.medium.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-800">Medium Priority ({data.byPriority.medium.length})</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {data.byPriority.medium.map((item, idx) => (
              <RecommendationCard key={idx} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* Low Priority Section */}
      {data.byPriority.low.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-400 to-slate-500 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-800">Low Priority ({data.byPriority.low.length})</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {data.byPriority.low.map((item, idx) => (
              <RecommendationCard key={idx} item={item} />
            ))}
          </div>
        </div>
      )}

      {data.total === 0 && (
        <div className="bg-slate-50 rounded-2xl p-12 text-center border border-slate-100">
          <svg className="w-16 h-16 mx-auto text-slate-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <p className="text-lg font-medium text-slate-600">No outreach recommendations found</p>
          <p className="text-slate-500 mt-1">Try changing the category filter</p>
        </div>
      )}
    </div>
  );
}
