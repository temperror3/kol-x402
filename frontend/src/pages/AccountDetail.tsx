import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getAccount } from '../api/client';
import type { Account, Tweet } from '../types';
import CategoryBadge from '../components/CategoryBadge';
import TweetCard from '../components/TweetCard';

export default function AccountDetail() {
  const { id } = useParams<{ id: string }>();
  const [account, setAccount] = useState<Account | null>(null);
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      if (!id) return;

      try {
        setLoading(true);
        const data = await getAccount(id);
        setAccount(data.account);
        setTweets(data.tweets || []);
      } catch (err) {
        setError('Failed to load account');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-indigo-100 flex items-center justify-center animate-pulse">
            <svg className="w-8 h-8 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <p className="text-slate-500 font-medium">Loading account...</p>
        </div>
      </div>
    );
  }

  if (error || !account) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-rose-700">
        <div className="flex items-center gap-3">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="font-medium">{error || 'Account not found'}</span>
        </div>
      </div>
    );
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const confidencePercent = (account.ai_confidence || 0) * 100;
  const getConfidenceColor = () => {
    if (confidencePercent >= 80) return 'from-emerald-500 to-teal-500';
    if (confidencePercent >= 60) return 'from-amber-500 to-orange-500';
    return 'from-slate-400 to-slate-500';
  };

  return (
    <div className="space-y-6">
      {/* Back Link */}
      <Link
        to="/accounts"
        className="inline-flex items-center gap-2 text-slate-600 hover:text-indigo-600 font-medium transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Accounts
      </Link>

      {/* Profile Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {/* Banner */}
        <div className="h-32 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>

        <div className="px-6 pb-6">
          <div className="flex items-end gap-6 -mt-12">
            {account.profile_image_url ? (
              <img
                src={account.profile_image_url}
                alt={account.username}
                className="w-24 h-24 rounded-2xl border-4 border-white shadow-lg object-cover"
              />
            ) : (
              <div className="w-24 h-24 rounded-2xl border-4 border-white shadow-lg bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center">
                <span className="text-3xl font-bold text-white">
                  {account.display_name?.charAt(0) || '?'}
                </span>
              </div>
            )}
            <div className="flex-1 pb-2">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-slate-800">{account.display_name}</h1>
                <CategoryBadge category={account.ai_category} />
              </div>
              <p className="text-slate-500">@{account.username}</p>
            </div>
            <a
              href={`https://twitter.com/${account.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors shadow-lg"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              View on X
            </a>
          </div>

          {account.bio && (
            <p className="mt-6 text-slate-700 leading-relaxed">{account.bio}</p>
          )}

          <div className="mt-6 flex gap-8">
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-800">
                {account.followers_count.toLocaleString()}
              </p>
              <p className="text-sm text-slate-500">Followers</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-800">
                {account.following_count.toLocaleString()}
              </p>
              <p className="text-sm text-slate-500">Following</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-800">
                {account.tweet_count.toLocaleString()}
              </p>
              <p className="text-sm text-slate-500">Tweets</p>
            </div>
          </div>
        </div>
      </div>

      {/* AI Analysis */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-800">AI Analysis</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-sm text-slate-500 mb-2">Category</p>
            <CategoryBadge category={account.ai_category} size="lg" />
          </div>

          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-sm text-slate-500 mb-2">Confidence Score</p>
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-slate-200 rounded-full h-3 overflow-hidden">
                <div
                  className={`bg-gradient-to-r ${getConfidenceColor()} h-3 rounded-full transition-all`}
                  style={{ width: `${confidencePercent}%` }}
                />
              </div>
              <span className="text-lg font-bold text-slate-800">
                {confidencePercent.toFixed(0)}%
              </span>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-sm text-slate-500 mb-2">Categorized On</p>
            <p className="text-lg font-semibold text-slate-800">
              {formatDate(account.ai_categorized_at)}
            </p>
          </div>
        </div>

        {account.ai_reasoning && (
          <div className="mt-6">
            <p className="text-sm font-medium text-slate-600 mb-3">AI Reasoning</p>
            <div className="bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-100 rounded-xl p-5 text-slate-700 leading-relaxed">
              {account.ai_reasoning}
            </div>
          </div>
        )}

        {account.has_github && (
          <div className="mt-6 flex gap-3">
            <span className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-medium">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              Has GitHub
            </span>
          </div>
        )}
      </div>

      {/* Recent Tweets */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-slate-800">Recent x402 Tweets</h2>
          </div>
          <span className="px-3 py-1.5 bg-slate-100 rounded-lg text-sm font-medium text-slate-600">
            {tweets.length} tweets
          </span>
        </div>

        {tweets.length > 0 ? (
          <div className="space-y-4">
            {tweets.map((tweet) => (
              <TweetCard key={tweet.id} tweet={tweet} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-slate-50 rounded-xl">
            <svg className="w-12 h-12 mx-auto text-slate-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-slate-500">No x402-related tweets found</p>
          </div>
        )}
      </div>
    </div>
  );
}
