import { AsyncStorage } from '@amazon-devices/react-native-kepler';
import { DEMO_VIEWER_ID, isDevEnvironment } from '../config/env';

const VIEWER_ID_STORAGE_KEY = '@narraview_viewer_id_v1';

// Persistent fallback store across simulated process restarts
const persistentFallbackStore = new Map<string, string>();

export type ViewerIdSource = 'override' | 'demo_config' | 'persistent_storage' | 'generated';

let cachedViewerId: string | null = null;
let viewerIdOverride: string | null = null;
let viewerIdPromise: Promise<string> | null = null;
let lastViewerIdSource: ViewerIdSource | null = null;
let demoViewerConfigEnabled: boolean = true;

/* eslint-disable no-bitwise */
function generateUUID(): string {
  // eslint-disable-next-line no-undef
  const globalRef: any = typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : null);
  const globalCrypto = globalRef?.crypto;
  if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
    return globalCrypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
/* eslint-enable no-bitwise */

async function safeGetItem(key: string): Promise<string | null> {
  try {
    if (AsyncStorage && typeof AsyncStorage.getItem === 'function') {
      const val = await AsyncStorage.getItem(key);
      if (typeof val === 'string' && val.trim().length > 0) {
        return val.trim();
      }
    }
  } catch (e) {
    console.warn('[VIEWER_STORAGE] safeGetItem error:', e);
  }
  return persistentFallbackStore.get(key) || null;
}

async function safeSetItem(key: string, value: string): Promise<void> {
  persistentFallbackStore.set(key, value);
  try {
    if (AsyncStorage && typeof AsyncStorage.setItem === 'function') {
      await AsyncStorage.setItem(key, value);
    }
  } catch (e) {
    console.warn('[VIEWER_STORAGE] safeSetItem error:', e);
  }
}

/**
 * Resolves viewer ID based on authoritative 4-level precedence (Part D & E):
 * 1. explicit testing override
 * 2. configured development/demo viewer ID (strictly active ONLY in dev/debug)
 * 3. persisted anonymous viewer ID from local storage
 * 4. newly generated anonymous viewer ID (persisted to storage)
 */
async function resolveViewerIdSequence(): Promise<string> {
  // Level 1: Explicit test override
  if (viewerIdOverride) {
    lastViewerIdSource = 'override';
    console.log('[REAL_VEGA_VIEWER_ID]', { viewerId: viewerIdOverride, source: 'override' });
    console.log('[VIEWER_ID_READY]', { source: 'override', viewerId: viewerIdOverride });
    return viewerIdOverride;
  }

  // Level 2: Configured development/demo viewer ID
  // Guard: Strictly disabled in production builds (Part E)
  const isDev = isDevEnvironment();
  if (isDev && demoViewerConfigEnabled && DEMO_VIEWER_ID) {
    lastViewerIdSource = 'demo_config';
    console.log('[REAL_VEGA_VIEWER_ID]', { viewerId: DEMO_VIEWER_ID, source: 'demo_config' });
    console.log('[VIEWER_ID_READY]', { source: 'demo_config', viewerId: DEMO_VIEWER_ID });
    return DEMO_VIEWER_ID;
  }

  // Level 3: Persisted anonymous viewer ID from device storage
  console.log('[VIEWER_BOOT] Checking persistent storage for anonymous viewer ID');
  let storedId: string | null = null;
  try {
    storedId = await safeGetItem(VIEWER_ID_STORAGE_KEY);
  } catch (err) {
    console.warn('[VIEWER_STORAGE] Failed reading storage key:', err);
  }

  if (storedId && typeof storedId === 'string' && storedId.trim().length > 0) {
    const trimmedId = storedId.trim();
    lastViewerIdSource = 'persistent_storage';
    console.log('[VIEWER_ID_STORAGE_READ_SUCCESS]', { viewerId: trimmedId });
    console.log('[REAL_VEGA_VIEWER_ID]', { viewerId: trimmedId, source: 'persistent_storage' });
    console.log('[VIEWER_ID_READY]', { source: 'persistent_storage', viewerId: trimmedId });
    return trimmedId;
  }

  // Level 4: Newly generated anonymous viewer ID
  console.log('[VIEWER_ID_STORAGE_READ_MISS] No stored viewer ID found, generating new identity');
  const newId = 'viewer_' + generateUUID();
  try {
    await safeSetItem(VIEWER_ID_STORAGE_KEY, newId);
  } catch (err) {
    console.warn('[VIEWER_STORAGE] Failed saving generated viewer ID:', err);
  }

  lastViewerIdSource = 'generated';
  console.log('[VIEWER_ID_GENERATED]', { viewerId: newId });
  console.log('[REAL_VEGA_VIEWER_ID]', { viewerId: newId, source: 'generated' });
    console.log('[VIEWER_ID_READY]', { source: 'generated', viewerId: newId });
  return newId;
}

