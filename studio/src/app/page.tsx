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
    <div className="relative min-h-[80vh] w-full isolate">
      {/* Background glow effects */}
      <div className="absolute top-0 -translate-y-12 left-1/4 w-96 h-96 bg-[#F5B800]/10 rounded-full blur-[120px] -z-10 pointer-events-none" />
      <div className="absolute bottom-0 translate-y-1/3 right-1/4 w-[30rem] h-[30rem] bg-indigo-500/10 rounded-full blur-[120px] -z-10 pointer-events-none" />

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6 relative z-10">
        <div>
          <h1 className="text-4xl md:text-5xl font-extralight tracking-tight text-white mb-2 bg-clip-text text-transparent bg-gradient-to-r from-white via-white/90 to-white/60">
            Content Library
          </h1>
          <p className="text-white/40 text-sm tracking-wide uppercase font-medium">Manage your NarraView Media Universe</p>
        </div>
        <Link 
          href="/content/new" 
          className="group relative inline-flex items-center justify-center px-8 py-3.5 font-medium tracking-wide text-black bg-gradient-to-br from-[#F5B800] to-[#E59800] rounded-full overflow-hidden transition-all hover:scale-105 hover:shadow-[0_0_40px_-10px_rgba(245,184,0,0.6)] focus:outline-none"
        >
          <span className="absolute inset-0 w-full h-full -mt-1 rounded-lg opacity-30 bg-gradient-to-b from-transparent via-transparent to-black pointer-events-none"></span>
          <span className="relative flex items-center gap-2">
            <svg className="w-5 h-5 transition-transform group-hover:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"></path></svg>
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
            <svg className="w-8 h-8 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
          </div>
          <h3 className="text-2xl font-light text-white/90 mb-2">Void Space Detected</h3>
          <p className="text-white/40 text-center max-w-sm mb-8">Your NarraView universe is currently empty. Populate it with an initial video artifact to begin processing.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {content.map((item) => (
            <Link key={item.contentId} href={`/content/${item.contentId}`} className="group block h-full">
              <div className="relative h-full bg-white/[0.02] border border-white/10 rounded-2xl overflow-hidden transition-all duration-500 hover:bg-white/[0.04] hover:border-white/20 hover:-translate-y-2 hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)] flex flex-col backdrop-blur-md">
                
                {/* Glow effect on hover */}
                <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                <div className="aspect-[16/9] w-full bg-black/50 relative flex items-center justify-center overflow-hidden shrink-0">
                  {item.posterUrl ? (
                    <img 
                      src={item.posterUrl} 
                      alt={item.title} 
                      className="w-full h-full object-cover opacity-70 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700 ease-out" 
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-black flex items-center justify-center">
                      <span className="text-white/10 uppercase tracking-[0.3em] text-xs font-bold">No Signal</span>
                    </div>
                  )}
                  
                  {/* Status Overlay */}
                  <div className="absolute top-4 right-4 flex gap-2">
                    {item.mediaPlayable && (
                      <div className="bg-black/50 backdrop-blur-md px-2.5 py-1 rounded-md text-[10px] font-bold tracking-widest text-white border border-white/10 shadow-lg">
                        MEDIA
                      </div>
                    )}
                  </div>
                  
                  {/* Gradient Overlay for seamless text transition */}
                  <div className="absolute bottom-0 w-full h-1/2 bg-gradient-to-t from-[#14141A] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                </div>
                
                <div className="p-6 flex flex-col flex-grow relative z-10">
                  <h3 className="text-xl font-light text-white/90 mb-1 group-hover:text-white transition-colors line-clamp-1">{item.title}</h3>
                  <p className="text-xs text-white/30 font-mono mb-6">{item.contentId}</p>
                  
                  <div className="mt-auto pt-4 border-t border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="relative flex items-center justify-center">
                        <div className={`w-2.5 h-2.5 rounded-full z-10 ${item.aiReady ? 'bg-[#F5B800]' : 'bg-white/20'}`} />
                        {item.aiReady && <div className="absolute w-2.5 h-2.5 rounded-full bg-[#F5B800] animate-ping opacity-50" />}
                      </div>
                      <span className="text-xs tracking-widest uppercase font-semibold" style={{ color: item.aiReady ? '#F5B800' : 'rgba(255,255,255,0.3)' }}>
                        {item.aiReady ? 'AI Armed' : 'AI Offline'}
                      </span>
                    </div>
                    
                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/30 group-hover:bg-white/10 group-hover:text-white transition-all duration-300">
                      <svg className="w-4 h-4 translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </div>
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
