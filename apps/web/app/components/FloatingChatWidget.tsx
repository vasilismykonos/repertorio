"use client";

import { FormEvent, PointerEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft, Bell, CheckCheck, MessageCircle, Search, Send, X } from "lucide-react";

const OPEN_DRAG_PX = 36;
const PANEL_USERS_TAKE = 5;
const PUSH_PROMPT_DISMISSED_UNTIL_KEY = "repertorio_push_prompt_dismissed_until_v1";
const PUSH_PROMPT_DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

type OnlineUser = {
  id: number | string;
  label: string;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  secondsAgo?: number;
  guest?: boolean;
  online?: boolean;
};

type MeResponse = {
  ok?: boolean;
  user?: { id?: number; displayName?: string | null; username?: string | null; email?: string | null };
};

type ChatMessage = {
  id: number;
  body: string;
  createdAt: string;
  senderUserId?: number;
  mine: boolean;
  delivery?: {
    status: "sent" | "delivered" | "read";
    recipientCount: number;
    readByCount: number;
    readAt?: string | null;
  } | null;
};

type ChatThread = {
  id: number;
  title: string;
  unreadCount: number;
  participants: Array<{ userId: number; lastReadAt?: string | null; user: OnlineUser }>;
  lastMessage?: { body: string; createdAt: string } | null;
};

function userLabel(user: OnlineUser | null) {
  return user?.label || user?.displayName || user?.username || "Χρήστης";
}

function isRealUser(user: OnlineUser): user is OnlineUser & { id: number } {
  return !user.guest && typeof user.id === "number" && Number.isFinite(user.id);
}

