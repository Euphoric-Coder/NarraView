"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { API_BASE_URL, ADMIN_TOKEN } from "@/config";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function KnowledgeInspectorInner() {
  const params = useParams();
  const contentId = params.contentId as string;
  const [knowledge, setKnowledge] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    fetchKnowledge();
  }, [contentId]);

  const fetchKnowledge = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE_URL}/content/${contentId}/knowledge`, {
        headers: { 'X-Admin-Token': ADMIN_TOKEN },
        cache: 'no-store'
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to load knowledge graph (HTTP ${res.status})`);
      }
      const data = await res.json();
      setKnowledge(data);
    } catch (err: any) {
      setError(err.message || "Knowledge unavailable");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-32 space-y-4">
      <div className="w-10 h-10 border-4 border-white/10 border-t-[#F5B800] rounded-full animate-spin" />
      <div className="text-white/40 text-sm uppercase tracking-widest animate-pulse">Loading knowledge...</div>
    </div>
  );

  if (error || !knowledge) return (
    <div className="max-w-4xl mx-auto py-20 px-4">
      <Link href={`/content/${contentId}`} className="text-white/50 hover:text-white text-sm mb-6 inline-flex items-center gap-2">
        &larr; Back to Content Pipeline
      </Link>
      <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/10 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto text-red-400">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
        </div>
        <h3 className="text-xl font-light text-white">Knowledge unavailable</h3>
        <p className="text-white/50 text-sm max-w-md mx-auto">{error || "Unable to locate or load the extracted knowledge graph artifact."}</p>
        <div className="pt-2 flex items-center justify-center gap-3">
          <button
            onClick={fetchKnowledge}
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold tracking-wide transition-all"
          >
            Retry
          </button>
        </div>
      </div>
    </div>
  );

  if (!knowledge) return null;

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "segments", label: "Segments" },
    { id: "events", label: `Events (${knowledge.events?.length || 0})` },
    { id: "facts", label: `Facts (${knowledge.facts?.length || 0})` },
    { id: "entities", label: `Entities (${knowledge.entities?.length || 0})` },
    { id: "people", label: `People (${knowledge.people?.length || 0})` },
    { id: "concepts", label: `Concepts (${knowledge.concepts?.length || 0})` },
    { id: "relationships", label: `Relations (${knowledge.relationships?.length || 0})` }
  ];

  return (
    <div className="max-w-7xl mx-auto pb-20 relative isolate">
      <div className="absolute top-0 right-0 w-96 h-96 bg-[#F5B800]/5 rounded-full blur-[100px] -z-10" />
      
      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/10 pb-6 relative z-10">
        <div>
          <Link href={`/content/${contentId}`} className="group flex items-center gap-2 text-white/50 hover:text-white mb-6 text-sm transition-colors w-fit">
            <span className="group-hover:-translate-x-1 transition-transform">&larr;</span> Back to Detail
          </Link>
          <h1 className="text-3xl font-extralight tracking-tight text-white mb-2">
            Knowledge Inspector
          </h1>
          <p className="text-white/40 font-mono text-sm tracking-wide">
            {contentId}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-widest text-white/30 mb-1">Generated With</div>
          <div className="text-sm font-mono text-[#F5B800]/80">{knowledge.metadata?.model}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-8">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm rounded-lg transition-colors border ${
              activeTab === tab.id 
                ? 'bg-white/10 text-white border-white/20' 
                : 'bg-transparent text-white/40 border-transparent hover:bg-white/5 hover:text-white/70'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 backdrop-blur-xl">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Total Segments" value={knowledge.segmentKnowledge?.length || 0} />
              <StatCard label="Events Detected" value={knowledge.events?.length || 0} />
              <StatCard label="Facts Extracted" value={knowledge.facts?.length || 0} />
              <StatCard label="Entities (Canonical)" value={knowledge.entities?.length || 0} />
              <StatCard label="People / Roles" value={knowledge.people?.length || 0} />
              <StatCard label="Concepts" value={knowledge.concepts?.length || 0} />
              <StatCard label="Locations" value={knowledge.locations?.length || 0} />
              <StatCard label="Relationships" value={knowledge.relationships?.length || 0} />
            </div>

            {knowledge.metadata?.qualitySummary && (
              <div className="pt-6 border-t border-white/5">
                <div className="text-xs uppercase tracking-widest text-white/40 mb-3 font-medium">Quality Hardening Summary</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div className="bg-black/30 p-3 rounded-lg border border-white/5">
                    <span className="text-white/40 block mb-1">Entities</span>
                    <span className="text-white/80 font-mono">{knowledge.metadata.qualitySummary.entities?.raw} raw &rarr; {knowledge.metadata.qualitySummary.entities?.canonical} canonical</span>
                  </div>
                  <div className="bg-black/30 p-3 rounded-lg border border-white/5">
                    <span className="text-white/40 block mb-1">Concepts</span>
                    <span className="text-white/80 font-mono">{knowledge.metadata.qualitySummary.concepts?.raw} raw &rarr; {knowledge.metadata.qualitySummary.concepts?.canonical} canonical</span>
                  </div>
                  <div className="bg-black/30 p-3 rounded-lg border border-white/5">
                    <span className="text-white/40 block mb-1">Relationships</span>
                    <span className="text-white/80 font-mono">{knowledge.metadata.qualitySummary.relationships?.raw} raw &rarr; {knowledge.metadata.qualitySummary.relationships?.canonical} canonical</span>
                  </div>
                  <div className="bg-black/30 p-3 rounded-lg border border-white/5">
                    <span className="text-white/40 block mb-1">Dangling Rejected</span>
                    <span className="text-emerald-400/80 font-mono">{knowledge.metadata.qualitySummary.relationships?.rejectedDangling || 0} pruned</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'segments' && (
          <div className="space-y-4">
            {knowledge.segmentKnowledge?.map((seg: any) => (
              <div key={seg.segmentId} className="bg-black/20 border border-white/5 p-4 rounded-xl">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-white/90 font-medium">{seg.title}</h3>
                  <span className="text-xs font-mono text-white/40 bg-white/5 px-2 py-1 rounded">
                    {formatTime(seg.startTime)} - {formatTime(seg.endTime)}
                  </span>
                </div>
                <p className="text-white/60 text-sm mb-4 leading-relaxed">{seg.summary}</p>
                <div className="flex gap-4 text-xs text-white/40">
                  <span>{seg.events?.length || 0} Events</span>
                  <span>{seg.facts?.length || 0} Facts</span>
                  <span>{seg.entities?.length || 0} Entities</span>
                  <span>{seg.concepts?.length || 0} Concepts</span>
                  <span>{seg.relationships?.length || 0} Relations</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'events' && (
          <div className="space-y-3">
            {knowledge.events?.map((ev: any) => (
              <div key={ev.id} className="bg-black/20 border-l-2 border-[#F5B800] p-4 rounded-r-xl text-sm">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-white/90 leading-relaxed">{ev.description}</span>
                  <span className="ml-4 text-xs font-mono text-emerald-400/80 whitespace-nowrap bg-emerald-400/10 px-2 py-1 rounded">
                    Known: {formatTime(ev.revealTime)}
                  </span>
                </div>
                {ev.importance && (
                  <span className="text-[10px] uppercase tracking-widest text-[#F5B800]/70">
                    Priority: {ev.importance}
                  </span>
                )}
                <div className="mt-2 text-[10px] font-mono text-white/30">
                  Evidence Indices: {ev.evidenceTranscriptIndices?.join(', ')}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'facts' && (
          <div className="grid gap-3">
            {knowledge.facts?.map((fact: any) => (
              <div key={fact.id} className="bg-black/20 border border-white/5 p-4 rounded-xl text-sm">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-white/80 leading-relaxed">{fact.statement}</span>
                  <span className="ml-4 text-xs font-mono text-emerald-400/80 whitespace-nowrap">
                    {formatTime(fact.revealTime)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px] font-mono text-white/30">
                  <span>Indices: {fact.evidenceTranscriptIndices?.join(', ')}</span>
                  {fact.origin && (
                    <span className="text-white/20 capitalize">{fact.origin.replace('_', ' ')}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'entities' && (
          <div className="grid md:grid-cols-2 gap-4">
            {knowledge.entities?.map((ent: any) => (
              <div key={ent.id} className="bg-black/20 border border-white/5 p-4 rounded-xl flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-1 gap-2">
                    <h4 className="text-white/90 font-medium text-base">{ent.name}</h4>
                    <div className="flex gap-1.5 shrink-0 items-center">
                      {ent.aliases && ent.aliases.length > 0 && (
                        <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400/80 border border-emerald-500/20">Canonical</span>
                      )}
                      {ent.asrUncertain && (
                        <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400/80 border border-amber-500/20">ASR Noise</span>
                      )}
                      <span className="text-[10px] uppercase tracking-widest text-[#F5B800]/50">{ent.entityType}</span>
                    </div>
                  </div>
                  {ent.description && <p className="text-sm text-white/50 mb-3">{ent.description}</p>}
                  {ent.aliases && ent.aliases.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-1.5 items-center">
                      <span className="text-[11px] text-white/40">Aliases:</span>
                      {ent.aliases.map((alias: string) => (
                        <span key={alias} className="text-[11px] font-mono px-2 py-0.5 rounded bg-white/5 border border-white/10 text-white/70">
                          {alias}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex justify-between items-end pt-2 border-t border-white/5 mt-2">
                  <span className="text-[10px] font-mono text-white/30">Evidence: {ent.evidenceTranscriptIndices?.join(', ')}</span>
                  <span className="text-xs font-mono text-emerald-400/80">Revealed: {formatTime(ent.firstKnownAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'people' && (
          <div className="grid md:grid-cols-2 gap-4">
            {knowledge.people?.map((person: any) => (
              <div key={person.id} className="bg-black/20 border border-white/5 p-4 rounded-xl flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-1 gap-2">
                    <h4 className="text-white/90 font-medium text-base">{person.name}</h4>
                    <span className="text-[10px] uppercase tracking-widest text-[#F5B800]/50">{person.role || 'Person'}</span>
                  </div>
                  {person.description && <p className="text-sm text-white/50 mb-3">{person.description}</p>}
                  {person.aliases && person.aliases.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-1.5 items-center">
                      <span className="text-[11px] text-white/40">Aliases:</span>
                      {person.aliases.map((alias: string) => (
                        <span key={alias} className="text-[11px] font-mono px-2 py-0.5 rounded bg-white/5 border border-white/10 text-white/70">
                          {alias}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex justify-between items-end pt-2 border-t border-white/5 mt-2">
                  <span className="text-[10px] font-mono text-white/30">Evidence: {person.evidenceTranscriptIndices?.join(', ')}</span>
                  <span className="text-xs font-mono text-emerald-400/80">Revealed: {formatTime(person.firstKnownAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'concepts' && (
          <div className="grid md:grid-cols-2 gap-4">
            {knowledge.concepts?.map((concept: any) => (
              <div key={concept.id} className="bg-black/20 border border-white/5 p-4 rounded-xl flex flex-col justify-between">
                <div>
                  <h4 className="text-white/90 font-medium mb-1">{concept.name}</h4>
                  <p className="text-sm text-white/50 mb-3">{concept.description}</p>
                  {concept.aliases && concept.aliases.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-1.5 items-center">
                      <span className="text-[11px] text-white/40">Aliases:</span>
                      {concept.aliases.map((alias: string) => (
                        <span key={alias} className="text-[11px] font-mono px-2 py-0.5 rounded bg-white/5 border border-white/10 text-white/70">
                          {alias}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex justify-between items-end pt-2 border-t border-white/5 mt-2">
                  <span className="text-[10px] font-mono text-white/30">Evidence: {concept.evidenceTranscriptIndices?.join(', ')}</span>
                  <span className="text-xs font-mono text-emerald-400/80">Revealed: {formatTime(concept.firstKnownAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'relationships' && (
          <div className="space-y-3">
            {knowledge.relationships?.map((rel: any) => (
              <div key={rel.id} className="bg-black/20 border border-white/5 p-4 rounded-xl flex items-center justify-between text-sm">
                <div className="flex items-center gap-3 text-white/70">
                  <span className="text-[#F5B800] font-medium">{rel.sourceId.replace(/^[^a-z0-9]+-/, '') || rel.sourceId}</span>
                  <span className="text-white/30 italic">-- {rel.relationshipType} --&gt;</span>
                  <span className="text-white/90 font-medium">{rel.targetId.replace(/^[^a-z0-9]+-/, '') || rel.targetId}</span>
                </div>
                <div className="text-right">
                  {rel.description && <div className="text-xs text-white/40 mb-1">{rel.description}</div>}
                  <div className="flex items-center gap-3 justify-end">
                    <span className="text-[10px] font-mono text-white/30">Evidence: {rel.evidenceTranscriptIndices?.join(', ')}</span>
                    <span className="text-xs font-mono text-emerald-400/80">Revealed: {formatTime(rel.firstKnownAt)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function KnowledgeInspector() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <div className="w-10 h-10 border-4 border-white/10 border-t-[#F5B800] rounded-full animate-spin" />
        <div className="text-white/40 text-sm uppercase tracking-widest animate-pulse">Loading Intelligence...</div>
      </div>
    }>
      <KnowledgeInspectorInner />
    </Suspense>
  );
}

function StatCard({ label, value }: { label: string, value: number }) {
  return (
    <div className="bg-black/20 border border-white/5 p-5 rounded-xl flex flex-col items-center justify-center">
      <div className="text-3xl font-light text-white mb-2">{value}</div>
      <div className="text-xs uppercase tracking-widest text-white/40 text-center">{label}</div>
    </div>
  );
}
