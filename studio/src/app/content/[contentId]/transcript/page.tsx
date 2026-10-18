"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ADMIN_API_BASE_URL } from "@/config";

interface CorrectionItem {
  transcriptIndex: number;
  original: string;
  corrected: string;
  confidence: "high" | "medium" | "low";
  reason: string;
  category: string;
  autoApplied: boolean;
}

interface CorrectedSegment {
  id: string;
  startTime: number;
  endTime: number;
  originalText: string;
  correctedText: string;
  correctionCount: number;
}

interface CorrectedTranscriptDoc {
  contentId: string;
  language: string;
  durationSeconds?: number;
  segments: CorrectedSegment[];
  corrections: CorrectionItem[];
  metadata: {
    source: string;
    correctionProvider: string;
    correctionModel: string;
    createdAt: string;
  };
}

function TranscriptViewerInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const contentId = params.contentId as string;
  const initialView = searchParams.get("view") === "raw" ? "raw" : "corrected";
  
  const [activeTab, setActiveTab] = useState<"corrected" | "raw">(initialView);
  
  // Data states
  const [rawTranscript, setRawTranscript] = useState<any>(null);
  const [correctedTranscript, setCorrectedTranscript] = useState<CorrectedTranscriptDoc | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchAll();
  }, [contentId]);

  const fetchAll = async () => {
    setLoading(true);
    setError("");
    try {
      // Fetch both in parallel
      const [rawRes, corrRes] = await Promise.all([
        fetch(`${ADMIN_API_BASE_URL}/content/${contentId}/transcript`, {
          
        }),
        fetch(`${ADMIN_API_BASE_URL}/content/${contentId}/transcript/corrected`, {
          
        })
      ]);

      if (rawRes.ok) {
        const rawData = await rawRes.json();
        setRawTranscript(rawData);
      }

      if (corrRes.ok) {
        const corrData = await corrRes.json();
        setCorrectedTranscript(corrData);
      } else {
        // If corrected transcript doesn't exist yet and initial view wasn't explicitly raw, default to raw
        if (initialView !== "raw") {
          setActiveTab("raw");
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to load transcripts");
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-32 space-y-4">
      <div className="w-10 h-10 border-4 border-white/10 border-t-[#F5B800] rounded-full animate-spin" />
      <div className="text-white/40 text-sm uppercase tracking-widest animate-pulse">Scanning Transcript Layers...</div>
    </div>
  );
  
  if (error) return (
    <div className="relative overflow-hidden p-6 rounded-2xl bg-red-500/5 border border-red-500/20 backdrop-blur-md max-w-4xl mx-auto">
      <div className="absolute top-0 left-0 w-1 h-full bg-red-500" />
      <h3 className="text-red-400 font-medium mb-1">Transcript Load Failure</h3>
      <p className="text-red-400/70 text-sm">{error}</p>
    </div>
  );

  const correctionsBySegmentIndex = new Map<number, CorrectionItem[]>();
  if (correctedTranscript?.corrections) {
    for (const c of correctedTranscript.corrections) {
      const list = correctionsBySegmentIndex.get(c.transcriptIndex) || [];
      list.push(c);
      correctionsBySegmentIndex.set(c.transcriptIndex, list);
    }
  }

  // Summary counts
  const totalCorrections = correctedTranscript?.corrections?.length || 0;
  const appliedCount = correctedTranscript?.corrections?.filter(c => c.autoApplied).length || 0;
  const highConfCount = correctedTranscript?.corrections?.filter(c => c.confidence === 'high').length || 0;
  const medConfCount = correctedTranscript?.corrections?.filter(c => c.confidence === 'medium').length || 0;
  const lowConfCount = correctedTranscript?.corrections?.filter(c => c.confidence === 'low').length || 0;

  return (
    <div className="max-w-6xl mx-auto pb-24 relative isolate">
      {/* Background ambient lighting */}
      <div className="absolute top-20 right-0 w-96 h-96 bg-[#F5B800]/5 rounded-full blur-[120px] -z-10 pointer-events-none" />
      <div className="absolute top-1/2 -left-20 w-[30rem] h-[30rem] bg-indigo-500/5 rounded-full blur-[100px] -z-10 pointer-events-none" />

      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between border-b border-white/10 pb-6 gap-6 relative z-10">
        <div>
          <Link href={`/content/${contentId}`} className="group flex items-center gap-2 text-white/50 hover:text-white mb-4 text-sm transition-colors w-fit">
            <span className="group-hover:-translate-x-1 transition-transform">&larr;</span> Back to Content Detail
          </Link>
          <h1 className="text-4xl md:text-5xl font-extralight tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-white/90 to-white/70">
            Transcript Explorer
          </h1>
          <p className="text-white/30 font-mono mt-2 tracking-widest uppercase text-xs flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-white/20" />
            Artifact ID: <span className="text-white/60">{contentId}</span>
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-2 bg-white/[0.03] p-1.5 rounded-xl border border-white/10 backdrop-blur-md">
          <button
            onClick={() => setActiveTab("corrected")}
            disabled={!correctedTranscript}
            className={`px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all flex items-center gap-2 ${
              activeTab === "corrected"
                ? "bg-[#F5B800] text-black shadow-lg shadow-[#F5B800]/20 font-bold"
                : correctedTranscript
                ? "text-white/60 hover:text-white hover:bg-white/5"
                : "text-white/20 cursor-not-allowed"
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Corrected Transcript
            {correctedTranscript && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === 'corrected' ? 'bg-black/20 text-black' : 'bg-[#F5B800]/20 text-[#F5B800]'}`}>
                {appliedCount} fixes
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("raw")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all flex items-center gap-2 ${
              activeTab === "raw"
                ? "bg-white/20 text-white shadow-lg font-bold"
                : "text-white/60 hover:text-white hover:bg-white/5"
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Authoritative Raw ASR
          </button>
        </div>
      </div>

      {/* Corrected Transcript View */}
      {activeTab === "corrected" && (
        <div className="space-y-6">
          {!correctedTranscript ? (
            <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-12 text-center">
              <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4 text-[#F5B800]">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h3 className="text-lg font-light text-white mb-2">No Corrected Transcript Generated Yet</h3>
              <p className="text-white/40 text-sm max-w-md mx-auto mb-6">
                Execute the Transcript Correction pipeline from the Content Detail page to detect and normalize speech-recognition errors.
              </p>
              <Link
                href={`/content/${contentId}`}
                className="inline-flex items-center gap-2 bg-[#F5B800] text-black font-semibold text-xs uppercase tracking-widest px-4 py-2.5 rounded-lg hover:bg-[#F5B800]/90 transition-all"
              >
                Go to Content Pipeline
              </Link>
            </div>
          ) : (
            <>
              {/* Correction Summary Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 backdrop-blur-md">
                  <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Total Segments</div>
                  <div className="text-2xl font-light text-white font-mono">{correctedTranscript.segments.length}</div>
                </div>
                <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 backdrop-blur-md">
                  <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Applied Fixes</div>
                  <div className="text-2xl font-light text-[#F5B800] font-mono">{appliedCount}</div>
                </div>
                <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 backdrop-blur-md">
                  <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">High Confidence</div>
                  <div className="text-2xl font-light text-emerald-400 font-mono">{highConfCount}</div>
                </div>
                <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 backdrop-blur-md">
                  <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Medium Conf (Held)</div>
                  <div className="text-2xl font-light text-amber-400 font-mono">{medConfCount}</div>
                </div>
                <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 backdrop-blur-md col-span-2 sm:col-span-1">
                  <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Correction Engine</div>
                  <div className="text-xs font-mono text-white/70 truncate mt-1">GPT-OSS-120B</div>
                  <div className="text-[10px] text-white/30 truncate">Bedrock Mantle</div>
                </div>
              </div>

              {/* Filter / Search input */}
              <div className="flex items-center gap-3 bg-white/[0.02] border border-white/10 rounded-xl px-4 py-2.5">
                <svg className="w-4 h-4 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Filter corrected transcript by keywords or terms..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-transparent border-none outline-none text-sm text-white placeholder-white/30 w-full"
                />
                {searchTerm && (
                  <button onClick={() => setSearchTerm("")} className="text-xs text-white/40 hover:text-white">
                    Clear
                  </button>
                )}
              </div>

              {/* Segments List */}
              <div className="space-y-4">
                {correctedTranscript.segments
                  .filter((seg) => {
                    if (!searchTerm) return true;
                    const term = searchTerm.toLowerCase();
                    return (
                      seg.correctedText.toLowerCase().includes(term) ||
                      seg.originalText.toLowerCase().includes(term)
                    );
                  })
                  .map((seg, idx) => {
                    const corrections = correctionsBySegmentIndex.get(idx) || [];
                    const hasCorrection = corrections.length > 0;
                    const isChanged = seg.correctedText !== seg.originalText;

                    return (
                      <div
                        key={seg.id || idx}
                        className={`rounded-2xl border transition-all p-5 backdrop-blur-md ${
                          isChanged
                            ? "bg-[#F5B800]/[0.03] border-[#F5B800]/30 shadow-lg shadow-[#F5B800]/5"
                            : "bg-white/[0.02] border-white/10 hover:border-white/20"
                        }`}
                      >
                        {/* Segment Top Bar */}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-3 mb-3">
                          <div className="flex items-center gap-3">
                            <span className="text-[11px] font-mono uppercase tracking-wider text-white/40 bg-white/5 px-2 py-0.5 rounded">
                              #{idx}
                            </span>
                            <span className="text-xs font-mono text-[#F5B800] bg-[#F5B800]/10 px-2 py-0.5 rounded border border-[#F5B800]/20">
                              {formatTime(seg.startTime)} – {formatTime(seg.endTime)}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {isChanged ? (
                              <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded border border-emerald-400/20">
                                Normalized
                              </span>
                            ) : (
                              <span className="text-[10px] uppercase font-medium tracking-widest text-white/30 bg-white/5 px-2 py-0.5 rounded">
                                Untouched
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Text Comparison */}
                        <div className="space-y-3">
                          {/* Corrected Text (Authoritative downstream) */}
                          <div>
                            <div className="text-[10px] uppercase tracking-widest text-[#F5B800] font-semibold mb-1 flex items-center gap-1.5">
                              <span>Downstream Transcript</span>
                              {isChanged && <span className="text-[9px] text-[#F5B800]/60 font-mono">(Corrected)</span>}
                            </div>
                            <p className="text-white/95 text-sm md:text-base leading-relaxed font-sans">
                              {seg.correctedText}
                            </p>
                          </div>

                          {/* Original Text (If changed, display for provenance) */}
                          {isChanged && (
                            <div className="pt-2 border-t border-white/5">
                              <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">
                                Original Raw ASR:
                              </div>
                              <p className="text-white/50 text-xs md:text-sm leading-relaxed font-mono line-through decoration-red-400/40">
                                {seg.originalText}
                              </p>
                            </div>
                          )}

                          {/* Traceable Corrections Detail */}
                          {corrections.length > 0 && (
                            <div className="pt-3 border-t border-white/5 space-y-2">
                              <div className="text-[10px] uppercase tracking-widest text-white/40">
                                Applied Corrections:
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {corrections.map((c, cIdx) => (
                                  <div
                                    key={cIdx}
                                    className="bg-black/30 border border-white/5 rounded-lg p-2.5 text-xs space-y-1"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-1.5 font-mono text-white/80">
                                        <span className="line-through text-red-400/80">{c.original}</span>
                                        <span className="text-white/40">&rarr;</span>
                                        <span className="text-emerald-400 font-semibold">{c.corrected}</span>
                                      </div>
                                      <span
                                        className={`text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded font-mono font-bold ${
                                          c.confidence === "high"
                                            ? "bg-emerald-400/10 text-emerald-400 border border-emerald-400/20"
                                            : c.confidence === "medium"
                                            ? "bg-amber-400/10 text-amber-400 border border-amber-400/20"
                                            : "bg-white/5 text-white/40 border border-white/10"
                                        }`}
                                      >
                                        {c.confidence}
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-white/50">{c.reason}</div>
                                    <div className="flex items-center justify-between text-[10px] text-white/30 pt-1 border-t border-white/5">
                                      <span className="capitalize">{c.category.replace("_", " ")}</span>
                                      <span className={c.autoApplied ? "text-emerald-400/70" : "text-amber-400/70"}>
                                        {c.autoApplied ? "Auto-applied" : "Held"}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Raw / Normalized Transcript View */}
      {activeTab === "raw" && (
        <div className="space-y-6">
          {!rawTranscript || !rawTranscript.segments ? (
            <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-12 text-center text-white/40">
              No raw transcript loaded.
            </div>
          ) : (
            <>
              {/* Raw Transcript Header Metric */}
              <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 backdrop-blur-md">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  <span className="text-xs uppercase tracking-widest text-white/70">
                    Source: <span className="text-white font-mono">{rawTranscript.metadata?.source || "amazon-transcribe"}</span>
                  </span>
                </div>
                <div className="text-xs font-mono text-white/50">
                  Total Segments: <span className="text-white">{rawTranscript.segments.length}</span>
                </div>
              </div>

              {/* Raw Segments List */}
              <div className="space-y-3">
                {rawTranscript.segments.map((seg: any, idx: number) => (
                  <div
                    key={seg.id || idx}
                    className="bg-white/[0.02] border border-white/10 rounded-xl p-4 hover:border-white/20 transition-all"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono text-white/40 bg-white/5 px-2 py-0.5 rounded">
                        #{idx}
                      </span>
                      <span className="text-xs font-mono text-white/50">
                        {formatTime(seg.startTime)} – {formatTime(seg.endTime)}
                      </span>
                    </div>
                    <p className="text-white/80 text-sm md:text-base leading-relaxed font-sans">
                      {seg.text || seg.originalText}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function TranscriptViewer() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center py-32 space-y-4">
          <div className="w-10 h-10 border-4 border-white/10 border-t-[#F5B800] rounded-full animate-spin" />
        </div>
      }
    >
      <TranscriptViewerInner />
    </Suspense>
  );
}
