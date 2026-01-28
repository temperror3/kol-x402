import { getSupabase } from './supabase.js';
import type { Campaign, CampaignAccount, PaginatedResponse, AccountFilters, RedFlag } from '../types/index.js';

const supabase = getSupabase();

export const CampaignModel = {
  // Create a new campaign
  async create(campaign: Omit<Campaign, 'id' | 'created_at' | 'updated_at'>): Promise<Campaign | null> {
    const { data, error } = await supabase
      .from('campaigns')
      .insert(campaign)
      .select()
      .single();

    if (error) {
      console.error('Error creating campaign:', error);
      return null;
    }
    return data;
  },

  // Get campaign by ID
  async getById(id: string): Promise<Campaign | null> {
    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code !== 'PGRST116') {
        console.error('Error getting campaign:', error);
      }
      return null;
    }
    return data;
  },

  // Get default campaign
  async getDefault(): Promise<Campaign | null> {
    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('is_default', true)
      .single();

    if (error) {
      if (error.code !== 'PGRST116') {
        console.error('Error getting default campaign:', error);
      }
      return null;
    }
    return data;
  },

  // List all campaigns
  async list(activeOnly = true): Promise<Campaign[]> {
    let query = supabase
      .from('campaigns')
      .select('*')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error listing campaigns:', error);
      return [];
    }
    return data || [];
  },

  // Update campaign
  async update(id: string, updates: Partial<Omit<Campaign, 'id' | 'created_at' | 'updated_at'>>): Promise<Campaign | null> {
    const { data, error } = await supabase
      .from('campaigns')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating campaign:', error);
      return null;
    }
    return data;
  },

  // Delete campaign (not allowed for default)
  async delete(id: string): Promise<boolean> {
    // First check if it's the default
    const campaign = await this.getById(id);
    if (campaign?.is_default) {
      console.error('Cannot delete default campaign');
      return false;
    }

    const { error } = await supabase
      .from('campaigns')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting campaign:', error);
      return false;
    }
    return true;
  },
};

