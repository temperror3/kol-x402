import { useState } from 'react';
import { useCampaign } from '../contexts/CampaignContext';
import { createCampaign, updateCampaign, deleteCampaign, runCampaignDiscovery } from '../api/client';
import CampaignModal from '../components/CampaignModal';
import type { Campaign, CreateCampaignData, UpdateCampaignData, CampaignWithStats } from '../types';

export default function Campaigns() {
  const { campaigns, refreshCampaigns, loading, error, setCurrentCampaign } = useCampaign();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [saving, setSaving] = useState(false);
  const [runningCampaign, setRunningCampaign] = useState<string | null>(null);
  const [deletingCampaign, setDeletingCampaign] = useState<string | null>(null);

  const handleCreate = () => {
    setEditingCampaign(null);
    setModalOpen(true);
  };

  const handleEdit = (campaign: Campaign) => {
    setEditingCampaign(campaign);
    setModalOpen(true);
  };

  const handleSave = async (data: CreateCampaignData | UpdateCampaignData) => {
    setSaving(true);
    try {
      if (editingCampaign) {
        await updateCampaign(editingCampaign.id, data);
      } else {
        await createCampaign(data as CreateCampaignData);
      }
      await refreshCampaigns();
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (campaign: CampaignWithStats) => {
    if (campaign.is_default) {
      alert('Cannot delete the default campaign');
      return;
    }

    if (!confirm(`Are you sure you want to delete "${campaign.name}"? This action cannot be undone.`)) {
      return;
    }

    setDeletingCampaign(campaign.id);
    try {
      await deleteCampaign(campaign.id);
      await refreshCampaigns();
    } catch (err) {
      alert('Failed to delete campaign');
    } finally {
      setDeletingCampaign(null);
    }
  };

  const handleRun = async (campaign: CampaignWithStats) => {
    setRunningCampaign(campaign.id);
    try {
      const result = await runCampaignDiscovery(campaign.id);
      alert(`Discovery started! Job ID: ${result.jobId}`);
    } catch (err) {
      alert('Failed to start discovery');
    } finally {
      setRunningCampaign(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-indigo-100 flex items-center justify-center animate-pulse">
            <svg className="w-8 h-8 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <p className="text-slate-500 font-medium">Loading campaigns...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-rose-700">
        <div className="flex items-center gap-3">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="font-medium">{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Campaigns</h1>
          <p className="text-slate-500 mt-1">Manage your KOL discovery campaigns</p>
        </div>
        <button
          onClick={handleCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium rounded-xl hover:from-indigo-600 hover:to-purple-700 transition-all shadow-lg shadow-indigo-500/25"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          New Campaign
        </button>
      </div>

      {/* Campaign Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {campaigns.map((campaign) => (
          <div
            key={campaign.id}
            className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-slate-800 truncate">{campaign.name}</h3>
                    {campaign.is_default && (
                      <span className="px-2 py-0.5 bg-indigo-100 text-indigo-600 text-xs font-medium rounded-full">
                        Default
                      </span>
                    )}
                  </div>
                  {campaign.description && (
                    <p className="text-sm text-slate-500 mt-1 line-clamp-2">{campaign.description}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="px-6 py-4 bg-slate-50/50">
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-lg font-bold text-slate-800">{campaign.stats.total}</p>
                  <p className="text-xs text-slate-500">Total</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-amber-600">{campaign.stats.KOL}</p>
                  <p className="text-xs text-slate-500">KOLs</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-blue-600">{campaign.stats.DEVELOPER}</p>
                  <p className="text-xs text-slate-500">Devs</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-emerald-600">{campaign.stats.ACTIVE_USER}</p>
                  <p className="text-xs text-slate-500">Active</p>
                </div>
              </div>
            </div>

            {/* Search Terms */}
            <div className="px-6 py-3 border-t border-slate-100">
              <p className="text-xs font-medium text-slate-500 mb-2">Search Terms</p>
              <div className="flex flex-wrap gap-1.5">
                {campaign.search_terms.slice(0, 4).map((term, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full"
                  >
                    {term}
                  </span>
                ))}
                {campaign.search_terms.length > 4 && (
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs rounded-full">
                    +{campaign.search_terms.length - 4} more
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentCampaign(campaign)}
                  className="px-3 py-1.5 text-sm text-indigo-600 hover:text-indigo-700 font-medium hover:bg-indigo-50 rounded-lg transition-colors"
                >
                  Select
                </button>
                <button
                  onClick={() => handleEdit(campaign)}
                  className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-700 font-medium hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Edit
                </button>
                {!campaign.is_default && (
                  <button
                    onClick={() => handleDelete(campaign)}
                    disabled={deletingCampaign === campaign.id}
                    className="px-3 py-1.5 text-sm text-rose-600 hover:text-rose-700 font-medium hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {deletingCampaign === campaign.id ? 'Deleting...' : 'Delete'}
                  </button>
                )}
              </div>
              <button
                onClick={() => handleRun(campaign)}
                disabled={runningCampaign === campaign.id}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {runningCampaign === campaign.id ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Running...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Run
                  </>
                )}
              </button>
            </div>
          </div>
        ))}

        {campaigns.length === 0 && (
          <div className="col-span-full text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-700 mb-1">No campaigns yet</h3>
            <p className="text-slate-500 mb-4">Create your first campaign to start discovering KOLs</p>
            <button
              onClick={handleCreate}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white font-medium rounded-xl transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Create Campaign
            </button>
          </div>
        )}
      </div>

      {/* Modal */}
      <CampaignModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        campaign={editingCampaign}
        isLoading={saving}
      />
    </div>
  );
}
