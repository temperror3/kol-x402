import { useState, useRef, useEffect } from 'react';
import { useCampaign } from '../contexts/CampaignContext';
import type { CampaignWithStats } from '../types';

interface CampaignSelectorProps {
  onManage?: () => void;
}

export default function CampaignSelector({ onManage }: CampaignSelectorProps) {
  const { campaigns, currentCampaign, setCurrentCampaign, loading } = useCampaign();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSelect = (campaign: CampaignWithStats) => {
    setCurrentCampaign(campaign);
    setIsOpen(false);
  };

  if (loading) {
    return (
      <div className="px-4 py-2 bg-slate-700/50 rounded-xl animate-pulse">
        <div className="h-4 w-24 bg-slate-600 rounded" />
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 bg-slate-700/50 hover:bg-slate-700 rounded-xl flex items-center justify-between gap-2 transition-colors border border-slate-600/50"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <div className="text-left min-w-0">
            <p className="text-xs text-slate-400 font-medium">Campaign</p>
            <p className="text-sm text-white font-semibold truncate">
              {currentCampaign?.name || 'Select Campaign'}
            </p>
          </div>
        </div>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 mt-2 py-2 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-50 max-h-72 overflow-y-auto">
          {campaigns.map((campaign) => (
            <button
              key={campaign.id}
              onClick={() => handleSelect(campaign)}
              className={`w-full px-4 py-2.5 text-left hover:bg-slate-700/50 flex items-center justify-between ${
                currentCampaign?.id === campaign.id ? 'bg-slate-700/50' : ''
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm text-white font-medium truncate">{campaign.name}</p>
                  {campaign.is_default && (
                    <span className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-400 text-xs rounded-full">
                      Default
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  {campaign.stats.total} accounts | {campaign.stats.KOL} KOLs
                </p>
              </div>
              {currentCampaign?.id === campaign.id && (
                <svg className="w-4 h-4 text-indigo-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}

          {onManage && (
            <>
              <div className="border-t border-slate-700 my-2" />
              <button
                onClick={() => {
                  setIsOpen(false);
                  onManage();
                }}
                className="w-full px-4 py-2.5 text-left hover:bg-slate-700/50 flex items-center gap-2 text-slate-400 hover:text-white"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span className="text-sm">Manage Campaigns</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
