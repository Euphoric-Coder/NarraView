"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { API_BASE_URL, ADMIN_TOKEN } from "@/config";

function SegmentsViewerInner() {
  const params = useParams();
  const contentId = params.contentId as string;
  
  const [segmentDoc, setSegmentDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchSegments();
  }, [contentId]);

  const fetchSegments = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/content/${contentId}/segments`, {
        headers: {
          'X-Admin-Token': ADMIN_TOKEN
        }
      });
      if (!res.ok) throw new Error("Failed to fetch segments");
      const data = await res.json();
      setSegmentDoc(data);
    } catch (err: any) {
      setError(err.message);
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
      <div className="text-white/40 text-sm uppercase tracking-widest animate-pulse">Loading Temporal Maps...</div>
    </div>
  );
  
  if (error) return (
    <div className="relative overflow-hidden p-6 rounded-2xl bg-red-500/5 border border-red-500/20 backdrop-blur-md max-w-4xl mx-auto">
      <div className="absolute top-0 left-0 w-1 h-full bg-red-500" />
      <h3 className="text-red-400 font-medium mb-1">Retrieval Failure</h3>
      <p className="text-red-400/70 text-sm">{error}</p>
    </div>
  );
  
  if (!segmentDoc || !segmentDoc.segments) return <div className="text-white/50 text-center py-20">No segments identified.</div>;

  return (
    <div className="max-w-5xl mx-auto pb-20 relative isolate">
      <div className="absolute top-20 right-0 w-96 h-96 bg-[#F5B800]/5 rounded-full blur-[120px] -z-10 pointer-events-none" />
      <div className="absolute top-1/2 -left-20 w-[30rem] h-[30rem] bg-indigo-500/5 rounded-full blur-[100px] -z-10 pointer-events-none" />

      <div className="mb-10 flex flex-col justify-between border-b border-white/10 pb-8 relative z-10">
        <div>
          <Link href={`/content/${contentId}`} className="group flex items-center gap-2 text-white/50 hover:text-white mb-6 text-sm transition-colors w-fit">
            <span className="group-hover:-translate-x-1 transition-transform">&larr;</span> Back to Object
          </Link>
          <h1 className="text-4xl md:text-5xl font-extralight tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-white/90 to-white/70">
            Temporal Structure Map
          </h1>
          <p className="text-white/30 font-mono mt-3 tracking-widest uppercase text-sm flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Detected via: <span className="text-emerald-400">{segmentDoc.metadata?.provider || 'GPT OSS 120B'}</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Metadata */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 p-6 space-y-6 shadow-xl sticky top-8">
            <h2 className="text-sm font-semibold tracking-widest uppercase text-white/50 border-b border-white/10 pb-4 mb-4">
              Map Details
            </h2>
            
            <div className="space-y-4">
              <div>
                <span className="block text-[10px] uppercase tracking-widest text-white/30 mb-1">Version</span>
                <span className="text-sm font-medium text-white/90">{segmentDoc.version}</span>
              </div>
              <div className="pt-3 border-t border-white/5">
                <span className="block text-[10px] uppercase tracking-widest text-white/30 mb-1">Segments Detected</span>
                <span className="text-sm font-medium text-white/90 font-mono">{segmentDoc.segments.length} units</span>
              </div>
              <div className="pt-3 border-t border-white/5">
                <span className="block text-[10px] uppercase tracking-widest text-white/30 mb-1">Generation Date</span>
                <span className="text-sm font-medium text-white/90 truncate block">
                  {segmentDoc.metadata?.createdAt ? new Date(segmentDoc.metadata.createdAt).toLocaleString() : 'Just now'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Segments List */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center gap-4 mb-2 pl-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#F5B800] shadow-[0_0_10px_rgba(245,184,0,0.8)]" />
            <span className="text-xs uppercase tracking-widest text-white/50">Chronological Segments</span>
          </div>

          {segmentDoc.segments.map((seg: any, index: number) => (
            <div 
              key={seg.segmentId || index} 
              className="group bg-white/[0.02] backdrop-blur-md rounded-xl border border-white/5 p-6 transition-all duration-300 hover:bg-white/[0.04] hover:border-white/20 hover:-translate-y-0.5 hover:shadow-lg relative overflow-hidden flex flex-col md:flex-row gap-6"
            >
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#F5B800]/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              
              <div className="shrink-0 w-32">
                <div className="inline-flex items-center gap-2 bg-[#F5B800]/10 border border-[#F5B800]/20 px-2.5 py-1 rounded text-[#F5B800] text-sm font-mono tracking-widest shadow-inner">
                  {formatTime(seg.startTime)} &rarr; {formatTime(seg.endTime)}
                </div>
                <div className="mt-3 text-[10px] uppercase tracking-widest text-white/30 font-mono">
                  IDX {seg.transcriptStartIndex} - {seg.transcriptEndIndex}
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-widest text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded w-fit">
                  {seg.segmentType}
                </div>
              </div>
              
              <div className="flex-1">
                <h3 className="text-lg font-medium text-white/90 mb-2 leading-tight">
                  {seg.title}
                </h3>
                {seg.summary && (
                  <p className="text-white/60 text-sm leading-relaxed mb-4">
                    {seg.summary}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SegmentsViewer() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <div className="w-10 h-10 border-4 border-white/10 border-t-[#F5B800] rounded-full animate-spin" />
      </div>
    }>
      <SegmentsViewerInner />
    </Suspense>
  );
}