/**
 * Returns the viewer ID for this session according to strict 4-level precedence.
 * In development builds, returns the stable demo viewer ID (or explicit override).
 * In production builds, returns the device's persistent anonymous viewer ID.
 */
export function getViewerId(): Promise<string> {
  // If an override is set, it always takes precedence immediately
  if (viewerIdOverride) {
    lastViewerIdSource = 'override';
    return Promise.resolve(viewerIdOverride);
  }

  if (cachedViewerId) {
    return Promise.resolve(cachedViewerId);
  }

  if (viewerIdPromise) {
    return viewerIdPromise;
  }

  viewerIdPromise = resolveViewerIdSequence()
    .then((id) => {
      cachedViewerId = id;
      return id;
    })
    .catch((err) => {
      console.error('[VIEWER_BOOT] Error resolving viewer identity:', err);
      viewerIdPromise = null; // allow retry on error
      throw err;
    });

  return viewerIdPromise;
}

/**
 * Returns the source of the currently resolved viewer ID.
 */
export function getViewerIdSource(): ViewerIdSource | null {
  return lastViewerIdSource;
}

/**
 * Checks if viewer identity is ready synchronously without initiating resolution.
 */
export function isViewerIdReady(): boolean {
  return Boolean(cachedViewerId || viewerIdOverride);
}

/**
 * Temporary viewer ID override for testing / simulation (Precedence Level 1).
 */
export function setViewerIdOverride(id: string | null): void {
  viewerIdOverride = id;
  cachedViewerId = null;
  viewerIdPromise = null;
  if (id) {
    lastViewerIdSource = 'override';
  }
  console.log('[VIEWER_TELEMETRY] VIEWER_ID_OVERRIDE_SET', { overrideId: id });
}

/**
 * Enables or disables the development demo viewer identity configuration (Part Q).
 * When disabled, identity falls back to normal persistent/generated anonymous identity.
 */
export function setDemoViewerConfigEnabled(enabled: boolean): void {
  demoViewerConfigEnabled = enabled;
  cachedViewerId = null;
  viewerIdPromise = null;
}

/**
 * Returns whether demo viewer config is currently active.
 */
export function isDemoViewerConfigEnabled(): boolean {
  return demoViewerConfigEnabled && Boolean(DEMO_VIEWER_ID) && isDevEnvironment();
}

/**
 * Simulates cold app restart: resets in-memory cached viewer ID and promise,
 * but preserves persistent storage so getViewerId() restores the exact same stored identity.
 */
export function clearCachedViewerId(): void {
  cachedViewerId = null;
  viewerIdOverride = null;
  viewerIdPromise = null;
}

/**
 * Wipes both in-memory cache and persistent storage (for fresh fixture initialization).
 */
export async function clearViewerIdentityStorage(): Promise<void> {
  clearCachedViewerId();
  persistentFallbackStore.clear();
  try {
    if (AsyncStorage && typeof AsyncStorage.removeItem === 'function') {
      await AsyncStorage.removeItem(VIEWER_ID_STORAGE_KEY);
    }
  } catch (_e) {
    /* ignore in test environments */
  }
}
