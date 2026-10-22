"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ADMIN_API_BASE_URL } from "@/config";
import { ALLOWED_CATEGORIES } from "@/components/EditContentModal";

function EditContentPageInner() {
  const params = useParams();
  const router = useRouter();
  const contentId = params.contentId as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [contentCategory, setContentCategory] = useState("other");
  const [contentType, setContentType] = useState("film");
  const [language, setLanguage] = useState("en");
  const [catalogVisible, setCatalogVisible] = useState(true);
  const [mediaPlayable, setMediaPlayable] = useState(true);

  useEffect(() => {
    fetchContent();
  }, [contentId]);

  const fetchContent = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${ADMIN_API_BASE_URL}/content/${contentId}`);
      if (!res.ok) throw new Error("Failed to load content details");
      const data = await res.json();
      setTitle(data.title || "");
      setDescription(data.description || "");
      setContentCategory(data.contentCategory || "other");
      setContentType(data.contentType || "film");
      setLanguage(data.language || "en");
      setCatalogVisible(data.catalogVisible !== false);
      setMediaPlayable(data.mediaPlayable !== false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title cannot be empty");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess(false);

    try {
      const res = await fetch(`${ADMIN_API_BASE_URL}/content/${contentId}`, {
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

      setSuccess(true);
      setTimeout(() => {
        router.push(`/content/${contentId}`);
      }, 1000);
    } catch (err: any) {
      setError(err.message || "Failed to update content");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <div className="w-10 h-10 border-4 border-white/10 border-t-[#F5B800] rounded-full animate-spin" />
        <div className="text-white/40 text-sm uppercase tracking-widest animate-pulse">Loading Metadata...</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <Link href={`/content/${contentId}`} className="text-white/40 hover:text-white mb-4 inline-block text-sm">
          &larr; Back to Detail
        </Link>
        <h1 className="text-3xl font-light tracking-tight text-white/90">Edit Content Metadata</h1>
        <p className="text-xs text-white/40 font-mono mt-1">ID: {contentId}</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg text-sm font-medium">
          Content updated. Redirecting...
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6 bg-[#14141A] border border-white/5 rounded-xl p-6 md:p-8">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-white/60 mb-2">
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
          <label className="block text-xs font-semibold uppercase tracking-wider text-white/60 mb-2">
            Description
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
            <label className="block text-xs font-semibold uppercase tracking-wider text-white/60 mb-2">
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
            <label className="block text-xs font-semibold uppercase tracking-wider text-white/60 mb-2">
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
            <label className="block text-xs font-semibold uppercase tracking-wider text-white/60 mb-2">
              Language
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full bg-[#1A1A22] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#F5B800] transition-colors"
            >
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
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

        <div className="flex items-center gap-4 pt-4 border-t border-white/10">
          <button
            type="submit"
            disabled={saving}
            className="bg-[#F5B800] text-black px-6 py-2.5 rounded-lg font-semibold text-sm hover:bg-[#F5B800]/90 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <Link href={`/content/${contentId}`} className="text-white/40 hover:text-white text-sm px-4 py-2">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

export default function EditContentPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <div className="w-10 h-10 border-4 border-white/10 border-t-[#F5B800] rounded-full animate-spin" />
      </div>
    }>
      <EditContentPageInner />
    </Suspense>
  );
}