export const CampaignAccountModel = {
  // Upsert a campaign account
  async upsert(campaignAccount: Omit<CampaignAccount, 'id' | 'created_at' | 'updated_at'>): Promise<CampaignAccount | null> {
    const { data, error } = await supabase
      .from('campaign_accounts')
      .upsert(campaignAccount, { onConflict: 'campaign_id,account_id' })
      .select()
      .single();

    if (error) {
      console.error('Error upserting campaign account:', error);
      return null;
    }
    return data;
  },

  // Bulk upsert campaign accounts
  async bulkUpsert(campaignAccounts: Omit<CampaignAccount, 'id' | 'created_at' | 'updated_at'>[]): Promise<number> {
    const { data, error } = await supabase
      .from('campaign_accounts')
      .upsert(campaignAccounts, { onConflict: 'campaign_id,account_id' })
      .select();

    if (error) {
      console.error('Error bulk upserting campaign accounts:', error);
      return 0;
    }
    return data?.length || 0;
  },

  // List accounts for a campaign with filtering and pagination
  async listByCampaign(
    campaignId: string,
    filters: AccountFilters = {},
    page = 1,
    limit = 50,
    orderBy = 'ai_confidence',
    orderDir: 'asc' | 'desc' = 'desc'
  ): Promise<PaginatedResponse<CampaignAccount & { account: { username: string; display_name: string; bio: string | null; followers_count: number; following_count: number; profile_image_url: string | null; has_github: boolean; twitter_id: string } }>> {
    let query = supabase
      .from('campaign_accounts')
      .select(`
        *,
        account:accounts!campaign_accounts_account_id_fkey (
          twitter_id,
          username,
          display_name,
          bio,
          followers_count,
          following_count,
          profile_image_url,
          has_github
        )
      `, { count: 'exact' })
      .eq('campaign_id', campaignId);

    // Apply filters
    if (filters.aiCategory) {
      query = query.eq('ai_category', filters.aiCategory);
    }
    if (filters.minAiConfidence !== undefined) {
      query = query.gte('ai_confidence', filters.minAiConfidence);
    }

    // Pagination
    const offset = (page - 1) * limit;
    query = query.order(orderBy, { ascending: orderDir === 'asc' }).range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error listing campaign accounts:', error);
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

  // Get uncategorized accounts for a campaign
  async getUncategorizedAccounts(campaignId: string, limit = 100): Promise<Array<CampaignAccount & { account: { twitter_id: string; username: string; display_name: string; bio: string | null; followers_count: number; following_count: number; has_github: boolean } }>> {
    const { data, error } = await supabase
      .from('campaign_accounts')
      .select(`
        *,
        account:accounts!campaign_accounts_account_id_fkey (
          twitter_id,
          username,
          display_name,
          bio,
          followers_count,
          following_count,
          has_github
        )
      `)
      .eq('campaign_id', campaignId)
      .is('ai_category', null)
      .limit(limit);

    if (error) {
      console.error('Error getting uncategorized campaign accounts:', error);
      return [];
    }
    return data || [];
  },

  // Get category stats for a campaign
  async getCategoryStats(campaignId: string): Promise<Record<string, number>> {
    const [totalResult, kolResult, devResult, activeUserResult] = await Promise.all([
      supabase.from('campaign_accounts').select('*', { count: 'exact', head: true }).eq('campaign_id', campaignId),
      supabase.from('campaign_accounts').select('*', { count: 'exact', head: true }).eq('campaign_id', campaignId).eq('ai_category', 'KOL'),
      supabase.from('campaign_accounts').select('*', { count: 'exact', head: true }).eq('campaign_id', campaignId).eq('ai_category', 'DEVELOPER'),
      supabase.from('campaign_accounts').select('*', { count: 'exact', head: true }).eq('campaign_id', campaignId).eq('ai_category', 'ACTIVE_USER'),
    ]);

    if (totalResult.error || kolResult.error || devResult.error || activeUserResult.error) {
      console.error('Error getting campaign category stats');
      return { KOL: 0, DEVELOPER: 0, ACTIVE_USER: 0, UNCATEGORIZED: 0 };
    }

    const total = totalResult.count || 0;
    const kol = kolResult.count || 0;
    const developer = devResult.count || 0;
    const activeUser = activeUserResult.count || 0;
    const uncategorized = total - kol - developer - activeUser;

    return {
      KOL: kol,
      DEVELOPER: developer,
      ACTIVE_USER: activeUser,
      UNCATEGORIZED: uncategorized,
    };
  },

  // Update AI categorization for a campaign account
  async updateAICategoryEnhanced(
    campaignId: string,
    accountId: string,
    data: {
      ai_category: string;
      ai_reasoning: string;
      ai_confidence: number;
      topic_consistency_score: number;
      content_depth_score: number;
      topic_focus_score: number;
      red_flags: RedFlag[];
      primary_topics: string[];
      keywords_found?: string[];
    }
  ): Promise<boolean> {
    const { error } = await supabase
      .from('campaign_accounts')
      .update({
        ai_category: data.ai_category,
        ai_reasoning: data.ai_reasoning,
        ai_confidence: data.ai_confidence,
        topic_consistency_score: data.topic_consistency_score,
        content_depth_score: data.content_depth_score,
        topic_focus_score: data.topic_focus_score,
        red_flags: data.red_flags,
        primary_topics: data.primary_topics,
        keywords_found: data.keywords_found || [],
        ai_categorized_at: new Date().toISOString(),
      })
      .eq('campaign_id', campaignId)
      .eq('account_id', accountId);

    if (error) {
      console.error('Error updating campaign account AI category:', error);
      return false;
    }
    return true;
  },

  // Bulk update AI categorization for campaign accounts
  async bulkUpdateAICategoryEnhanced(
    campaignId: string,
    updates: Array<{
      account_id: string;
      ai_category: string;
      ai_reasoning: string;
      ai_confidence: number;
      topic_consistency_score: number;
      content_depth_score: number;
      topic_focus_score: number;
      red_flags: RedFlag[];
      primary_topics: string[];
      keywords_found?: string[];
    }>
  ): Promise<{ success: number; failed: number }> {
    const now = new Date().toISOString();
    let success = 0;
    let failed = 0;

    const batchSize = 50;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);

      const results = await Promise.all(
        batch.map(async (update) => {
          const { error } = await supabase
            .from('campaign_accounts')
            .update({
              ai_category: update.ai_category,
              ai_reasoning: update.ai_reasoning,
              ai_confidence: update.ai_confidence,
              topic_consistency_score: update.topic_consistency_score,
              content_depth_score: update.content_depth_score,
              topic_focus_score: update.topic_focus_score,
              red_flags: update.red_flags,
              primary_topics: update.primary_topics,
              keywords_found: update.keywords_found || [],
              ai_categorized_at: now,
            })
            .eq('campaign_id', campaignId)
            .eq('account_id', update.account_id);

          return error ? 'failed' : 'success';
        })
      );

      success += results.filter((r) => r === 'success').length;
      failed += results.filter((r) => r === 'failed').length;
    }

    return { success, failed };
  },

  // Get campaign account by campaign and account ID
  async getByCampaignAndAccount(campaignId: string, accountId: string): Promise<CampaignAccount | null> {
    const { data, error } = await supabase
      .from('campaign_accounts')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('account_id', accountId)
      .single();

    if (error) {
      if (error.code !== 'PGRST116') {
        console.error('Error getting campaign account:', error);
      }
      return null;
    }
    return data;
  },

  // Create campaign account linking (without AI categorization)
  async linkAccountToCampaign(campaignId: string, accountId: string, keywordsFound: string[] = []): Promise<boolean> {
    const { error } = await supabase
      .from('campaign_accounts')
      .upsert({
        campaign_id: campaignId,
        account_id: accountId,
        keywords_found: keywordsFound,
        red_flags: [],
        primary_topics: [],
      }, { onConflict: 'campaign_id,account_id' });

    if (error) {
      console.error('Error linking account to campaign:', error);
      return false;
    }
    return true;
  },

  // Bulk link accounts to campaign
  async bulkLinkAccountsToCampaign(
    campaignId: string,
    links: Array<{ account_id: string; keywords_found: string[] }>
  ): Promise<number> {
    const records = links.map((link) => ({
      campaign_id: campaignId,
      account_id: link.account_id,
      keywords_found: link.keywords_found,
      red_flags: [],
      primary_topics: [],
    }));

    const { data, error } = await supabase
      .from('campaign_accounts')
      .upsert(records, { onConflict: 'campaign_id,account_id' })
      .select();

    if (error) {
      console.error('Error bulk linking accounts to campaign:', error);
      return 0;
    }
    return data?.length || 0;
  },
};

