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
  SearchConfiguration,
  ConfigurationWithStats,
  CreateConfigurationInput,
} from '../types';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Configurations API
export async function getConfigurations(): Promise<{ data: ConfigurationWithStats[] }> {
  const response = await api.get<{ data: ConfigurationWithStats[] }>('/configurations');
  return response.data;
}

export async function getDefaultConfiguration(): Promise<SearchConfiguration | null> {
  try {
    const response = await api.get<SearchConfiguration>('/configurations/default');
    return response.data;
  } catch {
    return null;
  }
}

export async function getConfiguration(id: string): Promise<SearchConfiguration & Record<string, number>> {
  const response = await api.get(`/configurations/${id}`);
  return response.data;
}

export async function createConfiguration(
  data: CreateConfigurationInput
): Promise<SearchConfiguration> {
  const response = await api.post<SearchConfiguration>('/configurations', data);
  return response.data;
}

export async function updateConfiguration(
  id: string,
  data: Partial<CreateConfigurationInput>
): Promise<SearchConfiguration> {
  const response = await api.patch<SearchConfiguration>(`/configurations/${id}`, data);
  return response.data;
}

export async function deleteConfiguration(id: string): Promise<void> {
  await api.delete(`/configurations/${id}`);
}

export async function setDefaultConfiguration(id: string): Promise<{ success: boolean }> {
  const response = await api.post<{ success: boolean }>(`/configurations/${id}/set-default`);
  return response.data;
}

export async function triggerSearch(configId?: string, maxPages?: number): Promise<{
  success: boolean;
  jobId: string;
  configId: string;
  configName: string;
  maxPages: number;
}> {
  const response = await api.post<{
    success: boolean;
    jobId: string;
    configId: string;
    configName: string;
    maxPages: number;
  }>('/search/run', { configId, maxPages });
  return response.data;
}

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
  if (filters.configId) params.set('configId', filters.configId);
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
export async function getSummary(configId?: string): Promise<SummaryResponse> {
  const params = configId ? `?configId=${configId}` : '';
  const response = await api.get<SummaryResponse>(`/analytics/summary${params}`);
  return response.data;
}

export async function getConfidenceDistribution(): Promise<ConfidenceDistribution> {
  const response = await api.get<ConfidenceDistribution>('/analytics/confidence-distribution');
  return response.data;
}

export async function exportAccounts(
  category?: Category,
  minConfidence?: number,
  configId?: string
): Promise<void> {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (minConfidence !== undefined) params.set('minConfidence', String(minConfidence));
  if (configId) params.set('configId', configId);

  const response = await api.get(`/analytics/export?${params.toString()}`, {
    responseType: 'blob',
  });

  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `kol-accounts-${category || 'all'}-${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function getOutreachRecommendations(
  category?: Category,
  limit = 20,
  configId?: string
): Promise<OutreachResponse> {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (configId) params.set('configId', configId);
  params.set('limit', String(limit));

  const response = await api.get<OutreachResponse>(`/analytics/outreach?${params.toString()}`);
  return response.data;
}

export default api;
