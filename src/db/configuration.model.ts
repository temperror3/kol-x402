import { getSupabase } from './supabase.js';
import type { SearchConfiguration, AccountConfiguration } from '../types/index.js';

const supabase = getSupabase();

export const ConfigurationModel = {
  /**
   * Create a new search configuration
   */
  async create(
    data: Omit<SearchConfiguration, 'id' | 'created_at' | 'updated_at'>
  ): Promise<SearchConfiguration | null> {
    const { data: config, error } = await supabase
      .from('search_configurations')
      .insert(data)
      .select()
      .single();

    if (error) {
      console.error('Error creating configuration:', error);
      return null;
    }
    return config;
  },

  /**
   * Get configuration by ID
   */
  async getById(id: string): Promise<SearchConfiguration | null> {
    const { data, error } = await supabase
      .from('search_configurations')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error getting configuration:', error);
      return null;
    }
    return data;
  },

  /**
   * Get configuration by name
   */
  async getByName(name: string): Promise<SearchConfiguration | null> {
    const { data, error } = await supabase
      .from('search_configurations')
      .select('*')
      .eq('name', name)
      .single();

    if (error) {
      if (error.code !== 'PGRST116') {
        // Not found is ok
        console.error('Error getting configuration by name:', error);
      }
      return null;
    }
    return data;
  },

  /**
   * Get the default configuration
   */
  async getDefault(): Promise<SearchConfiguration | null> {
    const { data, error } = await supabase
      .from('search_configurations')
      .select('*')
      .eq('is_default', true)
      .single();

    if (error) {
      if (error.code !== 'PGRST116') {
        console.error('Error getting default configuration:', error);
      }
      return null;
    }
    return data;
  },

  /**
   * List all configurations with optional filters
   */
  async list(filters: { isActive?: boolean } = {}): Promise<SearchConfiguration[]> {
    let query = supabase.from('search_configurations').select('*');

    if (filters.isActive !== undefined) {
      query = query.eq('is_active', filters.isActive);
    }

    query = query.order('is_default', { ascending: false }).order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error('Error listing configurations:', error);
      return [];
    }
    return data || [];
  },

  /**
   * Update a configuration
   */
  async update(
    id: string,
    updates: Partial<Omit<SearchConfiguration, 'id' | 'created_at' | 'updated_at'>>
  ): Promise<SearchConfiguration | null> {
    const { data, error } = await supabase
      .from('search_configurations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating configuration:', error);
      return null;
    }
    return data;
  },

  /**
   * Delete a configuration
   */
  async delete(id: string): Promise<boolean> {
    // Don't allow deleting the default configuration
    const config = await this.getById(id);
    if (config?.is_default) {
      console.error('Cannot delete the default configuration');
      return false;
    }

    const { error } = await supabase.from('search_configurations').delete().eq('id', id);

    if (error) {
      console.error('Error deleting configuration:', error);
      return false;
    }
    return true;
  },

  /**
   * Set a configuration as default (unsets all others)
   */
  async setDefault(id: string): Promise<boolean> {
    // Use a transaction-like approach: first unset all defaults, then set the new one
    const { error: unsetError } = await supabase
      .from('search_configurations')
      .update({ is_default: false })
      .eq('is_default', true);

    if (unsetError) {
      console.error('Error unsetting default configurations:', unsetError);
      return false;
    }

    const { error: setError } = await supabase
      .from('search_configurations')
      .update({ is_default: true })
      .eq('id', id);

    if (setError) {
      console.error('Error setting default configuration:', setError);
      return false;
    }

    return true;
  },

  /**
   * Get all configurations associated with an account
   */
  async getAccountConfigs(accountId: string): Promise<AccountConfiguration[]> {
    const { data, error } = await supabase
      .from('account_configurations')
      .select('*')
      .eq('account_id', accountId);

    if (error) {
      console.error('Error getting account configurations:', error);
      return [];
    }
    return data || [];
  },

  /**
   * Add or update account-configuration association
   */
  async addAccountConfig(
    accountId: string,
    configId: string,
    data: {
      relevance_score?: number;
      tweet_count_30d?: number;
      keywords_found?: string[];
    }
  ): Promise<AccountConfiguration | null> {
    const { data: result, error } = await supabase
      .from('account_configurations')
      .upsert(
        {
          account_id: accountId,
          config_id: configId,
          ...data,
          last_analyzed_at: new Date().toISOString(),
        },
        { onConflict: 'account_id,config_id' }
      )
      .select()
      .single();

    if (error) {
      console.error('Error adding account configuration:', error);
      return null;
    }
    return result;
  },

  /**
   * Bulk upsert account configurations
   */
  async bulkUpsertAccountConfigs(
    configs: Array<{
      account_id: string;
      config_id: string;
      relevance_score?: number;
      tweet_count_30d?: number;
      keywords_found?: string[];
    }>
  ): Promise<number> {
    if (configs.length === 0) return 0;

    const configsWithTimestamp = configs.map((c) => ({
      ...c,
      last_analyzed_at: new Date().toISOString(),
    }));

    const { data, error } = await supabase
      .from('account_configurations')
      .upsert(configsWithTimestamp, { onConflict: 'account_id,config_id' })
      .select();

    if (error) {
      console.error('Error bulk upserting account configurations:', error);
      return 0;
    }
    return data?.length || 0;
  },

  /**
   * Remove account-configuration association
   */
  async removeAccountConfig(accountId: string, configId: string): Promise<boolean> {
    const { error } = await supabase
      .from('account_configurations')
      .delete()
      .eq('account_id', accountId)
      .eq('config_id', configId);

    if (error) {
      console.error('Error removing account configuration:', error);
      return false;
    }
    return true;
  },

  /**
   * Get accounts for a specific configuration with pagination
   */
  async getAccountsByConfig(
    configId: string,
    options: {
      minRelevance?: number;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{
    accounts: Array<AccountConfiguration>;
    total: number;
  }> {
    const { minRelevance = 0, page = 1, limit = 50 } = options;

    let query = supabase
      .from('account_configurations')
      .select('*', { count: 'exact' })
      .eq('config_id', configId);

    if (minRelevance > 0) {
      query = query.gte('relevance_score', minRelevance);
    }

    const offset = (page - 1) * limit;
    query = query.order('relevance_score', { ascending: false }).range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error getting accounts by config:', error);
      return { accounts: [], total: 0 };
    }

    return {
      accounts: data || [],
      total: count || 0,
    };
  },

  /**
   * Get configuration stats (number of accounts, KOL/developer/active counts).
   * Uses a two-step query so counts work reliably regardless of Supabase join behavior.
   */
  async getConfigStats(configId: string): Promise<{
    accountCount: number;
    kolCount: number;
    developerCount: number;
    activeUserCount: number;
  }> {
    const { data: acRows, error: acError } = await supabase
      .from('account_configurations')
      .select('account_id')
      .eq('config_id', configId)
      .limit(10000);

    if (acError) {
      console.error('Error getting config stats (account_configurations):', acError);
      return { accountCount: 0, kolCount: 0, developerCount: 0, activeUserCount: 0 };
    }

    const accountIds = (acRows || []).map((r) => r.account_id);
    const accountCount = accountIds.length;

    if (accountIds.length === 0) {
      return { accountCount: 0, kolCount: 0, developerCount: 0, activeUserCount: 0 };
    }

    const { data: accounts, error: accError } = await supabase
      .from('accounts')
      .select('ai_category')
      .in('id', accountIds);

    if (accError) {
      console.error('Error getting config stats (accounts):', accError);
      return { accountCount, kolCount: 0, developerCount: 0, activeUserCount: 0 };
    }

    let kolCount = 0;
    let developerCount = 0;
    let activeUserCount = 0;
    (accounts || []).forEach((row: { ai_category: string | null }) => {
      const cat = row.ai_category;
      if (cat === 'KOL') kolCount++;
      else if (cat === 'DEVELOPER') developerCount++;
      else if (cat === 'ACTIVE_USER') activeUserCount++;
    });

    return {
      accountCount,
      kolCount,
      developerCount,
      activeUserCount,
    };
  },
};
