/**
 * NarraView Vega Centralized Client Configuration
 * 
 * Centralized, client-safe configuration for the Vega application.
 * Sourced directly from build-time generated constants (src/config/generated.ts)
 * with graceful fallbacks for testing environments.
 * Secrets (AWS credentials, admin tokens, bearer tokens) MUST NEVER be placed here.
 */

import { GENERATED_CONFIG } from './generated';

declare const __DEV__: boolean | undefined;

/**
 * Determines whether the current execution is in development/debug mode.
 * Evaluates GENERATED_CONFIG.BUILD_MODE first (authoritative compile-time build mode),
 * then falls back to __DEV__ / process.env for Jest test environments.
 */
export function isDevEnvironment(): boolean {
  if (GENERATED_CONFIG && GENERATED_CONFIG.BUILD_MODE === 'production') {
    return false;
  }
  if (GENERATED_CONFIG && GENERATED_CONFIG.BUILD_MODE === 'development') {
    return true;
  }
  if (typeof __DEV__ !== 'undefined') {
    return Boolean(__DEV__);
  }
  return typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';
}

// Canonical defaults
export const DEFAULT_API_BASE_URL = 'https://vif7g6ez24.execute-api.eu-north-1.amazonaws.com/prod';
export const DEFAULT_AWS_REGION = 'eu-north-1';
export const DEFAULT_DEMO_VIEWER_ID = 'narraview-demo-viewer';

/**
 * Resolves the active demo viewer ID with strict production safety (Part E).
 * In production/release builds, demo viewer ID is ALWAYS ignored and evaluates to null
 * so that production installations NEVER share a demo identity.
 */
export function resolveDemoViewerId(
  isDev: boolean = isDevEnvironment(),
  configuredId: string | null = (typeof process !== 'undefined' && process.env?.NARRAVIEW_DEMO_VIEWER_ID !== undefined)
    ? process.env.NARRAVIEW_DEMO_VIEWER_ID
    : (GENERATED_CONFIG ? GENERATED_CONFIG.DEMO_VIEWER_ID : DEFAULT_DEMO_VIEWER_ID)
): string | null {
  if (!isDev) {
    if (configuredId) {
      console.warn('[CONFIG_GUARD] Production release detected: NARRAVIEW_DEMO_VIEWER_ID is strictly disabled in production.');
    }
    return null;
  }
  return configuredId || null;
}

/**
 * Validates required configuration with fail-fast semantics (Part N).
 */
export function validateConfig(apiUrl: string | undefined): void {
  if (!apiUrl || typeof apiUrl !== 'string' || apiUrl.trim().length === 0) {
    throw new Error('NarraView configuration error: API base URL is missing.');
  }
}

// Resolved configuration values
const rawApiUrl = (typeof process !== 'undefined' && process.env?.NARRAVIEW_API_BASE_URL)
  || (GENERATED_CONFIG && GENERATED_CONFIG.API_BASE_URL)
  || DEFAULT_API_BASE_URL;

validateConfig(rawApiUrl);

export const IS_DEV: boolean = isDevEnvironment();
export const API_BASE_URL: string = rawApiUrl;
export const AWS_REGION: string = (typeof process !== 'undefined' && process.env?.NARRAVIEW_AWS_REGION)
  || (GENERATED_CONFIG && GENERATED_CONFIG.AWS_REGION)
  || DEFAULT_AWS_REGION;

export const DEMO_VIEWER_ID: string | null = resolveDemoViewerId(IS_DEV);

export function logRealVegaConfig(): void {
  console.log('[REAL_VEGA_CONFIG]', {
    apiBaseUrl: API_BASE_URL,
    awsRegion: AWS_REGION,
    demoViewerEnabled: Boolean(DEMO_VIEWER_ID)
  });
}

// Telemetry for real Vega bundle (Section 12)
logRealVegaConfig();

if (IS_DEV) {
  console.log('[CONFIG_READY]', {
    apiBaseUrl: API_BASE_URL,
    region: AWS_REGION,
    demoViewerEnabled: Boolean(DEMO_VIEWER_ID)
  });
}
