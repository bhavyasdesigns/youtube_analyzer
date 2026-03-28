"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

type SortFilter = "mostViewed" | "latest" | "trending";

type ChannelPayload = {
  id: string;
  title: string;
  thumbnailUrl: string;
  customUrl: string;
  subscriberCount: string | null;
  subscriberHidden: boolean;
  viewCount: string;
};

type VideoPayload = {
  id: string;
  title: string;
  publishedAt: string;
  thumbnailUrl: string;
  viewCount: number;
  likeCount: number;
};

const THUMB_COLORS = ["#b7d9bd", "#a7cae8", "#f2d4a2", "#e9afc5", "#d4c4f0"];

const SIMPLE_BAR_COLORS = [
  "#7c3aed",
  "#ec4899",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#6366f1",
  "#14b8a6",
  "#f97316",
  "#8b5cf6",
];

function formatCompact(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return Math.round(n).toLocaleString();
}

function shortTitle(title: string, max = 14): string {
  const t = title.trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(1, (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function trendingScore(video: VideoPayload): number {
  const pub = new Date(video.publishedAt);
  const d = daysBetween(pub, new Date());
  return video.viewCount / d;
}

function StatCard({
  label,
  value,
  note,
  noteClassName,
}: {
  label: string;
  value: string;
  note: string;
  noteClassName: string;
}) {
  return (
    <div className="rounded-xl bg-[#f3f1eb] px-4 py-4 sm:px-5">
      <p className="text-xs font-medium text-[#5a5a5a]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-[#1d1d1d] sm:text-3xl">
        {value}
      </p>
      <p className={`mt-1 text-xs font-medium ${noteClassName}`}>{note}</p>
    </div>
  );
}

function getYoutubeEmbedUrlFromVideoId(id: string) {
  if (/^[a-zA-Z0-9_-]{11}$/.test(id)) {
    return `https://www.youtube.com/embed/${id}?autoplay=1`;
  }

  try {
    let url: URL | null = null;

    if (
      id.includes("http") ||
      id.includes("youtube.com") ||
      id.includes("youtu.be")
    ) {
      url = new URL(id.startsWith("http") ? id : `https://${id}`);
    }

    if (url) {
      if (url.pathname.startsWith("/shorts/")) {
        const match = url.pathname.match(/shorts\/([A-Za-z0-9_-]+)/);
        if (match) {
          return `https://www.youtube.com/embed/${match[1]}?autoplay=1`;
        }
      }

      if (url.searchParams.has("v")) {
        const v = url.searchParams.get("v");
        if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) {
          return `https://www.youtube.com/embed/${v}?autoplay=1`;
        }
      }

      if (url.hostname.includes("youtu.be") && url.pathname.length > 1) {
        return `https://www.youtube.com/embed/${url.pathname.substring(
          1
        )}?autoplay=1`;
      }
    }
  } catch {}

  return `https://www.youtube.com/embed/${id}?autoplay=1`;
}

function downloadCsv(data: VideoPayload[], fileName = "videos.csv") {
  if (!data.length) return;

  const header = [
    "id",
    "title",
    "publishedAt",
    "viewCount",
    "likeCount",
    "thumbnailUrl",
  ];

  const rows = data.map((v) =>
    [
      v.id,
      `"${v.title.replace(/"/g, '""')}"`,
      v.publishedAt,
      v.viewCount,
      v.likeCount,
      v.thumbnailUrl,
    ].join(",")
  );

  const csvContent = [header.join(","), ...rows].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => window.URL.revokeObjectURL(url), 300);
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<SortFilter>("mostViewed");
  const [channel, setChannel] = useState<ChannelPayload | null>(null);
  const [videos, setVideos] = useState<VideoPayload[]>([]);
  const [analyzed, setAnalyzed] = useState(false);
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
  const [tooltipX, setTooltipX] = useState(8);
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const [showExportOptions, setShowExportOptions] = useState(false);
  const [exportingPng, setExportingPng] = useState(false);

  const pageRef = useRef<HTMLElement | null>(null);

  const analyze = useCallback(async () => {
    const q = query.trim();

    if (!q) {
      toast.error("Enter a channel URL, @handle, or channel ID.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`/api/youtube/analyze?q=${encodeURIComponent(q)}`);
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Request failed");
        setChannel(null);
        setVideos([]);
        setAnalyzed(true);
        return;
      }

      setChannel(data.channel);
      setVideos(data.videos ?? []);
      setAnalyzed(true);
    } catch {
      toast.error("Network error");
      setChannel(null);
      setVideos([]);
      setAnalyzed(true);
    } finally {
      setLoading(false);
    }
  }, [query]);

  const yearOptions = useMemo(() => {
    const years = Array.from(
      new Set(
        videos
          .map((v) => new Date(v.publishedAt).getFullYear())
          .filter((y) => Number.isFinite(y))
      )
    ).sort((a, b) => b - a);

    return years.map((y) => String(y));
  }, [videos]);

  const yearFilteredVideos = useMemo(() => {
    if (!videos.length || yearFilter === "all") return videos;

    return videos.filter(
      (v) => String(new Date(v.publishedAt).getFullYear()) === yearFilter
    );
  }, [videos, yearFilter]);

  const sortedVideos = useMemo(() => {
    if (!yearFilteredVideos.length) return [];

    if (filter === "latest") {
      return [...yearFilteredVideos].sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      );
    }

    if (filter === "trending") {
      return [...yearFilteredVideos].sort(
        (a, b) => trendingScore(b) - trendingScore(a)
      );
    }

    return [...yearFilteredVideos].sort((a, b) => b.viewCount - a.viewCount);
  }, [yearFilteredVideos, filter]);

  const sumViews = useMemo(
    () => videos.reduce((sum, v) => sum + v.viewCount, 0),
    [videos]
  );

  const avgViewsVideo = videos.length ? Math.round(sumViews / videos.length) : 0;

  const channelLifetimeViews = channel
    ? parseInt(channel.viewCount, 10) || 0
    : 0;

  const trendingCount = useMemo(() => {
    if (!videos.length) return 0;

    const scores = videos.map(trendingScore).sort((a, b) => a - b);
    const med = scores[Math.floor(scores.length / 2)] ?? 0;

    return videos.filter((v) => trendingScore(v) >= med * 1.2).length;
  }, [videos]);

  const avgDaysTo1M = useMemo(() => {
    if (!videos.length) return null;

    const now = new Date();
    const estimates: number[] = [];

    for (const v of videos) {
      const pub = new Date(v.publishedAt);
      const days = daysBetween(pub, now);

      if (v.viewCount < 1000) continue;

      const estDays = (days * 1_000_000) / v.viewCount;
      if (estDays < 5000) estimates.push(estDays);
    }

    if (!estimates.length) return null;

    return estimates.reduce((a, b) => a + b, 0) / estimates.length;
  }, [videos]);

  const chartBars = useMemo(() => {
    const max = Math.max(...sortedVideos.map((v) => v.viewCount), 1);

    return sortedVideos.map((v) => ({
      label: shortTitle(v.title),
      pct: (v.viewCount / max) * 100,
      views: v.viewCount,
      likes: v.likeCount,
      title: v.title,
      publishedAt: v.publishedAt,
      velocity: trendingScore(v),
    }));
  }, [sortedVideos]);

  const mostViewed = useMemo(
    () =>
      sortedVideos.length
        ? sortedVideos.reduce((a, b) => (a.viewCount >= b.viewCount ? a : b))
        : null,
    [sortedVideos]
  );

  const maxTrendingScore = useMemo(
    () => (sortedVideos.length ? Math.max(...sortedVideos.map(trendingScore)) : 0),
    [sortedVideos]
  );

  const donutCenter = channelLifetimeViews
    ? formatCompact(channelLifetimeViews)
    : sumViews
      ? formatCompact(sumViews)
      : "—";

  const discoverySignals = useMemo(() => {
    if (!videos.length) {
      return [
        { name: "Search intent", value: 40, color: "#ef4444" },
        { name: "Suggested potential", value: 30, color: "#3b82f6" },
        { name: "Browse momentum", value: 20, color: "#10b981" },
        { name: "External buzz", value: 10, color: "#f59e0b" },
      ];
    }

    let searchIntent = 0;
    let suggestedPotential = 0;
    let browseMomentum = 0;
    let externalBuzz = 0;
    const now = new Date();

    for (const video of videos) {
      const title = video.title.toLowerCase();
      const ageDays = daysBetween(new Date(video.publishedAt), now);
      const likeRate =
        video.viewCount > 0 ? video.likeCount / video.viewCount : 0;
      const velocity = trendingScore(video);

      if (/(how to|tutorial|guide|tips|review|vs|explained|best)/.test(title)) {
        searchIntent += 2;
      } else {
        searchIntent += 1;
      }

      suggestedPotential += Math.max(1, velocity / 10000) + likeRate * 500;
      browseMomentum += ageDays <= 14 ? 2.5 : ageDays <= 30 ? 1.5 : 1;

      if (/(collab|challenge|giveaway|live|official|trailer)/.test(title)) {
        externalBuzz += 2;
      } else {
        externalBuzz += 1;
      }
    }

    const raw = [
      { name: "Search intent", value: searchIntent, color: "#ef4444" },
      { name: "Suggested potential", value: suggestedPotential, color: "#3b82f6" },
      { name: "Browse momentum", value: browseMomentum, color: "#10b981" },
      { name: "External buzz", value: externalBuzz, color: "#f59e0b" },
    ];

    const total = raw.reduce((sum, x) => sum + x.value, 0) || 1;

    const normalized = raw.map((x) => ({
      ...x,
      value: Math.max(1, Math.round((x.value / total) * 100)),
    }));

    const sum = normalized.reduce((s, x) => s + x.value, 0);

    if (sum !== 100) {
      const idx = normalized.reduce(
        (best, x, i, arr) => (x.value > arr[best].value ? i : best),
        0
      );

      normalized[idx] = {
        ...normalized[idx],
        value: normalized[idx].value + (100 - sum),
      };
    }

    return normalized;
  }, [videos]);

  function handleExportClick(e: React.MouseEvent) {
    e.stopPropagation();
    setShowExportOptions((s) => !s);
  }

  async function handleExportPNG(e?: React.MouseEvent) {
    if (e) e.stopPropagation();

    const element = pageRef.current;
    if (!element) {
      toast.error("Nothing to export yet.");
      setShowExportOptions(false);
      return;
    }

    try {
      setExportingPng(true);
      setShowExportOptions(false);

      const previousPlayingVideoId = playingVideoId;
      if (previousPlayingVideoId) {
        setPlayingVideoId(null);
      }

      await new Promise((resolve) => setTimeout(resolve, 500));

      const html2canvasModule = await import("html2canvas");
      const html2canvas = (html2canvasModule as any).default ?? html2canvasModule;

      const canvas = await html2canvas(
        element,
        {
          background: "#f4f4f2",
          useCORS: true,
          logging: false,
          scale: Math.min(window.devicePixelRatio || 1, 2),
          windowWidth: element.scrollWidth,
          windowHeight: element.scrollHeight,
          scrollX: 0,
          scrollY: -window.scrollY,
          onclone: (clonedDoc: Document) => {
            const clonedElement = clonedDoc.getElementById("export-area");
            if (!clonedElement) return;

            const allNodes = clonedElement.querySelectorAll<HTMLElement>("*");

            allNodes.forEach((node) => {
              const style = clonedDoc.defaultView?.getComputedStyle(node);
              if (!style) return;

              const badColor = (value: string) =>
                value.includes("lab(") ||
                value.includes("oklab(") ||
                value.includes("oklch(") ||
                value.includes("color(");

              if (badColor(style.color)) node.style.color = "#2e2e2e";
              if (badColor(style.backgroundColor)) {
                node.style.backgroundColor = "transparent";
              }
              if (badColor(style.borderTopColor)) {
                node.style.borderTopColor = "#d4d4d4";
              }
              if (badColor(style.borderRightColor)) {
                node.style.borderRightColor = "#d4d4d4";
              }
              if (badColor(style.borderBottomColor)) {
                node.style.borderBottomColor = "#d4d4d4";
              }
              if (badColor(style.borderLeftColor)) {
                node.style.borderLeftColor = "#d4d4d4";
              }
              if (badColor(style.outlineColor)) {
                node.style.outlineColor = "transparent";
              }
              if (badColor(style.textDecorationColor)) {
                node.style.textDecorationColor = "#2e2e2e";
              }

              const boxShadow = style.boxShadow;
              if (
                boxShadow.includes("lab(") ||
                boxShadow.includes("oklab(") ||
                boxShadow.includes("oklch(") ||
                boxShadow.includes("color(")
              ) {
                node.style.boxShadow = "none";
              }

              node.style.filter = "none";
              node.style.backdropFilter = "none";
              (
                node.style as CSSStyleDeclaration & {
                  webkitBackdropFilter?: string;
                }
              ).webkitBackdropFilter = "none";
            });

            clonedElement.style.backgroundColor = "#f4f4f2";
          },
        } as any
      );

      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = "youtube-analyzer-full-page.png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      if (previousPlayingVideoId) {
        setPlayingVideoId(previousPlayingVideoId);
      }

      toast.success("PNG downloaded");
    } catch (error) {
      console.error("PNG export failed:", error);
      toast.error("PNG export failed");
    } finally {
      setExportingPng(false);
    }
  }

  function handleExportCSV(e?: React.MouseEvent) {
    if (e) e.stopPropagation();

    try {
      downloadCsv(sortedVideos, "youtube_analyzer_data.csv");
      toast.success("Exported data as CSV");
    } catch (error) {
      console.error("CSV export failed:", error);
      toast.error("Failed to export CSV.");
    }

    setShowExportOptions(false);
  }

  useEffect(() => {
    setPlayingVideoId(null);
  }, [sortedVideos]);

  useEffect(() => {
    if (!showExportOptions) return;

    function onDocClick() {
      setShowExportOptions(false);
    }

    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [showExportOptions]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f8fafc] via-[#f1f5f9] to-[#e2e8f0] text-[#1e293b]">
      <main
        ref={pageRef}
        className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6"
        id="export-area"
      >
        <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#e4e4e1] bg-[#f4f4f2] p-3 sm:gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#ef4444] text-sm text-white sm:h-10 sm:w-10">
              ▶
            </div>
            <p className="truncate text-base font-semibold tracking-tight sm:text-lg">
              YouTube Analyzer
            </p>
          </div>

          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Paste any YouTube channel/video URL, @handle, or ID"
            className="h-10 min-w-[200px] flex-1 rounded-lg border border-[#d8d8d6] bg-[#ececec] px-3 text-sm outline-none placeholder:text-[#888] focus:border-[#c2c2c0] sm:min-w-[280px]"
            onKeyDown={(e) => e.key === "Enter" && analyze()}
          />

          <button
            type="button"
            onClick={analyze}
            disabled={loading}
            className="h-10 shrink-0 rounded-lg bg-[#ea4c4c] px-5 text-sm font-semibold text-white transition hover:bg-[#de3f3f] disabled:opacity-60"
          >
            {loading ? "…" : "Analyze"}
          </button>
        </section>

        <section className="mt-4 rounded-2xl border border-[#dfdfdd] bg-white/80 backdrop-blur-sm px-4 py-5 sm:px-6 sm:py-6">
          {!channel && !loading && (
            <p className="text-sm text-[#666]">
              {analyzed
                ? "No channel to show. Fix the URL or API key and try again."
                : "Paste any YouTube channel or video URL to generate a polished competitor performance brief."}
            </p>
          )}

          {loading && <p className="text-sm text-[#666]">Loading channel…</p>}

          {channel && !loading && (
            <>
              <div className="flex flex-wrap items-center gap-4">
                {channel.thumbnailUrl ? (
                  <Image
                    src={channel.thumbnailUrl}
                    alt=""
                    width={56}
                    height={56}
                    className="h-14 w-14 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#eb4f4f] text-xl font-semibold text-white">
                    {channel.title.slice(0, 1).toUpperCase()}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold leading-tight sm:text-xl">
                    {channel.title}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-[#585858]">
                    <span>
                      {channel.customUrl
                        ? `@${channel.customUrl.replace(/^@/, "")}`
                        : "—"}
                    </span>
                    <span>·</span>
                    <span>
                      {channel.subscriberHidden
                        ? "Subscribers hidden"
                        : channel.subscriberCount
                          ? `${formatCompact(
                              parseInt(channel.subscriberCount, 10)
                            )} subscribers`
                          : "— subscribers"}
                    </span>
                  </div>
                </div>

                <div
                  className="relative z-20 flex items-center"
                  data-html2canvas-ignore="true"
                >
                  <button
                    type="button"
                    className="ml-auto flex items-center gap-1 rounded-lg border border-[#ddd] bg-white px-3 py-2 text-xs font-semibold text-[#444] shadow-none transition hover:bg-[#ececec]"
                    onClick={handleExportClick}
                    tabIndex={0}
                    disabled={exportingPng}
                  >
                    <svg width="15" height="15" fill="none" viewBox="0 0 15 15">
                      <path
                        d="M7.5 1v8m0 0-3-3m3 3 3-3M2 13.5h11"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    {exportingPng ? "Exporting..." : "Export"}
                  </button>

                  {showExportOptions && (
                    <div
                      className="absolute right-0 top-full z-40 mt-2 w-44 rounded-xl border border-[#dcdcdc] bg-white py-1 shadow-md"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={handleExportPNG}
                        className="w-full px-4 py-2 text-left text-sm transition hover:bg-[#f2f2f2]"
                        disabled={exportingPng}
                      >
                        Export as PNG
                      </button>
                      <button
                        type="button"
                        onClick={handleExportCSV}
                        className="w-full px-4 py-2 text-left text-sm transition hover:bg-[#f2f2f2]"
                        disabled={exportingPng}
                      >
                        Export data as CSV
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <hr className="my-5 border-[#ddddda]" />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="Total views (channel)"
                  value={
                    channelLifetimeViews
                      ? formatCompact(channelLifetimeViews)
                      : "—"
                  }
                  note="Lifetime (YouTube Data API)"
                  noteClassName="text-[#5f8d42]"
                />
                <StatCard
                  label="Avg views / video"
                  value={videos.length ? formatCompact(avgViewsVideo) : "—"}
                  note={
                    videos.length
                      ? `Based on ${videos.length} recent uploads`
                      : "No videos in batch"
                  }
                  noteClassName="text-[#5f8d42]"
                />
                <StatCard
                  label="Trending videos (heuristic)"
                  value={
                    videos.length ? `${trendingCount} / ${videos.length}` : "—"
                  }
                  note="Above median velocity vs peers"
                  noteClassName="text-[#5f8d42]"
                />
                <StatCard
                  label="Est. avg days to 1M views"
                  value={
                    avgDaysTo1M != null ? `${avgDaysTo1M.toFixed(1)}d` : "—"
                  }
                  note="Rough model from recent uploads"
                  noteClassName="text-[#ba4f4f]"
                />
              </div>
            </>
          )}
        </section>

        <section className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-[#dfdfdd] bg-white/80 backdrop-blur-sm p-4 sm:p-5">
            <h2 className="text-base font-semibold text-[#3c3c3c]">
              Views per video
            </h2>

            <div className="mt-4 flex h-52 flex-col justify-between gap-3 sm:h-56">
              {chartBars.length === 0 ? (
                <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-[#ccc] bg-[#f8f8f6] text-sm text-[#888]">
                  Analyze a channel to see bars
                </div>
              ) : (
                <>
                  <div className="relative flex flex-1 items-end justify-between gap-1 border-b border-[#e0e0dd] pb-1 pt-2">
                    {hoveredBar !== null && chartBars[hoveredBar] && (
                      <div
                        className="pointer-events-none absolute -top-28 z-20 w-56 rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-lg transition-all duration-150"
                        style={{ left: tooltipX }}
                      >
                        <p className="line-clamp-2 font-semibold text-slate-900">
                          {chartBars[hoveredBar].title}
                        </p>
                        <p className="mt-1 text-slate-600">
                          Views: {formatCompact(chartBars[hoveredBar].views)}
                        </p>
                        <p className="text-slate-600">
                          Likes: {formatCompact(chartBars[hoveredBar].likes)}
                        </p>
                        <p className="text-slate-600">
                          Velocity:{" "}
                          {Math.round(
                            chartBars[hoveredBar].velocity
                          ).toLocaleString()}
                          /day
                        </p>
                        <p className="text-slate-500">
                          {new Date(
                            chartBars[hoveredBar].publishedAt
                          ).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </p>
                      </div>
                    )}

                    {chartBars.map((b, i) => (
                      <div
                        key={i}
                        className="flex min-w-0 flex-1 flex-col items-center gap-1"
                        onMouseEnter={(e) => {
                          setHoveredBar(i);
                          const parent = e.currentTarget.parentElement;
                          if (!parent) return;

                          const parentRect = parent.getBoundingClientRect();
                          const itemRect = e.currentTarget.getBoundingClientRect();
                          const tooltipWidth = 224;

                          let nextX =
                            itemRect.left -
                            parentRect.left +
                            itemRect.width / 2 -
                            tooltipWidth / 2;

                          if (nextX < 8) nextX = 8;
                          if (nextX + tooltipWidth > parentRect.width - 8) {
                            nextX = parentRect.width - tooltipWidth - 8;
                          }

                          setTooltipX(nextX);
                        }}
                        onMouseLeave={() => setHoveredBar(null)}
                        onFocus={(e) => {
                          setHoveredBar(i);
                          const parent = e.currentTarget.parentElement;
                          if (!parent) return;

                          const parentRect = parent.getBoundingClientRect();
                          const itemRect = e.currentTarget.getBoundingClientRect();
                          const tooltipWidth = 224;

                          let nextX =
                            itemRect.left -
                            parentRect.left +
                            itemRect.width / 2 -
                            tooltipWidth / 2;

                          if (nextX < 8) nextX = 8;
                          if (nextX + tooltipWidth > parentRect.width - 8) {
                            nextX = parentRect.width - tooltipWidth - 8;
                          }

                          setTooltipX(nextX);
                        }}
                        onBlur={() => setHoveredBar(null)}
                      >
                        <div
                          aria-label={`${b.title}: ${formatCompact(b.views)} views`}
                          className="w-full max-w-[28px] rounded-t sm:max-w-[36px]"
                          style={{
                            height: `${Math.max(8, (b.pct / 100) * 140)}px`,
                            backgroundColor:
                              SIMPLE_BAR_COLORS[i % SIMPLE_BAR_COLORS.length],
                          }}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between gap-0.5 overflow-x-auto text-[10px] text-[#555] sm:text-xs">
                    {chartBars.map((b, i) => (
                      <span
                        key={i}
                        className="min-w-0 flex-1 truncate text-center"
                      >
                        {b.label}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-[#dfdfdd] bg-white/80 backdrop-blur-sm p-4 sm:p-5">
            <h2 className="text-base font-semibold text-[#3c3c3c]">
              Content Opportunity Insights
            </h2>
            <p className="mt-1 text-xs text-[#777]">
              Understand what’s gaining traction across competitors through
              growth, recency, and engagement signals.
            </p>

            <div className="mt-4 flex min-h-[200px] flex-col justify-center gap-6">
              <div className="text-center">
                <div className="text-3xl font-semibold text-[#2b2b2b]">
                  {donutCenter}
                </div>
                <div className="text-sm text-[#777]">
                  Total opportunity signal
                </div>
              </div>

              <div className="space-y-3">
                {discoverySignals.map((entry) => (
                  <div key={entry.name}>
                    <div className="mb-1 flex items-center justify-between text-sm text-[#4b4b4b]">
                      <span>{entry.name}</span>
                      <span>{entry.value}%</span>
                    </div>
                    <div className="h-3 w-full rounded-full bg-[#e5e7eb]">
                      <div
                        className="h-3 rounded-full"
                        style={{
                          width: `${entry.value}%`,
                          backgroundColor: entry.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-[#dfdfdd] bg-white/80 backdrop-blur-sm p-4 sm:p-6">
          <div className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-base font-semibold text-[#3b3b3b] sm:text-lg">
              Videos by year
            </h2>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setYearFilter("all")}
                className={`rounded-full px-3 py-1.5 text-xs font-medium sm:text-sm ${
                  yearFilter === "all"
                    ? "bg-slate-800 text-white"
                    : "border border-[#d3d3d1] text-[#595959]"
                }`}
              >
                All years
              </button>

              {yearOptions.map((year) => (
                <button
                  key={year}
                  type="button"
                  onClick={() => setYearFilter(year)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium sm:text-sm ${
                    yearFilter === year
                      ? "bg-slate-800 text-white"
                      : "border border-[#d3d3d1] text-[#595959]"
                  }`}
                >
                  {year}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-sm font-medium text-[#555]">Sort videos</h3>

            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["mostViewed", "Most viewed"],
                  ["latest", "Latest"],
                  ["trending", "Trending"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium sm:text-sm ${
                    filter === key
                      ? "bg-[#ea4c4c] text-white"
                      : "border border-[#d3d3d1] text-[#595959]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-[#e3e3e0]">
            {sortedVideos.length === 0 && channel && !loading && (
              <p className="py-8 text-center text-sm text-[#888]">
                No videos found for this year filter.
              </p>
            )}

            {sortedVideos.map((video, i) => {
              const date = new Date(video.publishedAt);
              const isTrending =
                maxTrendingScore > 0 &&
                trendingScore(video) >= maxTrendingScore * 0.85;
              const isTop = mostViewed && video.id === mostViewed.id;

              return (
                <article
                  key={video.id}
                  className="grid grid-cols-[minmax(0,88px)_1fr_auto] items-center gap-3 py-3 sm:grid-cols-[minmax(0,120px)_1fr_auto] sm:gap-4 sm:py-4"
                >
                  <div
                    className="relative aspect-video w-full overflow-hidden rounded-lg"
                    style={{
                      backgroundColor: THUMB_COLORS[i % THUMB_COLORS.length],
                    }}
                  >
                    {playingVideoId === video.id ? (
                      <iframe
                        src={getYoutubeEmbedUrlFromVideoId(video.id)}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        title={video.title}
                        className="absolute inset-0 h-full w-full rounded-lg"
                        style={{ background: "black", border: "none" }}
                        tabIndex={0}
                      />
                    ) : video.thumbnailUrl ? (
                      <button
                        type="button"
                        onClick={() => setPlayingVideoId(video.id)}
                        className="absolute inset-0 h-full w-full"
                        style={{
                          background: "transparent",
                          padding: 0,
                          border: "none",
                        }}
                        aria-label={`Play: ${video.title}`}
                        tabIndex={0}
                      >
                        <Image
                          src={video.thumbnailUrl}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="(max-width: 640px) 88px, 120px"
                        />
                        <span
                          className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white"
                          aria-hidden="true"
                        >
                          <svg
                            viewBox="0 0 32 32"
                            width="24"
                            height="24"
                            fill="currentColor"
                          >
                            <polygon points="12,8 26,16 12,24" />
                          </svg>
                        </span>
                      </button>
                    ) : null}
                  </div>

                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-snug text-[#282828] sm:text-base">
                      {video.title}
                    </p>
                    <p className="mt-0.5 text-xs text-[#5c5c5c]">
                      {date.toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums text-[#2f2f2f] sm:text-base">
                      {formatCompact(video.viewCount)}
                    </p>
                    <p className="text-xs text-[#5f5f5f]">views</p>

                    <div className="mt-1 flex flex-col items-end gap-1">
                      {isTop && (
                        <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                          Top in batch
                        </span>
                      )}
                      {isTrending && (
                        <span className="inline-flex items-center rounded-full bg-[#f8e7e7] px-2 py-0.5 text-[10px] font-medium text-[#c34141] sm:text-xs">
                          🔥 Trending
                        </span>
                      )}
                    </div>

                    {playingVideoId === video.id && (
                      <button
                        type="button"
                        className="mt-1 rounded border border-[#ddddda] px-2 py-1 text-xs font-medium text-[#444] hover:bg-[#ececec]"
                        onClick={() => setPlayingVideoId(null)}
                      >
                        Stop video
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}