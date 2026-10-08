import { API_BASE_URL } from '../api'; // Or define it directly if missing

export const listContent = async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/content`);
    if (!res.ok) throw new Error('Failed to fetch content library');
    return await res.json();
  } catch (error) {
    console.warn('listContent failed, falling back to local demo data', error);
    return null;
  }
};

export const getContent = async (contentId: string) => {
  try {
    const res = await fetch(`${API_BASE_URL}/content/${contentId}`);
    if (!res.ok) throw new Error(`Failed to fetch content details for ${contentId}`);
    return await res.json();
  } catch (error) {
    console.warn(`getContent failed for ${contentId}, falling back to local data`, error);
    return null;
  }
};
