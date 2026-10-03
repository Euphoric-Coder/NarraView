import { API_BASE_URL } from '../config/api';

export interface AskNarraViewRequest {
  contentId: string;
  timestamp: number;
  question?: string;
  mode?: "ask" | "recap" | "explain_simple" | "learn";
  scene?: {
    startTime: number;
    endTime: number;
    label: string;
  };
}

export interface AskNarraViewResponse {
  mode: string;
  answer?: string;
  recap?: string;
  takeaway?: string;
  question?: string;
  options?: { id: string; text: string }[];
  correctOptionId?: string;
  explanation?: string;
  contentId: string;
  sceneId?: string;
  sceneLabel?: string;
  timestamp: number;
  spoilerSafe: boolean;
  confidence: number;
  source: string;
}

export const askNarraView = async (request: AskNarraViewRequest): Promise<AskNarraViewResponse> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.log('[NarraView API] timeout reached, aborting request');
    controller.abort();
  }, 12000); // slightly longer timeout for robust reasoning

  const endpoint = `${API_BASE_URL}/ai/ask`;

  console.log(`[NarraView API] endpoint: ${endpoint}`);
  console.log(`[NarraView API] request:\\ncontent=${request.contentId}\\ntime=${request.timestamp}\\nmode=${request.mode}\\nquestion=${request.question}\\nscene=${request.scene?.label}`);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('[NarraView API] error during fetch:', error);
    throw error;
  }

  // Clear timeout immediately after fetch succeeds
  clearTimeout(timeoutId);
  console.log('[NarraView API] fetch returned');
  console.log('[NarraView API] status:', response.status);
  console.log('[NarraView API] ok:', response.ok);

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const rawText = await response.text();
  console.log('[NarraView API] raw response:', rawText);

  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch (error) {
    console.error('[NarraView API] JSON parse failed', error);
    throw new Error('NarraView API returned invalid JSON');
  }

  // Handle potential API Gateway double-wrapping just in case
  if (data && typeof data.body === 'string' && data.statusCode) {
    console.log('[NarraView API] detected wrapped response, unwrapping');
    try {
      data = JSON.parse(data.body);
    } catch (e) {
      console.error('[NarraView API] JSON parse of body failed', e);
      throw new Error('NarraView API returned invalid JSON body');
    }
  }

  console.log('[NarraView API] response source:', data.source);
  
  return data as AskNarraViewResponse;
};
