import { getSupabase } from './supabase.js';
import type { Account, Tweet, AccountFilters, PaginatedResponse } from '../types/index.js';

const supabase = getSupabase();

export const AccountModel = {
  // Create or update account (upsert)
  async upsert(account: Omit<Account, 'id' | 'created_at' | 'updated_at'>): Promise<Account | null> {
    const { data, error } = await supabase
      .from('accounts')
      .upsert(account, { onConflict: 'twitter_id' })
      .select()
      .single();

    if (error) {
      console.error('Error upserting account:', error);
      return null;
    }
    return data;
  },

  // Bulk upsert accounts
  async bulkUpsert(accounts: Omit<Account, 'id' | 'created_at' | 'updated_at'>[]): Promise<number> {
    const { data, error } = await supabase
      .from('accounts')
      .upsert(accounts, { onConflict: 'twitter_id' })
      .select();

    if (error) {
      console.error('Error bulk upserting accounts:', error);
      return 0;
    }
    return data?.length || 0;
  },

  // Get account by Twitter ID
  async getByTwitterId(twitterId: string): Promise<Account | null> {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('twitter_id', twitterId)
      .single();

    if (error) {
      if (error.code !== 'PGRST116') { // Not found is ok
        console.error('Error getting account:', error);
      }
      return null;
    }
    return data;
  },

  // Get account by ID
  async getById(id: string): Promise<Account | null> {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error getting account:', error);
      return null;
    }
    return data;
  },

  // List accounts with filtering and pagination
  async list(
    filters: AccountFilters = {},
    page = 1,
    limit = 50,
    orderBy = 'confidence',
    orderDir: 'asc' | 'desc' = 'desc'
  ): Promise<PaginatedResponse<Account>> {
    let query = supabase.from('accounts').select('*', { count: 'exact' });

    // Apply filters
    if (filters.category) {
      query = query.eq('category', filters.category);
    }
    if (filters.minEngagementScore !== undefined) {
      query = query.gte('engagement_score', filters.minEngagementScore);
    }
    if (filters.minTechScore !== undefined) {
      query = query.gte('tech_score', filters.minTechScore);
    }
    if (filters.minX402Relevance !== undefined) {
      query = query.gte('x402_relevance', filters.minX402Relevance);
    }
    if (filters.minConfidence !== undefined) {
      query = query.gte('confidence', filters.minConfidence);
    }
    if (filters.hasGithub !== undefined) {
      query = query.eq('has_github', filters.hasGithub);
    }

    // Pagination
    const offset = (page - 1) * limit;
    query = query.order(orderBy, { ascending: orderDir === 'asc' }).range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error listing accounts:', error);
      return { data: [], pagination: { page, limit, total: 0, totalPages: 0 } };
    }

    const total = count || 0;
    return {
      data: data || [],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  // Get category stats
  async getCategoryStats(): Promise<Record<string, number>> {
    const { data, error } = await supabase.from('accounts').select('category');

    if (error) {
      console.error('Error getting category stats:', error);
      return {};
    }

    const stats: Record<string, number> = {
      KOL: 0,
      DEVELOPER: 0,
      ACTIVE_USER: 0,
      UNCATEGORIZED: 0,
    };

    data?.forEach((row) => {
      if (row.category in stats) {
        stats[row.category]++;
      }
    });

    return stats;
  },

  // Update account scores and category
  async updateScores(
    twitterId: string,
    scores: {
      engagement_score: number;
      tech_score: number;
      x402_relevance: number;
      confidence: number;
      category: string;
      x402_tweet_count_30d: number;
      has_github: boolean;
      uses_technical_terms: boolean;
      posts_code_snippets: boolean;
    }
  ): Promise<boolean> {
    const { error } = await supabase
      .from('accounts')
      .update({ ...scores, last_enriched_at: new Date().toISOString() })
      .eq('twitter_id', twitterId);

    if (error) {
      console.error('Error updating scores:', error);
      return false;
    }
    return true;
  },

  // Delete account
  async delete(id: string): Promise<boolean> {
    const { error } = await supabase.from('accounts').delete().eq('id', id);

    if (error) {
      console.error('Error deleting account:', error);
      return false;
    }
    return true;
  },

  // Get accounts needing enrichment (not enriched in last 24 hours)
  async getStaleAccounts(limit = 100): Promise<Account[]> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .or(`last_enriched_at.is.null,last_enriched_at.lt.${oneDayAgo}`)
      .limit(limit);

    if (error) {
      console.error('Error getting stale accounts:', error);
      return [];
    }
    return data || [];
  },
};

export const TweetModel = {
  // Bulk insert tweets
  async bulkInsert(tweets: Omit<Tweet, 'id'>[]): Promise<number> {
    const { data, error } = await supabase
      .from('tweets')
      .upsert(tweets, { onConflict: 'twitter_id' })
      .select();

    if (error) {
      console.error('Error bulk inserting tweets:', error);
      return 0;
    }
    return data?.length || 0;
  },

  // Get tweets for account
  async getByAccountId(accountId: string, limit = 100): Promise<Tweet[]> {
    const { data, error } = await supabase
      .from('tweets')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error getting tweets:', error);
      return [];
    }
    return data || [];
  },

  // Get recent tweets (last 30 days) for analysis
  async getRecentByAccountId(accountId: string): Promise<Tweet[]> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('tweets')
      .select('*')
      .eq('account_id', accountId)
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error getting recent tweets:', error);
      return [];
    }
    return data || [];
  },

  // Count x402 tweets in last 30 days
  async countX402Tweets30d(accountId: string): Promise<number> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { count, error } = await supabase
      .from('tweets')
      .select('*', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .gte('created_at', thirtyDaysAgo)
      .not('x402_keywords_found', 'eq', '{}');

    if (error) {
      console.error('Error counting x402 tweets:', error);
      return 0;
    }
    return count || 0;
  },
};

export const SearchQueryModel = {
  // Log a search query
  async log(query: string, resultsCount: number): Promise<void> {
    await supabase.from('search_queries').insert({
      query,
      results_count: resultsCount,
      last_run_at: new Date().toISOString(),
    });
  },

  // Get search history
  async getHistory(limit = 50): Promise<Array<{ query: string; results_count: number; last_run_at: string }>> {
    const { data, error } = await supabase
      .from('search_queries')
      .select('query, results_count, last_run_at')
      .order('last_run_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error getting search history:', error);
      return [];
    }
    return data || [];
  },
};
