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

// Search Configuration (user-defined topics)
export interface SearchConfiguration {
  id: string;
  name: string;
  description?: string;
  primary_keywords: string[];
  secondary_keywords: string[];
  topic_context: string;
  min_followers: number;
  min_relevance_score: number;
  min_tweet_count_30d: number;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

// Account-Configuration relationship (many-to-many)
export interface AccountConfiguration {
  id: string;
  account_id: string;
  config_id: string;
  relevance_score: number;
  tweet_count_30d: number;
  keywords_found: string[];
  discovered_at: string;
  last_analyzed_at?: string;
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
  keywords_found: string[]; // Renamed from x402_keywords_found
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
  /** Filter by search configuration: only accounts linked to this config */
  configId?: string;
}

// Red flag types for KOL quality assessment
export type RedFlagType =
  | 'company_founder'
  | 'corporate_account'
  | 'self_promotion'
  | 'bot_like_behavior'
  | 'only_retweets'
  | 'engagement_farming'
  | 'low_quality_content'
  | 'shill_behavior';

export type RedFlagSeverity = 'low' | 'medium' | 'high';

export interface RedFlag {
  type: RedFlagType;
  description: string;
  severity: RedFlagSeverity;
}

// Enhanced AI categorization result with quality scores
export interface EnhancedAICategoryResult {
  category: 'KOL' | 'UNCATEGORIZED';
  confidence: number;
  reasoning: string;
  topicConsistencyScore: number;
  contentDepthScore: number;
  topicFocusScore: number;
  redFlags: RedFlag[];
  primaryTopics: string[];
}
