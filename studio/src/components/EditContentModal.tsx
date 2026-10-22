"use client";

import { useState, useEffect } from "react";
import { ADMIN_API_BASE_URL } from "@/config";

interface EditContentModalProps {
  content: any;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (updatedItem: any) => void;
}

export const ALLOWED_CATEGORIES = [
  { value: "documentary", label: "Documentary" },
  { value: "tutorial", label: "Tutorial" },
  { value: "demo", label: "Demo" },
  { value: "narrative", label: "Story / Narrative" },
  { category: "educational", value: "educational", label: "Educational" },
  { value: "other", label: "Other" },
];

export default function EditContentModal({
  content,
  isOpen,
  onClose,
  onSaved,
}: EditContentModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [contentCategory, setContentCategory] = useState("other");
  const [contentType, setContentType] = useState("film");
  const [language, setLanguage] = useState("en");
  const [catalogVisible, setCatalogVisible] = useState(true);
  const [mediaPlayable, setMediaPlayable] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (content) {
      setTitle(content.title || "");
      setDescription(content.description || "");
      setContentCategory(content.contentCategory || "other");
      setContentType(content.contentType || "film");
      setLanguage(content.language || "en");
      setCatalogVisible(content.catalogVisible !== false);
      setMediaPlayable(content.mediaPlayable !== false);
      setError("");
    }
  }, [content]);

  if (!isOpen || !content) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title cannot be empty");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const res = await fetch(`${ADMIN_API_BASE_URL}/content/${content.contentId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          contentCategory,
          contentType,
          language,
          catalogVisible,
          mediaPlayable,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update content metadata");
      }

      const updated = await res.json();
      onSaved(updated);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save content");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div 
        className="relative w-full max-w-xl bg-[#14141A] border border-white/10 rounded-2xl shadow-2xl p-6 md:p-8 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 mb-6 border-b border-white/10">
          <div>
            <h2 className="text-xl font-light tracking-wide text-white">Edit Content Metadata</h2>
            <p className="text-xs text-white/40 font-mono mt-1">ID: {content.contentId}</p>
          </div>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-white/60 mb-1.5">
              Title
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-[#1A1A22] border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#F5B800] transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-white/60 mb-1.5">
              Description / Synopsis
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-[#1A1A22] border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#F5B800] transition-colors"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-white/60 mb-1.5">
                Content Category
              </label>
              <select
                value={contentCategory}
                onChange={(e) => setContentCategory(e.target.value)}
                className="w-full bg-[#1A1A22] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#F5B800] transition-colors"
              >
                {ALLOWED_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-white/60 mb-1.5">
                Content Type
              </label>
              <select
                value={contentType}
                onChange={(e) => setContentType(e.target.value)}
                className="w-full bg-[#1A1A22] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#F5B800] transition-colors"
              >
                <option value="film">Film</option>
                <option value="episode">Episode</option>
                <option value="documentary">Documentary</option>
                <option value="tutorial">Tutorial</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-white/60 mb-1.5">
                Language
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full bg-[#1A1A22] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#F5B800] transition-colors"
              >
                <option value="en">English (en)</option>
                <option value="es">Spanish (es)</option>
                <option value="fr">French (fr)</option>
              </select>
            </div>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-6 border-t border-white/5">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={catalogVisible}
                onChange={(e) => setCatalogVisible(e.target.checked)}
                className="w-4 h-4 rounded accent-[#F5B800]"
              />
              <span className="text-sm text-white/80">Catalog Visible</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={mediaPlayable}
                onChange={(e) => setMediaPlayable(e.target.checked)}
                className="w-4 h-4 rounded accent-[#F5B800]"
              />
              <span className="text-sm text-white/80">Media Playable</span>
            </label>
          </div>

          <p className="text-[11px] text-white/30 italic">
            Note: Presentation metadata changes do not trigger or invalidate AI processing.
          </p>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-[#F5B800] text-black font-semibold text-sm rounded-lg hover:bg-[#F5B800]/90 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
