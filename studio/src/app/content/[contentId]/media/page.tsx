"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { API_BASE_URL, ADMIN_TOKEN } from "@/config";

function formatDuration(seconds?: number): string {
  if (!seconds || isNaN(seconds)) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}:${remMins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function MediaViewerInner() {
  const params = useParams();
  const router = useRouter();
  const contentId = params.contentId as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [content, setContent] = useState<any>(null);
  const [playbackUrl, setPlaybackUrl] = useState<string>("");

  useEffect(() => {
    fetchMedia();
  }, [contentId]);

  const fetchMedia = async () => {
    setLoading(true);
    setError("");
    try {
      // 1. Fetch content metadata
      const contentRes = await fetch(`${API_BASE_URL}/content/${contentId}`, {
        headers: { 'X-Admin-Token': ADMIN_TOKEN }
      });
      if (!contentRes.ok) {
        throw new Error("Unable to locate content record");
      }
      const contentData = await contentRes.json();
      setContent(contentData);

      // 2. Fetch secure playback URL from GET /content/{contentId}/media-url
      // Fallback to presigned videoUrl returned by /content/{contentId} if available
      let resolvedUrl = "";
      try {
        const mediaRes = await fetch(`${API_BASE_URL}/content/${contentId}/media-url`, {
          headers: { 'X-Admin-Token': ADMIN_TOKEN }
        });
        if (mediaRes.ok) {
          const mediaData = await mediaRes.json();
          if (mediaData.url) {
            resolvedUrl = mediaData.url;
          }
        }
      } catch (e) {
        console.warn("media-url endpoint fetch error:", e);
      }

      if (!resolvedUrl && contentData.videoUrl && contentData.videoUrl.startsWith("https://")) {
        resolvedUrl = contentData.videoUrl;
      }

      if (!resolvedUrl) {
        throw new Error("Unable to prepare secure media for playback.");
      }

      setPlaybackUrl(resolvedUrl);
    } catch (err: any) {
      console.error("Playback preparation failed:", err);
      setError(err.message || "Unable to prepare this media for playback.");
    } finally {
      setLoading(false);
    }
  };

  const title = content?.title || "CityCare Demo";
  const duration = content?.durationSeconds || (content?.duration ? parseFloat(content.duration) : null);

  return (
    <div className="min-h-screen bg-[#07090E] text-white p-6 md:p-12 font-sans selection:bg-[#F5B800]/30 selection:text-white">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Navigation & Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/10">
          <div className="flex items-center gap-4">
            <Link 
              href={`/content/${contentId}`}
              className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-3.5 py-2 rounded-lg transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Details
            </Link>
            <div>
              <h1 className="text-2xl md:text-3xl font-light tracking-tight text-white flex items-center gap-3">
                {title}
              </h1>
              <div className="flex items-center gap-3 mt-1 text-xs text-white/50 font-mono">
                <span>ID: {contentId}</span>
                {duration && (
                  <>
                    <span>•</span>
                    <span>Duration: {formatDuration(duration)} ({Math.round(duration)}s)</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] uppercase tracking-wider px-2.5 py-1 rounded bg-[#F5B800]/10 border border-[#F5B800]/30 text-[#F5B800] font-medium">
              Secure Playback
            </span>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-16 flex flex-col items-center justify-center text-center space-y-4 min-h-[400px]">
            <div className="w-10 h-10 border-2 border-white/10 border-t-[#F5B800] rounded-full animate-spin" />
            <div className="text-lg font-light text-white/90">Preparing secure media...</div>
            <div className="text-xs text-white/40 max-w-sm">
              Authorizing private storage access and establishing high-performance direct media stream.
            </div>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="bg-red-500/[0.04] border border-red-500/20 rounded-2xl p-12 flex flex-col items-center justify-center text-center space-y-4 min-h-[350px]">
            <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-medium text-red-300">Media unavailable</h2>
            <p className="text-sm text-white/60 max-w-md">
              Unable to prepare this media for playback.
            </p>
            <p className="text-xs text-red-400/80 font-mono max-w-md">
              {error}
            </p>
            <button
              onClick={fetchMedia}
              className="mt-4 px-5 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-white font-medium text-xs tracking-wide transition-all cursor-pointer flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Retry
            </button>
          </div>
        )}

        {/* Video Player Display */}
        {!loading && !error && playbackUrl && (
          <div className="space-y-6">
            <div className="relative rounded-2xl overflow-hidden bg-black border border-white/10 shadow-2xl">
              <video
                id="narraview-studio-player"
                controls
                autoPlay={false}
                playsInline
                preload="metadata"
                src={playbackUrl}
                className="w-full max-h-[75vh] aspect-video object-contain bg-black"
              >
                Your browser does not support the video tag.
              </video>
            </div>

            {/* Video Metadata Panel */}
            <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <div className="text-xs uppercase tracking-wider text-white/40 mb-1">Title</div>
                  <div className="text-sm font-medium text-white/90">{title}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-white/40 mb-1">Duration</div>
                  <div className="text-sm font-medium text-white/90">
                    {formatDuration(duration)} {duration ? `(${Math.round(duration)} seconds)` : ""}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-white/40 mb-1">Playback Transport</div>
                  <div className="text-sm font-mono text-emerald-400 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Direct S3 Presigned HTTPS Stream
                  </div>
                </div>
              </div>
              {content?.description && (
                <div className="mt-4 pt-4 border-t border-white/5">
                  <div className="text-xs uppercase tracking-wider text-white/40 mb-1">Synopsis</div>
                  <div className="text-sm text-white/70 leading-relaxed">{content.description}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MediaViewerPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#07090E] p-12 flex items-center justify-center">
        <div className="text-white/40 text-sm">Loading media viewer...</div>
      </div>
    }>
      <MediaViewerInner />
    </Suspense>
  );
}
