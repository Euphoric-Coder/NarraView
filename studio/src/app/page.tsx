"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ADMIN_API_BASE_URL } from "@/config";
import EditContentModal from "@/components/EditContentModal";
import DeleteContentModal from "@/components/DeleteContentModal";

const PROTECTED_DEMO_TITLES = new Set([
  "city-care-demo",
  "ml-systems-tutorial",
  "signal-lost",
]);

const CATEGORY_DISPLAY_MAP: Record<string, { label: string; color: string }> = {
  documentary: { label: "Documentary", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  tutorial: { label: "Tutorial", color: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  demo: { label: "Demo", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  narrative: { label: "Story", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  educational: { label: "Educational", color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" },
  other: { label: "Other", color: "bg-white/10 text-white/70 border-white/15" },
};

export default function Home() {
  const [content, setContent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modals state
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [deletingItem, setDeletingItem] = useState<any | null>(null);

  // Toast feedback state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"success" | "error">("success");

  useEffect(() => {
    fetchContent();
  }, []);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToastMessage(message);
    setToastType(type);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  const fetchContent = async () => {
    try {
      const res = await fetch(`${ADMIN_API_BASE_URL}/content?all=true`);
      if (!res.ok) throw new Error("Failed to fetch content");
      const data = await res.json();
      setContent(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaved = (updatedItem: any) => {
    setContent((prev) =>
      prev.map((item) =>
        (item.contentId === updatedItem.contentId ? { ...item, ...updatedItem } : item)
      )
    );
    showToast("Content updated.", "success");
  };

  const handleDeleted = (deletedContentId: string) => {
    setContent((prev) => prev.filter((item) => item.contentId !== deletedContentId));
    showToast("Content deleted successfully.", "success");
  };

  const formatTimestamp = (iso?: string) => {
    if (!iso) return null;
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return null;
    }
  };

  const getPipelineStatusBadge = (processing?: any) => {
    const status = processing?.pipelineStatus || "idle";
    if (status === "processing") {
      return (
        <span className="text-[10px] font-mono text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
          Processing
        </span>
      );
    }
    return (
      <span className="text-[10px] font-mono text-white/40 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
        Idle
      </span>
    );
  };

  return (
    <div className="relative min-h-[80vh] w-full isolate">
      {/* Toast Feedback */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-2xl text-sm font-medium flex items-center gap-3 backdrop-blur-md transition-all animate-slideUp ${
            toastType === "success"
              ? "bg-emerald-500/90 text-black border border-emerald-400/40"
              : "bg-red-500/90 text-white border border-red-400/40"
          }`}
        >
          {toastType === "success" ? (
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Background glow effects */}
      <div className="absolute top-0 -translate-y-12 left-1/4 w-96 h-96 bg-[#F5B800]/10 rounded-full blur-[120px] -z-10 pointer-events-none" />
      <div className="absolute bottom-0 translate-y-1/3 right-1/4 w-[30rem] h-[30rem] bg-indigo-500/10 rounded-full blur-[120px] -z-10 pointer-events-none" />

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6 relative z-10">
        <div>
          <h1 className="text-4xl md:text-5xl font-extralight tracking-tight text-white mb-2 bg-clip-text text-transparent bg-gradient-to-r from-white via-white/90 to-white/60">
            Content Library
          </h1>
          <p className="text-white/40 text-sm tracking-wide uppercase font-medium">
            Manage your NarraView Media Universe
          </p>
        </div>
        <Link 
          href="/content/new" 
          className="group relative inline-flex items-center justify-center px-8 py-3.5 font-medium tracking-wide text-black bg-gradient-to-br from-[#F5B800] to-[#E59800] rounded-full overflow-hidden transition-all hover:scale-105 hover:shadow-[0_0_40px_-10px_rgba(245,184,0,0.6)] focus:outline-none"
        >
          <span className="absolute inset-0 w-full h-full -mt-1 rounded-lg opacity-30 bg-gradient-to-b from-transparent via-transparent to-black pointer-events-none"></span>
          <span className="relative flex items-center gap-2">
            <svg className="w-5 h-5 transition-transform group-hover:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"></path>
            </svg>
            Add Content
          </span>
        </Link>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 space-y-4">
          <div className="w-10 h-10 border-4 border-white/10 border-t-[#F5B800] rounded-full animate-spin" />
          <div className="text-white/40 text-sm uppercase tracking-widest animate-pulse">Initializing Interface...</div>
        </div>
      ) : error ? (
        <div className="relative overflow-hidden p-6 rounded-2xl bg-red-500/5 border border-red-500/20 backdrop-blur-md">
          <div className="absolute top-0 left-0 w-1 h-full bg-red-500" />
          <h3 className="text-red-400 font-medium mb-1">System Error</h3>
          <p className="text-red-400/70 text-sm">{error}</p>
        </div>
      ) : content.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 px-6 border border-white/5 rounded-3xl bg-white/[0.01] backdrop-blur-sm relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
          <div className="w-20 h-20 mb-6 rounded-full bg-white/5 flex items-center justify-center">
            <svg className="w-8 h-8 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h3 className="text-2xl font-light text-white/90 mb-2">Void Space Detected</h3>
          <p className="text-white/40 text-center max-w-sm mb-8">
            Your NarraView universe is currently empty. Populate it with an initial video artifact to begin processing.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {content.map((item) => {
            const rawCategory = item.contentCategory || "other";
            const categoryMeta = CATEGORY_DISPLAY_MAP[rawCategory] || CATEGORY_DISPLAY_MAP.other;
            const isProtected = PROTECTED_DEMO_TITLES.has(item.contentId);
            const timeDisplay = formatTimestamp(item.updatedAt || item.createdAt);

            return (
              <div
                key={item.contentId}
                className="relative bg-white/[0.02] border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/[0.04] hover:border-white/20 flex flex-col backdrop-blur-md"
              >
                {/* Poster Area */}
                <div className="aspect-[16/9] w-full bg-black/50 relative flex items-center justify-center overflow-hidden shrink-0">
                  {item.posterUrl ? (
                    <img 
                      src={item.posterUrl} 
                      alt={item.title} 
                      className="w-full h-full object-cover opacity-75" 
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-black flex items-center justify-center">
                      <span className="text-white/10 uppercase tracking-[0.3em] text-xs font-bold">No Signal</span>
                    </div>
                  )}
                  
                  {/* Status Overlay Badges */}
                  <div className="absolute top-3 right-3 flex flex-col gap-1.5 items-end">
                    {item.catalogVisible === false && (
                      <div className="bg-amber-400 text-black px-2 py-0.5 rounded text-[9px] font-extrabold tracking-wider uppercase shadow-lg">
                        Hidden
                      </div>
                    )}
                    {item.mediaPlayable && (
                      <div className="bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-[9px] font-bold tracking-widest text-white border border-white/10 shadow-lg">
                        MEDIA
                      </div>
                    )}
                  </div>

                  {/* Category Badge overlay on image */}
                  <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                    <span className={`text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full border backdrop-blur-md ${categoryMeta.color}`}>
                      {categoryMeta.label}
                    </span>
                    {isProtected && (
                      <span className="text-[10px] font-mono text-amber-300 bg-amber-500/20 border border-amber-400/30 px-2 py-0.5 rounded-full backdrop-blur-md">
                        Protected Demo
                      </span>
                    )}
                  </div>
                  
                  {/* Bottom Gradient */}
                  <div className="absolute bottom-0 w-full h-1/3 bg-gradient-to-t from-[#14141A] to-transparent" />
                </div>
                
                {/* Card Body */}
                <div className="p-5 flex flex-col flex-grow">
                  <div className="mb-2">
                    <h3 className="text-lg font-light text-white/90 line-clamp-1 mb-1">{item.title}</h3>
                    <div className="flex items-center gap-2 text-xs text-white/40 font-mono">
                      <span>{item.contentId}</span>
                      <span>•</span>
                      <span className="capitalize">{item.contentType || "film"}</span>
                      {timeDisplay && (
                        <>
                          <span>•</span>
                          <span>{timeDisplay}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* AI & Pipeline Status Bar */}
                  <div className="py-3 my-2 border-y border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="relative flex items-center justify-center">
                        <div className={`w-2 h-2 rounded-full z-10 ${item.aiReady ? 'bg-[#F5B800]' : 'bg-white/20'}`} />
                        {item.aiReady && <div className="absolute w-2 h-2 rounded-full bg-[#F5B800] animate-ping opacity-50" />}
                      </div>
                      <span className="text-[11px] tracking-wider uppercase font-semibold" style={{ color: item.aiReady ? '#F5B800' : 'rgba(255,255,255,0.4)' }}>
                        {item.aiReady ? 'AI Armed' : 'AI Offline'}
                      </span>
                    </div>

                    {getPipelineStatusBadge(item.processing)}
                  </div>
                  
                  {/* Visual Hierarchy Action Buttons */}
                  <div className="mt-auto pt-3 flex items-center justify-between gap-2">
                    {/* Primary: Open */}
                    <Link
                      href={`/content/${item.contentId}`}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-[#F5B800] text-white hover:text-black rounded-lg text-xs font-semibold tracking-wide transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      Open
                    </Link>

                    <div className="flex items-center gap-1.5">
                      {/* Secondary: Edit */}
                      <button
                        type="button"
                        onClick={() => setEditingItem(item)}
                        className="inline-flex items-center gap-1 px-3 py-2 bg-white/5 hover:bg-white/15 text-white/80 hover:text-white rounded-lg text-xs font-medium transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Edit
                      </button>

                      {/* Destructive: Delete */}
                      <button
                        type="button"
                        onClick={() => setDeletingItem(item)}
                        title={isProtected ? "Protected demo title" : "Delete Content"}
                        className={`inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                          isProtected
                            ? "bg-white/[0.02] text-white/20 cursor-not-allowed"
                            : "bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20"
                        }`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Content Modal */}
      <EditContentModal
        content={editingItem}
        isOpen={Boolean(editingItem)}
        onClose={() => setEditingItem(null)}
        onSaved={handleSaved}
      />

      {/* Delete Content Modal */}
      <DeleteContentModal
        content={deletingItem}
        isOpen={Boolean(deletingItem)}
        onClose={() => setDeletingItem(null)}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
