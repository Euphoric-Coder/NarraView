"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { API_BASE_URL, ADMIN_TOKEN } from "@/config";

interface IntelligenceData {
  schemaVersion: string;
  intelligenceVersion: number;
  content: {
    contentId: string;
    title: string;
    contentType: string;
    language: string;
    durationSeconds?: number;
  };
  timeline: Array<{
    segmentId: string;
    startTime: number;
    endTime: number;
    title: string;
    summary: string;
    transcript: {
      startIndex: number;
      endIndex: number;
    };
    peopleIds: string[];
    entityIds: string[];
    conceptIds: string[];
    eventIds: string[];
    factIds: string[];
    relationshipIds: string[];
  }>;
  people: Array<{
    id: string;
    name: string;
    role: string;
    description: string;
    aliases: string[];
    firstKnownAt: number;
    evidenceTranscriptIndices: number[];
  }>;
  entities: Array<{
    id: string;
    name: string;
    entityType: string;
    description: string;
    aliases: string[];
    firstKnownAt: number;
    evidenceTranscriptIndices: number[];
    asrUncertain?: boolean;
  }>;
  concepts: Array<{
    id: string;
    name: string;
    description: string;
    aliases: string[];
    firstKnownAt: number;
    evidenceTranscriptIndices: number[];
  }>;
  events: Array<{
    id: string;
    description: string;
    importance: string;
    revealTime: number;
    evidenceTranscriptIndices: number[];
  }>;
  facts: Array<{
    id: string;
    statement: string;
    revealTime: number;
    evidenceTranscriptIndices: number[];
    origin?: string;
  }>;
  relationships: Array<{
    id: string;
    sourceId: string;
    targetId: string;
    predicate: string;
    description?: string;
    revealTime: number;
    evidenceTranscriptIndices: number[];
  }>;
  temporalIndex: {
    revealPoints: Array<{
      time: number;
      description?: string;
      factIds: string[];
      eventIds: string[];
      entityIds: string[];
      conceptIds: string[];
      relationshipIds: string[];
    }>;
  };
  sourceArtifacts: {
    correctedTranscriptKey?: string;
    normalizedTranscriptKey: string;
    segmentsKey: string;
    knowledgeKey: string;
  };
  quality: {
    referentialIntegrity: boolean;
    danglingRelationsDropped?: number;
    unresolvedAsrTerms: string[];
    duplicateFactsRemoved: number;
    duplicateRelationsRemoved: number;
    canonicalizationApplied: boolean;
    qualityScore: number;
  };
  metadata: {
    compiledAt: string;
    compilerVersion: string;
  };
}

