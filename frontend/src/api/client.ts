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

export default api;
