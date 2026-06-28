"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { recordSongSearch, recordSongView, setupUserHistoryFlush } from "@/lib/userHistory";

function getSongId(pathname: string | null): number | null {
  const match = String(pathname || "").match(/^\/songs\/(\d+)(?:\/?$|\/)/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getVisibleTitle() {
  const h1 = document.querySelector("h1");
  const text = h1?.textContent?.trim();
  if (text) return text;
  return document.title.split("|")[0]?.trim() || null;
}

function searchMetadata(params: URLSearchParams) {
  const keys = [
    "categoryIds",
    "rythmIds",
    "tagIds",
    "lyrics",
    "chords",
    "partiture",
    "status",
    "composerIds",
    "lyricistIds",
    "singerFrontIds",
    "singerBackIds",
    "yearFrom",
    "yearTo",
  ];
  const out: Record<string, string> = {};
  keys.forEach((key) => {
    const value = params.get(key);
    if (value) out[key] = value;
  });
  return out;
}

export default function UserHistoryTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const paramsKey = searchParams.toString();

  useEffect(() => setupUserHistoryFlush(), []);

  const songId = useMemo(() => getSongId(pathname), [pathname]);

  useEffect(() => {
    if (!songId) return;
    const timer = window.setTimeout(() => {
      recordSongView({
        songId,
        title: getVisibleTitle(),
        path: `${window.location.pathname}${window.location.search}`,
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [songId, paramsKey]);

  useEffect(() => {
    if (pathname !== "/songs") return;
    const term = (searchParams.get("search_term") || searchParams.get("q") || "").trim();
    if (!term) return;
    recordSongSearch({
      searchTerm: term,
      path: `${window.location.pathname}${window.location.search}`,
      metadata: searchMetadata(searchParams),
    });
  }, [pathname, searchParams, paramsKey]);

  return null;
}