export const CampaignTweetModel = {
  // Link a tweet to a campaign
  async linkTweetToCampaign(
    campaignId: string,
    tweetId: string,
    accountId: string,
    keywordsFound: string[] = []
  ): Promise<boolean> {
    const { error } = await supabase
      .from('campaign_tweets')
      .upsert({
        campaign_id: campaignId,
        tweet_id: tweetId,
        account_id: accountId,
        keywords_found: keywordsFound,
      }, { onConflict: 'campaign_id,tweet_id' });

    if (error) {
      console.error('Error linking tweet to campaign:', error);
      return false;
    }
    return true;
  },

  // Bulk link tweets to campaign
  async bulkLinkTweetsToCampaign(
    campaignId: string,
    tweets: Array<{ tweet_id: string; account_id: string; keywords_found: string[] }>
  ): Promise<number> {
    const records = tweets.map((t) => ({
      campaign_id: campaignId,
      tweet_id: t.tweet_id,
      account_id: t.account_id,
      keywords_found: t.keywords_found,
    }));

    const { data, error } = await supabase
      .from('campaign_tweets')
      .upsert(records, { onConflict: 'campaign_id,tweet_id' })
      .select();

    if (error) {
      console.error('Error bulk linking tweets to campaign:', error);
      return 0;
    }
    return data?.length || 0;
  },

  // Get tweets for an account in a campaign
  async getTweetsForCampaignAccount(campaignId: string, accountId: string): Promise<Array<{ tweet_id: string; keywords_found: string[] }>> {
    const { data, error } = await supabase
      .from('campaign_tweets')
      .select('tweet_id, keywords_found')
      .eq('campaign_id', campaignId)
      .eq('account_id', accountId);

    if (error) {
      console.error('Error getting campaign tweets:', error);
      return [];
    }
    return data || [];
  },
};

export const CampaignSearchQueryModel = {
  // Log a campaign search query
  async log(campaignId: string, query: string, resultsCount: number): Promise<void> {
    await supabase.from('campaign_search_queries').insert({
      campaign_id: campaignId,
      query,
      results_count: resultsCount,
      last_run_at: new Date().toISOString(),
    });
  },

  // Get search history for a campaign
  async getHistory(campaignId: string, limit = 50): Promise<Array<{ query: string; results_count: number; last_run_at: string }>> {
    const { data, error } = await supabase
      .from('campaign_search_queries')
      .select('query, results_count, last_run_at')
      .eq('campaign_id', campaignId)
      .order('last_run_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error getting campaign search history:', error);
      return [];
    }
    return data || [];
  },
};
