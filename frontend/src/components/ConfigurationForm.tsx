import { useState } from 'react';
import type { SearchConfiguration, CreateConfigurationInput } from '../types';

interface ConfigurationFormProps {
  initial?: SearchConfiguration | null;
  onSubmit: (data: CreateConfigurationInput) => Promise<void>;
  onCancel: () => void;
}

export default function ConfigurationForm({
  initial,
  onSubmit,
  onCancel,
}: ConfigurationFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [primaryKeywords, setPrimaryKeywords] = useState(
    initial?.primary_keywords?.join(', ') ?? ''
  );
  const [secondaryKeywords, setSecondaryKeywords] = useState(
    initial?.secondary_keywords?.join(', ') ?? ''
  );
  const [topicContext, setTopicContext] = useState(initial?.topic_context ?? '');
  const [minFollowers, setMinFollowers] = useState(initial?.min_followers ?? 1000);
  const [minRelevanceScore, setMinRelevanceScore] = useState(
    initial?.min_relevance_score ?? 30
  );
  const [isDefault, setIsDefault] = useState(initial?.is_default ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseKeywords = (s: string): string[] =>
    s
      .split(/[,;]/)
      .map((k) => k.trim())
      .filter(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const data: CreateConfigurationInput = {
        name: name.trim(),
        description: description.trim() || undefined,
        primary_keywords: parseKeywords(primaryKeywords),
        secondary_keywords: parseKeywords(secondaryKeywords),
        topic_context: topicContext.trim(),
        min_followers: minFollowers,
        min_relevance_score: minRelevanceScore,
        min_tweet_count_30d: initial?.min_tweet_count_30d ?? 3,
        is_active: true,
        is_default: isDefault,
      };
      if (data.primary_keywords.length === 0) {
        setError('Add at least one primary keyword');
        setSaving(false);
        return;
      }
      if (!data.topic_context) {
        setError('Topic context is required for AI categorization');
        setSaving(false);
        return;
      }
      await onSubmit(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          placeholder="e.g. Web3 Payments"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          placeholder="Short description of this topic"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Primary keywords *</label>
        <input
          type="text"
          value={primaryKeywords}
          onChange={(e) => setPrimaryKeywords(e.target.value)}
          className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          placeholder="Comma-separated, e.g. DeFi, #DeFi, decentralized finance"
        />
        <p className="text-xs text-slate-500 mt-1">Used for Twitter search and topic-tweet detection</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Secondary keywords</label>
        <input
          type="text"
          value={secondaryKeywords}
          onChange={(e) => setSecondaryKeywords(e.target.value)}
          className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          placeholder="Comma-separated broader terms"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Topic context *</label>
        <textarea
          value={topicContext}
          onChange={(e) => setTopicContext(e.target.value)}
          rows={4}
          className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          placeholder="Describe the topic in 1–3 sentences. This is used by the AI to judge whether accounts are genuine KOLs, developers, or active users in this space."
          required
        />
        <p className="text-xs text-slate-500 mt-1">Used in AI prompts for categorization</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Min followers</label>
          <input
            type="number"
            min={0}
            value={minFollowers}
            onChange={(e) => setMinFollowers(Number(e.target.value))}
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Min relevance score</label>
          <input
            type="number"
            min={0}
            max={100}
            value={minRelevanceScore}
            onChange={(e) => setMinRelevanceScore(Number(e.target.value))}
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="isDefault"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
        />
        <label htmlFor="isDefault" className="text-sm text-slate-700">
          Use as default configuration for searches
        </label>
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : initial ? 'Update' : 'Create'}
        </button>
      </div>
    </form>
  );
}
