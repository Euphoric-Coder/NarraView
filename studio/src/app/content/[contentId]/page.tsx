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
  const canonicalContentId = content?.contentId || contentId;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  // Action in-flight states
  const [executingStage, setExecutingStage] = useState<string | null>(null);
  const [stageErrors, setStageErrors] = useState<Record<string, { message: string; requestId?: string }>>({});
  const [showReprocessModal, setShowReprocessModal] = useState(false);
  const [reprocessStartFrom, setReprocessStartFrom] = useState<'transcript_correction' | 'transcription'>('transcript_correction');
  const [reprocessLoading, setReprocessLoading] = useState(false);

  useEffect(() => {
    fetchDetail();
  }, [contentId]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (content) {
      const isTranscriptionRunning = content.processing?.transcriptionStatus === 'queued' || content.processing?.transcriptionStatus === 'processing';
      const isCorrectionRunning = content.processing?.transcriptCorrectionStatus === 'queued' || content.processing?.transcriptCorrectionStatus === 'processing';
      const isSceneDetectionRunning = content.processing?.sceneDetectionStatus === 'queued' || content.processing?.sceneDetectionStatus === 'processing';
      const isKnowledgeRunning = content.processing?.metadataExtractionStatus === 'queued' || content.processing?.metadataExtractionStatus === 'processing';
      const isIntelligenceRunning = content.processing?.intelligenceCompilationStatus === 'queued' || content.processing?.intelligenceCompilationStatus === 'processing';
      const isPipelineRunning = content.processing?.pipelineStatus === 'processing' || content.processing?.pipelineStatus === 'queued';
      
      if (isTranscriptionRunning || isCorrectionRunning || isSceneDetectionRunning || isKnowledgeRunning || isIntelligenceRunning || isPipelineRunning) {
        interval = setInterval(() => {
          fetchDetail(true);
        }, 4000);
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

  // Live elapsed time tracker for active processing
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const isAnyRunning =
      content?.processing?.transcriptionStatus === 'processing' ||
      content?.processing?.transcriptCorrectionStatus === 'processing' ||
      content?.processing?.sceneDetectionStatus === 'processing' ||
      content?.processing?.metadataExtractionStatus === 'processing' ||
      content?.processing?.intelligenceCompilationStatus === 'processing' ||
      content?.processing?.pipelineStatus === 'processing';

    if (!isAnyRunning) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [content?.processing]);

  const getElapsedSeconds = (startedAt?: string | null) => {
    if (!startedAt) return null;
    const start = new Date(startedAt).getTime();
    if (isNaN(start)) return null;
    return Math.max(0, Math.floor((now - start) / 1000));
  };

  const isPipelineActive = content?.processing?.pipelineStatus === 'processing' || content?.processing?.pipelineStatus === 'queued';
  const isReferenceTitle = canonicalContentId === 'signal-lost' || content?.isReferenceTitle;

  // Reprocess AI Pipeline
  const handleReprocessPipeline = async (startFrom: 'transcript_correction' | 'transcription' | 'scene_detection' | 'knowledge_extraction' | 'intelligence_compilation') => {
    setReprocessLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/content/${canonicalContentId}/pipeline/reprocess`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': ADMIN_TOKEN
        },
        body: JSON.stringify({ startFrom })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to start pipeline reprocessing");
      }
      setShowReprocessModal(false);
      await fetchDetail(true);
    } catch (err: any) {
      setStageErrors(prev => ({
        ...prev,
        pipeline: { message: err.message || "Failed to start pipeline reprocessing", requestId: err.requestId }
      }));
    } finally {
      setReprocessLoading(false);
    }
  };

  // Individual Stage Handlers
  const triggerStage = async (stage: string, url: string, confirmMsg: string) => {
    if (isPipelineActive) {
      setStageErrors(prev => ({
        ...prev,
        [stage]: { message: "A full AI pipeline reprocessing job is currently active. Individual actions are temporarily locked." }
      }));
      return;
    }
    if (!confirm(confirmMsg)) return;

    setExecutingStage(stage);
    setStageErrors(prev => {
      const copy = { ...prev };
      delete copy[stage];
      return copy;
    });

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'X-Admin-Token': ADMIN_TOKEN
        }
      });
      const data = await res.json();
      if (!res.ok) {
        const errObj: any = new Error(data.error || `Failed to execute ${stage}`);
        errObj.requestId = data.requestId;
        throw errObj;
      }
      await fetchDetail(true);
    } catch (err: any) {
      setStageErrors(prev => ({
        ...prev,
        [stage]: {
          message: err.message || `Unable to start ${stage}.`,
          requestId: err.requestId
        }
      }));
    } finally {
      setExecutingStage(null);
    }
  };

  const handleTranscribe = (isRerun = false) => {
    const msg = isRerun 
      ? "Re-running Amazon Transcribe will invalidate ALL downstream stages (Transcript Correction, Scene Detection, Knowledge Extraction, Content Intelligence) as STALE. Continue?"
      : "Are you sure you want to start transcription for this media?";
    triggerStage('transcription', `${API_BASE_URL}/content/${canonicalContentId}/transcribe`, msg);
  };

  const handleCorrection = (isRerun = false) => {
    const msg = isRerun
      ? "Re-running Transcript Correction will invalidate downstream stages (Scene Detection, Knowledge Extraction, Content Intelligence) as STALE. Continue?"
      : "Start AI Transcript Correction & Normalization?";
    triggerStage('correction', `${API_BASE_URL}/content/${canonicalContentId}/transcript/correct`, msg);
  };

  const handleSegmentation = (isRerun = false) => {
    const msg = isRerun
      ? "Re-running Scene Boundary Detection will invalidate downstream stages (Knowledge Extraction, Content Intelligence) as STALE. Continue?"
      : "Start Scene/Segment detection for this media?";
    triggerStage('segmentation', `${API_BASE_URL}/content/${canonicalContentId}/segments/detect`, msg);
  };

  const handleKnowledge = (isRerun = false) => {
    const msg = isRerun
      ? "Re-running Knowledge Graph Extraction will invalidate Content Intelligence as STALE. Continue?"
      : "Start Knowledge Graph Extraction for this media?";
    triggerStage('knowledge', `${API_BASE_URL}/content/${canonicalContentId}/knowledge/extract`, msg);
  };

  const handleIntelligence = (isRecompile = false) => {
    const msg = isRecompile
      ? "Compile a new immutable Content Intelligence version (vN)? Previous versions will remain preserved in history."
      : "Compile Canonical Content Intelligence Package?";
    triggerStage('intelligence', `${API_BASE_URL}/content/${canonicalContentId}/intelligence/compile`, msg);
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

  const tStatus = content.processing?.transcriptionStatus || 'not_started';
  const cStatus = content.processing?.transcriptCorrectionStatus || 'not_started';
  const sStatus = content.processing?.sceneDetectionStatus || 'not_started';
  const kStatus = content.processing?.metadataExtractionStatus || 'not_started';
  const iStatus = content.processing?.intelligenceCompilationStatus || 'not_started';
  const pStatus = content.processing?.pipelineStatus || 'idle';
  const pStage = content.processing?.currentPipelineStage || null;
  const pErrorStage = content.processing?.pipelineErrorStage || null;

  return (
    <div className="max-w-5xl mx-auto relative isolate pb-20">
      {/* Background glow effects */}
      <div className="absolute top-20 -translate-x-20 left-0 w-96 h-96 bg-[#F5B800]/5 rounded-full blur-[100px] -z-10 pointer-events-none" />
      <div className="absolute top-1/2 right-0 translate-x-20 w-80 h-80 bg-indigo-500/10 rounded-full blur-[100px] -z-10 pointer-events-none" />

      {/* Header */}
      <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/10 pb-6 relative z-10">
        <div>
          <Link href="/" className="group flex items-center gap-2 text-white/50 hover:text-white mb-6 text-sm transition-colors w-fit">
            <svg className="w-4 h-4 transition-transform group-hover:-translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back to Catalog
          </Link>
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-light tracking-wide text-white/90">{content.title}</h1>
            <span className="text-[10px] font-mono uppercase tracking-widest px-2.5 py-1 rounded border border-white/10 bg-white/5 text-white/70">
              {canonicalContentId}
            </span>
          </div>
        </div>

        {/* Global Pipeline Reprocess CTA */}
        {!isReferenceTitle && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowReprocessModal(true)}
              disabled={isPipelineActive || !content.mediaPlayable}
              title="Regenerates AI-derived artifacts for this title. Existing media is preserved."
              className="group relative inline-flex items-center gap-2.5 bg-gradient-to-r from-[#F5B800] to-amber-500 hover:from-amber-400 hover:to-amber-500 text-black font-semibold text-xs uppercase tracking-wider px-4 py-2.5 rounded-lg shadow-lg shadow-amber-500/20 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <svg className={`w-4 h-4 ${isPipelineActive ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>{isPipelineActive ? 'Pipeline Reprocessing...' : 'Reprocess AI Pipeline'}</span>
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        
        {/* Left Column: Media & System Overview */}
        <div className="lg:col-span-4 space-y-6">
          <div className="aspect-[2/3] w-full rounded-2xl overflow-hidden relative border border-white/10 bg-black/40 shadow-2xl group">
            {content.posterUrl ? (
              <img src={content.posterUrl} alt={content.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-white/20 p-6 text-center">
                <svg className="w-16 h-16 stroke-1 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" /></svg>
                <span className="text-xs tracking-widest uppercase">No Visual Poster</span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
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
              <div className="text-xs uppercase tracking-widest text-white/30 mb-2">NarraView Engine (v0.16)</div>
              <div className="flex items-center gap-3">
                <div className="relative flex items-center justify-center">
                  <div className={`w-3 h-3 rounded-full ${content.aiReady ? 'bg-[#F5B800]' : 'bg-white/20'}`} />
                  {content.aiReady && <div className="absolute w-3 h-3 rounded-full bg-[#F5B800] animate-ping opacity-50" />}
                </div>
                <span className={`text-sm font-semibold tracking-wide ${content.aiReady ? 'text-[#F5B800]' : 'text-white/50'}`}>
                  {content.aiReady ? 'Intelligence Armed' : 'Dormant (Controlled separately)'}
                </span>
              </div>
            </div>

            {content.transcriptCorrection && (
              <div className="pt-5 border-t border-white/10">
                <div className="text-xs uppercase tracking-widest text-white/30 mb-2">Correction Stats</div>
                <div className="space-y-1.5 text-xs text-white/70">
                  <div className="flex justify-between">
                    <span className="text-white/40">Total Fixes:</span>
                    <span className="font-mono text-[#F5B800] font-semibold">{content.transcriptCorrection.correctionCount || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/40">High Confidence:</span>
                    <span className="font-mono text-emerald-400">{content.transcriptCorrection.highConfidenceCount || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/40">Medium Confidence:</span>
                    <span className="font-mono text-amber-400">{content.transcriptCorrection.mediumConfidenceCount || 0}</span>
                  </div>
                </div>
              </div>
            )}

            {content.intelligence && (
              <div className="pt-5 border-t border-white/10">
                <div className="text-xs uppercase tracking-widest text-white/30 mb-2">Content Intelligence</div>
                <div className="space-y-1.5 text-xs text-white/70">
                  <div className="flex justify-between">
                    <span className="text-white/40">Package Version:</span>
                    <span className="font-mono text-[#F5B800] font-semibold">v{content.intelligence.latestVersion || 1}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/40">Integrity Score:</span>
                    <span className="font-mono text-emerald-400 font-semibold">{content.intelligence.qualityScore ?? 100}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/40">Segments:</span>
                    <span className="font-mono text-white/90">{content.intelligence.segmentCount || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/40">Canonical Facts:</span>
                    <span className="font-mono text-white/90">{content.intelligence.factCount || 0}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Metadata & Pipeline Controls */}
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
                {content.mediaPlayable !== false ? (
                  <Link 
                    href={`/content/${canonicalContentId}/media`} 
                    className="group/btn inline-flex items-center justify-center gap-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white py-2.5 px-5 rounded-lg transition-all duration-300"
                  >
                    <svg className="w-4 h-4 text-[#F5B800] transition-transform group-hover/btn:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    <span className="font-medium tracking-wide text-sm">Launch Media</span>
                  </Link>
                ) : (
                  <span className="text-white/30 text-sm italic">No stream URI registered</span>
                )}
              </div>
            </div>
          </div>

          {/* Processing Timeline Card */}
          <div className="bg-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 p-8 shadow-xl space-y-6">
            <div className="border-b border-white/10 pb-4 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                <h2 className="text-xl font-light tracking-wide text-white/90">AI Processing Pipeline</h2>
              </div>
              <span className="text-[10px] uppercase tracking-widest bg-white/5 border border-white/10 px-2 py-1 rounded text-white/40 font-mono">
                Authoritative Sequence
              </span>
            </div>

            {/* Pipeline In-Progress Banner */}
            {isPipelineActive && (
              <div className="bg-[#F5B800]/10 border border-[#F5B800]/30 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#F5B800] animate-pulse" />
                    <span className="text-xs font-bold uppercase tracking-wider text-[#F5B800]">Reprocessing AI Pipeline</span>
                  </div>
                  <span className="text-[11px] font-mono text-white/60 capitalize">
                    Current: <strong className="text-white">{pStage?.replace(/_/g, ' ') || 'initializing'}</strong>
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px] font-mono text-white/70">
                  <div className="flex items-center gap-1.5">
                    <span className={tStatus === 'complete' ? 'text-emerald-400' : pStage === 'transcription' ? 'text-[#F5B800] animate-pulse' : 'text-white/30'}>
                      {tStatus === 'complete' ? '✓' : pStage === 'transcription' ? '●' : '○'} Transcribe
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={cStatus === 'complete' ? 'text-emerald-400' : pStage === 'transcript_correction' ? 'text-[#F5B800] animate-pulse font-medium' : 'text-white/30'}>
                      {cStatus === 'complete' ? '✓' : pStage === 'transcript_correction' ? '●' : '○'} Correction
                      {pStage === 'transcript_correction' && content.processing?.batchProgress?.stage === 'transcript_correction' && content.processing?.batchProgress?.current && (
                        <span className="text-[10px] ml-1 opacity-80 font-mono">
                          (Batch {content.processing.batchProgress.current}/{content.processing.batchProgress.total})
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={sStatus === 'complete' ? 'text-emerald-400' : pStage === 'scene_detection' ? 'text-[#F5B800] animate-pulse' : 'text-white/30'}>
                      {sStatus === 'complete' ? '✓' : pStage === 'scene_detection' ? '●' : '○'} Segments
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={kStatus === 'complete' ? 'text-emerald-400' : pStage === 'knowledge_extraction' ? 'text-[#F5B800] animate-pulse' : 'text-white/30'}>
                      {kStatus === 'complete' ? '✓' : pStage === 'knowledge_extraction' ? '●' : '○'} Knowledge
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Pipeline Failure Banner */}
            {pStatus === 'failed' && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-400" />
                    Pipeline Stopped at {pErrorStage ? pErrorStage.replace(/_/g, ' ') : 'Stage'}
                  </div>
                  <div className="text-[11px] text-white/60 mt-1">
                    An error occurred during automated chain execution. Downstream stages were halted safely.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {pErrorStage && (
                    <button
                      onClick={() => handleReprocessPipeline(pErrorStage as any)}
                      disabled={reprocessLoading}
                      className="text-xs font-semibold bg-[#F5B800] hover:bg-amber-400 text-black px-3 py-1.5 rounded transition-all"
                    >
                      Resume Pipeline
                    </button>
                  )}
                  <button
                    onClick={() => setShowReprocessModal(true)}
                    className="text-xs font-semibold bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded transition-all"
                  >
                    Restart
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-6 pt-2">
              
              {/* 1. Media Ingestion */}
              <TimelineItem 
                number="1"
                label="Media Ingestion" 
                status={content.mediaPlayable ? "Secure" : "Pending"} 
                active={content.mediaPlayable} 
              />

              {/* 2. Amazon Transcribe Pipeline */}
              <div>
                <TimelineItem 
                  number="2"
                  label="Amazon Transcribe" 
                  status={stageErrors['transcription'] ? 'failed' : tStatus} 
                  active={!stageErrors['transcription'] && tStatus === 'complete'}
                  isStale={!stageErrors['transcription'] && tStatus === 'stale'}
                  action={
                    tStatus === 'processing' || tStatus === 'queued' ? (
                      <div className="ml-4 text-xs font-mono text-white/40 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-white/40 animate-pulse" />
                        Running...
                      </div>
                    ) : tStatus === 'not_started' || tStatus === 'failed' || stageErrors['transcription'] ? (
                      <button 
                        onClick={() => {
                          setStageErrors(prev => { const c = { ...prev }; delete c['transcription']; return c; });
                          handleTranscribe(false);
                        }} 
                        disabled={executingStage === 'transcription' || !content.mediaPlayable || isPipelineActive}
                        className="ml-4 text-xs font-semibold tracking-wide bg-white/10 hover:bg-white/20 border border-white/10 text-white px-3 py-1.5 rounded transition-all disabled:opacity-30 flex items-center gap-2"
                      >
                        {executingStage === 'transcription' && <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />}
                        {tStatus === 'failed' || stageErrors['transcription'] ? 'Retry Transcribe' : 'Run Transcribe'}
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 ml-4">
                        <Link 
                          href={`/content/${canonicalContentId}/transcript?view=raw`} 
                          className="text-xs font-bold tracking-wide bg-white/10 hover:bg-white/20 border border-white/10 text-white px-3 py-1.5 rounded transition-all flex items-center gap-2 group"
                        >
                          View Transcript
                          <svg className="w-3 h-3 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </Link>
                        <button
                          onClick={() => handleTranscribe(true)}
                          disabled={executingStage === 'transcription' || isPipelineActive}
                          title="Re-running Transcribe invalidates all downstream stages as STALE"
                          className="text-[10px] uppercase tracking-wider font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white px-2 py-1.5 rounded transition-all disabled:opacity-30"
                        >
                          Re-run
                        </button>
                      </div>
                    )
                  }
                />
                {stageErrors['transcription'] && (
                  <div className="mt-2 ml-5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-300 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-red-400">Unable to start transcription.</div>
                      <div className="text-white/60 text-[11px] mt-0.5">{stageErrors['transcription'].message}</div>
                      {stageErrors['transcription'].requestId && (
                        <div className="text-white/40 text-[10px] font-mono mt-0.5">Request ID: {stageErrors['transcription'].requestId}</div>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setStageErrors(prev => { const c = { ...prev }; delete c['transcription']; return c; });
                        handleTranscribe(tStatus === 'complete');
                      }}
                      className="ml-3 px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-white font-medium text-xs whitespace-nowrap cursor-pointer transition-colors"
                    >
                      Retry
                    </button>
                  </div>
                )}
              </div>

              {/* 3. Transcript Correction / Normalization Layer */}
              <TimelineItem 
                number="3"
                label="Transcript Correction" 
                status={cStatus} 
                active={cStatus === 'complete'}
                isStale={cStatus === 'stale'}
                action={
                  cStatus === 'processing' || cStatus === 'queued' ? (
                    (() => {
                      const cElapsed = getElapsedSeconds(content.transcriptCorrection?.startedAt || content.processing?.transcriptCorrectionStartedAt);
                      const isBatchKnown = content.processing?.batchProgress?.stage === 'transcript_correction' && content.processing?.batchProgress?.current;
                      return (
                        <div className="ml-4 text-xs font-mono text-[#F5B800] flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#F5B800] animate-pulse" />
                          {cStatus === 'queued' ? (
                            'Queued...'
                          ) : isBatchKnown ? (
                            <span>
                              Batch {content.processing?.batchProgress?.current} / {content.processing?.batchProgress?.total}
                              {cElapsed !== null && <span className="text-white/40 ml-1.5">({cElapsed}s)</span>}
                            </span>
                          ) : (
                            <span>
                              Processing
                              {cElapsed !== null && <span className="text-white/40 ml-1.5">({cElapsed}s)</span>}
                            </span>
                          )}
                        </div>
                      );
                    })()
                  ) : cStatus === 'not_started' || cStatus === 'failed' ? (
                    <button 
                      onClick={() => handleCorrection(false)} 
                      disabled={executingStage === 'correction' || tStatus !== 'complete' || isPipelineActive}
                      title={tStatus !== 'complete' ? "Requires completed transcription" : ""}
                      className="ml-4 text-xs font-semibold tracking-wide bg-white/10 hover:bg-white/20 border border-white/10 text-white px-3 py-1.5 rounded transition-all disabled:opacity-30 flex items-center gap-2"
                    >
                      {executingStage === 'correction' && <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />}
                      {cStatus === 'failed' ? 'Retry Correction' : 'Run Correction'}
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 ml-4">
                      {content.transcriptCorrection?.transcriptCorrectionDurationMs && (
                        <span className="text-[11px] font-mono text-white/40 mr-1" title="Correction Duration">
                          {(content.transcriptCorrection.transcriptCorrectionDurationMs / 1000).toFixed(1)}s
                        </span>
                      )}
                      <Link 
                        href={`/content/${canonicalContentId}/transcript?view=corrected`} 
                        className="text-xs font-bold tracking-wide bg-[#F5B800]/10 hover:bg-[#F5B800]/20 border border-[#F5B800]/20 text-[#F5B800] px-3 py-1.5 rounded transition-all flex items-center gap-2 group"
                      >
                        View Corrected Transcript
                        <svg className="w-3 h-3 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                      </Link>
                      <button
                        onClick={() => handleCorrection(true)}
                        disabled={executingStage === 'correction' || isPipelineActive}
                        title="Re-running correction invalidates downstream segments and knowledge as STALE"
                        className="text-[10px] uppercase tracking-wider font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white px-2 py-1.5 rounded transition-all disabled:opacity-30"
                      >
                        Re-run
                      </button>
                    </div>
                  )
                }
              />

              {/* 4. Scene Boundary Detection */}
              <TimelineItem 
                number="4"
                label="Scene / Segment Detection" 
                status={sStatus}
                active={sStatus === 'complete'}
                isStale={sStatus === 'stale'}
                action={
                  sStatus === 'processing' || sStatus === 'queued' ? (
                    <div className="ml-4 text-xs font-mono text-white/40 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-white/40 animate-pulse" />
                      Running...
                    </div>
                  ) : sStatus === 'not_started' || sStatus === 'failed' ? (
                    <button 
                      onClick={() => handleSegmentation(false)} 
                      disabled={executingStage === 'segmentation' || tStatus !== 'complete' || isPipelineActive}
                      className="ml-4 text-xs font-semibold tracking-wide bg-white/10 hover:bg-white/20 border border-white/10 text-white px-3 py-1.5 rounded transition-all disabled:opacity-30 flex items-center gap-2"
                    >
                      {executingStage === 'segmentation' && <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />}
                      {sStatus === 'failed' ? 'Retry Detection' : 'Run Detection'}
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 ml-4">
                      <Link 
                        href={`/content/${canonicalContentId}/segments`} 
                        className="text-xs font-bold tracking-wide bg-[#F5B800]/10 hover:bg-[#F5B800]/20 border border-[#F5B800]/20 text-[#F5B800] px-3 py-1.5 rounded transition-all flex items-center gap-2 group"
                      >
                        View Segments
                        <svg className="w-3 h-3 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                      </Link>
                      <button
                        onClick={() => handleSegmentation(true)}
                        disabled={executingStage === 'segmentation' || isPipelineActive}
                        title="Re-running segmentation invalidates downstream knowledge and intelligence as STALE"
                        className="text-[10px] uppercase tracking-wider font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white px-2 py-1.5 rounded transition-all disabled:opacity-30"
                      >
                        Re-run
                      </button>
                    </div>
                  )
                }
              />

              {/* 5. Knowledge Graph Extraction */}
              <TimelineItem 
                number="5"
                label="Knowledge Graph Extraction" 
                status={kStatus}
                active={kStatus === 'complete'}
                isStale={kStatus === 'stale'}
                action={
                  kStatus === 'processing' || kStatus === 'queued' ? (
                    <div className="ml-4 text-xs font-mono text-white/40 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-white/40 animate-pulse" />
                      Running...
                    </div>
                  ) : kStatus === 'not_started' || kStatus === 'failed' ? (
                    <button 
                      onClick={() => handleKnowledge(false)} 
                      disabled={executingStage === 'knowledge' || sStatus !== 'complete' || isPipelineActive}
                      title={sStatus !== 'complete' ? "Requires completed scene detection" : ""}
                      className="ml-4 text-xs font-semibold tracking-wide bg-white/10 hover:bg-white/20 border border-white/10 text-white px-3 py-1.5 rounded transition-all disabled:opacity-30 flex items-center gap-2"
                    >
                      {executingStage === 'knowledge' && <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />}
                      {kStatus === 'failed' ? 'Retry Knowledge' : 'Extract Knowledge'}
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 ml-4">
                      <Link 
                        href={`/content/${canonicalContentId}/knowledge`} 
                        className="text-xs font-bold tracking-wide bg-[#F5B800]/10 hover:bg-[#F5B800]/20 border border-[#F5B800]/20 text-[#F5B800] px-3 py-1.5 rounded transition-all flex items-center gap-2 group"
                      >
                        View Knowledge
                        <svg className="w-3 h-3 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                      </Link>
                      <button
                        onClick={() => handleKnowledge(true)}
                        disabled={executingStage === 'knowledge' || isPipelineActive}
                        title="Re-running knowledge extraction invalidates content intelligence as STALE"
                        className="text-[10px] uppercase tracking-wider font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white px-2 py-1.5 rounded transition-all disabled:opacity-30"
                      >
                        Re-run
                      </button>
                    </div>
                  )
                }
              />

              {/* 6. Content Intelligence Package Compilation */}
              <TimelineItem 
                number="6"
                label="Content Intelligence" 
                status={iStatus} 
                active={iStatus === 'complete'}
                isStale={iStatus === 'stale'}
                action={
                  iStatus === 'processing' || iStatus === 'queued' ? (
                    <div className="ml-4 text-xs font-mono text-[#F5B800] flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#F5B800] animate-pulse" />
                      Compiling...
                    </div>
                  ) : iStatus === 'not_started' || iStatus === 'failed' ? (
                    <button 
                      onClick={() => handleIntelligence(false)} 
                      disabled={executingStage === 'intelligence' || kStatus !== 'complete' || isPipelineActive}
                      title={kStatus !== 'complete' ? "Requires completed knowledge extraction" : ""}
                      className="ml-4 text-xs font-semibold tracking-wide bg-white/10 hover:bg-white/20 border border-white/10 text-white px-3 py-1.5 rounded transition-all disabled:opacity-30 flex items-center gap-2"
                    >
                      {executingStage === 'intelligence' && <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />}
                      {iStatus === 'failed' ? 'Retry Compilation' : 'Compile Intelligence'}
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 ml-4">
                      <Link 
                        href={`/content/${canonicalContentId}/intelligence`} 
                        className="text-xs font-bold tracking-wide bg-[#F5B800]/10 hover:bg-[#F5B800]/20 border border-[#F5B800]/20 text-[#F5B800] px-3 py-1.5 rounded transition-all flex items-center gap-2 group"
                      >
                        View Intelligence
                        <svg className="w-3 h-3 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                      </Link>
                      <button
                        onClick={() => handleIntelligence(true)}
                        disabled={executingStage === 'intelligence' || isPipelineActive}
                        title="Recompile to new immutable version. Does not invalidate earlier stages."
                        className="text-[10px] uppercase tracking-wider font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white px-2.5 py-1.5 rounded transition-all disabled:opacity-30"
                      >
                        Recompile
                      </button>
                    </div>
                  )
                }
              />
              
              <div className="pt-4 border-t border-white/5">
                <TimelineItem 
                  label="Final System State (AI Ready)" 
                  status={content.aiReady ? "Armed" : "Offline"} 
                  active={content.aiReady} 
                  isAccent 
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal: Reprocess AI Pipeline */}
      {showReprocessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#121214] border border-white/10 rounded-2xl max-w-xl w-full p-6 space-y-6 shadow-2xl relative">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-medium text-white/90">Reprocess AI Pipeline?</h3>
                <p className="text-xs text-white/50 mt-1">
                  This will regenerate downstream AI artifacts for this title. Media file is preserved.
                </p>
              </div>
              <button 
                onClick={() => setShowReprocessModal(false)}
                className="text-white/40 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              {/* Option A (Recommended) */}
              <label 
                onClick={() => setReprocessStartFrom('transcript_correction')}
                className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                  reprocessStartFrom === 'transcript_correction' 
                    ? 'border-[#F5B800]/50 bg-[#F5B800]/5 text-white' 
                    : 'border-white/10 bg-white/[0.02] text-white/70 hover:border-white/20'
                }`}
              >
                <input 
                  type="radio" 
                  name="startFrom" 
                  checked={reprocessStartFrom === 'transcript_correction'} 
                  onChange={() => setReprocessStartFrom('transcript_correction')}
                  className="mt-1 accent-[#F5B800]"
                />
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-white flex items-center gap-2">
                    Reprocess from Transcript Correction
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-[#F5B800]/20 text-[#F5B800]">Recommended</span>
                  </div>
                  <div className="text-[11px] text-white/60">
                    Preserves existing Amazon Transcribe output. Regenerates Corrected Transcript, Scene Detection, Knowledge Extraction, and Content Intelligence. Saves AWS transcription time & cost.
                  </div>
                </div>
              </label>

              {/* Option B */}
              <label 
                onClick={() => setReprocessStartFrom('transcription')}
                className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                  reprocessStartFrom === 'transcription' 
                    ? 'border-[#F5B800]/50 bg-[#F5B800]/5 text-white' 
                    : 'border-white/10 bg-white/[0.02] text-white/70 hover:border-white/20'
                }`}
              >
                <input 
                  type="radio" 
                  name="startFrom" 
                  checked={reprocessStartFrom === 'transcription'} 
                  onChange={() => setReprocessStartFrom('transcription')}
                  className="mt-1 accent-[#F5B800]"
                />
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-white">
                    Reprocess Everything
                  </div>
                  <div className="text-[11px] text-white/60">
                    Reruns Amazon Transcribe and all downstream AI stages from scratch. Use this only if the raw audio transcription itself needs regeneration.
                  </div>
                </div>
              </label>
            </div>

            <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5 text-[11px] text-white/50 space-y-1">
              <div>• Existing historical intelligence versions will remain preserved.</div>
              <div>• This title will remain <strong className="text-white/70">AI Ready = False</strong> until verified in v0.16.</div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowReprocessModal(false)}
                disabled={reprocessLoading}
                className="text-xs font-semibold px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleReprocessPipeline(reprocessStartFrom)}
                disabled={reprocessLoading}
                className="text-xs font-semibold px-5 py-2 rounded-lg bg-[#F5B800] hover:bg-amber-400 text-black flex items-center gap-2 transition-all shadow-lg shadow-amber-500/20"
              >
                {reprocessLoading && <div className="w-3 h-3 border-2 border-black/20 border-t-black rounded-full animate-spin" />}
                {reprocessLoading ? 'Dispatching...' : 'Start Reprocess'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TimelineItem({ 
  number,
  label, 
  status, 
  active = false, 
  isStale = false,
  isAccent = false, 
  action = null 
}: { 
  number?: string;
  label: string; 
  status: string; 
  active?: boolean; 
  isStale?: boolean;
  isAccent?: boolean; 
  action?: React.ReactNode; 
}) {
  const isFailed = status === 'failed';
  const isRunning = status === 'processing' || status === 'queued';

  let badgeColor = 'bg-white/[0.02] text-white/30 border-white/5';
  if (isStale) {
    badgeColor = 'bg-amber-500/10 text-amber-300 border-amber-500/30';
  } else if (active) {
    badgeColor = isAccent ? 'bg-[#F5B800]/5 text-[#F5B800] border-[#F5B800]/20' : 'bg-emerald-400/5 text-emerald-400 border-emerald-400/20';
  } else if (isFailed) {
    badgeColor = 'bg-red-500/5 text-red-400 border-red-500/20';
  } else if (isRunning) {
    badgeColor = 'bg-white/5 text-white/70 border-white/10';
  }

  const displayStatus = isStale ? 'STALE' : status.replace(/_/g, ' ');

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between py-1.5 group">
      <div className="flex items-center gap-4 mb-2 sm:mb-0">
        {number ? (
          <span className="text-xs font-mono text-white/30 w-4">{number}.</span>
        ) : (
          <div className={`w-1 h-1 rounded-full transition-colors ${active ? (isAccent ? 'bg-[#F5B800]' : 'bg-emerald-400') : 'bg-white/20'}`} />
        )}
        <span className={`text-sm tracking-wide transition-colors ${active ? 'text-white/90' : isStale ? 'text-white/70' : 'text-white/50'}`}>
          {label}
        </span>
      </div>
      <div className="flex items-center pl-5 sm:pl-0">
        <span 
          title={isStale ? "Upstream dependency changed. Run to regenerate." : ""}
          className={`text-[11px] font-mono uppercase tracking-widest px-2.5 py-1 rounded-sm border ${badgeColor}`}
        >
          {displayStatus}
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
