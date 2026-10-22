"use client";

import { useState } from "react";
import { ADMIN_API_BASE_URL } from "@/config";

interface DeleteContentModalProps {
  content: any;
  isOpen: boolean;
  onClose: () => void;
  onDeleted: (contentId: string) => void;
}

const PROTECTED_DEMO_TITLES = new Set([
  "city-care-demo",
  "ml-systems-tutorial",
  "signal-lost",
]);

export default function DeleteContentModal({
  content,
  isOpen,
  onClose,
  onDeleted,
}: DeleteContentModalProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen || !content) return null;

  const contentId = content.contentId || content.id;
  const isProtected = PROTECTED_DEMO_TITLES.has(contentId);

  const handleDelete = async () => {
    if (isProtected) {
      setError("Protected demo content cannot be deleted.");
      return;
    }

    setDeleting(true);
    setError("");

    try {
      const res = await fetch(`${ADMIN_API_BASE_URL}/content/${contentId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not delete content.");
      }

      onDeleted(contentId);
      onClose();
    } catch (err: any) {
      console.error("[STUDIO_DELETE_ERROR]", err);
      setError("Could not delete content.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div 
        className="relative w-full max-w-md bg-[#14141A] border border-red-500/20 rounded-2xl shadow-2xl p-6 md:p-8 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 text-red-400 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-light tracking-wide text-white">Delete this title?</h2>
            <p className="text-xs text-white/40 font-mono mt-0.5">{content.title} ({contentId})</p>
          </div>
        </div>

        <p className="text-sm text-white/70 leading-relaxed mb-6">
          This will remove the content and its NarraView processing artifacts. This action cannot be undone.
        </p>

        {isProtected && (
          <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2.5">
            <svg className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <span className="font-semibold block mb-0.5">Protected Demo Content</span>
              This title is part of the core demo suite and cannot be deleted for hackathon reliability.
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-xs">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting || isProtected}
            className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white font-semibold text-sm rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {deleting ? "Deleting..." : "Delete Permanently"}
          </button>
        </div>
      </div>
    </div>
  );
}
