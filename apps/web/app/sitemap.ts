import { MetadataRoute } from "next";
import { fetchJson } from "@/lib/api";

type EsSongItem = {
  id: number;
  status?: string | null;
};

type EsSongsSearchResponse = {
  total: number;
  items: EsSongItem[];
  aggs?: unknown;
};

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_BASE_URL ||
  "https://repertorio.net"
).replace(/\/$/, "");

const PAGE_SIZE = 500;

async function fetchPublishedSongUrls(): Promise<MetadataRoute.Sitemap> {
  const urls: MetadataRoute.Sitemap = [];
  let skip = 0;

  while (true) {
    const data = await fetchJson<EsSongsSearchResponse>(
      `/songs-es/search?take=${PAGE_SIZE}&skip=${skip}&status=PUBLISHED`,
      {
        cache: "no-store",
      },
    );

    const items = Array.isArray(data?.items) ? data.items : [];

    if (items.length === 0) break;

    for (const song of items) {
      const id = Number(song?.id);
      if (!Number.isFinite(id) || id <= 0) continue;

      urls.push({
        url: `${SITE_URL}/songs/${id}`,
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }

    skip += items.length;

    if (items.length < PAGE_SIZE) break;
  }

  return urls;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return fetchPublishedSongUrls();
}