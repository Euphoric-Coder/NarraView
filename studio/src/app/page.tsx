"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { API_BASE_URL, ADMIN_TOKEN } from "@/config";

export default function Home() {
  const [content, setContent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchContent();
  }, []);

  const fetchContent = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/content`, {
        headers: {
          'X-Admin-Token': ADMIN_TOKEN
        }
      });
      if (!res.ok) throw new Error("Failed to fetch content");
      const data = await res.json();
      setContent(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-light tracking-tight text-white/90">Content Library</h1>
        <Link 
          href="/content/new" 
          className="bg-[#F5B800] text-black px-6 py-2.5 rounded font-medium hover:bg-[#F5B800]/90 transition-colors"
        >
          Add Content
        </Link>
      </div>

      {loading ? (
        <div className="text-white/50">Loading library...</div>
      ) : error ? (
        <div className="text-red-400 bg-red-400/10 p-4 rounded border border-red-400/20">{error}</div>
      ) : content.length === 0 ? (
        <div className="text-center py-20 border border-white/5 rounded-lg bg-white/[0.02]">
          <h3 className="text-xl text-white/70 mb-2">No content yet</h3>
          <p className="text-white/40 mb-6">Add your first title to NarraView.</p>
          <Link 
            href="/content/new" 
            className="bg-white/10 text-white px-6 py-2.5 rounded hover:bg-white/20 transition-colors"
          >
            Add Content
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {content.map((item) => (
            <Link key={item.contentId} href={`/content/${item.contentId}`} className="group block">
              <div className="bg-[#14141A] border border-white/5 rounded-lg overflow-hidden transition-all duration-200 hover:border-white/20 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/50">
                <div className="aspect-video bg-[#1A1A22] relative border-b border-white/5 flex items-center justify-center overflow-hidden">
                  {item.posterUrl ? (
                    <img src={item.posterUrl} alt={item.title} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                  ) : (
                    <span className="text-white/20 uppercase tracking-widest text-sm">No Poster</span>
                  )}
                  {item.mediaPlayable && (
                    <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md px-2 py-1 rounded text-[10px] font-bold tracking-wider text-white border border-white/10">
                      MEDIA READY
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <h3 className="text-lg font-medium text-white/90 mb-1 truncate">{item.title}</h3>
                  <p className="text-sm text-white/40 font-mono mb-4">{item.contentId}</p>
                  
                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-white/5">
                    <div className={`w-2 h-2 rounded-full ${item.aiReady ? 'bg-[#F5B800]' : 'bg-white/20'}`}></div>
                    <span className="text-xs tracking-wider uppercase font-medium" style={{ color: item.aiReady ? '#F5B800' : 'rgba(255,255,255,0.4)' }}>
                      {item.aiReady ? 'AI Ready' : 'AI Not Processed'}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
