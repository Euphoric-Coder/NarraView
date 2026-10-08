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

  useEffect(() => {
    fetchDetail();
  }, [contentId]);

  const fetchDetail = async () => {
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
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="text-white/50">Loading...</div>;
  if (error) return <div className="text-red-400 bg-red-400/10 p-4 rounded border border-red-400/20">{error}</div>;
  if (!content) return <div>Not found</div>;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <Link href="/" className="text-white/40 hover:text-white mb-4 inline-block text-sm">
            &larr; Back to Library
          </Link>
          <h1 className="text-3xl font-light tracking-tight text-white/90">{content.title}</h1>
          <p className="text-white/40 font-mono mt-1">{content.contentId}</p>
        </div>
        <div className="flex gap-4">
          <Link href="/content/new" className="text-white/60 hover:text-white px-4 py-2 border border-white/10 rounded">
            Add Another
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-1 space-y-6">
          {/* Poster */}
          <div className="aspect-[2/3] bg-[#14141A] rounded-lg border border-white/5 overflow-hidden flex items-center justify-center">
            {content.posterUrl ? (
              <img src={content.posterUrl} alt="Poster" className="w-full h-full object-cover" />
            ) : (
              <span className="text-white/20 uppercase tracking-widest text-sm">No Poster</span>
            )}
          </div>
          
          <div className="bg-[#14141A] rounded-lg border border-white/5 p-4 space-y-4">
            <div>
              <div className="text-xs text-white/40 mb-1">Status</div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${content.mediaPlayable ? 'bg-green-500' : 'bg-white/20'}`}></div>
                <span className="text-sm font-medium text-white/90">{content.mediaPlayable ? 'Media Ready' : 'Media Not Ready'}</span>
              </div>
            </div>
            
            <div className="pt-4 border-t border-white/5">
              <div className="text-xs text-white/40 mb-1">AI Intelligence</div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${content.aiReady ? 'bg-[#F5B800]' : 'bg-white/20'}`}></div>
                <span className="text-sm font-medium text-white/90" style={{ color: content.aiReady ? '#F5B800' : 'rgba(255,255,255,0.9)' }}>
                  {content.aiReady ? 'Ready' : 'Not Processed'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="md:col-span-2 space-y-8">
          <div className="bg-[#14141A] rounded-lg border border-white/5 p-6 space-y-6">
            <h2 className="text-lg font-medium text-white/80 border-b border-white/5 pb-4">Metadata</h2>
            
            <div className="grid grid-cols-2 gap-y-4">
              <div>
                <span className="block text-xs text-white/40 mb-1">Content Type</span>
                <span className="text-white/90 capitalize">{content.contentType}</span>
              </div>
              <div>
                <span className="block text-xs text-white/40 mb-1">Language</span>
                <span className="text-white/90 uppercase">{content.language}</span>
              </div>
              <div className="col-span-2 mt-2">
                <span className="block text-xs text-white/40 mb-1">Description</span>
                <span className="text-white/80 leading-relaxed">{content.description || "No description provided."}</span>
              </div>
              <div className="col-span-2 mt-2">
                <span className="block text-xs text-white/40 mb-1">Video Source</span>
                {content.videoUrl ? (
                  <a href={content.videoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/20 text-white text-sm font-medium py-1.5 px-3 rounded transition-colors duration-200 gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    Watch Media
                  </a>
                ) : (
                  <span className="text-white/40 text-sm">No video registered</span>
                )}
              </div>
            </div>
          </div>

          <div className="bg-[#14141A] rounded-lg border border-white/5 p-6 space-y-6 opacity-75">
            <h2 className="text-lg font-medium text-white/80 border-b border-white/5 pb-4 flex justify-between items-center">
              Processing Timeline
              <span className="text-xs bg-white/5 px-2 py-1 rounded text-white/40">Future Pipeline</span>
            </h2>
            
            <div className="space-y-4">
              <TimelineItem label="Media Upload" status={content.mediaPlayable ? "Ready" : "Pending"} active={content.mediaPlayable} />
              <TimelineItem label="Transcription" status={content.processing?.transcriptionStatus === 'not_started' ? "Not Started" : content.processing?.transcriptionStatus} />
              <TimelineItem label="Scene Detection" status={content.processing?.sceneDetectionStatus === 'not_started' ? "Not Started" : content.processing?.sceneDetectionStatus} />
              <TimelineItem label="Knowledge Extraction" status={content.processing?.metadataExtractionStatus === 'not_started' ? "Not Started" : content.processing?.metadataExtractionStatus} />
              <TimelineItem label="AI Ready" status={content.aiReady ? "Ready" : "Not Ready"} active={content.aiReady} isAccent />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TimelineItem({ label, status, active = false, isAccent = false }: { label: string, status: string, active?: boolean, isAccent?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
      <span className="text-sm text-white/70">{label}</span>
      <span className={`text-xs px-2 py-1 rounded font-medium ${active ? (isAccent ? 'bg-[#F5B800]/10 text-[#F5B800]' : 'bg-green-500/10 text-green-500') : 'bg-white/5 text-white/40'}`}>
        {status}
      </span>
    </div>
  );
}

export default function ContentDetail() {
  return (
    <Suspense fallback={<div className="text-white/50">Loading...</div>}>
      <ContentDetailInner />
    </Suspense>
  );
}
