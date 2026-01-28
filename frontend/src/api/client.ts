import axios from 'axios';
import type {
  Account,
  Tweet,
  PaginatedResponse,
  SummaryResponse,
  ConfidenceDistribution,
  OutreachResponse,
  AccountFilters,
  Category,
  Campaign,
  CampaignWithStats,
  CampaignAccount,
  CampaignAnalytics,
  CreateCampaignData,
  UpdateCampaignData,
} from '../types';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Accounts API
export async function getAccounts(
  filters: AccountFilters = {},
  page = 1,
  limit = 50
): Promise<PaginatedResponse<Account>> {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', String(limit));

  if (filters.category) params.set('category', filters.category);
  if (filters.minConfidence !== undefined) params.set('minConfidence', String(filters.minConfidence));
  if (filters.hasGithub !== undefined) params.set('hasGithub', String(filters.hasGithub));
  if (filters.orderBy) params.set('orderBy', filters.orderBy);
  if (filters.orderDir) params.set('orderDir', filters.orderDir);

  const response = await api.get<PaginatedResponse<Account>>(`/accounts?${params.toString()}`);
  return response.data;
}

export async function getAccount(id: string): Promise<{ account: Account; tweets: Tweet[] }> {
  const response = await api.get(`/accounts/${id}`);
  return response.data;
}

export async function updateAccountCategory(
  id: string,
  category: Category,
  reasoning: string
): Promise<Account> {
  const response = await api.patch(`/accounts/${id}`, { category, reasoning });
  return response.data;
}

// Analytics API
export async function getSummary(): Promise<SummaryResponse> {
  const response = await api.get<SummaryResponse>('/analytics/summary');
  return response.data;
}

export async function getConfidenceDistribution(): Promise<ConfidenceDistribution> {
  const response = await api.get<ConfidenceDistribution>('/analytics/confidence-distribution');
  return response.data;
}

export async function exportAccounts(category?: Category, minConfidence?: number): Promise<void> {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (minConfidence !== undefined) params.set('minConfidence', String(minConfidence));

  const response = await api.get(`/analytics/export?${params.toString()}`, {
    responseType: 'blob',
  });

  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `x402-accounts-${category || 'all'}-${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function getOutreachRecommendations(
  category?: Category,
  limit = 20
): Promise<OutreachResponse> {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  params.set('limit', String(limit));

  const response = await api.get<OutreachResponse>(`/analytics/outreach?${params.toString()}`);
  return response.data;
}

// Campaigns API
export async function getCampaigns(activeOnly = true): Promise<CampaignWithStats[]> {
  const params = new URLSearchParams();
  params.set('activeOnly', String(activeOnly));

  const response = await api.get<CampaignWithStats[]>(`/campaigns?${params.toString()}`);
  return response.data;
}

export async function getCampaign(id: string): Promise<CampaignWithStats> {
  const response = await api.get<CampaignWithStats>(`/campaigns/${id}`);
  return response.data;
}

export async function getDefaultCampaign(): Promise<CampaignWithStats> {
  const response = await api.get<CampaignWithStats>('/campaigns/default/info');
  return response.data;
}

export async function createCampaign(data: CreateCampaignData): Promise<Campaign> {
  const response = await api.post<Campaign>('/campaigns', data);
  return response.data;
}

export async function updateCampaign(id: string, data: UpdateCampaignData): Promise<Campaign> {
  const response = await api.put<Campaign>(`/campaigns/${id}`, data);
  return response.data;
}

export async function deleteCampaign(id: string): Promise<{ success: boolean; message: string }> {
  const response = await api.delete<{ success: boolean; message: string }>(`/campaigns/${id}`);
  return response.data;
}

export async function runCampaignDiscovery(id: string, maxPages?: number): Promise<{
  success: boolean;
  jobId: string;
  message: string;
  campaign: { id: string; name: string };
  searchTerms: string[];
}> {
  const response = await api.post(`/campaigns/${id}/run`, { maxPages });
  return response.data;
}

export async function getCampaignAccounts(
  campaignId: string,
  filters: AccountFilters = {},
  page = 1,
  limit = 50
): Promise<PaginatedResponse<CampaignAccount>> {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', String(limit));

  if (filters.category) params.set('category', filters.category);
  if (filters.minConfidence !== undefined) params.set('minConfidence', String(filters.minConfidence));
  if (filters.orderBy) params.set('orderBy', filters.orderBy);
  if (filters.orderDir) params.set('orderDir', filters.orderDir);

  const response = await api.get<PaginatedResponse<CampaignAccount>>(
    `/campaigns/${campaignId}/accounts?${params.toString()}`
  );
  return response.data;
}

export async function getCampaignAnalytics(campaignId: string): Promise<CampaignAnalytics> {
  const response = await api.get<CampaignAnalytics>(`/campaigns/${campaignId}/analytics`);
  return response.data;
}

export default api;
