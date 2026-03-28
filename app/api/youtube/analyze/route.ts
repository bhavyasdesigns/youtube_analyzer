import { NextResponse } from "next/server";

const API_BASE = "https://www.googleapis.com/youtube/v3";

type Parsed =
  | { kind: "channelId"; channelId: string }
  | { kind: "handle"; handle: string }
  | { kind: "customUrl"; customUrl: string }
  | { kind: "videoId"; videoId: string };

function parseQuery(raw: string): Parsed | null {
  const s = raw.trim();
  if (!s) return null;

  if (s.startsWith("@")) {
    return { kind: "handle", handle: s.slice(1).replace(/^@/, "") };
  }

  if (/^UC[\w-]{10,}$/.test(s)) return { kind: "channelId", channelId: s };
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return { kind: "videoId", videoId: s };

  if (/^[\w.-]{2,}$/.test(s) && !s.includes(" ") && !s.includes("/")) {
    return { kind: "handle", handle: s.replace(/^@/, "") };
  }

  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const url = new URL(withScheme);
    const host = url.hostname.toLowerCase();
    const segments = url.pathname.split("/").filter(Boolean);

    if (host.includes("youtu.be")) {
      const id = segments[0];
      if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) {
        return { kind: "videoId", videoId: id };
      }
    }

    if (host.includes("youtube.com")) {
      if (segments[0] === "channel" && segments[1]?.startsWith("UC")) {
        return { kind: "channelId", channelId: segments[1] };
      }
      if (segments[0]?.startsWith("@")) {
        return { kind: "handle", handle: segments[0].slice(1) };
      }
      if (segments[0] === "user" && segments[1]) {
        return { kind: "customUrl", customUrl: segments[1] };
      }
      if (segments[0] === "c" && segments[1]) {
        return { kind: "customUrl", customUrl: segments[1] };
      }
      if (
        (segments[0] === "shorts" || segments[0] === "live") &&
        segments[1] &&
        /^[a-zA-Z0-9_-]{11}$/.test(segments[1])
      ) {
        return { kind: "videoId", videoId: segments[1] };
      }
      const watchId = url.searchParams.get("v");
      if (watchId && /^[a-zA-Z0-9_-]{11}$/.test(watchId)) {
        return { kind: "videoId", videoId: watchId };
      }
    }
  } catch {
    return null;
  }

  return null;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function GET(request: Request) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Missing YOUTUBE_API_KEY on the server. Add it to .env.local." },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const parsed = parseQuery(q);
  if (!parsed) {
    return NextResponse.json(
      {
        error:
          "Enter a YouTube channel/video URL, @handle, custom URL, channel ID, or video ID.",
      },
      { status: 400 }
    );
  }

  try {
    let channelId = parsed.kind === "channelId" ? parsed.channelId : "";

    if (parsed.kind === "handle") {
      const chUrl = `${API_BASE}/channels?part=id&forHandle=${encodeURIComponent(
        parsed.handle
      )}&key=${key}`;
      const ch = await fetchJson<{ items?: { id: string }[] }>(chUrl);
      if (!ch.items?.[0]?.id) {
        const searchUrl = `${API_BASE}/search?part=snippet&type=channel&q=${encodeURIComponent(
          parsed.handle
        )}&maxResults=1&key=${key}`;
        const search = await fetchJson<{
          items?: { id?: { channelId?: string } }[];
        }>(searchUrl);
        const id = search.items?.[0]?.id?.channelId;
        if (!id) {
          return NextResponse.json(
            { error: `No channel found for “${parsed.handle}”.` },
            { status: 404 }
          );
        }
        channelId = id;
      } else {
        channelId = ch.items[0].id;
      }
    } else if (parsed.kind === "customUrl") {
      const byUsernameUrl = `${API_BASE}/channels?part=id&forUsername=${encodeURIComponent(
        parsed.customUrl
      )}&key=${key}`;
      const byUsername = await fetchJson<{ items?: { id: string }[] }>(byUsernameUrl);

      if (byUsername.items?.[0]?.id) {
        channelId = byUsername.items[0].id;
      } else {
        const searchUrl = `${API_BASE}/search?part=snippet&type=channel&q=${encodeURIComponent(
          parsed.customUrl
        )}&maxResults=1&key=${key}`;
        const search = await fetchJson<{
          items?: { id?: { channelId?: string } }[];
        }>(searchUrl);
        const id = search.items?.[0]?.id?.channelId;
        if (!id) {
          return NextResponse.json(
            { error: `No channel found for “${parsed.customUrl}”.` },
            { status: 404 }
          );
        }
        channelId = id;
      }
    } else if (parsed.kind === "videoId") {
      const videoLookupUrl = `${API_BASE}/videos?part=snippet&id=${parsed.videoId}&key=${key}`;
      const videoLookup = await fetchJson<{
        items?: { snippet?: { channelId?: string } }[];
      }>(videoLookupUrl);
      const resolved = videoLookup.items?.[0]?.snippet?.channelId;
      if (!resolved) {
        return NextResponse.json(
          { error: "Could not resolve channel from that video URL/ID." },
          { status: 404 }
        );
      }
      channelId = resolved;
    }

    const channelUrl = `${API_BASE}/channels?part=snippet,statistics,brandingSettings&id=${channelId}&key=${key}`;
    const channelRes = await fetchJson<{
      items?: {
        id: string;
        snippet?: {
          title?: string;
          thumbnails?: { medium?: { url?: string }; high?: { url?: string } };
          customUrl?: string;
        };
        statistics?: {
          subscriberCount?: string;
          viewCount?: string;
          hiddenSubscriberCount?: boolean;
        };
      }[];
    }>(channelUrl);

    const ch = channelRes.items?.[0];
    if (!ch) {
      return NextResponse.json({ error: "Channel not found." }, { status: 404 });
    }

    const searchVideosUrl = `${API_BASE}/search?part=id&channelId=${channelId}&order=date&type=video&maxResults=50&key=${key}`;
    const searchVideos = await fetchJson<{
      items?: { id?: { videoId?: string } }[];
    }>(searchVideosUrl);

    const videoIds =
      searchVideos.items
        ?.map((i) => i.id?.videoId)
        .filter((id): id is string => !!id) ?? [];

    if (videoIds.length === 0) {
      return NextResponse.json({
        channel: {
          id: ch.id,
          title: ch.snippet?.title ?? "Channel",
          thumbnailUrl:
            ch.snippet?.thumbnails?.high?.url ??
            ch.snippet?.thumbnails?.medium?.url ??
            "",
          customUrl: ch.snippet?.customUrl ?? "",
          subscriberCount: ch.statistics?.subscriberCount ?? null,
          subscriberHidden: !!ch.statistics?.hiddenSubscriberCount,
          viewCount: ch.statistics?.viewCount ?? "0",
        },
        videos: [],
      });
    }

    const statsUrl = `${API_BASE}/videos?part=snippet,statistics&id=${videoIds.join(
      ","
    )}&key=${key}`;
    const stats = await fetchJson<{
      items?: {
        id: string;
        snippet?: { title?: string; publishedAt?: string; thumbnails?: { medium?: { url?: string } } };
        statistics?: { viewCount?: string; likeCount?: string };
      }[];
    }>(statsUrl);

    const order = new Map(videoIds.map((id, i) => [id, i]));
    const items = (stats.items ?? []).sort(
      (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
    );

    const videos = items.map((v) => ({
      id: v.id,
      title: v.snippet?.title ?? "",
      publishedAt: v.snippet?.publishedAt ?? "",
      thumbnailUrl: v.snippet?.thumbnails?.medium?.url ?? "",
      viewCount: parseInt(v.statistics?.viewCount ?? "0", 10),
      likeCount: parseInt(v.statistics?.likeCount ?? "0", 10),
    }));

    return NextResponse.json({
      channel: {
        id: ch.id,
        title: ch.snippet?.title ?? "Channel",
        thumbnailUrl:
          ch.snippet?.thumbnails?.high?.url ??
          ch.snippet?.thumbnails?.medium?.url ??
          "",
        customUrl: ch.snippet?.customUrl ?? "",
        subscriberCount: ch.statistics?.subscriberCount ?? null,
        subscriberHidden: !!ch.statistics?.hiddenSubscriberCount,
        viewCount: ch.statistics?.viewCount ?? "0",
      },
      videos,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "YouTube API error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
