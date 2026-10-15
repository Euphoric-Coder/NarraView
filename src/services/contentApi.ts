import { API_BASE_URL } from '../config/api';

export const listContent = async () => {
  try {
    const timestamp = Date.now();
    const res = await fetch(`${API_BASE_URL}/content?_t=${timestamp}`, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });
    if (!res.ok) throw new Error('Failed to fetch content library');
    const data = await res.json();
    if (Array.isArray(data)) {
      console.log('[CLOUD_CATALOG_RAW]', data.map((d: any) => ({
        contentId: d.contentId,
        title: d.title,
        aiReady: d.aiReady,
        runtimeProvider: d.runtimeProvider,
        mediaPlayable: d.mediaPlayable,
        contentType: d.contentType,
        durationSeconds: d.durationSeconds
      })));
    }
    return data;
  } catch (error) {
    console.warn('listContent failed, falling back to local demo data', error);
    return null;
  }
};

export const getContent = async (contentId: string) => {
  try {
    const timestamp = Date.now();
    const res = await fetch(`${API_BASE_URL}/content/${encodeURIComponent(contentId)}?_t=${timestamp}`, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });
    if (!res.ok) throw new Error(`Failed to fetch content details for ${contentId}`);
    return await res.json();
  } catch (error) {
    console.warn(`getContent failed for ${contentId}, falling back to local data`, error);
    return null;
  }
};
