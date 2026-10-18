import { API_BASE_URL } from '../config/api';

export const listContentWithRetry = async (
  maxRetries = 3,
  retryDelays = [500, 1500, 3000]
): Promise<any[] | null> => {
  let attempt = 0;
  while (attempt <= maxRetries) {
    attempt++;
    console.log('[CLOUD_FETCH_START]', { attempt });
    try {
      const timestamp = Date.now();
      const res = await fetch(`${API_BASE_URL}/content?_t=${timestamp}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });
      if (res.ok) {
        const data = await res.json();
        const itemCount = Array.isArray(data) ? data.length : 0;
        console.log('[CLOUD_FETCH_SUCCESS]', {
          attempt,
          httpStatus: res.status,
          itemCount
        });
        return Array.isArray(data) ? data : [];
      } else {
        console.warn('[CLOUD_FETCH_FAILED]', {
          attempt,
          httpStatus: res.status,
          error: `HTTP ${res.status}`
        });
      }
    } catch (err: any) {
      console.warn('[CLOUD_FETCH_FAILED]', {
        attempt,
        error: err?.message || String(err)
      });
    }

    if (attempt <= maxRetries) {
      const delay = retryDelays[attempt - 1] || 3000;
      console.log(`[CLOUD_FETCH_RETRY] Retrying in ${delay}ms (attempt ${attempt}/${maxRetries})...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  console.error('[CLOUD_FETCH_FAILED] All catalog retries exhausted');
  return null;
};

export const listContent = async () => {
  return listContentWithRetry(0);
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
