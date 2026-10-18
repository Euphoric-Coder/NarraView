"use client";

import { useState, useEffect } from "react";
import { API_BASE_URL } from "@/config";

interface WatchedInterval {
  start: number;
  end: number;
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
}

interface HistoryItem extends ContinueWatchingItem {
  startedAt: string;
  completedAt?: string;
  lastSessionId?: string;
  watchedIntervals: WatchedInterval[];
}

const PRESET_VIEWERS = [
  "test-viewer-1",
  "interval-tester",
  "viewer-a",
  "viewer-b",
  "citycare-tester"
];

function formatTime(seconds?: number): string {
  if (!seconds || seconds <= 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function ViewerSessionsPage() {
  const [viewerId, setViewerId] = useState("test-viewer-1");
  const [activeViewerId, setActiveViewerId] = useState("test-viewer-1");
  const [continueWatching, setContinueWatching] = useState<ContinueWatchingItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

  return (
    <div className="relative min-h-[85vh] w-full isolate">
      {/* Background glow effects */}
      <div className="absolute top-0 -translate-y-12 left-1/4 w-96 h-96 bg-[#F5B800]/10 rounded-full blur-[120px] -z-10 pointer-events-none" />
      <div className="absolute bottom-0 translate-y-1/3 right-1/4 w-[30rem] h-[30rem] bg-indigo-500/10 rounded-full blur-[120px] -z-10 pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6 relative z-10">
        <div>
          <h1 className="text-4xl md:text-5xl font-extralight tracking-tight text-white mb-2 bg-clip-text text-transparent bg-gradient-to-r from-white via-white/90 to-white/60">
            Viewer Sessions
          </h1>
          <p className="text-white/40 text-sm tracking-wide uppercase font-medium">
            Inspect Watch State, Continue Watching & Watched Intervals (Read-Only)
          </p>
        </div>
      </div>

      {/* Search & Presets Form */}
      <div className="bg-[#121216] border border-white/10 rounded-2xl p-6 mb-8">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="relative flex-1">
            <input
              type="text"
              value={viewerId}
              onChange={(e) => setViewerId(e.target.value)}
              placeholder="Enter Viewer ID (e.g. test-viewer-1, viewer-a)..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#F5B800] transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 bg-[#F5B800] text-black font-semibold rounded-xl hover:bg-[#E59800] transition-colors disabled:opacity-50"
          >
            {loading ? "Inspecting..." : "Inspect Viewer"}
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-white/40 uppercase font-medium tracking-wider mr-2">Quick Presets:</span>
          {PRESET_VIEWERS.map((preset) => (
            <button
              key={preset}
              onClick={() => handlePresetClick(preset)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                activeViewerId === preset
                  ? "bg-[#F5B800]/20 border-[#F5B800] text-[#F5B800]"
                  : "bg-white/5 border-white/10 text-white/60 hover:text-white hover:border-white/20"
              }`}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-8">
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
          <span className="text-[#F5B800]">▶</span> Continue Watching Rail
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
      <div>
        <h2 className="text-xl font-light tracking-wide text-white mb-4 flex items-center gap-2">
          <span className="text-indigo-400">◉</span> Watch State & Watched Intervals
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
                    <span className="text-[11px] text-white/40 lowercase">discontinuous ranges recorded</span>
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
    </div>
  );
}
