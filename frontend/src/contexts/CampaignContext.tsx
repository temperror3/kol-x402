import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { getCampaigns } from '../api/client';
import type { CampaignWithStats } from '../types';

interface CampaignContextType {
  campaigns: CampaignWithStats[];
  currentCampaign: CampaignWithStats | null;
  setCurrentCampaign: (campaign: CampaignWithStats | null) => void;
  refreshCampaigns: () => Promise<void>;
  loading: boolean;
  error: string | null;
}

const CampaignContext = createContext<CampaignContextType | undefined>(undefined);

export function CampaignProvider({ children }: { children: ReactNode }) {
  const [campaigns, setCampaigns] = useState<CampaignWithStats[]>([]);
  const [currentCampaign, setCurrentCampaign] = useState<CampaignWithStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshCampaigns = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const campaignsList = await getCampaigns(true);
      setCampaigns(campaignsList);

      // If no current campaign selected, try to get the default
      if (!currentCampaign) {
        // Find the default campaign in the list
        const defaultCampaign = campaignsList.find((c) => c.is_default);
        if (defaultCampaign) {
          setCurrentCampaign(defaultCampaign);
        } else if (campaignsList.length > 0) {
          // Fall back to first campaign
          setCurrentCampaign(campaignsList[0]);
        }
      } else {
        // Refresh current campaign data
        const updated = campaignsList.find((c) => c.id === currentCampaign.id);
        if (updated) {
          setCurrentCampaign(updated);
        }
      }
    } catch (err) {
      console.error('Failed to load campaigns:', err);
      setError('Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  }, [currentCampaign]);

  // Load campaigns on mount
  useEffect(() => {
    refreshCampaigns();
  }, []);

  // Save current campaign ID to localStorage
  useEffect(() => {
    if (currentCampaign) {
      localStorage.setItem('currentCampaignId', currentCampaign.id);
    }
  }, [currentCampaign]);

  // Restore current campaign from localStorage on initial load
  useEffect(() => {
    const savedCampaignId = localStorage.getItem('currentCampaignId');
    if (savedCampaignId && campaigns.length > 0 && !currentCampaign) {
      const saved = campaigns.find((c) => c.id === savedCampaignId);
      if (saved) {
        setCurrentCampaign(saved);
      }
    }
  }, [campaigns, currentCampaign]);

  const value = {
    campaigns,
    currentCampaign,
    setCurrentCampaign,
    refreshCampaigns,
    loading,
    error,
  };

  return (
    <CampaignContext.Provider value={value}>
      {children}
    </CampaignContext.Provider>
  );
}

export function useCampaign() {
  const context = useContext(CampaignContext);
  if (context === undefined) {
    throw new Error('useCampaign must be used within a CampaignProvider');
  }
  return context;
}
