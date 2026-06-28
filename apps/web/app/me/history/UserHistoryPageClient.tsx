"use client";

import Link from "next/link";
import { Clock, Music2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  readLocalUserHistory,
  type RecentSearchHistoryItem,
  type RecentSongHistoryItem,
} from "@/lib/userHistory";

type HistoryState = {
  recentSongs: RecentSongHistoryItem[];
  recentSearches: RecentSearchHistoryItem[];
  loading: boolean;
  authenticated: boolean | null;
};

function formatDate(value: string) {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleString("el-GR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function mergeSongs(local: RecentSongHistoryItem[], remote: RecentSongHistoryItem[]) {
  const seen = new Set<number>();
  return [...remote, ...local]
    .filter((item) => {
      if (!item?.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, 40);
}

function mergeSearches(local: RecentSearchHistoryItem[], remote: RecentSearchHistoryItem[]) {
  const seen = new Set<string>();
  return [...remote, ...local]
    .filter((item) => {
      const key = String(item?.term || "").toLocaleLowerCase("el-GR");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, 40);
}

export default function UserHistoryPageClient() {
  const [state, setState] = useState<HistoryState>(() => {
    const local = readLocalUserHistory();
    return {
      recentSongs: local.recentSongs,
      recentSearches: local.recentSearches,
      loading: true,
      authenticated: null,
    };
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const local = readLocalUserHistory();
      try {
        const res = await fetch("/api/user-history?take=40", {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        setState({
          recentSongs: mergeSongs(local.recentSongs, Array.isArray(data?.recentSongs) ? data.recentSongs : []),
          recentSearches: mergeSearches(
            local.recentSearches,
            Array.isArray(data?.recentSearches) ? data.recentSearches : [],
          ),
          loading: false,
          authenticated: data?.authenticated ?? null,
        });
      } catch {
        if (cancelled) return;
        setState((prev) => ({ ...prev, loading: false }));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasHistory = state.recentSongs.length > 0 || state.recentSearches.length > 0;
  const note = useMemo(() => {
    if (state.loading) return "Φορτώνει...";
    if (state.authenticated === false) return "Εμφανίζεται μόνο το τοπικό ιστορικό αυτής της συσκευής.";
    return "Το ιστορικό κρατιέται ελαφρύ και συγχρονίζεται στο παρασκήνιο.";
  }, [state.loading, state.authenticated]);

  return (
    <div className="history-page">
      <div className="history-head">
        <Clock size={28} />
        <div>
          <h1>Ιστορικό</h1>
          <p>{note}</p>
        </div>
      </div>

      {!hasHistory && !state.loading ? <div className="empty">Δεν υπάρχει ακόμη ιστορικό.</div> : null}

      <section>
        <h2>
          <Music2 size={20} /> Πρόσφατα τραγούδια
        </h2>
        <div className="history-list">
          {state.recentSongs.map((item) => (
            <Link key={`${item.id}-${item.occurredAt}`} href={item.path || `/songs/${item.id}`} className="history-row">
              <strong>{item.title}</strong>
              <span>{formatDate(item.occurredAt)}</span>
              {item.firstLyrics ? <small>{item.firstLyrics}</small> : null}
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2>
          <Search size={20} /> Πρόσφατες αναζητήσεις
        </h2>
        <div className="history-list">
          {state.recentSearches.map((item) => (
            <Link key={`${item.term}-${item.occurredAt}`} href={item.path} className="history-row">
              <strong>{item.term}</strong>
              <span>{formatDate(item.occurredAt)}</span>
            </Link>
          ))}
        </div>
      </section>

      <style jsx>{`
        .history-page {
          width: min(980px, calc(100vw - 28px));
          margin: 24px auto 56px;
          color: #fff;
        }
        .history-head {
          display: flex;
          gap: 14px;
          align-items: center;
          margin-bottom: 22px;
        }
        h1 {
          margin: 0;
          font-size: clamp(30px, 7vw, 46px);
          line-height: 1.05;
        }
        p {
          margin: 6px 0 0;
          color: #bdbdbd;
        }
        section {
          margin-top: 22px;
        }
        h2 {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 22px;
          margin: 0 0 10px;
        }
        .history-list {
          display: grid;
          gap: 8px;
        }
        .history-row {
          display: grid;
          gap: 3px;
          padding: 12px 14px;
          border: 1px solid #333;
          border-radius: 8px;
          background: #121212;
          color: #fff;
          text-decoration: none;
        }
        .history-row:hover {
          border-color: #555;
          background: #171717;
        }
        .history-row span,
        .history-row small {
          color: #a8a8a8;
        }
        .history-row small {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .empty {
          padding: 14px;
          border: 1px solid #333;
          border-radius: 8px;
          color: #bbb;
        }
      `}</style>
    </div>
  );
}
