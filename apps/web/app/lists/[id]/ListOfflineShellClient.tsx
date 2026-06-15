"use client";

import React, { useEffect, useState } from "react";
import { readOfflineListsForCurrentUser } from "@/lib/offlineStore";
import ListDetailClient from "./ListDetailClient";
import type { ListDetailDto } from "./page";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; listId: number; viewerUserId: number; data: ListDetailDto };

function currentListId(): number | null {
  if (typeof window === "undefined") return null;
  const match = window.location.pathname.match(/^\/lists\/(\d+)$/);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) && id > 0 ? Math.trunc(id) : null;
}

function textOrNull(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function numberOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeRole(value: unknown): ListDetailDto["role"] {
  return value === "OWNER" || value === "LIST_EDITOR" || value === "SONGS_EDITOR" || value === "VIEWER"
    ? value
    : "VIEWER";
}

function normalizeListDetail(listId: number, detail: any, summary: any): ListDetailDto {
  const source = detail || summary || {};
  const title = textOrNull(source.title || source.name || source.listTitle || source.list_title) || `Λίστα #${listId}`;
  const items = Array.isArray(detail?.items) ? detail.items : [];

  return {
    id: listId,
    title,
    name: textOrNull(source.name) || title,
    listTitle: textOrNull(source.listTitle) || title,
    list_title: textOrNull(source.list_title) || title,
    groupId: numberOrNull(source.groupId),
    groupTitle: textOrNull(source.groupTitle),
    groupFullTitle: textOrNull(source.groupFullTitle),
    marked: Boolean(source.marked),
    role: normalizeRole(source.role),
    items: items.map((item: any, index: number) => ({
      listItemId: Number(item?.listItemId ?? item?.id ?? index + 1),
      listId,
      sortId: Number(item?.sortId ?? index + 1),
      songId: numberOrNull(item?.songId ?? item?.song_id),
      title: textOrNull(item?.title),
      chords: textOrNull(item?.chords),
      chordsSource: item?.chordsSource === "LIST" || item?.chordsSource === "SONG" ? item.chordsSource : "NONE",
      lyrics: textOrNull(item?.lyrics),
      lyricsSource: item?.lyricsSource === "LIST" || item?.lyricsSource === "SONG" ? item.lyricsSource : "NONE",
    })),
  };
}

export default function ListOfflineShellClient() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function loadList() {
      const listId = currentListId();
      if (!listId) {
        setState({ status: "error", message: "Δεν εντοπίστηκε ID λίστας." });
        return;
      }

      const snapshot = await readOfflineListsForCurrentUser().catch(() => null);
      if (!snapshot) {
        if (!cancelled) setState({ status: "error", message: "Δεν βρέθηκαν offline λίστες για τον τρέχοντα χρήστη." });
        return;
      }

      const key = String(listId);
      const detail = snapshot.detailsById?.[key] || null;
      const summaries = Array.isArray(snapshot.data?.items) ? snapshot.data.items : [];
      const summary = summaries.find((item: any) => Number(item?.id) === listId) || null;

      if (!detail && !summary) {
        if (!cancelled) setState({ status: "error", message: "Η λίστα δεν βρέθηκε στα offline δεδομένα αυτής της συσκευής." });
        return;
      }

      const data = normalizeListDetail(listId, detail, summary);
      if (!cancelled) {
        setState({ status: "ready", listId, viewerUserId: Number(snapshot.userId), data });
      }
    }

    void loadList();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <section style={{ padding: "1rem" }}>
        <p>Φόρτωση offline λίστας...</p>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section style={{ padding: "1rem" }}>
        <h1>Λίστα</h1>
        <p>{state.message}</p>
      </section>
    );
  }

  return <ListDetailClient listId={state.listId} viewerUserId={state.viewerUserId} data={state.data} />;
}
