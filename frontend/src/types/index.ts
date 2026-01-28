export type Category = 'KOL' | 'DEVELOPER' | 'ACTIVE_USER' | 'UNCATEGORIZED';

export interface Account {
  id: string;
  twitter_id: string;
  username: string;
  display_name: string;
  bio: string | null;
  followers_count: number;
  following_count: number;
  tweet_count: number;
  profile_image_url: string | null;
  has_github: boolean;
  ai_category: Category | null;
  ai_reasoning: string | null;
  ai_confidence: number | null;
  ai_categorized_at: string | null;
  created_at: string;
  updated_at: string;
}

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

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface SummaryResponse {
  total: number;
  byCategory: Record<Category | 'UNCATEGORIZED', number>;
  percentages: Record<Category | 'UNCATEGORIZED', string>;
  topAccounts: {
    KOL: TopAccount[];
    DEVELOPER: TopAccount[];
    ACTIVE_USER: TopAccount[];
  };
}

export interface TopAccount {
  username: string;
  display_name: string;
  followers?: number;
  confidence: number;
  reasoning: string;
  has_github?: boolean;
  twitter_url: string;
}

export interface ConfidenceDistribution {
  overall: { range: string; count: number }[];
  byCategory: Record<Category | 'UNCATEGORIZED', { range: string; count: number }[]>;
}

export interface OutreachRecommendation {
  account: {
    username: string;
    display_name: string;
    twitter_url: string;
    category: Category;
    confidence: number;
    reasoning: string | null;
    followers_count: number;
    bio: string | null;
  };
  recommendation: {
    priority: 'high' | 'medium' | 'low';
    action: string;
    template: string;
  };
}

export interface OutreachResponse {
  total: number;
  byPriority: {
    high: OutreachRecommendation[];
    medium: OutreachRecommendation[];
    low: OutreachRecommendation[];
  };
  all: OutreachRecommendation[];
}

export interface AccountFilters {
  category?: Category;
  minConfidence?: number;
  hasGithub?: boolean;
  orderBy?: 'ai_confidence' | 'followers_count' | 'created_at' | 'ai_categorized_at';
  orderDir?: 'asc' | 'desc';
}

// Campaign types
export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  search_terms: string[];
  topic_description: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CampaignStats {
  total: number;
  KOL: number;
  DEVELOPER: number;
  ACTIVE_USER: number;
  UNCATEGORIZED: number;
}

export interface CampaignWithStats extends Campaign {
  stats: CampaignStats;
}

export interface CampaignAccount {
  id: string;
  campaign_id: string;
  account_id: string;
  // Account info
  twitter_id: string;
  username: string;
  display_name: string;
  bio: string | null;
  followers_count: number;
  following_count: number;
  profile_image_url: string | null;
  has_github: boolean;
  twitter_url: string | null;
  // AI categorization for this campaign
  ai_category: Category | null;
  ai_confidence: number | null;
  ai_reasoning: string | null;
  ai_categorized_at: string | null;
  // Quality scores
  topic_consistency_score: number | null;
  content_depth_score: number | null;
  topic_focus_score: number | null;
  red_flags: Array<{ type: string; description: string; severity: string }>;
  primary_topics: string[];
  keywords_found: string[];
  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface CampaignAnalytics {
  campaign: {
    id: string;
    name: string;
  };
  total: number;
  byCategory: Record<Category | 'UNCATEGORIZED', number>;
  percentages: Record<Category | 'UNCATEGORIZED', string>;
  topAccounts: {
    KOL: TopAccount[];
    DEVELOPER: TopAccount[];
    ACTIVE_USER: TopAccount[];
  };
}

export interface CreateCampaignData {
  name: string;
  description?: string | null;
  search_terms: string[];
  topic_description: string;
  is_active?: boolean;
}

export interface UpdateCampaignData {
  name?: string;
  description?: string | null;
  search_terms?: string[];
  topic_description?: string;
  is_active?: boolean;
}
