"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { API_BASE_URL, ADMIN_TOKEN } from "@/config";

export default function AddContent() {
  const router = useRouter();
  
  const [formData, setFormData] = useState({
    title: "",
    contentId: "",
    description: "",
    contentType: "film",
    language: "en",
  });

  const [mediaMode, setMediaMode] = useState<"upload" | "url">("upload");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [posterUrl, setPosterUrl] = useState("");

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  
  const handleIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // ^[a-z0-9]+(?:-[a-z0-9]+)*$
    if (val === "" || /^[a-z0-9-]+$/.test(val)) {
      setFormData({ ...formData, contentId: val });
    }
  };

  const uploadFileToS3 = async (file: File, endpoint: string) => {
    // 1. Request presigned URL
    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Token": ADMIN_TOKEN
      },
      body: JSON.stringify({
        contentId: formData.contentId,
        fileName: file.name,
        contentType: file.type
      })
    });
    
    if (!res.ok) throw new Error(`Failed to get presigned URL for ${file.name}`);
    const { uploadUrl, url } = await res.json();
    
    // 2. Upload directly to S3
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type
      },
      body: file
    });
    
    if (!uploadRes.ok) throw new Error(`Failed to upload ${file.name} to S3`);
    return url; // Return final S3 URL
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setUploading(true);
    setProgress("Starting registration...");

    try {
      // Validate contentId exactly
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(formData.contentId)) {
        throw new Error("Invalid Content ID format. Use lowercase letters, numbers, and hyphens.");
      }
      
      let finalVideoUrl = videoUrl;
      let finalPosterUrl = posterUrl;
      
      // Upload Video if selected
      if (mediaMode === "upload" && videoFile) {
        setProgress("Uploading video directly to S3...");
        finalVideoUrl = await uploadFileToS3(videoFile, "/content/upload-url");
      } else if (mediaMode === "upload" && !videoFile) {
        throw new Error("Please select a video file or use an existing URL");
      }
      
      // Upload Poster if selected
      if (posterFile) {
        setProgress("Uploading poster directly to S3...");
        finalPosterUrl = await uploadFileToS3(posterFile, "/content/poster-upload-url");
      }

      setProgress("Registering metadata...");
      const res = await fetch(`${API_BASE_URL}/content`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Token": ADMIN_TOKEN
        },
        body: JSON.stringify({
          ...formData,
          videoUrl: finalVideoUrl,
          posterUrl: finalPosterUrl,
          mediaPlayable: !!finalVideoUrl,
          aiReady: false // New content is never AI ready by default
        })
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to save content metadata");
      }

      setProgress("Success!");
      // Redirect to detail page
      router.push(`/content/${formData.contentId}`);
      
    } catch (err: any) {
      setError(err.message);
      setUploading(false);
      setProgress("");
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <Link href="/" className="text-white/40 hover:text-white mb-4 inline-block text-sm">
          &larr; Back to Library
        </Link>
        <h1 className="text-3xl font-light tracking-tight text-white/90">Add Content</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-md">
            Couldn't save this content. {error}
          </div>
        )}

        {/* Basic Information */}
        <div className="bg-[#14141A] border border-white/5 rounded-lg p-6 space-y-6">
          <h2 className="text-lg font-medium text-white/80 border-b border-white/5 pb-4">Basic Information</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white/60 mb-1">Title</label>
              <input 
                type="text" required
                value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})}
                className="w-full bg-[#1A1A22] border border-white/10 rounded px-4 py-2 text-white focus:outline-none focus:border-[#F5B800] transition-colors" 
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-white/60 mb-1">Content ID</label>
              <input 
                type="text" required placeholder="e.g., citycare-demo"
                value={formData.contentId} onChange={handleIdChange}
                className="w-full bg-[#1A1A22] border border-white/10 rounded px-4 py-2 text-white font-mono focus:outline-none focus:border-[#F5B800] transition-colors" 
              />
              <p className="text-xs text-white/40 mt-1">Must be unique. Lowercase letters, numbers, hyphens only.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-white/60 mb-1">Description</label>
              <textarea 
                rows={3}
                value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}
                className="w-full bg-[#1A1A22] border border-white/10 rounded px-4 py-2 text-white focus:outline-none focus:border-[#F5B800] transition-colors" 
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white/60 mb-1">Content Type</label>
                <select 
                  value={formData.contentType} onChange={e => setFormData({...formData, contentType: e.target.value})}
                  className="w-full bg-[#1A1A22] border border-white/10 rounded px-4 py-2 text-white focus:outline-none focus:border-[#F5B800] transition-colors"
                >
                  <option value="film">Film</option>
                  <option value="episode">Episode</option>
                  <option value="documentary">Documentary</option>
                  <option value="tutorial">Tutorial</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/60 mb-1">Language</label>
                <select 
                  value={formData.language} onChange={e => setFormData({...formData, language: e.target.value})}
                  className="w-full bg-[#1A1A22] border border-white/10 rounded px-4 py-2 text-white focus:outline-none focus:border-[#F5B800] transition-colors"
                >
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Media */}
        <div className="bg-[#14141A] border border-white/5 rounded-lg p-6 space-y-6">
          <h2 className="text-lg font-medium text-white/80 border-b border-white/5 pb-4">Media</h2>
          
          <div className="space-y-6">
            <div>
              <div className="flex gap-4 mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" name="mediaMode" value="upload" 
                    checked={mediaMode === "upload"} onChange={() => setMediaMode("upload")}
                    className="accent-[#F5B800]"
                  />
                  <span className="text-sm text-white/80">Upload Video</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" name="mediaMode" value="url" 
                    checked={mediaMode === "url"} onChange={() => setMediaMode("url")}
                    className="accent-[#F5B800]"
                  />
                  <span className="text-sm text-white/80">Existing URL</span>
                </label>
              </div>

              {mediaMode === "upload" ? (
                <div className="border border-dashed border-white/20 rounded-lg p-6 text-center bg-[#1A1A22]">
                  <input 
                    type="file" accept="video/mp4,video/webm"
                    onChange={e => setVideoFile(e.target.files?.[0] || null)}
                    className="text-sm text-white/60 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-white/10 file:text-white hover:file:bg-white/20 transition-colors"
                  />
                  {videoFile && <p className="text-xs text-white/40 mt-2">{(videoFile.size / (1024*1024)).toFixed(1)} MB</p>}
                </div>
              ) : (
                <input 
                  type="url" placeholder="https://..." required={mediaMode === "url"}
                  value={videoUrl} onChange={e => setVideoUrl(e.target.value)}
                  className="w-full bg-[#1A1A22] border border-white/10 rounded px-4 py-2 text-white focus:outline-none focus:border-[#F5B800] transition-colors" 
                />
              )}
            </div>

            <div className="pt-4 border-t border-white/5">
              <label className="block text-sm font-medium text-white/60 mb-2">Poster Image (Optional)</label>
              <div className="border border-dashed border-white/20 rounded-lg p-4 text-center bg-[#1A1A22]">
                <input 
                  type="file" accept="image/jpeg,image/png,image/webp"
                  onChange={e => setPosterFile(e.target.files?.[0] || null)}
                  className="text-sm text-white/60 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-white/10 file:text-white hover:file:bg-white/20 transition-colors"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 pt-4">
          <button 
            type="submit" 
            disabled={uploading}
            className="bg-[#F5B800] text-black px-8 py-3 rounded font-medium hover:bg-[#F5B800]/90 transition-colors disabled:opacity-50 min-w-[200px]"
          >
            {uploading ? "Processing..." : "Register Content"}
          </button>
          
          <Link href="/" className="text-white/40 hover:text-white px-4 py-2">
            Cancel
          </Link>
          
          {uploading && <span className="text-sm text-white/60 animate-pulse">{progress}</span>}
        </div>
      </form>
    </div>
  );
}