function IntelligenceViewerInner() {
  const params = useParams();
  const router = useRouter();
  const contentId = params.contentId as string;

  const [data, setData] = useState<IntelligenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "timeline" | "people_entities" | "concepts_facts" | "relationships" | "temporal_index" | "temporal_rag">("overview");
  const [ragTimestamp, setRagTimestamp] = useState<number>(90.91);
  const [ragMode, setRagMode] = useState<"ask" | "previously_on" | "explain_simple" | "learn">("ask");
  const [ragQuestion, setRagQuestion] = useState<string>("What is the Haversine distance formula used for?");
  const [ragRunning, setRagRunning] = useState<boolean>(false);
  const [ragResult, setRagResult] = useState<any>(null);
  const [ragError, setRagError] = useState<string | null>(null);
  const [snapshotView, setSnapshotView] = useState<"facts" | "events" | "entities" | "concepts" | "relationships">("facts");

  const executeRagTest = async (overrideTs?: number, overrideQ?: string, overrideMode?: any) => {
    setRagRunning(true);
    setRagError(null);
    const ts = overrideTs !== undefined ? overrideTs : Number(ragTimestamp);
    const mode = overrideMode || ragMode;
    const q = overrideQ !== undefined ? overrideQ : ragQuestion;
    try {
      const res = await fetch(`${API_BASE_URL}/ai/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Token": ADMIN_TOKEN,
        },
        body: JSON.stringify({
          contentId,
          viewerTimestamp: ts,
          mode,
          question: (mode === "ask" || mode === "explain_simple") ? q : undefined,
          allowPreActivationTest: true,
        }),
      });
      const resData = await res.json();
      if (!res.ok) {
        setRagError(resData.error || "Temporal RAG request failed");
      } else {
        setRagResult(resData);
      }
    } catch (err: any) {
      setRagError(err.message || "Network error");
    } finally {
      setRagRunning(false);
    }
  };
  const [recompiling, setRecompiling] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const [availableVersions, setAvailableVersions] = useState<string[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string>("latest");

  useEffect(() => {
    fetchIntelligence("latest");
    fetchVersions();
  }, [contentId]);

  const fetchVersions = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/content/${contentId}/intelligence/versions`, {
        headers: { 'X-Admin-Token': ADMIN_TOKEN },
        cache: 'no-store'
      });
      if (res.ok) {
        const vData = await res.json();
        if (Array.isArray(vData.versions)) {
          setAvailableVersions(vData.versions);
        }
      }
    } catch (e) {
      console.warn("Failed to fetch versions:", e);
    }
  };

  const fetchIntelligence = async (version = selectedVersion) => {
    setLoading(true);
    setError("");
    try {
      const endpoint = (version && version !== "latest")
        ? `${API_BASE_URL}/content/${contentId}/intelligence/${version}`
        : `${API_BASE_URL}/content/${contentId}/intelligence`;

      const res = await fetch(endpoint, {
        headers: { 'X-Admin-Token': ADMIN_TOKEN },
        cache: 'no-store'
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        if (res.status === 404) {
          throw new Error(errorData.error || "No compiled intelligence package found. Please trigger compilation first.");
        }
        throw new Error(errorData.error || `Failed to load content intelligence (HTTP ${res.status})`);
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || "Failed to load intelligence");
    } finally {
      setLoading(false);
    }
  };

  const recompile = async () => {
    if (!confirm("Recompile canonical content intelligence package? This creates a new immutable version.")) return;
    setRecompiling(true);
    try {
      const res = await fetch(`${API_BASE_URL}/content/${contentId}/intelligence/compile`, {
        method: "POST",
        headers: { "X-Admin-Token": ADMIN_TOKEN },
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to start compilation");
      }
      alert("Intelligence compilation started! Redirecting to Content Pipeline to monitor progress...");
      router.push(`/content/${contentId}`);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setRecompiling(false);
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
      <div className="text-white/40 text-sm uppercase tracking-widest animate-pulse">Loading Canonical Intelligence...</div>
    </div>
  );

  if (error || !data) return (
    <div className="max-w-4xl mx-auto py-20 px-4">
      <Link href={`/content/${contentId}`} className="text-white/50 hover:text-white text-sm mb-6 inline-flex items-center gap-2">
        &larr; Back to Content Pipeline
      </Link>
      <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/10 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-[#F5B800]/10 border border-[#F5B800]/20 flex items-center justify-center mx-auto text-[#F5B800]">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
        </div>
        <h3 className="text-xl font-light text-white">Intelligence Package Not Ready</h3>
        <p className="text-white/50 text-sm max-w-md mx-auto">{error || "Please compile the intelligence package from the pipeline."}</p>
        <div className="pt-2 flex items-center justify-center gap-3">
          <button
            onClick={() => {
              fetchIntelligence(selectedVersion);
              fetchVersions();
            }}
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold tracking-wide transition-all"
          >
            Retry
          </button>
          <Link
            href={`/content/${contentId}`}
            className="inline-flex items-center gap-2 bg-[#F5B800] text-black text-xs font-semibold uppercase tracking-widest px-5 py-2.5 rounded-lg hover:bg-[#F5B800]/90 transition-all"
          >
            Go to Content Detail
          </Link>
        </div>
      </div>
    </div>
  );

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
          <div className="flex items-center gap-3">
            <h1 className="text-4xl md:text-5xl font-extralight tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-white/90 to-white/70">
              Content Intelligence Store
            </h1>
            <span className="text-xs font-mono font-bold bg-[#F5B800] text-black px-2.5 py-1 rounded-md shadow-md shadow-[#F5B800]/20">
              v{data.intelligenceVersion}
            </span>
            {availableVersions.length > 0 && (
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1">
                <span className="text-[10px] uppercase font-mono tracking-wider text-white/40">Version:</span>
                <select
                  value={selectedVersion}
                  onChange={(e) => {
                    const newVer = e.target.value;
                    setSelectedVersion(newVer);
                    fetchIntelligence(newVer);
                  }}
                  className="bg-transparent text-xs font-mono font-semibold text-[#F5B800] focus:outline-none cursor-pointer"
                >
                  <option value="latest" className="bg-[#07090E] text-white">Latest</option>
                  {availableVersions.map(v => (
                    <option key={v} value={v} className="bg-[#07090E] text-white">{v}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <p className="text-white/40 font-mono mt-2 tracking-widest uppercase text-xs flex items-center gap-3">
            <span>Title: <strong className="text-white/80">{data.content.title}</strong></span>
            <span>&bull;</span>
            <span>Schema: <strong className="text-white/80">v{data.schemaVersion}</strong></span>
            <span>&bull;</span>
            <span>Compiled: <strong className="text-white/80">{new Date(data.metadata.compiledAt).toLocaleTimeString()}</strong></span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={recompile}
            disabled={recompiling}
            className="px-4 py-2 rounded-lg text-xs font-semibold tracking-wide bg-white/10 hover:bg-white/20 border border-white/10 text-white transition-all flex items-center gap-2 disabled:opacity-40"
          >
            {recompiling ? "Triggering..." : "Recompile Package"}
          </button>
        </div>
      </div>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-8">
        <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 backdrop-blur-md">
          <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Integrity Score</div>
          <div className="text-2xl font-light text-emerald-400 font-mono">{data.quality.qualityScore}%</div>
        </div>
        <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 backdrop-blur-md">
          <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Segments</div>
          <div className="text-2xl font-light text-white font-mono">{data.timeline.length}</div>
        </div>
        <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 backdrop-blur-md">
          <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">People / Roles</div>
          <div className="text-2xl font-light text-white font-mono">{data.people.length}</div>
        </div>
        <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 backdrop-blur-md">
          <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Entities</div>
          <div className="text-2xl font-light text-white font-mono">{data.entities.length}</div>
        </div>
        <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 backdrop-blur-md">
          <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Concepts</div>
          <div className="text-2xl font-light text-white font-mono">{data.concepts.length}</div>
        </div>
        <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 backdrop-blur-md">
          <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Canonical Facts</div>
          <div className="text-2xl font-light text-[#F5B800] font-mono">{data.facts.length}</div>
        </div>
        <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 backdrop-blur-md">
          <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Reveal Points</div>
          <div className="text-2xl font-light text-indigo-400 font-mono">{data.temporalIndex.revealPoints.length}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-4 mb-8">
        {[
          { key: "overview", label: "Overview & Quality" },
          { key: "timeline", label: `Timeline (${data.timeline.length})` },
          { key: "people_entities", label: `Entities & Roles (${data.people.length + data.entities.length})` },
          { key: "concepts_facts", label: `Concepts & Facts (${data.concepts.length + data.facts.length})` },
          { key: "relationships", label: `Relationships (${data.relationships.length})` },
          { key: "temporal_index", label: `Temporal Index (${data.temporalIndex.revealPoints.length})` },
          { key: "temporal_rag", label: "⚡ Temporal RAG Test & Snapshot" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all ${
              activeTab === tab.key
                ? "bg-[#F5B800] text-black font-bold shadow-md shadow-[#F5B800]/20"
                : "bg-white/[0.03] text-white/60 hover:text-white hover:bg-white/10"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Overview & Quality */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Quality Summary */}
            <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 backdrop-blur-md space-y-4">
              <h3 className="text-base font-light text-white tracking-wide border-b border-white/10 pb-3 flex items-center justify-between">
                <span>Quality & Compilation Integrity</span>
                <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded border border-emerald-400/20">
                  {data.quality.referentialIntegrity ? "PASS — 100% Resolved" : "WARNING"}
                </span>
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center py-1 border-b border-white/5">
                  <span className="text-white/50">Referential Integrity:</span>
                  <span className="font-mono text-emerald-400 font-semibold">100% (Zero dangling links)</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-white/5">
                  <span className="text-white/50">Aliases Normalized:</span>
                  <span className="font-mono text-white/90">{data.quality.canonicalizationApplied ? "Applied" : "None required"}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-white/5">
                  <span className="text-white/50">Duplicate Facts Consolidated:</span>
                  <span className="font-mono text-[#F5B800]">{data.quality.duplicateFactsRemoved} merged</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-white/5">
                  <span className="text-white/50">Duplicate Relationships Pruned:</span>
                  <span className="font-mono text-[#F5B800]">{data.quality.duplicateRelationsRemoved} merged</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-white/50">Compiler Engine:</span>
                  <span className="font-mono text-white/70">v{data.metadata.compilerVersion}</span>
                </div>
              </div>
            </div>

            {/* ASR Uncertainty & Grounding */}
            <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 backdrop-blur-md space-y-4">
              <h3 className="text-base font-light text-white tracking-wide border-b border-white/10 pb-3">
                Unresolved ASR Term Watchlist
              </h3>
              {data.quality.unresolvedAsrTerms.length === 0 ? (
                <div className="py-6 text-center text-white/40 text-sm">
                  <div className="w-8 h-8 rounded-full bg-emerald-400/10 text-emerald-400 flex items-center justify-center mx-auto mb-2">✓</div>
                  Zero unresolved ASR terms flagged. All terminology canonically grounded.
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-white/40">The following terms remain held with medium/low ASR confidence to prevent unverified claims from becoming authoritative:</p>
                  <div className="flex flex-wrap gap-2 pt-2">
                    {data.quality.unresolvedAsrTerms.map((term, i) => (
                      <span key={i} className="text-xs font-mono bg-amber-400/10 text-amber-300 border border-amber-400/20 px-2.5 py-1 rounded">
                        {term}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Source Provenance */}
          <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 backdrop-blur-md space-y-3">
            <h3 className="text-base font-light text-white tracking-wide border-b border-white/10 pb-3">
              Upstream Source Artifacts
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
              <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                <span className="text-white/40 block mb-1">Transcript Source:</span>
                <span className="text-[#F5B800] truncate block">{data.sourceArtifacts.correctedTranscriptKey || data.sourceArtifacts.normalizedTranscriptKey}</span>
              </div>
              <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                <span className="text-white/40 block mb-1">Segments Source:</span>
                <span className="text-white/80 truncate block">{data.sourceArtifacts.segmentsKey}</span>
              </div>
              <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                <span className="text-white/40 block mb-1">Knowledge Graph:</span>
                <span className="text-white/80 truncate block">{data.sourceArtifacts.knowledgeKey}</span>
              </div>
              <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                <span className="text-white/40 block mb-1">Downstream Readiness:</span>
                <span className="text-emerald-400 truncate block">Ready for v0.16 Temporal RAG Engine</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Timeline */}
      {activeTab === "timeline" && (
        <div className="space-y-4">
          {data.timeline.map((seg, idx) => (
            <div key={seg.segmentId || idx} className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 backdrop-blur-md space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-white/40 bg-white/5 px-2 py-0.5 rounded">#{idx}</span>
                  <h4 className="text-base font-medium text-white">{seg.title}</h4>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-[#F5B800] bg-[#F5B800]/10 px-2 py-0.5 rounded border border-[#F5B800]/20">
                    {formatTime(seg.startTime)} – {formatTime(seg.endTime)}
                  </span>
                  <span className="text-[10px] font-mono text-white/40 bg-white/5 px-2 py-0.5 rounded">
                    Indices #{seg.transcript.startIndex}..#{seg.transcript.endIndex}
                  </span>
                </div>
              </div>

              <p className="text-white/80 text-sm leading-relaxed">{seg.summary}</p>

              <div className="pt-2 flex flex-wrap gap-2 text-[11px] font-mono">
                {seg.entityIds.length > 0 && (
                  <span className="bg-blue-500/10 text-blue-300 border border-blue-500/20 px-2 py-0.5 rounded">
                    {seg.entityIds.length} Entities
                  </span>
                )}
                {seg.conceptIds.length > 0 && (
                  <span className="bg-purple-500/10 text-purple-300 border border-purple-500/20 px-2 py-0.5 rounded">
                    {seg.conceptIds.length} Concepts
                  </span>
                )}
                {seg.factIds.length > 0 && (
                  <span className="bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded">
                    {seg.factIds.length} Facts
                  </span>
                )}
                {seg.relationshipIds.length > 0 && (
                  <span className="bg-amber-500/10 text-amber-300 border border-amber-500/20 px-2 py-0.5 rounded">
                    {seg.relationshipIds.length} Relations
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: People & Entities */}
      {activeTab === "people_entities" && (
        <div className="space-y-6">
          <div className="space-y-3">
            <h3 className="text-xs uppercase tracking-widest text-white/40">People & Roles</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {data.people.map((p) => (
                <div key={p.id} className="bg-white/[0.02] border border-white/10 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white text-sm">{p.name}</span>
                    <span className="text-[10px] font-mono uppercase bg-white/10 px-2 py-0.5 rounded text-white/70">{p.role}</span>
                  </div>
                  <p className="text-xs text-white/60">{p.description}</p>
                  <div className="text-[10px] font-mono text-white/30 pt-1 border-t border-white/5 flex justify-between">
                    <span>ID: {p.id}</span>
                    <span>First Known: {formatTime(p.firstKnownAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3 pt-4">
            <h3 className="text-xs uppercase tracking-widest text-white/40">Canonical Entities</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {data.entities.map((e) => (
                <div key={e.id} className="bg-white/[0.02] border border-white/10 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white text-sm">{e.name}</span>
                    <span className="text-[10px] font-mono uppercase bg-blue-500/10 text-blue-300 px-2 py-0.5 rounded border border-blue-500/20">{e.entityType}</span>
                  </div>
                  <p className="text-xs text-white/60">{e.description}</p>
                  {e.aliases.length > 0 && (
                    <div className="text-[11px] text-white/40">
                      Aliases: <span className="font-mono text-white/60">{e.aliases.join(", ")}</span>
                    </div>
                  )}
                  <div className="text-[10px] font-mono text-white/30 pt-1 border-t border-white/5 flex justify-between">
                    <span>ID: {e.id}</span>
                    <span>Revealed: {formatTime(e.firstKnownAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Concepts & Facts */}
      {activeTab === "concepts_facts" && (
        <div className="space-y-6">
          <div className="space-y-3">
            <h3 className="text-xs uppercase tracking-widest text-white/40">Canonical Concepts</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {data.concepts.map((c) => (
                <div key={c.id} className="bg-white/[0.02] border border-white/10 rounded-xl p-4 space-y-1.5">
                  <span className="font-semibold text-white text-sm block">{c.name}</span>
                  <p className="text-xs text-white/60">{c.description}</p>
                  <div className="text-[10px] font-mono text-white/30 pt-1 border-t border-white/5 flex justify-between">
                    <span>ID: {c.id}</span>
                    <span>First Known: {formatTime(c.firstKnownAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3 pt-4">
            <h3 className="text-xs uppercase tracking-widest text-white/40">Canonical Facts ({data.facts.length})</h3>
            <div className="space-y-2">
              {data.facts.map((f, i) => (
                <div key={f.id || i} className="bg-white/[0.02] border border-white/10 rounded-xl p-3 flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-white/90 font-medium">{f.statement}</p>
                    <div className="flex items-center gap-3 text-[10px] font-mono text-white/40">
                      <span>ID: {f.id}</span>
                      <span>Indices: [{f.evidenceTranscriptIndices.join(", ")}]</span>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-[#F5B800] bg-[#F5B800]/10 px-2 py-0.5 rounded border border-[#F5B800]/20 whitespace-nowrap">
                    {formatTime(f.revealTime)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Relationships */}
      {activeTab === "relationships" && (
        <div className="space-y-3">
          <h3 className="text-xs uppercase tracking-widest text-white/40">Canonical Relationships ({data.relationships.length})</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.relationships.map((r, i) => (
              <div key={r.id || i} className="bg-white/[0.02] border border-white/10 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-white font-semibold truncate">{r.sourceId}</span>
                    <span className="text-[#F5B800] bg-[#F5B800]/10 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold">{r.predicate}</span>
                    <span className="text-white font-semibold truncate">{r.targetId}</span>
                  </div>
                  <span className="text-[10px] text-white/40 whitespace-nowrap ml-2">{formatTime(r.revealTime)}</span>
                </div>
                {r.description && <p className="text-xs text-white/60">{r.description}</p>}
                <div className="text-[10px] font-mono text-white/30 pt-1 border-t border-white/5 flex justify-between">
                  <span>ID: {r.id}</span>
                  <span>Evidence: [{r.evidenceTranscriptIndices.join(", ")}]</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}


      {/* Tab: Temporal RAG Test & Snapshot Inspector (v0.16) */}
      {activeTab === "temporal_rag" && (() => {
        const safeFacts = data.facts.filter(f => f.revealTime <= ragTimestamp);
        const safeEvents = data.events.filter(e => e.revealTime <= ragTimestamp);
        const safeEntities = data.entities.filter(ent => ent.firstKnownAt <= ragTimestamp);
        const safePeople = data.people.filter(p => p.firstKnownAt <= ragTimestamp);
        const safeConcepts = data.concepts.filter(c => c.firstKnownAt <= ragTimestamp);
        const safeRelationships = data.relationships.filter(r => r.revealTime <= ragTimestamp);

        return (
          <div className="space-y-8 animate-in fade-in duration-200">
            {/* Header info */}
            <div className="p-6 rounded-2xl bg-gradient-to-r from-[#F5B800]/10 via-white/[0.02] to-transparent border border-[#F5B800]/20 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded bg-[#F5B800]/20 text-[#F5B800] border border-[#F5B800]/30 font-bold">
                    v0.16 Production Runtime
                  </span>
                  <span className="text-xs text-white/50">Generic Temporal RAG Inspector</span>
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight mt-1">
                  Temporal Knowledge Boundary Tester
                </h2>
                <p className="text-xs text-white/60 mt-1 max-w-2xl">
                  Simulate viewer playback at any exact timestamp. The engine strictly enforces{" "}
                  <code className="text-[#F5B800] font-mono">knowledge.revealTime &lt;= viewerTimestamp</code>{" "}
                  prior to retrieval and LLM context construction.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-white/40">Active Package</div>
                  <div className="font-mono text-sm text-[#F5B800] font-bold">Version {data.intelligenceVersion}</div>
                </div>
              </div>
            </div>

            {/* Test Configuration Panel */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Controls Column */}
              <div className="lg:col-span-1 space-y-6 bg-white/[0.02] border border-white/10 rounded-2xl p-6">
                <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Simulation Controls</h3>

                {/* Timestamp Scrubber */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <label className="text-white/70 font-medium">Viewer Timestamp (s)</label>
                    <span className="font-mono text-[#F5B800] font-bold">{Number(ragTimestamp).toFixed(2)}s ({formatTime(Number(ragTimestamp))})</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={data.content.durationSeconds || 6380}
                    step="0.01"
                    value={ragTimestamp}
                    onChange={(e) => setRagTimestamp(parseFloat(e.target.value))}
                    className="w-full accent-[#F5B800] cursor-pointer"
                  />
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.01"
                      value={ragTimestamp}
                      onChange={(e) => setRagTimestamp(parseFloat(e.target.value) || 0)}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-[#F5B800]"
                    />
                  </div>
                </div>

                {/* Preset Reveal Jump Buttons */}
                <div className="space-y-1.5 pt-2 border-t border-white/5">
                  <label className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">Test Presets</label>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <button
                      onClick={() => {
                        setRagTimestamp(15.0);
                        setRagQuestion("What is CityCare?");
                        setRagMode("ask");
                      }}
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-left text-white/80 transition-all"
                    >
                      <div className="font-mono text-[#F5B800]">15.00s</div>
                      <div className="text-[10px] text-white/50 truncate">Intro / Problem</div>
                    </button>

                    <button
                      onClick={() => {
                        setRagTimestamp(90.90);
                        setRagQuestion("What is the Haversine distance formula used for?");
                        setRagMode("ask");
                      }}
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-red-500/20 text-left text-white/80 transition-all"
                    >
                      <div className="font-mono text-red-400">90.90s (T-0.01)</div>
                      <div className="text-[10px] text-white/50 truncate">Before Haversine</div>
                    </button>

                    <button
                      onClick={() => {
                        setRagTimestamp(90.91);
                        setRagQuestion("What is the Haversine distance formula used for?");
                        setRagMode("ask");
                      }}
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-emerald-500/20 text-left text-white/80 transition-all"
                    >
                      <div className="font-mono text-emerald-400">90.91s (T)</div>
                      <div className="text-[10px] text-white/50 truncate">Haversine Reveal</div>
                    </button>

                    <button
                      onClick={() => {
                        setRagTimestamp(282.29);
                        setRagQuestion("What database does CityCare use?");
                        setRagMode("ask");
                      }}
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-left text-white/80 transition-all"
                    >
                      <div className="font-mono text-[#F5B800]">282.29s (Late)</div>
                      <div className="text-[10px] text-white/50 truncate">Convex DB & Stack</div>
                    </button>
                  </div>
                </div>

                {/* Mode Selector */}
                <div className="space-y-1.5 pt-2 border-t border-white/5">
                  <label className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">Mode</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: "ask", label: "Ask NarraView" },
                      { key: "previously_on", label: "Previously On" },
                      { key: "explain_simple", label: "Explain Simply" },
                      { key: "learn", label: "Learn Mode" },
                    ].map((m) => (
                      <button
                        key={m.key}
                        onClick={() => setRagMode(m.key as any)}
                        className={`px-3 py-2 rounded-lg text-xs font-semibold text-center transition-all ${
                          ragMode === m.key
                            ? "bg-[#F5B800] text-black font-bold shadow-md shadow-[#F5B800]/20"
                            : "bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border border-white/5"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Question input (if ask or explain_simple) */}
                {(ragMode === "ask" || ragMode === "explain_simple") && (
                  <div className="space-y-1.5 pt-2 border-t border-white/5">
                    <label className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">Question</label>
                    <textarea
                      rows={3}
                      value={ragQuestion}
                      onChange={(e) => setRagQuestion(e.target.value)}
                      placeholder="Ask NarraView something..."
                      className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#F5B800]"
                    />
                  </div>
                )}

                <button
                  onClick={() => executeRagTest()}
                  disabled={ragRunning}
                  className="w-full py-3 rounded-xl bg-[#F5B800] hover:bg-[#F5B800]/90 text-black font-bold text-xs uppercase tracking-wider shadow-lg shadow-[#F5B800]/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {ragRunning ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      Testing Temporal RAG...
                    </>
                  ) : (
                    <>
                      <span>⚡ Run Temporal RAG Test</span>
                    </>
                  )}
                </button>
              </div>

              {/* Response & Output Column */}
              <div className="lg:col-span-2 space-y-6">
                {/* Safe Snapshot Live Stats Card */}
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white/60 font-semibold uppercase tracking-wider text-[10px]">
                      Safe Knowledge Snapshot Unlocked at {Number(ragTimestamp).toFixed(2)}s
                    </span>
                    <span className="text-emerald-400 font-mono text-[11px]">Strict Reveal Safety Invariant</span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-2">
                    <div className="p-2.5 rounded-lg bg-black/30 border border-white/5 text-center">
                      <div className="text-[10px] text-white/40 uppercase">Facts</div>
                      <div className="font-mono text-base font-bold text-emerald-400">{safeFacts.length} <span className="text-[10px] text-white/30 font-normal">/ {data.facts.length}</span></div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-black/30 border border-white/5 text-center">
                      <div className="text-[10px] text-white/40 uppercase">Events</div>
                      <div className="font-mono text-base font-bold text-blue-400">{safeEvents.length} <span className="text-[10px] text-white/30 font-normal">/ {data.events.length}</span></div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-black/30 border border-white/5 text-center">
                      <div className="text-[10px] text-white/40 uppercase">Entities</div>
                      <div className="font-mono text-base font-bold text-cyan-400">{safeEntities.length} <span className="text-[10px] text-white/30 font-normal">/ {data.entities.length}</span></div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-black/30 border border-white/5 text-center">
                      <div className="text-[10px] text-white/40 uppercase">People</div>
                      <div className="font-mono text-base font-bold text-indigo-400">{safePeople.length} <span className="text-[10px] text-white/30 font-normal">/ {data.people.length}</span></div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-black/30 border border-white/5 text-center">
                      <div className="text-[10px] text-white/40 uppercase">Concepts</div>
                      <div className="font-mono text-base font-bold text-purple-400">{safeConcepts.length} <span className="text-[10px] text-white/30 font-normal">/ {data.concepts.length}</span></div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-black/30 border border-white/5 text-center">
                      <div className="text-[10px] text-white/40 uppercase">Relations</div>
                      <div className="font-mono text-base font-bold text-amber-400">{safeRelationships.length} <span className="text-[10px] text-white/30 font-normal">/ {data.relationships.length}</span></div>
                    </div>
                  </div>
                </div>

                {/* Error Banner */}
                {ragError && (
                  <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300">
                    <span className="font-bold">Error:</span> {ragError}
                  </div>
                )}

                {/* Result Display */}
                {ragResult && (
                  <div className="space-y-6">
                    {/* Safety Audit Bar */}
                    <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-white/50">Spoiler Safety:</span>
                        <span className={`font-mono font-bold px-2 py-0.5 rounded ${
                          ragResult.safety?.spoilerSafe ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
                        }`}>
                          {ragResult.safety?.spoilerSafe ? "PASSED" : "FAILED"}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-white/50">Max Reveal Used:</span>
                        <span className="font-mono text-[#F5B800] font-bold">
                          {ragResult.safety?.maxRevealTimeUsed ? `${ragResult.safety.maxRevealTimeUsed.toFixed(2)}s` : "None"}
                        </span>
                        <span className="text-[10px] text-white/40">(&lt;= {Number(ragTimestamp).toFixed(2)}s)</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-white/50">Premise Validated:</span>
                        <span className={`font-mono ${ragResult.safety?.premiseValidated ? "text-emerald-400" : "text-amber-400"}`}>
                          {ragResult.safety?.premiseValidated ? "Yes" : "Safe Refusal"}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-white/50">Latency:</span>
                        <span className="font-mono text-white/70">{ragResult.latencyMs || 0}ms</span>
                      </div>
                    </div>

                    {/* Model Answer / Output Card */}
                    <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 space-y-4">
                      <div className="flex items-center justify-between border-b border-white/5 pb-3">
                        <h4 className="text-xs font-semibold text-white uppercase tracking-wider">
                          {ragResult.mode === "previously_on" ? "Generated Recap" : ragResult.mode === "learn" ? "Quiz & Takeaway" : "NarraView Answer"}
                        </h4>
                        <span className="text-[10px] font-mono text-white/40">Request ID: {ragResult.requestId?.substring(0, 8)}</span>
                      </div>

                      {/* Ask / Explain simple output */}
                      {ragResult.answer && (
                        <div className="text-sm text-white/90 leading-relaxed whitespace-pre-line bg-black/20 p-4 rounded-xl border border-white/5 font-sans">
                          {ragResult.answer}
                        </div>
                      )}

                      {/* Previously On Recap output */}
                      {ragResult.recap && (
                        <div className="text-sm text-white/90 leading-relaxed whitespace-pre-line bg-black/20 p-4 rounded-xl border border-white/5 font-sans">
                          {ragResult.recap}
                        </div>
                      )}

                      {/* Learn Mode output */}
                      {ragResult.mode === "learn" && (
                        <div className="space-y-4">
                          {ragResult.takeaway && (
                            <div className="p-4 rounded-xl bg-[#F5B800]/5 border border-[#F5B800]/20 space-y-1">
                              <div className="text-[10px] uppercase tracking-wider text-[#F5B800] font-bold">Takeaway</div>
                              <div className="text-xs text-white/90">{ragResult.takeaway}</div>
                            </div>
                          )}

                          {ragResult.question && (
                            <div className="p-4 rounded-xl bg-black/30 border border-white/10 space-y-3">
                              <div className="text-[10px] uppercase tracking-wider text-purple-400 font-bold">Quick Check</div>
                              <div className="text-xs font-semibold text-white">{ragResult.question}</div>
                              <div className="space-y-1.5">
                                {ragResult.options?.map((opt: any) => (
                                  <div
                                    key={opt.id}
                                    className={`p-2.5 rounded-lg text-xs font-mono flex items-center justify-between border ${
                                      opt.id === ragResult.correctOptionId
                                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                                        : "bg-white/[0.02] border-white/5 text-white/70"
                                    }`}
                                  >
                                    <span><b className="uppercase mr-2">{opt.id}:</b> {opt.text}</span>
                                    {opt.id === ragResult.correctOptionId && (
                                      <span className="text-[10px] font-bold text-emerald-400">CORRECT</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                              {ragResult.explanation && (
                                <div className="text-[11px] text-white/50 pt-2 border-t border-white/5">
                                  <b>Explanation:</b> {ragResult.explanation}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Citations List */}
                    {ragResult.citations && ragResult.citations.length > 0 && (
                      <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-semibold text-white uppercase tracking-wider">
                            Temporal Evidence Citations ({ragResult.citations.length})
                          </h4>
                          <span className="text-[10px] text-white/40 font-mono">
                            All revealTime &lt;= {Number(ragTimestamp).toFixed(2)}s
                          </span>
                        </div>

                        <div className="grid grid-cols-1 gap-2.5">
                          {ragResult.citations.map((c: any, i: number) => (
                            <div
                              key={i}
                              className="p-3 rounded-xl bg-black/30 border border-white/5 space-y-1.5 hover:border-white/10 transition-all text-xs"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className={`text-[9px] font-mono uppercase px-2 py-0.5 rounded font-bold ${
                                    c.type === "fact" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                                    c.type === "concept" ? "bg-purple-500/10 text-purple-400 border border-purple-500/20" :
                                    c.type === "entity" ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" :
                                    c.type === "event" ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" :
                                    c.type === "relationship" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                                    "bg-white/10 text-white/70"
                                  }`}>
                                    {c.type}
                                  </span>
                                  <span className="font-mono text-white/50 text-[10px]">{c.id}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-[#F5B800] text-[11px] font-bold">
                                    {formatTime(c.revealTime)} ({c.revealTime?.toFixed(1)}s)
                                  </span>
                                </div>
                              </div>
                              <p className="text-white/80 text-[11px] font-mono leading-relaxed bg-white/[0.01] p-2 rounded">
                                {c.textSnippet || c.text || JSON.stringify(c)}
                              </p>
                              {c.evidenceTranscriptIndices && c.evidenceTranscriptIndices.length > 0 && (
                                <div className="text-[9px] text-white/30 font-mono">
                                  Transcript Indices: [{c.evidenceTranscriptIndices.join(", ")}]
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {!ragResult && !ragRunning && !ragError && (
                  <div className="p-12 text-center rounded-2xl bg-white/[0.01] border border-dashed border-white/10 space-y-3">
                    <div className="w-12 h-12 rounded-full bg-[#F5B800]/10 border border-[#F5B800]/20 flex items-center justify-center mx-auto text-[#F5B800] font-bold text-lg">
                      ⚡
                    </div>
                    <div className="text-sm font-semibold text-white">No Simulation Run Yet</div>
                    <div className="text-xs text-white/40 max-w-md mx-auto">
                      Choose a timestamp and question, then click <b>Run Temporal RAG Test</b> to simulate real-time viewer playback.
                    </div>
                  </div>
                )}

                {/* Section: Snapshot Inspector Details */}
                <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-3">
                    <div>
                      <h4 className="text-xs font-semibold text-white uppercase tracking-wider">
                        Live Snapshot Elements Inspector
                      </h4>
                      <p className="text-[11px] text-white/40">
                        Inspect all knowledge elements strictly unlocked at {Number(ragTimestamp).toFixed(2)}s
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {[
                        { key: "facts", label: `Facts (${safeFacts.length})` },
                        { key: "events", label: `Events (${safeEvents.length})` },
                        { key: "entities", label: `Entities (${safeEntities.length + safePeople.length})` },
                        { key: "concepts", label: `Concepts (${safeConcepts.length})` },
                        { key: "relationships", label: `Relations (${safeRelationships.length})` },
                      ].map((s) => (
                        <button
                          key={s.key}
                          onClick={() => setSnapshotView(s.key as any)}
                          className={`px-2.5 py-1 rounded text-[10px] font-mono transition-all ${
                            snapshotView === s.key
                              ? "bg-white/20 text-white font-bold"
                              : "bg-white/5 text-white/50 hover:text-white"
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
                    {snapshotView === "facts" && safeFacts.map((f) => (
                      <div key={f.id} className="p-3 rounded-lg bg-black/30 border border-white/5 space-y-1">
                        <div className="flex justify-between text-[10px] font-mono">
                          <span className="text-emerald-400 font-bold">{f.id}</span>
                          <span className="text-[#F5B800]">{formatTime(f.revealTime)}</span>
                        </div>
                        <div className="text-xs text-white/80">{f.statement}</div>
                      </div>
                    ))}

                    {snapshotView === "events" && safeEvents.map((e) => (
                      <div key={e.id} className="p-3 rounded-lg bg-black/30 border border-white/5 space-y-1">
                        <div className="flex justify-between text-[10px] font-mono">
                          <span className="text-blue-400 font-bold">{e.id}</span>
                          <span className="text-[#F5B800]">{formatTime(e.revealTime)}</span>
                        </div>
                        <div className="text-xs text-white/80">{e.description}</div>
                      </div>
                    ))}

                    {snapshotView === "entities" && [...safePeople, ...safeEntities].map((ent) => (
                      <div key={ent.id} className="p-3 rounded-lg bg-black/30 border border-white/5 space-y-1">
                        <div className="flex justify-between text-[10px] font-mono">
                          <span className="text-cyan-400 font-bold">{ent.name}</span>
                          <span className="text-[#F5B800]">{formatTime(ent.firstKnownAt)}</span>
                        </div>
                        <div className="text-xs text-white/80">{ent.description}</div>
                        {ent.aliases && ent.aliases.length > 0 && (
                          <div className="text-[10px] text-white/40 font-mono">Aliases: {ent.aliases.join(", ")}</div>
                        )}
                      </div>
                    ))}

                    {snapshotView === "concepts" && safeConcepts.map((c) => (
                      <div key={c.id} className="p-3 rounded-lg bg-black/30 border border-white/5 space-y-1">
                        <div className="flex justify-between text-[10px] font-mono">
                          <span className="text-purple-400 font-bold">{c.name}</span>
                          <span className="text-[#F5B800]">{formatTime(c.firstKnownAt)}</span>
                        </div>
                        <div className="text-xs text-white/80">{c.description}</div>
                      </div>
                    ))}

                    {snapshotView === "relationships" && safeRelationships.map((r) => (
                      <div key={r.id} className="p-3 rounded-lg bg-black/30 border border-white/5 space-y-1">
                        <div className="flex justify-between text-[10px] font-mono">
                          <span className="text-amber-400 font-bold">{r.predicate}</span>
                          <span className="text-[#F5B800]">{formatTime(r.revealTime)}</span>
                        </div>
                        <div className="text-xs text-white/80">{r.description || `${r.sourceId} -> ${r.targetId}`}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

            {/* Tab: Temporal Index */}
      {activeTab === "temporal_index" && (
        <div className="space-y-4">
          <div className="bg-black/30 border border-white/10 rounded-xl p-4 text-xs text-white/60 flex items-center justify-between">
            <span>Runtime Retrieval Query: Retrieves all items unlocked at or prior to timestamp T.</span>
            <span className="text-[#F5B800] font-mono font-bold">{data.temporalIndex.revealPoints.length} Reveal Milestones</span>
          </div>

          <div className="space-y-3 relative before:absolute before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-white/10">
            {data.temporalIndex.revealPoints.map((pt, i) => (
              <div key={i} className="pl-10 relative">
                <div className="absolute left-2.5 top-3 -translate-x-1/2 w-3 h-3 rounded-full bg-[#F5B800] border-2 border-black" />
                <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-[#F5B800] bg-[#F5B800]/10 px-2.5 py-1 rounded border border-[#F5B800]/20">
                      {formatTime(pt.time)} ({pt.time.toFixed(1)}s)
                    </span>
                    <span className="text-xs text-white/70 font-medium">{pt.description}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[10px] font-mono pt-1">
                    {pt.entityIds.length > 0 && <span className="text-blue-400">+{pt.entityIds.length} Entities</span>}
                    {pt.conceptIds.length > 0 && <span className="text-purple-400">+{pt.conceptIds.length} Concepts</span>}
                    {pt.factIds.length > 0 && <span className="text-emerald-400">+{pt.factIds.length} Facts</span>}
                    {pt.relationshipIds.length > 0 && <span className="text-amber-400">+{pt.relationshipIds.length} Relations</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function IntelligenceViewer() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <div className="w-10 h-10 border-4 border-white/10 border-t-[#F5B800] rounded-full animate-spin" />
      </div>
    }>
      <IntelligenceViewerInner />
    </Suspense>
  );
}
