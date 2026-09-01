import { useState, useEffect } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';

function getYoutubeId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return match?.[1] || null;
}

export default function YouTubeEmbed({ url, compact }: { url: string; compact?: boolean }) {
  const [info, setInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const videoId = getYoutubeId(url);

  useEffect(() => {
    if (!videoId) return;
    setLoading(true);
    fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`)
      .then((r) => r.json())
      .then((d) => setInfo(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [videoId]);

  if (!videoId) return null;

  if (compact) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-3 p-2 rounded-lg bg-surface-50 border border-surface-200 hover:border-accent-300 transition-colors group">
        <img src={`https://img.youtube.com/vi/${videoId}/default.jpg`} alt=""
          className="w-20 h-[45px] rounded object-cover shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-surface-700 truncate">{info?.title || (loading ? 'Loading...' : 'YouTube Video')}</p>
          <p className="text-[11px] text-surface-400 mt-0.5">{info?.author_name || ''}</p>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-surface-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      </a>
    );
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="flex items-start gap-4 p-3 rounded-xl bg-surface-50 border border-surface-200 hover:border-accent-300 transition-colors group">
      <img src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`} alt=""
        className="w-40 h-[90px] rounded-lg object-cover shrink-0" />
      <div className="min-w-0 flex-1 pt-1">
        <p className="text-sm font-semibold text-surface-800">{info?.title || (loading ? 'Loading...' : 'YouTube Video')}</p>
        <p className="text-xs text-surface-500 mt-1">{info?.author_name || ''}</p>
        <span className="inline-flex items-center gap-1 mt-2 text-xs text-accent-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
          <ExternalLink className="w-3 h-3" /> Watch on YouTube
        </span>
      </div>
    </a>
  );
}
