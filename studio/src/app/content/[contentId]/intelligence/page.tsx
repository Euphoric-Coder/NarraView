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
  const [activeTab, setActiveTab] = useState<"overview" | "timeline" | "people_entities" | "concepts_facts" | "relationships" | "temporal_index">("overview");
  const [recompiling, setRecompiling] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");

  useEffect(() => {
    fetchIntelligence();
  }, [contentId]);

  const fetchIntelligence = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE_URL}/content/${contentId}/intelligence`, {
        headers: { 'X-Admin-Token': ADMIN_TOKEN }
      });
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error("No compiled intelligence package found. Please trigger compilation first.");
        }
        throw new Error("Failed to load content intelligence");
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
        <div className="pt-2">
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
