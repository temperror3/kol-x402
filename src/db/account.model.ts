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
    orderBy = 'ai_confidence',
    orderDir: 'asc' | 'desc' = 'desc'
  ): Promise<PaginatedResponse<Account>> {
    let query = supabase.from('accounts').select('*', { count: 'exact' });

    if (filters.aiCategory) {
      query = query.eq('ai_category', filters.aiCategory);
    }
    if (filters.minAiConfidence !== undefined) {
      query = query.gte('ai_confidence', filters.minAiConfidence);
    }
    if (filters.hasGithub !== undefined) {
      query = query.eq('has_github', filters.hasGithub);
    }
    if (filters.configId) {
      const { data: acRows } = await supabase
        .from('account_configurations')
        .select('account_id')
        .eq('config_id', filters.configId);
      const accountIds = (acRows || []).map((r: { account_id: string }) => r.account_id);
      if (accountIds.length === 0) {
        return { data: [], pagination: { page, limit, total: 0, totalPages: 0 } };
      }
      query = query.in('id', accountIds);
    }

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

  // Get AI category stats
  async getAICategoryStats(): Promise<Record<string, number>> {
    // Use separate count queries for each category to avoid Supabase's default 1000 row limit
    // Get total count and categorized counts, then calculate UNCATEGORIZED as the difference
    const [totalResult, kolResult, devResult, activeUserResult] = await Promise.all([
      supabase.from('accounts').select('*', { count: 'exact', head: true }),
      supabase.from('accounts').select('*', { count: 'exact', head: true }).eq('ai_category', 'KOL'),
      supabase.from('accounts').select('*', { count: 'exact', head: true }).eq('ai_category', 'DEVELOPER'),
      supabase.from('accounts').select('*', { count: 'exact', head: true }).eq('ai_category', 'ACTIVE_USER'),
    ]);

    if (totalResult.error || kolResult.error || devResult.error || activeUserResult.error) {
      console.error('Error getting AI category stats:', {
        total: totalResult.error,
        kol: kolResult.error,
        dev: devResult.error,
        activeUser: activeUserResult.error,
      });
      return { KOL: 0, DEVELOPER: 0, ACTIVE_USER: 0, UNCATEGORIZED: 0 };
    }

    const total = totalResult.count || 0;
    const kol = kolResult.count || 0;
    const developer = devResult.count || 0;
    const activeUser = activeUserResult.count || 0;
    // UNCATEGORIZED includes all accounts not in the three main categories (NULL, empty string, or any other value)
    const uncategorized = total - kol - developer - activeUser;

    return {
      KOL: kol,
      DEVELOPER: developer,
      ACTIVE_USER: activeUser,
      UNCATEGORIZED: uncategorized,
    };
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

  // Update AI categorization
  async updateAICategory(
    twitterId: string,
    data: {
      ai_category: string;
      ai_reasoning: string;
      ai_confidence: number;
    }
  ): Promise<boolean> {
    const { error } = await supabase
      .from('accounts')
      .update({
        ...data,
        ai_categorized_at: new Date().toISOString(),
      })
      .eq('twitter_id', twitterId);

    if (error) {
      console.error('Error updating AI category:', error);
      return false;
    }
    return true;
  },

  // Update AI categorization with enhanced quality scores
  async updateAICategoryEnhanced(
    twitterId: string,
    data: {
      ai_category: string;
      ai_reasoning: string;
      ai_confidence: number;
      topic_consistency_score: number;
      content_depth_score: number;
      topic_focus_score: number;
      red_flags: Array<{ type: string; description: string; severity: string }>;
      primary_topics: string[];
    }
  ): Promise<boolean> {
    const { error } = await supabase
      .from('accounts')
      .update({
        ai_category: data.ai_category,
        ai_reasoning: data.ai_reasoning,
        ai_confidence: data.ai_confidence,
        topic_consistency_score: data.topic_consistency_score,
        content_depth_score: data.content_depth_score,
        topic_focus_score: data.topic_focus_score,
        red_flags: data.red_flags,
        primary_topics: data.primary_topics,
        ai_categorized_at: new Date().toISOString(),
      })
      .eq('twitter_id', twitterId);

    if (error) {
      console.error('Error updating enhanced AI category:', error);
      return false;
    }
    return true;
  },

  // Get accounts needing AI categorization (never run through AI yet).
  // New accounts have ai_category = 'UNCATEGORIZED' (DB default) and ai_categorized_at = null.
  async getUncategorizedAccounts(limit = 100): Promise<Account[]> {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .is('ai_categorized_at', null)
      .limit(limit);

    if (error) {
      console.error('Error getting uncategorized accounts:', error);
      return [];
    }
    return data || [];
  },

  // Bulk update AI categorization with enhanced quality scores
  async bulkUpdateAICategoryEnhanced(
    updates: Array<{
      twitter_id: string;
      ai_category: string;
      ai_reasoning: string;
      ai_confidence: number;
      topic_consistency_score: number;
      content_depth_score: number;
      topic_focus_score: number;
      red_flags: Array<{ type: string; description: string; severity: string }>;
      primary_topics: string[];
    }>
  ): Promise<{ success: number; failed: number }> {
    const now = new Date().toISOString();
    let success = 0;
    let failed = 0;

    // Process in batches to avoid overwhelming the database
    const batchSize = 50;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);

      // Use Promise.all for parallel updates within each batch
      const results = await Promise.all(
        batch.map(async (update) => {
          const { error } = await supabase
            .from('accounts')
            .update({
              ai_category: update.ai_category,
              ai_reasoning: update.ai_reasoning,
              ai_confidence: update.ai_confidence,
              topic_consistency_score: update.topic_consistency_score,
              content_depth_score: update.content_depth_score,
              topic_focus_score: update.topic_focus_score,
              red_flags: update.red_flags,
              primary_topics: update.primary_topics,
              ai_categorized_at: now,
            })
            .eq('twitter_id', update.twitter_id);

          return error ? 'failed' : 'success';
        })
      );

      success += results.filter((r) => r === 'success').length;
      failed += results.filter((r) => r === 'failed').length;
    }

    return { success, failed };
  },

  // Get accounts by usernames
  async getByUsernames(usernames: string[]): Promise<Account[]> {
    if (usernames.length === 0) return [];

    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .in('username', usernames);

    if (error) {
      console.error('Error getting accounts by usernames:', error);
      return [];
    }
    return data || [];
  },

  // Bulk update AI categorization (for secondary categorization)
  async bulkUpdateAICategorization(
    updates: Array<{
      twitter_id: string;
      ai_category: string;
      ai_reasoning: string;
      ai_confidence: number;
    }>
  ): Promise<{ success: number; failed: number }> {
    const now = new Date().toISOString();
    let success = 0;
    let failed = 0;

    // Process in batches to avoid overwhelming the database
    const batchSize = 50;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);

      // Use Promise.all for parallel updates within each batch
      const results = await Promise.all(
        batch.map(async (update) => {
          const { error } = await supabase
            .from('accounts')
            .update({
              ai_category: update.ai_category,
              ai_reasoning: update.ai_reasoning,
              ai_confidence: update.ai_confidence,
              ai_categorized_at: now,
            })
            .eq('twitter_id', update.twitter_id);

          return error ? 'failed' : 'success';
        })
      );

      success += results.filter((r) => r === 'success').length;
      failed += results.filter((r) => r === 'failed').length;
    }

    return { success, failed };
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
      .not('keywords_found', 'eq', '{}');

    if (error) {
      console.error('Error counting x402 tweets:', error);
      return 0;
    }
    return count || 0;
  },
};

export const SearchQueryModel = {
  // Log a search query (optional configId links to search_configurations)
  async log(query: string, resultsCount: number, configId?: string): Promise<void> {
    await supabase.from('search_queries').insert({
      query,
      results_count: resultsCount,
      last_run_at: new Date().toISOString(),
      ...(configId && { config_id: configId }),
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
