// NarraView Studio Centralized Configuration

export const API_BASE_URL: string =
  process.env.NEXT_PUBLIC_NARRAVIEW_API_BASE_URL ||
  process.env.NEXT_PUBLIC_NARRAVIEW_API_URL ||
  "https://vif7g6ez24.execute-api.eu-north-1.amazonaws.com/prod";

/**
 * Server-side admin token retrieval with fail-fast validation (Part N).
 * Only callable in Node.js server environment (API route handlers, server actions).
 */
export function getAdminToken(): string {
  const token = process.env.NARRAVIEW_ADMIN_TOKEN;
  if (!token) {
    throw new Error(
      "NarraView Studio configuration error: NARRAVIEW_ADMIN_TOKEN is missing from server environment."
    );
  }
  return token;
}

/**
 * Base URL for admin operations.
 * In browser context, requests route through the secure server-side proxy (/api/admin)
 * so that NARRAVIEW_ADMIN_TOKEN is never exposed in browser JavaScript bundles.
 * In server context, requests use the direct API Gateway base URL.
 */
export const ADMIN_API_BASE_URL =
  typeof window !== "undefined" ? "/api/admin" : API_BASE_URL;

/**
 * Compatibility export for legacy calls before full migration.
 * Resolves to empty string in browser (server token never leaked via NEXT_PUBLIC).
 */
export const ADMIN_TOKEN: string = process.env.NARRAVIEW_ADMIN_TOKEN || "";

/**
 * Helper for performing admin API operations.
 * Automatically leverages the secure server-side proxy in browser context.
 */
export async function adminFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  if (typeof window !== "undefined") {
    // Client-side: proxy through Studio server-side route
    return fetch(`/api/admin${cleanPath}`, init);
  } else {
    // Server-side: direct to API Gateway with server-side token
    const token = getAdminToken();
    const headers = new Headers(init?.headers);
    headers.set("X-Admin-Token", token);
    return fetch(`${API_BASE_URL}${cleanPath}`, {
      ...init,
      headers,
    });
  }
}
