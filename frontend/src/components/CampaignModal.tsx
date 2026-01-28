import { useState, useEffect } from 'react';
import type { Campaign, CreateCampaignData, UpdateCampaignData } from '../types';

interface CampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CreateCampaignData | UpdateCampaignData) => Promise<void>;
  campaign?: Campaign | null; // If provided, editing mode
  isLoading?: boolean;
}

export default function CampaignModal({
  isOpen,
  onClose,
  onSave,
  campaign,
  isLoading = false,
}: CampaignModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [searchTermsText, setSearchTermsText] = useState('');
  const [topicDescription, setTopicDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!campaign;

  // Initialize form when campaign changes
  useEffect(() => {
    if (campaign) {
      setName(campaign.name);
      setDescription(campaign.description || '');
      setSearchTermsText(campaign.search_terms.join('\n'));
      setTopicDescription(campaign.topic_description);
    } else {
      setName('');
      setDescription('');
      setSearchTermsText('');
      setTopicDescription('');
    }
    setError(null);
  }, [campaign, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Parse search terms (split by newlines or commas)
    const searchTerms = searchTermsText
      .split(/[\n,]/)
      .map((term) => term.trim())
      .filter((term) => term.length > 0);

    if (searchTerms.length === 0) {
      setError('Please add at least one search term');
      return;
    }

    if (topicDescription.trim().length < 10) {
      setError('Topic description must be at least 10 characters');
      return;
    }

    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || null,
        search_terms: searchTerms,
        topic_description: topicDescription.trim(),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save campaign');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-white rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-800">
              {isEditing ? 'Edit Campaign' : 'Create Campaign'}
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-sm">
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Campaign Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., DeFi KOLs, NFT Influencers"
              required
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Description
              <span className="text-slate-400 font-normal ml-1">(optional)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this campaign"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* Search Terms */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Search Terms
            </label>
            <textarea
              value={searchTermsText}
              onChange={(e) => setSearchTermsText(e.target.value)}
              placeholder="Enter keywords, one per line or comma-separated:&#10;#defi&#10;DeFi protocol&#10;yield farming"
              rows={4}
              required
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors resize-none"
            />
            <p className="mt-1 text-xs text-slate-500">
              These keywords will be used to search Twitter for relevant content
            </p>
          </div>

          {/* Topic Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Topic Description
              <span className="text-slate-400 font-normal ml-1">(for AI context)</span>
            </label>
            <textarea
              value={topicDescription}
              onChange={(e) => setTopicDescription(e.target.value)}
              placeholder="Describe the topic for AI categorization. This helps the AI understand what to look for.&#10;&#10;Example: DeFi (Decentralized Finance) encompasses protocols for lending, borrowing, trading, and yield farming on blockchain networks..."
              rows={4}
              required
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors resize-none"
            />
            <p className="mt-1 text-xs text-slate-500">
              This context is provided to the AI when categorizing accounts
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2.5 text-slate-600 hover:text-slate-800 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium rounded-xl hover:from-indigo-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-500/25"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Saving...
                </span>
              ) : isEditing ? (
                'Save Changes'
              ) : (
                'Create Campaign'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
