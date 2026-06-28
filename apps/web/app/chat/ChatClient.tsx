"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageCircle, Plus, Search, Send, Users } from "lucide-react";

type UserMini = {
  id: number;
  displayName?: string | null;
  username?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
};

type ChatThread = {
  id: number;
  title: string;
  isGroup: boolean;
  unreadCount: number;
  lastMessageAt?: string | null;
  participants: Array<{ userId: number; user: UserMini }>;
  lastMessage?: { id: number; body: string; createdAt: string; sender: UserMini } | null;
};

type ChatMessage = {
  id: number;
  threadId: number;
  body: string;
  createdAt: string;
  sender: UserMini;
  mine: boolean;
};

function userLabel(user: UserMini | null | undefined) {
  return user?.displayName || user?.username || user?.email || `User #${user?.id ?? ""}`;
}

function formatTime(iso?: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
    credentials: "include",
    cache: "no-store",
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.ok === false) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
  return data as T;
}

export default function ChatClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<UserMini[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<UserMini[]>([]);
  const [groupTitle, setGroupTitle] = useState("");
  const listBottomRef = useRef<HTMLDivElement | null>(null);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) || null,
    [threads, activeThreadId],
  );

  const threadIdFromUrl = useMemo(() => {
    const raw = Number(searchParams.get("threadId") || "");
    return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : null;
  }, [searchParams]);

  const refreshThreads = useCallback(async () => {
    const data = await jsonFetch<{ ok: true; threads: ChatThread[] }>("/api/chat");
    const nextThreads = data.threads || [];
    const urlThread = threadIdFromUrl && nextThreads.some((thread) => thread.id === threadIdFromUrl) ? threadIdFromUrl : null;
    setThreads(nextThreads);
    setActiveThreadId((prev) => prev ?? urlThread ?? nextThreads?.[0]?.id ?? null);
  }, [threadIdFromUrl]);

  const loadMessages = useCallback(async (threadId: number) => {
    setLoadingMessages(true);
    try {
      const data = await jsonFetch<{ ok: true; messages: ChatMessage[] }>(`/api/chat/${threadId}/messages`);
      setMessages(data.messages || []);
      await fetch(`/api/chat/${threadId}/read`, { method: "POST", credentials: "include" }).catch(() => null);
      setThreads((prev) => prev.map((thread) => (thread.id === threadId ? { ...thread, unreadCount: 0 } : thread)));
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingThreads(true);
    refreshThreads()
      .catch((err: any) => {
        if (!cancelled) setError(err?.message || "Δεν φορτώθηκαν οι συνομιλίες.");
      })
      .finally(() => {
        if (!cancelled) setLoadingThreads(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshThreads]);

  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      return;
    }
    void loadMessages(activeThreadId).catch((err: any) => setError(err?.message || "Δεν φορτώθηκαν τα μηνύματα."));
  }, [activeThreadId, loadMessages]);

  useEffect(() => {
    if (!activeThreadId) return;
    const id = window.setInterval(async () => {
      try {
        const lastId = messages[messages.length - 1]?.id;
        const qs = lastId ? `?afterId=${lastId}` : "";
        const data = await jsonFetch<{ ok: true; messages: ChatMessage[] }>(`/api/chat/${activeThreadId}/messages${qs}`);
        if (data.messages?.length) {
          setMessages((prev) => [...prev, ...data.messages]);
          await fetch(`/api/chat/${activeThreadId}/read`, { method: "POST", credentials: "include" }).catch(() => null);
          void refreshThreads().catch(() => null);
        }
      } catch {
        // Polling must not disturb the user while typing/reading.
      }
    }, 5000);
    return () => window.clearInterval(id);
  }, [activeThreadId, messages, refreshThreads]);

  useEffect(() => {
    listBottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, activeThreadId]);

  useEffect(() => {
    let cancelled = false;
    const q = userQuery.trim();
    if (q.length < 2) {
      setUserResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const data = await jsonFetch<any>(`/api/users?q=${encodeURIComponent(q)}&take=8`);
        const raw = Array.isArray(data?.items) ? data.items : Array.isArray(data?.data) ? data.data : [];
        const users = raw
          .map((item: any) => item.user || item)
          .filter((item: any) => item?.id && !selectedUsers.some((selected) => selected.id === item.id));
        if (!cancelled) setUserResults(users);
      } catch {
        if (!cancelled) setUserResults([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [userQuery, selectedUsers]);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!activeThreadId || sending || !draft.trim()) return;
    const body = draft.trim();
    setDraft("");
    setSending(true);
    try {
      const data = await jsonFetch<{ ok: true; message: ChatMessage; thread: ChatThread }>(
        `/api/chat/${activeThreadId}/messages`,
        { method: "POST", body: JSON.stringify({ body }) },
      );
      setMessages((prev) => [...prev, data.message]);
      setThreads((prev) => [data.thread, ...prev.filter((thread) => thread.id !== data.thread.id)]);
    } catch (err: any) {
      setDraft(body);
      setError(err?.message || "Δεν στάλθηκε το μήνυμα.");
    } finally {
      setSending(false);
    }
  }

  async function createThread() {
    if (!selectedUsers.length) {
      setError("Επίλεξε τουλάχιστον έναν χρήστη.");
      return;
    }
    try {
      const data = await jsonFetch<{ ok: true; thread: ChatThread }>("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          participantUserIds: selectedUsers.map((user) => user.id),
          isGroup: selectedUsers.length > 1,
          title: groupTitle,
        }),
      });
      setThreads((prev) => [data.thread, ...prev.filter((thread) => thread.id !== data.thread.id)]);
      setActiveThreadId(data.thread.id);
      router.replace(`/chat?threadId=${data.thread.id}`, { scroll: false });
      setSelectedUsers([]);
      setGroupTitle("");
      setUserQuery("");
      setUserResults([]);
      setNewOpen(false);
    } catch (err: any) {
      setError(err?.message || "Δεν δημιουργήθηκε η συνομιλία.");
    }
  }

  return (
    <main className="chat-page">
      <section className="chat-layout">
        <aside className="chat-sidebar">
          <div className="chat-title-row">
            <div>
              <h1>Chat</h1>
              <span>Συνομιλίες χρηστών</span>
            </div>
            <button type="button" onClick={() => setNewOpen((v) => !v)} title="Νέα συνομιλία">
              <Plus size={20} />
            </button>
          </div>

          {newOpen ? (
            <div className="new-chat">
              <label>
                <span>Αναζήτηση χρήστη</span>
                <div className="user-search">
                  <Search size={16} />
                  <input value={userQuery} onChange={(e) => setUserQuery(e.currentTarget.value)} placeholder="Όνομα ή email" />
                </div>
              </label>
              {userResults.length ? (
                <div className="user-results">
                  {userResults.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => {
                        setSelectedUsers((prev) => [...prev, user]);
                        setUserQuery("");
                        setUserResults([]);
                      }}
                    >
                      {userLabel(user)}
                    </button>
                  ))}
                </div>
              ) : null}
              {selectedUsers.length ? (
                <div className="selected-users">
                  {selectedUsers.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => setSelectedUsers((prev) => prev.filter((item) => item.id !== user.id))}
                    >
                      {userLabel(user)} ×
                    </button>
                  ))}
                </div>
              ) : null}
              {selectedUsers.length > 1 ? (
                <input value={groupTitle} onChange={(e) => setGroupTitle(e.currentTarget.value)} placeholder="Τίτλος ομάδας προαιρετικά" />
              ) : null}
              <button type="button" className="create-chat" onClick={createThread}>
                Δημιουργία
              </button>
            </div>
          ) : null}

          <div className="thread-list">
            {loadingThreads ? <div className="empty-state">Φόρτωση...</div> : null}
            {!loadingThreads && !threads.length ? <div className="empty-state">Δεν υπάρχουν συνομιλίες.</div> : null}
            {threads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                className={thread.id === activeThreadId ? "active" : ""}
                onClick={() => {
                  setActiveThreadId(thread.id);
                  router.replace(`/chat?threadId=${thread.id}`, { scroll: false });
                }}
              >
                <div className="thread-line">
                  <strong>{thread.title}</strong>
                  {thread.unreadCount ? <span>{thread.unreadCount}</span> : null}
                </div>
                <small>{thread.lastMessage ? thread.lastMessage.body : "Χωρίς μηνύματα ακόμη"}</small>
              </button>
            ))}
          </div>
        </aside>

        <section className="chat-main">
          {activeThread ? (
            <>
              <header className="chat-room-head">
                <div>
                  <h2>{activeThread.title}</h2>
                  <span>
                    <Users size={15} /> {activeThread.participants.map((p) => userLabel(p.user)).join(", ")}
                  </span>
                </div>
              </header>

              <div className="messages">
                {loadingMessages ? <div className="empty-state">Φόρτωση μηνυμάτων...</div> : null}
                {!loadingMessages && !messages.length ? <div className="empty-state">Γράψε το πρώτο μήνυμα.</div> : null}
                {messages.map((message) => (
                  <div key={message.id} className={message.mine ? "message mine" : "message"}>
                    <div className="message-meta">
                      <strong>{message.mine ? "Εσύ" : userLabel(message.sender)}</strong>
                      <span>{formatTime(message.createdAt)}</span>
                    </div>
                    <p>{message.body}</p>
                  </div>
                ))}
                <div ref={listBottomRef} />
              </div>

              <form className="composer" onSubmit={sendMessage}>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.currentTarget.value)}
                  placeholder="Γράψε μήνυμα..."
                  rows={2}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendMessage(event as any);
                    }
                  }}
                />
                <button type="submit" disabled={sending || !draft.trim()} title="Αποστολή">
                  <Send size={19} />
                </button>
              </form>
            </>
          ) : (
            <div className="chat-placeholder">
              <MessageCircle size={40} />
              <h2>Επίλεξε ή δημιούργησε συνομιλία</h2>
            </div>
          )}
        </section>
      </section>

      {error ? (
        <button type="button" className="chat-error" onClick={() => setError(null)}>
          {error}
        </button>
      ) : null}

      <style jsx>{`
        .chat-page {
          min-height: calc(100vh - 92px);
          background: #050505;
          color: #fff;
          padding: 14px;
        }

        .chat-layout {
          display: grid;
          grid-template-columns: minmax(260px, 340px) minmax(0, 1fr);
          gap: 12px;
          max-width: 1180px;
          margin: 0 auto;
        }

        .chat-sidebar,
        .chat-main {
          border: 1px solid #2f2f2f;
          border-radius: 10px;
          background: #101010;
          min-width: 0;
        }

        .chat-sidebar {
          padding: 10px;
        }

        .chat-title-row,
        .thread-line,
        .chat-room-head,
        .composer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        h1,
        h2 {
          margin: 0;
        }

        .chat-title-row span,
        .chat-room-head span,
        .empty-state,
        .message-meta span {
          color: #b6b6b6;
          font-size: 0.86rem;
        }

        .chat-title-row button,
        .create-chat,
        .composer button {
          border: 1px solid #8b5cf6;
          border-radius: 8px;
          background: #8b5cf6;
          color: #fff;
          cursor: pointer;
          font-weight: 850;
          padding: 8px 10px;
        }

        .new-chat {
          display: grid;
          gap: 8px;
          border: 1px solid #333;
          border-radius: 8px;
          background: #171717;
          margin: 10px 0;
          padding: 9px;
        }

        .new-chat label {
          display: grid;
          gap: 5px;
          color: #d6d6d6;
          font-weight: 750;
        }

        .user-search {
          display: flex;
          align-items: center;
          gap: 6px;
          border: 1px solid #3b3b3b;
          border-radius: 8px;
          padding: 0 8px;
          background: #050505;
        }

        input,
        textarea {
          width: 100%;
          border: 1px solid #3b3b3b;
          border-radius: 8px;
          background: #050505;
          color: #fff;
          padding: 9px;
          font: inherit;
          box-sizing: border-box;
        }

        .user-search input {
          border: 0;
          padding-left: 0;
        }

        .user-results,
        .selected-users {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .user-results button,
        .selected-users button {
          border: 1px solid #444;
          border-radius: 999px;
          background: #242424;
          color: #fff;
          cursor: pointer;
          padding: 6px 8px;
        }

        .thread-list {
          display: grid;
          gap: 7px;
          margin-top: 10px;
        }

        .thread-list button {
          display: grid;
          gap: 4px;
          width: 100%;
          border: 1px solid #2f2f2f;
          border-radius: 8px;
          background: #171717;
          color: #fff;
          cursor: pointer;
          padding: 9px;
          text-align: left;
        }

        .thread-list button.active {
          border-color: #8b5cf6;
          background: #241b3d;
        }

        .thread-line span {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 22px;
          height: 22px;
          border-radius: 999px;
          background: #dc2626;
          color: #fff;
          font-size: 0.8rem;
        }

        .thread-list small {
          color: #b8b8b8;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .chat-main {
          display: grid;
          grid-template-rows: auto minmax(360px, 1fr) auto;
          min-height: calc(100vh - 125px);
        }

        .chat-room-head {
          border-bottom: 1px solid #2e2e2e;
          padding: 12px;
        }

        .chat-room-head span {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          margin-top: 4px;
        }

        .messages {
          display: flex;
          flex-direction: column;
          gap: 8px;
          overflow: auto;
          padding: 12px;
        }

        .message {
          align-self: flex-start;
          max-width: min(680px, 86%);
          border: 1px solid #303030;
          border-radius: 10px;
          background: #181818;
          padding: 8px 10px;
        }

        .message.mine {
          align-self: flex-end;
          background: #241b3d;
          border-color: #8b5cf6;
        }

        .message-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 4px;
        }

        .message p {
          margin: 0;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          line-height: 1.35;
        }

        .composer {
          border-top: 1px solid #2e2e2e;
          padding: 10px;
        }

        .composer textarea {
          resize: none;
        }

        .composer button {
          width: 44px;
          height: 44px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .composer button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .chat-placeholder {
          display: grid;
          place-items: center;
          align-content: center;
          gap: 12px;
          min-height: 420px;
          color: #cfcfcf;
        }

        .chat-error {
          position: fixed;
          left: 50%;
          bottom: 18px;
          transform: translateX(-50%);
          max-width: min(680px, calc(100vw - 24px));
          border: 1px solid #7f1d1d;
          border-radius: 9px;
          background: #2a1010;
          color: #ffd4d4;
          padding: 9px 12px;
          cursor: pointer;
          z-index: 1000;
        }

        @media (max-width: 760px) {
          .chat-page {
            padding: 8px;
          }

          .chat-layout {
            grid-template-columns: 1fr;
          }

          .chat-main {
            min-height: 68vh;
          }
        }
      `}</style>
    </main>
  );
}
