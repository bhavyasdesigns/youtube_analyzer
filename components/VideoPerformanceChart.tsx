"use client";

type ChartMetric = "views" | "likes" | "trendingScore";
type SortType = "views" | "date";

type ChartDataItem = {
  id: string;
  title: string;
  originalTitle: string;
  thumbUrl: string;
  published: string;
  views: number;
  likes: number;
  trendingScore: number;
};

type TopVideo = {
  title: string;
  thumbUrl: string;
  views: number;
};

type Props = {
  data: ChartDataItem[];
  metric: ChartMetric;
  setMetric: React.Dispatch<React.SetStateAction<ChartMetric>>;
  sortType: SortType;
  setSortType: React.Dispatch<React.SetStateAction<SortType>>;
  loading: boolean;
  topVideo?: TopVideo;
  totalViews: number;
  avgViews: number;
  onExportResult: (type: "png" | "csv") => void;
};

const metricLabel: Record<ChartMetric, string> = {
  views: "Views",
  likes: "Likes",
  trendingScore: "Trending score",
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export default function VideoPerformanceChart({
  data,
  metric,
  setMetric,
  sortType,
  setSortType,
  loading,
  topVideo,
  totalViews,
  avgViews,
  onExportResult,
}: Props) {
  const maxMetricValue = data.reduce(
    (max, item) => Math.max(max, item[metric]),
    0
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_260px] gap-8 rounded-2xl p-8 bg-gradient-to-br from-slate-100/80 via-white/60 to-slate-100/50 shadow-lg border border-slate-100">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold text-slate-900">
            Video Performance
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onExportResult("png")}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              Export PNG
            </button>
            <button
              type="button"
              onClick={() => onExportResult("csv")}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              Export CSV
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(["views", "likes", "trendingScore"] as ChartMetric[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setMetric(item)}
              className={`rounded-full px-3 py-1.5 text-sm ${
                metric === item
                  ? "bg-blue-600 text-white"
                  : "bg-white text-slate-700 border border-slate-300"
              }`}
            >
              {metricLabel[item]}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setSortType(sortType === "views" ? "date" : "views")}
            className="ml-auto rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
          >
            Sort: {sortType === "views" ? "Most viewed" : "Latest"}
          </button>
        </div>

        <div className="space-y-3">
          {loading && data.length === 0 ? (
            <p className="text-slate-500 text-sm">Loading chart data...</p>
          ) : (
            data.map((item) => {
              const value = item[metric];
              const widthPercent =
                maxMetricValue > 0 ? (value / maxMetricValue) * 100 : 0;

              return (
                <div key={item.id} className="rounded-lg bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {item.originalTitle}
                    </p>
                    <span className="text-xs text-slate-500">
                      {formatNumber(Math.round(value))}
                    </span>
                  </div>
                  <div className="h-2 rounded bg-slate-200">
                    <div
                      className="h-2 rounded bg-blue-500"
                      style={{ width: `${Math.max(4, widthPercent)}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <aside className="flex flex-col min-h-[250px] p-5 bg-white/95 rounded-xl border border-slate-100 shadow-lg gap-5">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">
            Total Views
          </p>
          <p className="text-2xl font-semibold text-slate-900">
            {formatNumber(totalViews)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">
            Avg Views
          </p>
          <p className="text-xl font-semibold text-slate-900">
            {formatNumber(avgViews)}
          </p>
        </div>
        {topVideo && (
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">
              Top Video
            </p>
            <p className="text-sm font-medium text-slate-800 line-clamp-2">
              {topVideo.title}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {formatNumber(topVideo.views)} views
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
