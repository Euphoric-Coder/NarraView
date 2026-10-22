import { API_BASE_URL } from '../config/api';

export type ExplanationStyle = 'standard' | 'simple' | 'very_simple';
export type Verbosity = 'brief' | 'normal' | 'detailed';

export interface ViewerAccessibilityProfile {
  viewerId: string;
  explanationStyle: ExplanationStyle;
  verbosity: Verbosity;
  jargonSupport: boolean;
  entityReminders: boolean;
  conceptReminders: boolean;
  stepByStep: boolean;
  reducedCognitiveLoad: boolean;
  autoExplainComplexTerms: boolean;
  updatedAt: string;
}

export const DEFAULT_ACCESSIBILITY_PROFILE: Omit<ViewerAccessibilityProfile, 'viewerId' | 'updatedAt'> = {
  explanationStyle: 'standard',
  verbosity: 'normal',
  jargonSupport: true,
  entityReminders: true,
  conceptReminders: true,
  stepByStep: false,
  reducedCognitiveLoad: false,
  autoExplainComplexTerms: false,
};

let cachedProfile: ViewerAccessibilityProfile | null = null;
let cachedViewerId: string | null = null;

export const getCachedAccessibilityProfile = (): ViewerAccessibilityProfile | null => {
  return cachedProfile;
};

export const fetchAccessibilityProfile = async (viewerId: string): Promise<ViewerAccessibilityProfile> => {
  if (cachedProfile && cachedViewerId === viewerId) {
    return cachedProfile;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/viewer/${encodeURIComponent(viewerId)}/accessibility`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (res.ok) {
      const data: ViewerAccessibilityProfile = await res.json();
      cachedProfile = data;
      cachedViewerId = viewerId;
      return data;
    }
  } catch (e) {
    console.warn('[ACCESSIBILITY_API] Could not fetch profile, using defaults:', e);
  }

  const fallback: ViewerAccessibilityProfile = {
    viewerId,
    ...DEFAULT_ACCESSIBILITY_PROFILE,
    updatedAt: new Date().toISOString()
  };
  cachedProfile = fallback;
  cachedViewerId = viewerId;
  return fallback;
};

export const updateAccessibilityProfile = async (
  viewerId: string, 
  updates: Partial<ViewerAccessibilityProfile>
): Promise<ViewerAccessibilityProfile> => {
  try {
    const res = await fetch(`${API_BASE_URL}/viewer/${encodeURIComponent(viewerId)}/accessibility`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });

    if (res.ok) {
      const data: ViewerAccessibilityProfile = await res.json();
      cachedProfile = data;
      cachedViewerId = viewerId;
      return data;
    }
  } catch (e) {
    console.warn('[ACCESSIBILITY_API] Could not persist profile update:', e);
  }

  const merged: ViewerAccessibilityProfile = {
    ...(cachedProfile || { viewerId, ...DEFAULT_ACCESSIBILITY_PROFILE, updatedAt: new Date().toISOString() }),
    ...updates,
    viewerId,
    updatedAt: new Date().toISOString()
  };
  cachedProfile = merged;
  cachedViewerId = viewerId;
  return merged;
};
