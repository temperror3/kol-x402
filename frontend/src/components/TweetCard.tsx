import type { Tweet } from '../types';

interface TweetCardProps {
  tweet: Tweet;
}

export default function TweetCard({ tweet }: TweetCardProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="bg-white rounded-xl border border-slate-100 p-5 hover:shadow-md transition-all hover:border-slate-200">
      <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{tweet.content}</p>

      {tweet.x402_keywords_found.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tweet.x402_keywords_found.map((keyword, idx) => (
            <span
              key={idx}
              className="px-2.5 py-1 bg-indigo-50 text-indigo-600 text-xs font-medium rounded-lg"
            >
              {keyword}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-5 text-sm">
          <span className="flex items-center gap-1.5 text-slate-500">
            <svg className="w-4 h-4 text-rose-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
            </svg>
            <span className="font-medium">{tweet.likes.toLocaleString()}</span>
          </span>
          <span className="flex items-center gap-1.5 text-slate-500">
            <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="font-medium">{tweet.retweets.toLocaleString()}</span>
          </span>
          <span className="flex items-center gap-1.5 text-slate-500">
            <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span className="font-medium">{tweet.replies.toLocaleString()}</span>
          </span>
          <span className="flex items-center gap-1.5 text-slate-500">
            <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            <span className="font-medium">{tweet.quotes.toLocaleString()}</span>
          </span>
        </div>
        <span className="text-sm text-slate-400">{formatDate(tweet.created_at)}</span>
      </div>

      {(tweet.has_code || tweet.has_github) && (
        <div className="mt-3 flex gap-2">
          {tweet.has_code && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-violet-50 text-violet-600 text-xs font-medium rounded-lg">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              Code
            </span>
          )}
          {tweet.has_github && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-lg">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              GitHub
            </span>
          )}
        </div>
      )}
    </div>
  );
}
