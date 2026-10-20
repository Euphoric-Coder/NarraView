"use client";

import { useState, useEffect } from "react";
import { API_BASE_URL } from "@/config";

interface WatchedInterval {
  start: number;
  end: number;
}

interface ViewerReturnContext {
  viewerId: string;
  contentId: string;
  resumePositionSeconds: number;
  lastWatchedAt?: string;
  timeAwaySeconds: number;
  watchedIntervals: WatchedInterval[];
  watchedSeconds: number;
  progressPercent: number;
  returnType: string;
  previousSessionId?: string;
  currentSessionId?: string;
  shouldOfferRecap: boolean;
}

interface ContinueWatchingItem {
  id: string;
  contentId: string;
  title: string;
  description?: string;
  posterUrl?: string;
  runtime?: string;
  genre?: string;
  positionSeconds: number;
  durationSeconds: number;
  progressPercent: number;
  lastWatchedAt: string;
  isCompleted: boolean;
  returnType?: string;
  timeAwaySeconds?: number;
  shouldOfferRecap?: boolean;
  returnContext?: ViewerReturnContext;
}

interface HistoryItem extends ContinueWatchingItem {
  startedAt: string;
  completedAt?: string;
  lastSessionId?: string;
  watchedIntervals: WatchedInterval[];
}

interface RecapTestResult {
  title?: string;
  summary?: string;
  bullets?: string[];
  keyPeople?: string[];
  keyConcepts?: string[];
  viewerTimestamp: number;
  citations: Array<{
    id: string;
    text: string;
    type: string;
    revealTime: number;
  }>;
  safety: {
    spoilerSafe: boolean;
    maxRevealTimeUsed: number;
    groundingPassed: boolean;
    premiseValidated: boolean;
  };
  personalized?: boolean;
  watchedCoverageUsed?: boolean;
  returnType?: string;
  latencyMs?: number;
}

const PRESET_VIEWERS = [
  "narraview-demo-viewer",
  "viewer-a",
  "viewer-b",
  "interval-tester",
  "test-viewer-1"
];

