"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { API_BASE_URL, ADMIN_TOKEN } from "@/config";

function TranscriptViewerInner() {
  const params = useParams();
  const router = useRouter();
  const contentId = params.contentId as string;
  
  const [transcript, setTranscript] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchTranscript();
  }, [contentId]);

  const fetchTranscript = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/content/${contentId}/transcript`, {
        headers: {
          'X-Admin-Token': ADMIN_TOKEN
        }
      });
      if (!res.ok) throw new Error("Failed to fetch transcript");
      const data = await res.json();
      setTranscript(data);
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
      <div className="text-white/40 text-sm uppercase tracking-widest animate-pulse">Decrypting Transcript...</div>
    </div>
  );
  
  if (error) return (
    <div className="relative overflow-hidden p-6 rounded-2xl bg-red-500/5 border border-red-500/20 backdrop-blur-md max-w-4xl mx-auto">
      <div className="absolute top-0 left-0 w-1 h-full bg-red-500" />
      <h3 className="text-red-400 font-medium mb-1">Decryption Failure</h3>
      <p className="text-red-400/70 text-sm">{error}</p>
    </div>
  );
  
  if (!transcript || !transcript.segments) return <div className="text-white/50 text-center py-20">No transcript signature found.</div>;

  const duration = transcript.segments.length > 0 ? transcript.segments[transcript.segments.length - 1].endTime : 0;

  return (
    <div className="max-w-5xl mx-auto pb-20 relative isolate">
      {/* Background ambient effects */}
      <div className="absolute top-20 right-0 w-96 h-96 bg-[#F5B800]/5 rounded-full blur-[120px] -z-10 pointer-events-none" />
      <div className="absolute top-1/2 -left-20 w-[30rem] h-[30rem] bg-indigo-500/5 rounded-full blur-[100px] -z-10 pointer-events-none" />

      <div className="mb-10 flex flex-col justify-between border-b border-white/10 pb-8 relative z-10">
        <div>
          <Link href={`/content/${contentId}`} className="group flex items-center gap-2 text-white/50 hover:text-white mb-6 text-sm transition-colors w-fit">
            <span className="group-hover:-translate-x-1 transition-transform">&larr;</span> Back to Object
          </Link>
          <h1 className="text-4xl md:text-5xl font-extralight tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-white/90 to-white/70">
            Normalized Transcript
          </h1>
          <p className="text-white/30 font-mono mt-3 tracking-widest uppercase text-sm flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-white/20" />
            Source: <span className="text-[#F5B800]">{transcript.metadata?.source || 'Amazon Transcribe'}</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Metadata Log */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 p-6 space-y-6 shadow-xl sticky top-8">
            <h2 className="text-sm font-semibold tracking-widest uppercase text-white/50 border-b border-white/10 pb-4 mb-4">
              Transcript Metrics
            </h2>
            
            <div className="space-y-4">
              <div>
                <span className="block text-[10px] uppercase tracking-widest text-white/30 mb-1">Processing Engine</span>
                <span className="text-sm font-medium text-white/90 capitalize flex items-center gap-2">
                  <svg className="w-4 h-4 text-[#F5B800]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                  {(transcript.metadata?.source || 'aws-transcribe').replace('-', ' ')}
                </span>
              </div>
              <div className="pt-3 border-t border-white/5">
                <span className="block text-[10px] uppercase tracking-widest text-white/30 mb-1">Language Dialect</span>
                <span className="text-sm font-medium text-white/90 uppercase">{transcript.language || 'EN-US'}</span>
              </div>
              <div className="pt-3 border-t border-white/5">
                <span className="block text-[10px] uppercase tracking-widest text-white/30 mb-1">Segment Count</span>
                <span className="text-sm font-medium text-white/90 font-mono">{transcript.segments.length} Chunks</span>
              </div>
              <div className="pt-3 border-t border-white/5">
                <span className="block text-[10px] uppercase tracking-widest text-white/30 mb-1">Track Duration</span>
                <span className="text-sm font-medium text-white/90 font-mono">{formatTime(duration)}</span>
              </div>
              <div className="pt-3 border-t border-white/5">
                <span className="block text-[10px] uppercase tracking-widest text-white/30 mb-1">Decryption Date</span>
                <span className="text-sm font-medium text-white/90 truncate block">
                  {transcript.metadata?.createdAt ? new Date(transcript.metadata.createdAt).toLocaleString() : 'Just now'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Audio Segments */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center gap-4 mb-2 pl-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
            <span className="text-xs uppercase tracking-widest text-white/50">Decrypted Audio Log</span>
          </div>

          {transcript.segments.map((seg: any) => (
            <div 
              key={seg.id} 
              className="group bg-white/[0.02] backdrop-blur-md rounded-xl border border-white/5 p-5 transition-all duration-300 hover:bg-white/[0.04] hover:border-white/20 hover:-translate-y-0.5 hover:shadow-lg relative overflow-hidden"
            >
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#F5B800]/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              
              <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                {/* Timestamp */}
                <div className="shrink-0 pt-1">
                  <div className="inline-flex items-center gap-2 bg-[#F5B800]/10 border border-[#F5B800]/20 px-2.5 py-1 rounded text-[#F5B800] text-xs font-mono">
                    <svg className="w-3.5 h-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    {formatTime(seg.startTime)} &rarr; {formatTime(seg.endTime)}
                  </div>
                </div>
                
                {/* Content */}
                <p className="text-white/80 leading-relaxed text-[15px] group-hover:text-white transition-colors">
                  {seg.text}
                </p>
              </div>
            </div>
          ))}

          {transcript.segments.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 px-6 border border-white/5 rounded-2xl bg-white/[0.01]">
              <div className="w-12 h-12 mb-4 rounded-full bg-white/5 flex items-center justify-center">
                <svg className="w-6 h-6 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" clipRule="evenodd" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
              </div>
              <p className="text-white/40">No audible speech patterns identified.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TranscriptViewer() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <div className="w-10 h-10 border-4 border-white/10 border-t-[#F5B800] rounded-full animate-spin" />
      </div>
    }>
      <TranscriptViewerInner />
    </Suspense>
  );
}
