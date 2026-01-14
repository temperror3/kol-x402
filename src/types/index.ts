// Account category types
export type Category = 'KOL' | 'DEVELOPER' | 'ACTIVE_USER' | 'UNCATEGORIZED';

// Full account model (matches current database schema)
export interface Account {
  id?: string;
  twitter_id: string;
  username: string;
  display_name: string;
  bio: string | null;
  followers_count: number;
  following_count: number;
  tweet_count: number;
  profile_image_url: string | null;

  // Metadata
  has_github: boolean;

  // AI categorization
  ai_category?: string;
  ai_reasoning?: string;
  ai_confidence?: number;
  ai_categorized_at?: string;

  // Timestamps
  created_at?: string;
  updated_at?: string;
}

// AI categorization result
export interface AICategoryResult {
  category: 'KOL' | 'DEVELOPER' | 'ACTIVE_USER' | 'UNCATEGORIZED';
  confidence: number;
  reasoning: string;
}

// Tweet data for analysis
export interface Tweet {
  id: string;
  twitter_id: string;
  account_id: string;
  content: string;
  likes: number;
  retweets: number;
  replies: number;
  quotes: number;
  created_at: string;
  has_code: boolean;
  has_github: boolean;
  x402_keywords_found: string[];
}

// Twitter API user response
export interface TwitterUser {
  id: string;
  username: string;
  name: string;
  description?: string;
  profile_image_url?: string;
  public_metrics?: {
    followers_count: number;
    following_count: number;
    tweet_count: number;
    listed_count: number;
  };
  created_at?: string;
}

// Twitter API tweet response
export interface TwitterTweet {
  id: string;
  text: string;
  author_id: string;
  created_at?: string;
  public_metrics?: {
    like_count: number;
    retweet_count: number;
    reply_count: number;
    quote_count: number;
  };
}

// Search result from Twitter
export interface SearchResult {
  tweets: TwitterTweet[];
  users: TwitterUser[];
  nextToken?: string;
}

// Job data
export interface CrawlJobData {
  keywords: string[];
  maxResults: number;
}

// API response types
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Account filters for API queries
export interface AccountFilters {
  aiCategory?: Category;
  minAiConfidence?: number;
  hasGithub?: boolean;
}