function formatTime(seconds?: number): string {
  if (!seconds || seconds <= 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return "just now";
  if (seconds < 60) return `${Math.round(seconds)}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

export default function ViewerSessionsPage() {
  const [viewerId, setViewerId] = useState("narraview-demo-viewer");
  const [activeViewerId, setActiveViewerId] = useState("narraview-demo-viewer");
  const [continueWatching, setContinueWatching] = useState<ContinueWatchingItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Recap Tester State
  const [testContentId, setTestContentId] = useState("city-care-demo");
  const [testTimestamp, setTestTimestamp] = useState("134.8");
  const [isTestingRecap, setIsTestingRecap] = useState(false);
  const [testResult, setTestResult] = useState<RecapTestResult | null>(null);
  const [testError, setTestError] = useState("");

  const fetchViewerData = async (id: string) => {
    if (!id.trim()) return;
    setLoading(true);
    setError("");
    setActiveViewerId(id);

    try {
      // 1. Fetch continue watching
      const cwRes = await fetch(`${API_BASE_URL}/viewer/${encodeURIComponent(id)}/continue-watching`);
      if (!cwRes.ok) throw new Error(`Continue watching request failed (${cwRes.status})`);
      const cwData = await cwRes.json();
      setContinueWatching(Array.isArray(cwData) ? cwData : []);

      // 2. Fetch history
      const histRes = await fetch(`${API_BASE_URL}/viewer/${encodeURIComponent(id)}/history`);
      if (!histRes.ok) throw new Error(`History request failed (${histRes.status})`);
      const histData = await histRes.json();
      setHistory(Array.isArray(histData) ? histData : []);

      if (Array.isArray(cwData) && cwData.length > 0) {
        setTestContentId(cwData[0].contentId);
        setTestTimestamp(cwData[0].positionSeconds.toString());
      }
    } catch (err: any) {
      console.error("Failed to fetch viewer data:", err);
      setError(err.message || "Failed to load viewer data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchViewerData(viewerId);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchViewerData(viewerId);
  };

  const handlePresetClick = (preset: string) => {
    setViewerId(preset);
    fetchViewerData(preset);
  };

  const handleRunRecapTest = async () => {
    setIsTestingRecap(true);
    setTestError("");
    setTestResult(null);

    const ts = parseFloat(testTimestamp) || 0;
    const currentHist = history.find(h => h.contentId === testContentId);
    const watchedIntervals = currentHist?.watchedIntervals || [];

    try {
      const res = await fetch(`${API_BASE_URL}/ai/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": "narraview-admin-token"
        },
        body: JSON.stringify({
          contentId: testContentId,
          timestamp: ts,
          viewerTimestamp: ts,
          mode: "previously_on",
          viewerId: activeViewerId,
          watchedIntervals,
          allowPreActivationTest: true,
          resumeContext: {
            resumePositionSeconds: ts,
            watchedIntervals,
            lastWatchedAt: currentHist?.lastWatchedAt,
            timeAwaySeconds: currentHist?.timeAwaySeconds || 7200,
            returnType: currentHist?.returnType || "SHORT_RETURN"
          }
        })
      });

      if (!res.ok) {
        throw new Error(`Recap API failed with status ${res.status}`);
      }

      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      console.error("Failed to run recap test:", err);
      setTestError(err.message || "Recap generation failed");
    } finally {
      setIsTestingRecap(false);
    }
  };

  return (
    <div className="relative min-h-[85vh] w-full isolate">
      {/* Background glow effects */}
      <div className="absolute top-0 -translate-y-12 left-1/4 w-96 h-96 bg-[#F5B800]/10 rounded-full blur-[120px] -z-10 pointer-events-none" />
      <div className="absolute bottom-0 translate-y-1/3 right-1/4 w-[30rem] h-[30rem] bg-indigo-500/10 rounded-full blur-[120px] -z-10 pointer-events-none" />

      {/* Page Header */}
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-3xl font-light tracking-wide text-white flex items-center gap-3">
            <span className="text-[#F5B800]">Viewer Intelligence</span>
            <span className="text-white/40 text-sm font-mono font-normal">v0.18</span>
          </h1>
          <p className="text-white/60 text-sm mt-1">
            Viewer return session classification, watched coverage memory, and personalized recap tester.
          </p>
        </div>

        {/* Search & Selector */}
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <input
            type="text"
            value={viewerId}
            onChange={(e) => setViewerId(e.target.value)}
            placeholder="Enter Viewer ID..."
            className="px-3.5 py-1.5 rounded-lg bg-white/5 border border-white/15 text-white text-sm focus:outline-none focus:border-[#F5B800] transition-colors font-mono w-48 md:w-64"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-1.5 rounded-lg bg-[#F5B800] text-black font-semibold text-sm hover:bg-[#F5B800]/90 transition-all disabled:opacity-50"
          >
            {loading ? "Loading..." : "Inspect"}
          </button>
        </form>
      </div>

      {/* Preset Chips */}
      <div className="flex flex-wrap items-center gap-2 mb-8">
        <span className="text-xs text-white/40 mr-1">Preset Viewers:</span>
        {PRESET_VIEWERS.map((preset) => (
          <button
            key={preset}
            onClick={() => handlePresetClick(preset)}
            className={`px-3 py-1 rounded-full text-xs font-mono transition-all ${
              activeViewerId === preset
                ? "bg-[#F5B800] text-black font-semibold shadow-lg shadow-[#F5B800]/20"
                : "bg-white/5 text-white/70 hover:bg-white/10 border border-white/5"
            }`}
          >
            {preset}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-4 mb-8 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Active Viewer Header */}
      <div className="flex items-center justify-between p-4 mb-8 rounded-xl bg-white/[0.03] border border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
          <span className="text-white/60 text-sm">Active Viewer:</span>
          <span className="text-white font-mono font-medium text-sm px-2.5 py-1 bg-white/5 rounded-md border border-white/10">
            {activeViewerId}
          </span>
        </div>
        <div className="text-xs text-white/40">
          Continue Watching: <span className="text-white font-semibold">{continueWatching.length}</span> • History: <span className="text-white font-semibold">{history.length}</span>
        </div>
      </div>

      {/* Section 1: Continue Watching Rail */}
      <div className="mb-12">
        <h2 className="text-xl font-light tracking-wide text-white mb-4 flex items-center gap-2">
          <span className="text-[#F5B800]">▶</span> Continue Watching Rail & Return Status
        </h2>

        {continueWatching.length === 0 ? (
          <div className="p-8 text-center rounded-xl bg-white/[0.02] border border-white/5 text-white/40 text-sm">
            No in-progress titles for this viewer.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {continueWatching.map((item) => (
              <div
                key={item.contentId}
                className="bg-[#121216] border border-white/10 rounded-xl p-5 hover:border-[#F5B800]/50 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-white font-semibold text-base">{item.title}</h3>
                    <span className="text-[11px] uppercase tracking-wider text-[#F5B800] bg-[#F5B800]/10 px-2 py-0.5 rounded border border-[#F5B800]/20">
                      {item.genre || "Feature"}
                    </span>
                  </div>
                  <div className="text-xs text-white/40 mb-3 font-mono">{item.contentId}</div>

                  <div className="flex justify-between items-center text-xs text-white/60 mb-1.5">
                    <span>{formatTime(item.positionSeconds)} of {formatTime(item.durationSeconds)}</span>
                    <span className="text-[#F5B800] font-medium">{item.progressPercent}%</span>
                  </div>

                  <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden mb-3">
                    <div
                      className="bg-[#F5B800] h-full rounded-full transition-all"
                      style={{ width: `${Math.min(100, Math.max(0, item.progressPercent))}%` }}
                    />
                  </div>

                  {/* Return Context Badges */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300">
                      {item.returnType || "NEW_VIEWER"}
                    </span>
                    {item.shouldOfferRecap && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                        RECAP OFFERED
                      </span>
                    )}
                    {item.timeAwaySeconds != null && (
                      <span className="text-[10px] text-white/50">
                        away {formatDuration(item.timeAwaySeconds)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-[11px] text-white/40 pt-2 border-t border-white/5 flex justify-between items-center">
                  <span>Last Watched:</span>
                  <span>{new Date(item.lastWatchedAt).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Complete Watch State & Interval Coverage */}
      <div className="mb-12">
        <h2 className="text-xl font-light tracking-wide text-white mb-4 flex items-center gap-2">
          <span className="text-indigo-400">◉</span> Watch State & Watched Intervals (Viewer Memory Input)
        </h2>

        {history.length === 0 ? (
          <div className="p-8 text-center rounded-xl bg-white/[0.02] border border-white/5 text-white/40 text-sm">
            No watch history recorded for this viewer.
          </div>
        ) : (
          <div className="space-y-4">
            {history.map((record) => (
              <div
                key={record.contentId}
                className="bg-[#121216] border border-white/10 rounded-xl p-6"
              >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4 pb-4 border-b border-white/5">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold text-white">{record.title}</h3>
                      <span className={`text-[11px] uppercase tracking-wider px-2 py-0.5 rounded font-medium ${
                        record.isCompleted
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                      }`}>
                        {record.isCompleted ? "Completed" : "In Progress"}
                      </span>
                      {record.returnType && (
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-300">
                          {record.returnType}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-white/40 font-mono mt-1">{record.contentId}</div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm font-medium text-white">
                      {formatTime(record.positionSeconds)} <span className="text-white/40 font-normal">/ {formatTime(record.durationSeconds)} ({record.progressPercent}%)</span>
                    </div>
                    <div className="text-xs text-white/40 mt-0.5">
                      Updated: {new Date(record.lastWatchedAt).toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden mb-5">
                  <div
                    className={`h-full rounded-full transition-all ${
                      record.isCompleted ? "bg-emerald-500" : "bg-[#F5B800]"
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, record.progressPercent))}%` }}
                  />
                </div>

                {/* Watched Intervals Details */}
                <div>
                  <div className="text-xs text-white/60 uppercase tracking-wider font-medium mb-2 flex items-center justify-between">
                    <span>Recorded Watched Intervals ({record.watchedIntervals?.length || 0}):</span>
                    <span className="text-[11px] text-white/40 lowercase">used for memory derivation & skipped filtering</span>
                  </div>

                  {!record.watchedIntervals || record.watchedIntervals.length === 0 ? (
                    <div className="text-xs text-white/30 italic">No discontinuous intervals logged yet.</div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {record.watchedIntervals.map((interval, idx) => (
                        <div
                          key={idx}
                          className="text-xs font-mono px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/80 flex items-center gap-2"
                        >
                          <span className="text-[#F5B800] font-bold">#{idx + 1}</span>
                          <span>{interval.start.toFixed(1)}s – {interval.end.toFixed(1)}s</span>
                          <span className="text-white/30 text-[10px]">
                            ({(interval.end - interval.start).toFixed(1)}s)
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {record.lastSessionId && (
                  <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-white/30 font-mono">
                    <span>Last Session ID: {record.lastSessionId}</span>
                    <span>Started: {record.startedAt ? new Date(record.startedAt).toLocaleTimeString() : "N/A"}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 3: Personalized Recap Tester (Requirement 45) */}
      <div className="bg-[#121216] border border-[#F5B800]/30 rounded-xl p-6 shadow-xl mb-12">
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/10">
          <div>
            <h2 className="text-xl font-medium text-white flex items-center gap-2">
              <span className="text-[#F5B800]">⚡</span> Personalized Recap Tester
            </h2>
            <p className="text-xs text-white/50 mt-1">
              Test on-demand recap generation using viewer history, watched coverage scoring, and temporal boundary.
            </p>
          </div>
          <span className="text-xs font-mono px-2.5 py-1 rounded bg-[#F5B800]/10 text-[#F5B800] border border-[#F5B800]/20">
            POST /ai/ask (mode: previously_on)
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div>
            <label className="block text-xs font-medium text-white/70 mb-1.5">Viewer ID</label>
            <input
              type="text"
              value={activeViewerId}
              readOnly
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-white/90 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-white/70 mb-1.5">Content ID</label>
            <input
              type="text"
              value={testContentId}
              onChange={(e) => setTestContentId(e.target.value)}
              placeholder="e.g. city-care-demo"
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-white text-sm font-mono focus:border-[#F5B800] outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-white/70 mb-1.5">Resume Timestamp (seconds)</label>
            <input
              type="text"
              value={testTimestamp}
              onChange={(e) => setTestTimestamp(e.target.value)}
              placeholder="e.g. 134.8"
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-white text-sm font-mono focus:border-[#F5B800] outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={handleRunRecapTest}
            disabled={isTestingRecap}
            className="px-5 py-2.5 rounded-lg bg-[#F5B800] text-black font-semibold text-sm hover:bg-[#F5B800]/90 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {isTestingRecap ? (
              <>
                <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                <span>Generating Personalized Recap...</span>
              </>
            ) : (
              <>
                <span>▶ Generate Personalized Recap</span>
              </>
            )}
          </button>
        </div>

        {testError && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-4">
            {testError}
          </div>
        )}

        {testResult && (
          <div className="space-y-6 pt-4 border-t border-white/10">
            {/* Safety & Personalization Assertion Header */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="text-[11px] text-white/40 uppercase">Spoiler Safe</div>
                <div className="text-base font-semibold text-emerald-400 mt-0.5">
                  {testResult.safety?.spoilerSafe ? "✓ Enforced" : "✗ Violation"}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="text-[11px] text-white/40 uppercase">Max Reveal Time</div>
                <div className="text-base font-mono font-semibold text-[#F5B800] mt-0.5">
                  {testResult.safety?.maxRevealTimeUsed?.toFixed(1)}s{" "}
                  <span className="text-xs text-white/40 font-normal">
                    (limit: {parseFloat(testTimestamp).toFixed(1)}s)
                  </span>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="text-[11px] text-white/40 uppercase">Watched Coverage</div>
                <div className="text-base font-semibold text-indigo-300 mt-0.5">
                  {testResult.watchedCoverageUsed ? "✓ Weighted" : "Not applied"}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="text-[11px] text-white/40 uppercase">Latency</div>
                <div className="text-base font-mono text-white/80 mt-0.5">
                  {testResult.latencyMs || 0}ms
                </div>
              </div>
            </div>

            {/* Generated Recap Card */}
            <div className="bg-black/40 border border-white/10 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-[#F5B800]">
                  {testResult.title || "Previously On"}
                </h3>
                {testResult.personalized && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    PERSONALIZED FOR THIS VIEWER
                  </span>
                )}
              </div>

              {testResult.summary && (
                <p className="text-sm text-white/80 mb-4 leading-relaxed font-sans">
                  {testResult.summary}
                </p>
              )}

              {testResult.bullets && testResult.bullets.length > 0 && (
                <div className="space-y-2 mb-4">
                  {testResult.bullets.map((b, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-sm text-white/90">
                      <span className="text-[#F5B800] font-bold">•</span>
                      <span className="leading-relaxed">{b}</span>
                    </div>
                  ))}
                </div>
              )}

              {testResult.keyConcepts && testResult.keyConcepts.length > 0 && (
                <div className="pt-3 border-t border-white/5 flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-white/40">Key Concepts:</span>
                  {testResult.keyConcepts.map((c, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded bg-white/5 text-white/70 border border-white/10">
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Citations & Evidence Classification */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-3">
                Grounded Citations ({testResult.citations?.length || 0})
              </h4>
              <div className="space-y-2">
                {testResult.citations?.map((c) => (
                  <div
                    key={c.id}
                    className="p-3 rounded-lg bg-white/[0.03] border border-white/10 flex items-start justify-between gap-4"
                  >
                    <div className="text-xs text-white/80 flex-1">
                      <span className="font-mono text-[#F5B800] mr-2">[{c.id}]</span>
                      <span className="text-white/40 uppercase text-[10px] mr-2 font-mono">({c.type})</span>
                      {c.text}
                    </div>
                    <div className="text-xs font-mono text-white/40 whitespace-nowrap">
                      reveal: {c.revealTime.toFixed(1)}s
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
