"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { API_BASE_URL, ADMIN_TOKEN } from "@/config";

function ContentDetailInner() {
  const params = useParams();
  const router = useRouter();
  const contentId = params.contentId as string;
  
  const [content, setContent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [startingTranscription, setStartingTranscription] = useState(false);

  useEffect(() => {
    fetchDetail();
  }, [contentId]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (content) {
      const isTranscriptionRunning = content.processing?.transcriptionStatus === 'queued' || content.processing?.transcriptionStatus === 'processing';
      const isSceneDetectionRunning = content.processing?.sceneDetectionStatus === 'queued' || content.processing?.sceneDetectionStatus === 'processing';
      
      if (isTranscriptionRunning || isSceneDetectionRunning) {
        interval = setInterval(() => {
          fetchDetail(true);
        }, 5000);
      }
    }
    return () => clearInterval(interval);
  }, [content, contentId]);

  const fetchDetail = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/content/${contentId}`, {
        headers: {
          'X-Admin-Token': ADMIN_TOKEN
        }
      });
      if (!res.ok) throw new Error("Failed to fetch content details");
      const data = await res.json();
      setContent(data);
    } catch (err: any) {
      if (!isSilent) setError(err.message);
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  const [startingSegmentation, setStartingSegmentation] = useState(false);

  const startTranscription = async () => {
    if (!confirm("Are you sure you want to start transcription for this media?")) return;
    setStartingTranscription(true);
    try {
      const res = await fetch(`${API_BASE_URL}/content/${contentId}/transcribe`, {
        method: 'POST',
        headers: {
          'X-Admin-Token': ADMIN_TOKEN
        }
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to start transcription");
      }
      await fetchDetail();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setStartingTranscription(false);
    }
  };

  const startSegmentation = async () => {
    if (!confirm("Start Scene/Segment detection for this media?")) return;
    setStartingSegmentation(true);
    try {
      const res = await fetch(`${API_BASE_URL}/content/${contentId}/segments/detect`, {
        method: 'POST',
        headers: {
          'X-Admin-Token': ADMIN_TOKEN
        }
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to start segmentation");
      }
      await fetchDetail();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setStartingSegmentation(false);
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-32 space-y-4">
      <div className="w-10 h-10 border-4 border-white/10 border-t-[#F5B800] rounded-full animate-spin" />
      <div className="text-white/40 text-sm uppercase tracking-widest animate-pulse">Scanning Data...</div>
    </div>
  );
  
  if (error) return (
    <div className="relative overflow-hidden p-6 rounded-2xl bg-red-500/5 border border-red-500/20 backdrop-blur-md max-w-4xl mx-auto">
      <div className="absolute top-0 left-0 w-1 h-full bg-red-500" />
      <h3 className="text-red-400 font-medium mb-1">System Error</h3>
      <p className="text-red-400/70 text-sm">{error}</p>
    </div>
  );
  
  if (!content) return <div className="text-white/50 text-center py-20">Artifact Not Found</div>;

  return (
    <div className="max-w-5xl mx-auto relative isolate pb-20">
      {/* Background glow effects */}
      <div className="absolute top-20 -translate-x-20 left-0 w-96 h-96 bg-[#F5B800]/5 rounded-full blur-[100px] -z-10 pointer-events-none" />
      <div className="absolute top-1/2 right-0 translate-x-20 w-80 h-80 bg-indigo-500/10 rounded-full blur-[100px] -z-10 pointer-events-none" />

      <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/10 pb-6 relative z-10">
        <div>
          <Link href="/" className="group flex items-center gap-2 text-white/50 hover:text-white mb-6 text-sm transition-colors w-fit">
            <span className="group-hover:-translate-x-1 transition-transform">&larr;</span> Return to Library
          </Link>
          <h1 className="text-4xl md:text-5xl font-extralight tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-white/90 to-white/70">
            {content.title}
          </h1>
          <p className="text-white/30 font-mono mt-2 tracking-widest uppercase text-sm flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-white/20" />
            {content.contentId}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Poster & Status */}
        <div className="lg:col-span-4 space-y-6">
          <div className="group relative aspect-[2/3] bg-black/40 rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
            {content.posterUrl ? (
              <img src={content.posterUrl} alt="Poster" className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700" />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-black">
                <span className="text-white/20 uppercase tracking-[0.3em] text-xs font-bold">No Image</span>
              </div>
            )}
            
            {/* Inner shadow overlay */}
            <div className="absolute inset-0 shadow-[inset_0_0_50px_rgba(0,0,0,0.5)] pointer-events-none" />
          </div>
          
          <div className="bg-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 p-5 space-y-5 shadow-xl">
            <div>
              <div className="text-xs uppercase tracking-widest text-white/30 mb-2">Media Status</div>
              <div className="flex items-center gap-3">
                <div className="relative flex items-center justify-center">
                  <div className={`w-3 h-3 rounded-full ${content.mediaPlayable ? 'bg-emerald-400' : 'bg-white/20'}`} />
                  {content.mediaPlayable && <div className="absolute w-3 h-3 rounded-full bg-emerald-400 animate-ping opacity-50" />}
                </div>
                <span className={`text-sm font-semibold tracking-wide ${content.mediaPlayable ? 'text-emerald-400' : 'text-white/50'}`}>
                  {content.mediaPlayable ? 'Stream Available' : 'Offline'}
                </span>
              </div>
            </div>
            
            <div className="pt-5 border-t border-white/10">
              <div className="text-xs uppercase tracking-widest text-white/30 mb-2">NarraView Engine</div>
              <div className="flex items-center gap-3">
                <div className="relative flex items-center justify-center">
                  <div className={`w-3 h-3 rounded-full ${content.aiReady ? 'bg-[#F5B800]' : 'bg-white/20'}`} />
                  {content.aiReady && <div className="absolute w-3 h-3 rounded-full bg-[#F5B800] animate-ping opacity-50" />}
                </div>
                <span className={`text-sm font-semibold tracking-wide ${content.aiReady ? 'text-[#F5B800]' : 'text-white/50'}`}>
                  {content.aiReady ? 'Intelligence Armed' : 'Dormant'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Metadata & Processing */}
        <div className="lg:col-span-8 space-y-8">
          
          {/* Metadata Card */}
          <div className="bg-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 p-8 shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/3 pointer-events-none transition-opacity opacity-50 group-hover:opacity-100" />
            
            <h2 className="text-xl font-light tracking-wide text-white/90 border-b border-white/10 pb-4 mb-6 flex items-center gap-3">
              <svg className="w-5 h-5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Core Metadata
            </h2>
            
            <div className="grid grid-cols-2 gap-y-8 gap-x-12 relative z-10">
              <div>
                <span className="block text-xs uppercase tracking-widest text-white/40 mb-2">Format Type</span>
                <span className="text-white/90 capitalize font-medium">{content.contentType}</span>
              </div>
              <div>
                <span className="block text-xs uppercase tracking-widest text-white/40 mb-2">Dialect</span>
                <span className="text-white/90 uppercase font-medium">{content.language}</span>
              </div>
              <div className="col-span-2">
                <span className="block text-xs uppercase tracking-widest text-white/40 mb-2">Synopsis</span>
                <span className="text-white/70 leading-relaxed text-sm md:text-base">{content.description || "No description logged in the database."}</span>
              </div>
              <div className="col-span-2 pt-4 border-t border-white/5">
                <span className="block text-xs uppercase tracking-widest text-white/40 mb-4">Stream Source</span>
                {content.videoUrl ? (
                  <a 
                    href={content.videoUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="group/btn inline-flex items-center justify-center gap-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white py-2.5 px-5 rounded-lg transition-all duration-300"
                  >
                    <svg className="w-4 h-4 text-[#F5B800] transition-transform group-hover/btn:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    <span className="font-medium tracking-wide text-sm">Launch Media</span>
                  </a>
                ) : (
                  <span className="text-white/30 text-sm italic">No stream URI registered</span>
                )}
              </div>
            </div>
          </div>

          {/* Processing Timeline Card */}
          <div className="bg-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 p-8 shadow-xl">
            <h2 className="text-xl font-light tracking-wide text-white/90 border-b border-white/10 pb-4 mb-6 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                Processing Pipeline
              </div>
              <span className="text-[10px] uppercase tracking-widest bg-white/5 border border-white/10 px-2 py-1 rounded text-white/40">
                System Log
              </span>
            </h2>
            
            <div className="space-y-6">
              <TimelineItem 
                label="Media Ingestion" 
                status={content.mediaPlayable ? "Secure" : "Pending"} 
                active={content.mediaPlayable} 
              />
              <TimelineItem 
                label="Amazon Transcribe Pipeline" 
                status={content.processing?.transcriptionStatus === 'not_started' ? "Not Started" : content.processing?.transcriptionStatus} 
                active={content.processing?.transcriptionStatus === 'complete' || content.processing?.transcriptionStatus === 'processing'}
                action={
                  (content.processing?.transcriptionStatus === 'not_started' || content.processing?.transcriptionStatus === 'failed') ? (
                    <button 
                      onClick={startTranscription} 
                      disabled={startingTranscription || !content.mediaPlayable}
                      className="ml-4 text-xs font-semibold tracking-wide bg-white/10 hover:bg-white/20 border border-white/10 text-white px-3 py-1.5 rounded transition-all disabled:opacity-30 flex items-center gap-2"
                    >
                      {startingTranscription && <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />}
                      {startingTranscription ? 'Initializing...' : content.processing?.transcriptionStatus === 'failed' ? 'Restart Process' : 'Execute Job'}
                    </button>
                  ) : content.processing?.transcriptionStatus === 'complete' ? (
                    <Link 
                      href={`/content/${contentId}/transcript`} 
                      className="ml-4 text-xs font-bold tracking-wide bg-[#F5B800]/10 hover:bg-[#F5B800]/20 border border-[#F5B800]/20 text-[#F5B800] px-3 py-1.5 rounded transition-all flex items-center gap-2 group"
                    >
                      View Logs
                      <svg className="w-3 h-3 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </Link>
                  ) : (
                    <div className="ml-4 text-xs font-mono text-white/40 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-white/40 animate-pulse" />
                      Running
                    </div>
                  )
                }
              />
              <TimelineItem 
                label="Scene Boundary Detection" 
                status={content.processing?.sceneDetectionStatus === 'not_started' ? "Not Started" : content.processing?.sceneDetectionStatus}
                active={content.processing?.sceneDetectionStatus === 'complete' || content.processing?.sceneDetectionStatus === 'processing'}
                action={
                  (content.processing?.sceneDetectionStatus === 'not_started' || content.processing?.sceneDetectionStatus === 'failed') ? (
                    <button 
                      onClick={startSegmentation} 
                      disabled={startingSegmentation || content.processing?.transcriptionStatus !== 'complete'}
                      className="ml-4 text-xs font-semibold tracking-wide bg-white/10 hover:bg-white/20 border border-white/10 text-white px-3 py-1.5 rounded transition-all disabled:opacity-30 flex items-center gap-2"
                    >
                      {startingSegmentation && <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />}
                      {startingSegmentation ? 'Initializing...' : content.processing?.sceneDetectionStatus === 'failed' ? 'Restart Process' : 'Execute Job'}
                    </button>
                  ) : content.processing?.sceneDetectionStatus === 'complete' ? (
                    <Link 
                      href={`/content/${contentId}/segments`} 
                      className="ml-4 text-xs font-bold tracking-wide bg-[#F5B800]/10 hover:bg-[#F5B800]/20 border border-[#F5B800]/20 text-[#F5B800] px-3 py-1.5 rounded transition-all flex items-center gap-2 group"
                    >
                      View Segments
                      <svg className="w-3 h-3 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </Link>
                  ) : (
                    <div className="ml-4 text-xs font-mono text-white/40 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-white/40 animate-pulse" />
                      Running
                    </div>
                  )
                }
              />
              <TimelineItem label="Knowledge Graph Extraction" status={content.processing?.metadataExtractionStatus === 'not_started' ? "Not Started" : content.processing?.metadataExtractionStatus} />
              
              <div className="pt-4 border-t border-white/5">
                <TimelineItem label="Final System State" status={content.aiReady ? "Armed" : "Offline"} active={content.aiReady} isAccent />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TimelineItem({ label, status, active = false, isAccent = false, action = null }: { label: string, status: string, active?: boolean, isAccent?: boolean, action?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between py-1 group">
      <div className="flex items-center gap-4 mb-2 sm:mb-0">
        <div className={`w-1 h-1 rounded-full transition-colors ${active ? (isAccent ? 'bg-[#F5B800]' : 'bg-emerald-400') : 'bg-white/20'}`} />
        <span className={`text-sm tracking-wide transition-colors ${active ? 'text-white/90' : 'text-white/50'}`}>{label}</span>
      </div>
      <div className="flex items-center pl-5 sm:pl-0">
        <span className={`text-[11px] font-mono uppercase tracking-widest px-2.5 py-1 rounded-sm border ${
          active ? (
            isAccent ? 'bg-[#F5B800]/5 text-[#F5B800] border-[#F5B800]/20' : 'bg-emerald-400/5 text-emerald-400 border-emerald-400/20'
          ) : status === 'failed' ? 'bg-red-500/5 text-red-400 border-red-500/20' : 'bg-white/[0.02] text-white/30 border-white/5'
        }`}>
          {status}
        </span>
        {action}
      </div>
    </div>
  );
}

export default function ContentDetail() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <div className="w-10 h-10 border-4 border-white/10 border-t-[#F5B800] rounded-full animate-spin" />
      </div>
    }>
      <ContentDetailInner />
    </Suspense>
  );
}