function normalizeUser(item: any, online = false): OnlineUser | null {
  const source = item?.user || item;
  const id = Number(source?.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  const displayName = source.displayName ?? source.name ?? null;
  const username = source.username ?? null;
  const email = source.email ?? null;
  return {
    id: Math.trunc(id),
    label: displayName || username || email || `User ${Math.trunc(id)}`,
    username,
    displayName,
    avatarUrl: source.avatarUrl ?? source.image ?? null,
    online,
  };
}

function readTime(value?: string | null) {
  if (!value) return 0;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
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

function urlBase64ToArrayBuffer(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) output[i] = rawData.charCodeAt(i);
  return output.buffer as ArrayBuffer;
}

async function savePushSubscription(subscription: PushSubscription) {
  const res = await fetch("/api/notifications/push", {
    method: "POST",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) throw new Error(data?.error || "push subscribe failed");
}

export default function FloatingChatWidget() {
  const [meId, setMeId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<OnlineUser[]>([]);
  const [searchUsers, setSearchUsers] = useState<OnlineUser[]>([]);
  const [selected, setSelected] = useState<OnlineUser | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingSearchUsers, setLoadingSearchUsers] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pushPromptVisible, setPushPromptVisible] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);
  const autoOpenThreadRef = useRef<number | null>(null);

  async function refreshPushPrompt() {
    if (typeof window === "undefined") return;
    if (!open || !meId) {
      setPushPromptVisible(false);
      return;
    }
    try {
      const dismissedUntil = Number(window.localStorage.getItem(PUSH_PROMPT_DISMISSED_UNTIL_KEY) || "0");
      if (Number.isFinite(dismissedUntil) && dismissedUntil > Date.now()) {
        setPushPromptVisible(false);
        return;
      }
    } catch {
      // Storage is optional; fall through to the prompt.
    }
    const supported = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
    if (!supported) {
      setPushPromptVisible(false);
      return;
    }
    if (window.Notification.permission === "denied") {
      setPushPromptVisible(false);
      return;
    }
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription && window.Notification.permission === "granted") {
        await savePushSubscription(subscription).catch(() => null);
        setPushPromptVisible(false);
        return;
      }
      setPushPromptVisible(true);
    } catch {
      setPushPromptVisible(true);
    }
  }

  async function enableChatPush() {
    if (typeof window === "undefined" || pushBusy) return;
    setPushBusy(true);
    setPushError(null);
    try {
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        setPushError("Η συσκευή δεν υποστηρίζει push ειδοποιήσεις.");
        return;
      }
      const permission =
        window.Notification.permission === "default"
          ? await window.Notification.requestPermission()
          : window.Notification.permission;
      if (permission !== "granted") {
        setPushError("Δεν δόθηκε άδεια ειδοποιήσεων.");
        return;
      }
      const keyData = await jsonFetch<{ ok: boolean; enabled?: boolean; publicKey?: string }>("/api/notifications/push");
      const publicKey = String(keyData?.publicKey || "");
      if (!keyData?.enabled || !publicKey) {
        setPushError("Οι push ειδοποιήσεις δεν είναι διαθέσιμες στον server.");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToArrayBuffer(publicKey),
        });
      }
      await savePushSubscription(subscription);
      window.localStorage.removeItem(PUSH_PROMPT_DISMISSED_UNTIL_KEY);
      setPushPromptVisible(false);
    } catch {
      setPushError("Δεν ενεργοποιήθηκαν οι ειδοποιήσεις.");
    } finally {
      setPushBusy(false);
    }
  }

  function dismissChatPushPrompt() {
    try {
      window.localStorage.setItem(PUSH_PROMPT_DISMISSED_UNTIL_KEY, String(Date.now() + PUSH_PROMPT_DISMISS_MS));
    } catch {
      // ignore
    }
    setPushPromptVisible(false);
  }

  useEffect(() => {
    let cancelled = false;
    jsonFetch<MeResponse>("/api/current-user")
      .then((data) => {
        const id = Number(data?.user?.id);
        if (!cancelled && Number.isFinite(id) && id > 0) setMeId(Math.trunc(id));
      })
      .catch(() => {
        if (!cancelled) setMeId(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadUsers() {
    if (!meId || document.visibilityState !== "visible") return;
    setLoadingUsers(true);
    setError(null);
    try {
      const data = await jsonFetch<{ ok: true; users?: OnlineUser[] }>("/api/presence/online?windowSec=180&take=12");
      const nextUsers = (Array.isArray(data.users) ? data.users : [])
        .map((user) => ({ ...user, online: true }))
        .filter(isRealUser)
        .filter((user) => user.id !== meId);
      setUsers(nextUsers);
    } catch (err: any) {
      setUsers([]);
      setError(err?.message || "Δεν φορτώθηκαν οι online χρήστες.");
    } finally {
      setLoadingUsers(false);
    }
  }

  async function loadThreads() {
    if (!meId || document.visibilityState !== "visible") return;
    setLoadingThreads(true);
    try {
      const data = await jsonFetch<{ ok: true; threads?: ChatThread[] }>("/api/chat");
      setThreads(Array.isArray(data.threads) ? data.threads : []);
    } catch {
      setThreads([]);
    } finally {
      setLoadingThreads(false);
    }
  }

  useEffect(() => {
    if (!open || !meId) return;
    void loadUsers();
    void loadThreads();
    void refreshPushPrompt();
    const id = window.setInterval(() => void loadUsers(), 15000);
    return () => window.clearInterval(id);
    // selected intentionally omitted: refresh must not restart while typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, meId]);

  useEffect(() => {
    if (!open || !meId) return;
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchUsers([]);
      setLoadingSearchUsers(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoadingSearchUsers(true);
      try {
        const [data, onlineData] = await Promise.all([
          jsonFetch<any>(`/api/users?q=${encodeURIComponent(q)}&take=8`),
          jsonFetch<{ ok: true; users?: OnlineUser[] }>("/api/presence/online?windowSec=180&take=200").catch(() => null),
        ]);
        const raw = Array.isArray(data?.items) ? data.items : Array.isArray(data?.data) ? data.data : [];
        const onlineSource = Array.isArray(onlineData?.users) ? onlineData.users : users;
        const onlineIds = new Set(onlineSource.map((user) => Number(user.id)));
        const nextUsers = raw
          .map((item: any) => normalizeUser(item, onlineIds.has(Number(item?.user?.id ?? item?.id))))
          .filter((user: OnlineUser | null): user is OnlineUser => Boolean(user))
          .filter((user: OnlineUser) => user.id !== meId);
        if (!cancelled) setSearchUsers(nextUsers);
      } catch {
        if (!cancelled) setSearchUsers([]);
      } finally {
        if (!cancelled) setLoadingSearchUsers(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, meId, searchQuery, users]);

  useEffect(() => {
    if (!meId) return;
    void loadThreads();
    const id = window.setInterval(() => void loadThreads(), open ? 15000 : 30000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meId, open]);

  useEffect(() => {
    if (!sent) return;
    const timer = window.setTimeout(() => setSent(false), 1400);
    return () => window.clearTimeout(timer);
  }, [sent]);

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    dragStartRef.current = { x: event.clientX, y: event.clientY };
    movedRef.current = false;
    setDragging(true);
    buttonRef.current?.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (!dragging || !dragStartRef.current) return;
    const dx = event.clientX - dragStartRef.current.x;
    const dy = event.clientY - dragStartRef.current.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) movedRef.current = true;
    setDragOffsetX(Math.max(-74, Math.min(0, dx)));
  }

  function handlePointerUp(event: PointerEvent<HTMLButtonElement>) {
    if (!dragging) return;
    const openedBySwipe = dragOffsetX <= -OPEN_DRAG_PX;
    setDragging(false);
    dragStartRef.current = null;
    setDragOffsetX(0);
    buttonRef.current?.releasePointerCapture(event.pointerId);
    if (openedBySwipe) setOpen(true);
  }

  function handleButtonClick() {
    if (movedRef.current) {
      movedRef.current = false;
      return;
    }
    // Desktop fallback: a plain click opens/closes too, while touch users can swipe left.
    setOpen((value) => !value);
  }

  async function openConversation(user: OnlineUser) {
    if (!isRealUser(user)) return;
    setSelected(user);
    setLoadingMessages(true);
    setError(null);
    try {
      const thread = await jsonFetch<{ ok: true; thread: { id: number } }>("/api/chat", {
        method: "POST",
        body: JSON.stringify({ participantUserIds: [user.id] }),
      });
      await openThreadById(thread.thread.id, user);
    } catch (err: any) {
      setActiveThreadId(null);
      setMessages([]);
      setError(err?.message || "Δεν άνοιξε η συνομιλία.");
    } finally {
      setLoadingMessages(false);
    }
  }

  async function openThreadById(threadId: number, fallbackUser?: OnlineUser | null) {
    const thread = threads.find((item) => item.id === threadId) || null;
    const other = thread?.participants.find((participant) => participant.userId !== meId)?.user || fallbackUser || null;
    if (other) setSelected(other);
    setActiveThreadId(threadId);
    setLoadingMessages(true);
    setError(null);
    try {
      const data = await jsonFetch<{ ok: true; messages?: ChatMessage[] }>(`/api/chat/${threadId}/messages`);
      setMessages((data.messages || []).slice(-8));
      await fetch(`/api/chat/${threadId}/read`, { method: "POST", credentials: "include" }).catch(() => null);
      void loadThreads();
    } catch (err: any) {
      setMessages([]);
      setError(err?.message || "Δεν άνοιξε η συνομιλία.");
    } finally {
      setLoadingMessages(false);
    }
  }

  useEffect(() => {
    if (!meId || typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const rawThreadId = Number(params.get("chatThreadId"));
    if (!Number.isFinite(rawThreadId) || rawThreadId <= 0) return;

    const threadId = Math.trunc(rawThreadId);
    if (autoOpenThreadRef.current === threadId) return;
    autoOpenThreadRef.current = threadId;

    setOpen(true);
    void openThreadById(threadId);

    params.delete("chatThreadId");
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);
    // openThreadById is intentionally omitted; this effect handles a one-shot URL action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meId]);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!selected || !isRealUser(selected) || !message.trim() || sending) return;
    const body = message.trim();
    setSending(true);
    setError(null);
    try {
      let threadId = activeThreadId;
      if (!threadId) {
        const thread = await jsonFetch<{ ok: true; thread: { id: number } }>("/api/chat", {
          method: "POST",
          body: JSON.stringify({ participantUserIds: [selected.id] }),
        });
        threadId = thread.thread.id;
        setActiveThreadId(threadId);
      }
      const data = await jsonFetch<{ ok: true; message: ChatMessage }>(`/api/chat/${threadId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      setMessage("");
      setMessages((prev) => [...prev.slice(-7), data.message]);
      void loadThreads();
      setSent(true);
    } catch (err: any) {
      setError(err?.message || "Δεν στάλθηκε το μήνυμα.");
    } finally {
      setSending(false);
    }
  }

  if (!meId) return null;

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase("el");
  const searchingUsers = normalizedSearch.length >= 2;
  const threadOtherUserId = (thread: ChatThread) =>
    thread.participants.find((participant) => participant.userId !== meId)?.userId ?? null;
  const unreadThreads = threads.filter((thread) => Number(thread.unreadCount || 0) > 0);
  const unreadUserIds = new Set(unreadThreads.map(threadOtherUserId).filter((id): id is number => typeof id === "number"));
  const unreadTotal = unreadThreads.reduce((sum, thread) => sum + Number(thread.unreadCount || 0), 0);
  const recentThreads = threads
    .filter((thread) => Boolean(thread.lastMessage))
    .filter((thread) => {
      const otherUserId = threadOtherUserId(thread);
      return !otherUserId || !unreadUserIds.has(otherUserId);
    })
    .sort((a, b) => {
      const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, 6);
  const recentUserIds = new Set(recentThreads.map(threadOtherUserId).filter((id): id is number => typeof id === "number"));
  const hiddenOnlineUserIds = new Set([...unreadUserIds, ...recentUserIds]);
  const visibleUsers = (searchingUsers
    ? searchUsers
    : users.filter(
        (user) =>
          !hiddenOnlineUserIds.has(Number(user.id)) &&
          (!normalizedSearch || userLabel(user).toLocaleLowerCase("el").includes(normalizedSearch)),
      )
  ).slice(0, searchingUsers ? 8 : PANEL_USERS_TAKE);
  const onlineUserIds = new Set(users.map((user) => Number(user.id)).filter((id) => Number.isFinite(id)));
  const activeThread = threads.find((thread) => thread.id === activeThreadId) || null;
  const threadOtherParticipant = (thread: ChatThread) =>
    thread.participants.find((participant) => participant.userId !== meId) || null;
  const threadUser = (thread: ChatThread): OnlineUser => {
    const participant = threadOtherParticipant(thread);
    const rawUser = participant?.user || null;
    const id = Number(participant?.userId ?? rawUser?.id ?? 0);
    return {
      id: Number.isFinite(id) && id > 0 ? Math.trunc(id) : thread.id,
      label: rawUser ? userLabel(rawUser) : thread.title,
      username: rawUser?.username ?? null,
      displayName: rawUser?.displayName ?? null,
      avatarUrl: rawUser?.avatarUrl ?? null,
      online: Number.isFinite(id) && onlineUserIds.has(Math.trunc(id)),
    };
  };
  const renderAvatar = (user: OnlineUser, withStatus = true) => (
    <div
      className="fcw-avatar"
      aria-hidden="true"
      style={{
        position: "relative",
        width: 26,
        height: 26,
        minWidth: 26,
        maxWidth: 26,
        flex: "0 0 26px",
        borderRadius: 999,
        overflow: "visible",
      }}
    >
      {withStatus && user.online ? (
        <i
          style={{
            position: "absolute",
            right: -1,
            bottom: -1,
            width: 8,
            height: 8,
            borderRadius: 999,
            background: "#22c55e",
            border: "2px solid #1a1a1a",
            zIndex: 2,
          }}
        />
      ) : null}
      {user.avatarUrl ? (
        <img
          src={user.avatarUrl}
          alt=""
          width={26}
          height={26}
          style={{
            width: 26,
            height: 26,
            minWidth: 26,
            maxWidth: 26,
            borderRadius: 999,
            objectFit: "cover",
            display: "block",
          }}
        />
      ) : (
        <div
          style={{
            width: 26,
            height: 26,
            minWidth: 26,
            maxWidth: 26,
            borderRadius: 999,
            background: "#3f3f46",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 900,
            lineHeight: 1,
          }}
        >
          {userLabel(user).slice(0, 1).toLocaleUpperCase("el")}
        </div>
      )}
    </div>
  );
  const renderThreadButton = (thread: ChatThread) => {
    const user = threadUser(thread);
    return (
      <button
        key={thread.id}
        type="button"
        className="fcw-person-row"
        onClick={() => void openThreadById(thread.id)}
        style={{
          display: "grid",
          gridTemplateColumns: "26px minmax(0, 1fr) auto",
          alignItems: "center",
          columnGap: 9,
        }}
      >
        {renderAvatar(user)}
        <div
          className="fcw-person-copy"
          style={{
            minWidth: 0,
            display: "grid",
            alignContent: "center",
            textAlign: "left",
          }}
        >
          <b>{userLabel(user)}</b>
          {thread.lastMessage?.body ? <small>{thread.lastMessage.body}</small> : null}
        </div>
        {thread.unreadCount ? <em>{thread.unreadCount}</em> : null}
      </button>
    );
  };
  const messageReceipt = (item: ChatMessage) => {
    if (!item.mine) return null;
    const senderUserId = Number(item.senderUserId ?? meId ?? 0);
    const createdAt = readTime(item.createdAt);
    const recipients =
      activeThread?.participants.filter((participant) => Number(participant.userId) !== senderUserId) ??
      Array.from({ length: Math.max(item.delivery?.recipientCount ?? 0, 0) }, (_, index) => ({
        userId: -index - 1,
        lastReadAt: null,
        user: { id: -index - 1, label: "" },
      }));

    if (!recipients.length) return { status: "sent" as const, label: "Στάλθηκε" };

    const readByCount = activeThread
      ? recipients.filter((participant) => readTime(participant.lastReadAt) >= createdAt).length
      : Math.max(item.delivery?.readByCount ?? 0, 0);

    if (readByCount >= recipients.length) {
      return {
        status: "read" as const,
        label: recipients.length === 1 ? "Διαβάστηκε" : `Διαβάστηκε ${readByCount}/${recipients.length}`,
      };
    }
    if (readByCount > 0) {
      return { status: "read-partial" as const, label: `Διαβάστηκε ${readByCount}/${recipients.length}` };
    }
    return { status: "delivered" as const, label: "Παραδόθηκε" };
  };

  return (
    <>
      {open ? (
        <section className="fcw-panel" aria-label="Chat">
          <header>
            <span className="fcw-title">
              <MessageCircle size={18} />
              <strong>Chat</strong>
            </span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Κλείσιμο">
              <X size={18} />
            </button>
          </header>

          <div className="fcw-body">
            {selected ? (
              <div className="fcw-chat-view">
                <div className="fcw-chatbar">
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(null);
                      setActiveThreadId(null);
                      setMessages([]);
                      setMessage("");
                    }}
                    aria-label="Πίσω"
                    title="Πίσω"
                  >
                    <ArrowLeft size={18} />
                  </button>
                  {selected.avatarUrl ? <img src={selected.avatarUrl} alt="" /> : <span>{userLabel(selected).slice(0, 1).toLocaleUpperCase("el")}</span>}
                  <strong>{userLabel(selected)}</strong>
                </div>

                <form className="fcw-composer" onSubmit={sendMessage}>
                  <div className="fcw-messages" aria-label="Πρόσφατα μηνύματα">
                    {loadingMessages ? <span className="fcw-muted">Φόρτωση συνομιλίας...</span> : null}
                    {!loadingMessages && !messages.length ? <span className="fcw-muted">Δεν υπάρχουν μηνύματα ακόμα.</span> : null}
                    {messages.map((item) => {
                      const receipt = messageReceipt(item);
                      return (
                        <div key={item.id} className={item.mine ? "mine" : ""}>
                          <small>{item.mine ? "Εσύ" : userLabel(selected)}</small>
                          <p>{item.body}</p>
                          {receipt ? (
                            <span className={`fcw-receipt ${receipt.status}`}>
                              <CheckCheck size={13} aria-hidden="true" />
                              {receipt.label}
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                  <div className="fcw-input-row">
                    <textarea
                      value={message}
                      onChange={(event) => setMessage(event.currentTarget.value)}
                      placeholder="Γράψε μήνυμα..."
                      rows={1}
                      disabled={sending}
                    />
                    <button
                      type="submit"
                      disabled={!message.trim() || sending}
                      aria-label={sending ? "Αποστολή..." : sent ? "Στάλθηκε" : "Αποστολή"}
                      title={sending ? "Αποστολή..." : sent ? "Στάλθηκε" : "Αποστολή"}
                    >
                      <Send size={17} />
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className={`fcw-menu ${searchingUsers ? "searching" : ""}`}>
                <label className="fcw-search" aria-label="Αναζήτηση χρήστη">
                  <Search size={15} />
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.currentTarget.value)}
                    placeholder="Αναζήτηση χρήστη..."
                  />
                </label>

                {pushPromptVisible ? (
                  <div className="fcw-push-prompt" role="status">
                    <Bell size={16} aria-hidden="true" />
                    <div>
                      <b>Ειδοποιήσεις chat</b>
                      <small>{pushError || "Ενεργοποίησε push για να βλέπεις νέα μηνύματα όταν η εφαρμογή είναι κλειστή."}</small>
                    </div>
                    <button type="button" onClick={() => void enableChatPush()} disabled={pushBusy}>
                      {pushBusy ? "..." : "Ενεργοποίηση"}
                    </button>
                    <button type="button" className="secondary" onClick={dismissChatPushPrompt}>
                      Όχι τώρα
                    </button>
                  </div>
                ) : null}

                {!searchingUsers && unreadThreads.length ? (
                  <div className="fcw-thread-list fcw-unread" aria-label="Νέα μηνύματα">
                    <strong>Νέα μηνύματα</strong>
                    {unreadThreads.slice(0, 5).map(renderThreadButton)}
                  </div>
                ) : null}

                {!searchingUsers && recentThreads.length ? (
                  <div className="fcw-thread-list" aria-label="Πρόσφατες συνομιλίες">
                    <strong>Πρόσφατες συνομιλίες</strong>
                    {recentThreads.map(renderThreadButton)}
                  </div>
                ) : null}

                <div className="fcw-section-title">{searchingUsers ? "Αποτελέσματα αναζήτησης" : "Online χρήστες"}</div>
                <div className={`fcw-users ${searchingUsers ? "search-results" : ""}`} aria-label={searchingUsers ? "Αποτελέσματα αναζήτησης" : "Online χρήστες"}>
                  {loadingUsers && !users.length && !searchingUsers ? <span className="fcw-muted">Φόρτωση online χρηστών...</span> : null}
                  {loadingSearchUsers && searchingUsers ? <span className="fcw-muted">Αναζήτηση χρηστών...</span> : null}
                  {!loadingUsers && !loadingSearchUsers && !visibleUsers.length ? (
                    <span className="fcw-muted">{searchingUsers ? "Δεν βρέθηκαν χρήστες." : "Δεν υπάρχουν άλλοι online χρήστες."}</span>
                  ) : null}
                  {visibleUsers.map((user) => (
                    <button
                      key={String(user.id)}
                      type="button"
                      className={user.online ? "" : "offline"}
                      onClick={() => void openConversation(user)}
                      title={userLabel(user)}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "26px minmax(0, 1fr)",
                        alignItems: "center",
                        columnGap: 9,
                      }}
                    >
                      {renderAvatar(user)}
                      <div
                        className="fcw-person-copy"
                        style={{
                          minWidth: 0,
                          display: "grid",
                          alignContent: "center",
                          textAlign: "left",
                        }}
                      >
                        <b>{userLabel(user)}</b>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error ? <button type="button" className="fcw-error" onClick={() => setError(null)}>{error}</button> : null}
          </div>
        </section>
      ) : null}

      {!open ? (
        <button
          ref={buttonRef}
          type="button"
          className={sent ? "fcw-button sent" : "fcw-button"}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onClick={handleButtonClick}
          style={{ transform: `translateX(${dragOffsetX}px)`, cursor: dragging ? "grabbing" : "grab" }}
          aria-label="Chat"
          title="Σύρε αριστερά ή πάτησε για chat"
        >
          <MessageCircle size={26} />
          {unreadTotal > 0 ? <span className="fcw-badge">{unreadTotal > 99 ? "99+" : unreadTotal}</span> : null}
        </button>
      ) : null}

      <style jsx>{`
        .fcw-button {
          position: fixed;
          z-index: 960;
          right: -30px;
          bottom: 96px;
          width: 64px;
          height: 58px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          border-right: 0;
          border-radius: 14px 0 0 14px;
          background: #f97316;
          color: #fff;
          display: inline-flex;
          align-items: center;
          justify-content: flex-start;
          padding-left: 13px;
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.42);
          touch-action: none;
          transition: transform 150ms ease, background 150ms ease;
        }

        .fcw-button.open {
          right: 10px;
          bottom: 96px;
          width: 44px;
          height: 44px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          justify-content: center;
          padding-left: 0;
          background: #c2410c;
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.34);
        }

        .fcw-button.sent {
          background: #22c55e;
        }

        .fcw-badge {
          position: absolute;
          top: -7px;
          left: 4px;
          min-width: 20px;
          height: 20px;
          border-radius: 999px;
          background: #dc2626;
          color: #fff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0 5px;
          font-size: 0.72rem;
          font-weight: 950;
          box-shadow: 0 0 0 2px #000;
        }

        .fcw-panel {
          position: fixed;
          right: 10px;
          bottom: 12px;
          z-index: 959;
          width: min(390px, calc(100vw - 24px));
          height: min(620px, calc(100dvh - 24px));
          overflow: hidden;
          overflow-x: hidden;
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 18px;
          background: #191919;
          color: #fff;
          box-shadow: 0 18px 50px rgba(0, 0, 0, 0.5);
          animation: fcw-slide-out 150ms ease-out;
          display: flex;
          flex-direction: column;
        }

        @keyframes fcw-slide-out {
          from {
            opacity: 0;
            transform: translateX(24px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
        }

        .fcw-panel header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 11px 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.12);
          background: linear-gradient(180deg, #242424, #1b1b1b);
          flex: 0 0 auto;
        }

        .fcw-title {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          color: #fff;
        }

        .fcw-panel header button,
        .fcw-error {
          border: 0;
          background: transparent;
          color: inherit;
          cursor: pointer;
        }

        .fcw-panel header button {
          width: 34px;
          height: 34px;
          min-height: 34px;
          padding: 0;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .fcw-body {
          min-height: 0;
          flex: 1 1 auto;
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 10px;
          overflow-x: hidden;
          overflow-y: hidden;
          overscroll-behavior: contain;
        }

        .fcw-menu,
        .fcw-chat-view {
          min-height: 0;
          flex: 1 1 auto;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .fcw-menu {
          overflow-y: auto;
          overflow-x: hidden;
          padding-right: 1px;
        }

        .fcw-menu.searching {
          overflow: visible;
        }

        .fcw-chatbar {
          flex: 0 0 auto;
          min-height: 46px;
          display: grid;
          grid-template-columns: 34px 34px minmax(0, 1fr);
          align-items: center;
          gap: 8px;
          padding: 5px 8px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 999px;
          background: #242424;
        }

        .fcw-chatbar button {
          width: 32px;
          height: 32px;
          min-height: 32px;
          padding: 0;
          border: 0;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.06);
          color: #fff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        .fcw-chatbar img,
        .fcw-chatbar span {
          width: 32px;
          height: 32px;
          border-radius: 999px;
          background: #444;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          object-fit: cover;
          font-weight: 900;
        }

        .fcw-chatbar strong {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .fcw-section-title {
          color: #d7d7d7;
          font-size: 0.82rem;
          font-weight: 900;
          padding: 2px 4px 0;
        }

        .fcw-menu.searching .fcw-section-title {
          color: #fed7aa;
        }

        .fcw-search {
          display: grid;
          grid-template-columns: 18px minmax(0, 1fr);
          align-items: center;
          gap: 6px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 10px;
          background: #101010;
          color: #d1d5db;
          padding: 0 9px;
          min-width: 0;
        }

        .fcw-search input {
          min-width: 0;
          width: 100%;
          border: 0;
          outline: 0;
          background: transparent;
          color: #fff;
          padding: 9px 0;
          font: inherit;
        }

        .fcw-push-prompt {
          flex: 0 0 auto;
          display: grid;
          grid-template-columns: 18px minmax(0, 1fr) auto auto;
          align-items: center;
          gap: 7px;
          border: 1px solid rgba(59, 130, 246, 0.34);
          border-radius: 12px;
          background: rgba(37, 99, 235, 0.13);
          color: #fff;
          padding: 7px 8px;
          min-width: 0;
        }

        .fcw-push-prompt > div {
          display: grid;
          gap: 1px;
          min-width: 0;
        }

        .fcw-push-prompt b,
        .fcw-push-prompt small {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .fcw-push-prompt b {
          font-size: 0.82rem;
          line-height: 1.15;
        }

        .fcw-push-prompt small {
          color: #dbeafe;
          font-size: 0.72rem;
          line-height: 1.15;
        }

        .fcw-push-prompt button {
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 999px;
          background: #2563eb;
          color: #fff;
          cursor: pointer;
          font-size: 0.72rem;
          font-weight: 900;
          padding: 5px 8px;
          white-space: nowrap;
        }

        .fcw-push-prompt button.secondary {
          background: transparent;
          color: #bfdbfe;
        }

        .fcw-push-prompt button:disabled {
          opacity: 0.65;
          cursor: wait;
        }

        .fcw-thread-list,
        .fcw-unread {
          flex: 0 0 auto;
          display: grid;
          gap: 6px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.035);
          padding: 8px;
          min-width: 0;
        }

        .fcw-unread {
          border-color: rgba(249, 115, 22, 0.38);
          background: rgba(124, 45, 18, 0.34);
        }

        .fcw-thread-list > strong,
        .fcw-unread > strong {
          color: #fed7aa;
          font-size: 0.86rem;
        }

        .fcw-person-row {
          position: relative;
          width: 100%;
          min-width: 0;
          min-height: 42px;
          display: grid;
          grid-template-columns: 26px minmax(0, 1fr) auto;
          align-items: center;
          gap: 9px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 11px;
          background: #2b2b2b;
          color: #fff;
          cursor: pointer;
          padding: 6px 8px;
          text-align: left;
          transition: border-color 140ms ease, background 140ms ease, transform 140ms ease;
        }

        .fcw-thread-list .fcw-person-row,
        .fcw-unread .fcw-person-row {
          border-color: rgba(251, 146, 60, 0.3);
          background: rgba(0, 0, 0, 0.18);
          border-radius: 12px;
        }

        .fcw-person-row:hover {
          border-color: rgba(249, 115, 22, 0.68);
          background: #35251b;
          transform: translateY(-1px);
        }

        .fcw-person-copy {
          display: grid;
          gap: 1px;
          min-width: 0;
          align-content: center;
        }

        .fcw-person-copy b,
        .fcw-person-copy small {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .fcw-person-copy b {
          max-width: 100%;
          color: #fff;
          font-size: 0.86rem;
          line-height: 1.15;
          text-align: left;
        }

        .fcw-person-copy small {
          color: #cfcfcf;
          font-size: 0.76rem;
          line-height: 1.18;
        }

        .fcw-unread small {
          color: #d6d3d1;
        }

        .fcw-thread-list em,
        .fcw-unread em {
          min-width: 22px;
          height: 22px;
          border-radius: 999px;
          background: #dc2626;
          color: #fff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-style: normal;
          font-size: 0.78rem;
          font-weight: 950;
        }

        .fcw-users {
          flex: 0 0 auto;
          display: grid;
          gap: 6px;
          max-height: 170px;
          overflow-y: auto;
          overflow-x: hidden;
          padding-bottom: 2px;
          scrollbar-width: thin;
        }

        .fcw-users.search-results {
          position: relative;
          z-index: 4;
          max-height: min(360px, calc(100dvh - 190px));
          padding: 8px;
          border: 1px solid rgba(249, 115, 22, 0.46);
          border-radius: 14px;
          background: #242424;
          box-shadow: 0 18px 38px rgba(0, 0, 0, 0.42), 0 0 0 1px rgba(255, 255, 255, 0.04) inset;
        }

        .fcw-users.search-results button {
          background: #303030;
          border-color: rgba(255, 255, 255, 0.16);
        }

        .fcw-users.search-results button:hover {
          border-color: rgba(249, 115, 22, 0.62);
          background: #3a2a20;
        }

        .fcw-users .fcw-person-row {
          border-radius: 12px;
          padding: 6px 8px;
        }

        .fcw-users .fcw-person-row.selected {
          border-color: #fb923c;
          background: #4a2512;
        }

        .fcw-avatar {
          position: relative;
          width: 24px !important;
          height: 24px !important;
          min-width: 24px !important;
          max-width: 24px !important;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #444;
          color: #fff;
          font-weight: 900;
          flex: 0 0 auto;
        }

        .fcw-avatar i {
          position: absolute;
          left: -1px;
          top: 0;
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: #22c55e;
          box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.18);
          z-index: 1;
        }

        .fcw-avatar img,
        .fcw-avatar > div {
          width: 24px !important;
          height: 24px !important;
          min-width: 24px !important;
          max-width: 24px !important;
          border-radius: 999px;
          background: #444;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          object-fit: cover;
          font-weight: 900;
          font-size: 0.7rem;
          line-height: 1;
        }

        .fcw-avatar img {
          display: block;
        }

        .fcw-muted,
        .fcw-target {
          color: #c8c8c8;
          font-size: 0.88rem;
        }

        .fcw-target {
          flex: 0 0 auto;
          padding: 0 2px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .fcw-messages {
          min-height: 0;
          flex: 1 1 auto;
          display: flex;
          flex-direction: column;
          gap: 6px;
          justify-content: flex-end;
          overflow: auto;
          overflow-x: hidden;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 14px;
          background:
            radial-gradient(circle at 12% 8%, rgba(249, 115, 22, 0.08), transparent 30%),
            #101010;
          padding: 10px;
        }

        .fcw-messages div {
          max-width: 88%;
          border-radius: 15px 15px 15px 5px;
          background: #2b2b2b;
          padding: 7px 10px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.16);
        }

        .fcw-messages div.mine {
          align-self: flex-end;
          border-radius: 15px 15px 5px 15px;
          background: #f97316;
          color: #fff;
        }

        .fcw-messages small {
          color: #d6d3d1;
          font-size: 0.72rem;
        }

        .fcw-messages p {
          margin: 2px 0 0;
          overflow-wrap: anywhere;
          white-space: pre-wrap;
          line-height: 1.28;
        }

        .fcw-receipt {
          display: inline-flex;
          align-items: center;
          justify-content: flex-end;
          gap: 3px;
          width: 100%;
          margin-top: 3px;
          color: rgba(255, 255, 255, 0.76);
          font-size: 0.68rem;
          font-weight: 800;
          line-height: 1;
        }

        .fcw-receipt.read,
        .fcw-receipt.read-partial {
          color: #bbf7d0;
        }

        .fcw-composer {
          min-height: 0;
          flex: 1 1 auto;
          display: flex;
          flex-direction: column;
          gap: 7px;
          margin-top: auto;
        }

        .fcw-input-row {
          flex: 0 0 auto;
          margin-top: auto;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 42px;
          align-items: end;
          gap: 8px;
          padding: 7px;
          border-radius: 999px;
          background: #101010;
          border: 1px solid rgba(255, 255, 255, 0.14);
        }

        .fcw-input-row textarea {
          width: 100%;
          box-sizing: border-box;
          resize: none;
          min-height: 36px;
          max-height: 92px;
          border: 0;
          outline: 0;
          border-radius: 18px;
          background: transparent;
          color: #fff;
          padding: 8px 10px;
          font: inherit;
          line-height: 1.25;
          overflow-y: auto;
        }

        .fcw-input-row button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 38px;
          height: 38px;
          min-height: 38px;
          padding: 0;
          border: 1px solid #f97316;
          border-radius: 999px;
          background: #f97316;
          color: #fff;
          font-weight: 900;
          cursor: pointer;
          box-shadow: 0 6px 16px rgba(249, 115, 22, 0.28);
        }

        .fcw-input-row button:disabled,
        .fcw-input-row textarea:disabled {
          opacity: 0.62;
          cursor: not-allowed;
        }

        .fcw-error {
          text-align: left;
          color: #fecaca;
          background: rgba(127, 29, 29, 0.42);
          border-radius: 9px;
          padding: 8px;
        }

        @media (max-width: 640px) {
          .fcw-panel {
            right: 10px;
            bottom: 10px;
            width: calc(100vw - 20px);
            height: min(620px, calc(100dvh - 20px));
          }

          .fcw-body {
            max-height: none;
          }
        }
      `}</style>
    </>
  );
}
