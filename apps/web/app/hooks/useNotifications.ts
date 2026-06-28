"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const OPEN_NOTIFICATIONS_EVENT = "rep:openNotifications";
export const NOTIFICATIONS_CHANGED_EVENT = "rep:notificationsChanged";

export type NotificationItem = {
  id: number;
  type: string;
  title: string;
  body: string | null;
  data: any;
  readAt: string | null;
  createdAt: string;
  actor?: {
    id: number;
    displayName: string | null;
    username: string | null;
    email: string | null;
    avatarUrl: string | null;
  } | null;
};

type NotificationsResponse = {
  ok: boolean;
  authenticated?: boolean;
  unreadCount?: number;
  items?: NotificationItem[];
  error?: string;
};

type UseNotificationsOptions = {
  enabled: boolean;
  take?: number;
  pollMs?: number;
  notifyOnNew?: boolean;
};

type PushPermissionState = NotificationPermission | "unsupported";

function urlBase64ToArrayBuffer(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) output[i] = rawData.charCodeAt(i);
  return output.buffer as ArrayBuffer;
}

export function notificationHref(item: NotificationItem): string | null {
  const href = item?.data?.href;
  return typeof href === "string" && href.startsWith("/") ? href : null;
}

export function formatNotificationDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("el-GR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function hasNotificationApi() {
  return typeof window !== "undefined" && "Notification" in window;
}

async function savePushSubscription(subscription: PushSubscription) {
  const saveRes = await fetch("/api/notifications/push", {
    method: "POST",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
  const saveData = await saveRes.json().catch(() => null);
  if (!saveRes.ok || !saveData?.ok) throw new Error(saveData?.error || "push subscribe failed");
  return saveData;
}

function notifyItem(item: NotificationItem) {
  if (!hasNotificationApi() || window.Notification.permission !== "granted") return;

  try {
    const notification = new window.Notification(item.title || "Νέα ενημέρωση", {
      body: item.body || undefined,
      icon: "/images/default-logo.png",
      badge: "/images/default-logo.png",
      tag: `repertorio-notification-${item.id}`,
    });

    const href = notificationHref(item);
    if (href) {
      notification.onclick = () => {
        window.focus();
        window.location.href = href;
      };
    }
  } catch {
    // Native notifications are best-effort and must never affect app flow.
  }
}

export function useNotifications({
  enabled,
  take = 8,
  pollMs = 45_000,
  notifyOnNew = false,
}: UseNotificationsOptions) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushPermission, setPushPermission] = useState<PushPermissionState>("unsupported");
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const seenIdsRef = useRef<Set<number>>(new Set());
  const initializedRef = useRef(false);
  const enabledRef = useRef(enabled);
  const takeRef = useRef(take);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    takeRef.current = take;
  }, [take]);

  const applyResponse = useCallback(
    (data: NotificationsResponse) => {
      const nextItems = Array.isArray(data.items) ? data.items : [];
      const nextUnread = Math.max(0, Number(data.unreadCount || 0));

      if (notifyOnNew && initializedRef.current) {
        const newUnreadItems = nextItems.filter(
          (item) => !item.readAt && !seenIdsRef.current.has(item.id),
        );
        for (const item of newUnreadItems) notifyItem(item);
      }

      seenIdsRef.current = new Set(nextItems.map((item) => item.id));
      initializedRef.current = true;
      setUnreadCount(nextUnread);
      setItems(nextItems);
      setError(null);
    },
    [notifyOnNew],
  );

  const refresh = useCallback(async () => {
    if (!enabledRef.current) {
      setItems([]);
      setUnreadCount(0);
      setLoading(false);
      setError(null);
      initializedRef.current = false;
      seenIdsRef.current = new Set();
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`/api/notifications?take=${takeRef.current}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const data = (await res.json().catch(() => null)) as NotificationsResponse | null;
      if (!res.ok || !data?.ok) throw new Error(data?.error || `notifications ${res.status}`);
      applyResponse(data);
    } catch {
      setItems([]);
      setUnreadCount(0);
      setError("Δεν φορτώθηκαν οι ενημερώσεις.");
    } finally {
      setLoading(false);
    }
  }, [applyResponse]);

  const markAllRead = useCallback(async () => {
    if (!enabledRef.current || unreadCount <= 0) return;

    const readAt = new Date().toISOString();
    setUnreadCount(0);
    setItems((current) =>
      current.map((item) => (item.readAt ? item : { ...item, readAt })),
    );

    try {
      setLoading(true);
      const res = await fetch("/api/notifications", {
        method: "POST",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const data = (await res.json().catch(() => null)) as NotificationsResponse | null;
      if (!res.ok || !data?.ok) throw new Error(data?.error || `notifications ${res.status}`);
      applyResponse(data);
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
    } catch {
      setError("Δεν έγινε σήμανση ως διαβασμένα.");
      void refresh();
    } finally {
      setLoading(false);
    }
  }, [applyResponse, refresh, unreadCount]);

  const requestBrowserPermission = useCallback(async () => {
    if (!hasNotificationApi()) return "unsupported";
    if (window.Notification.permission !== "default") return window.Notification.permission;
    try {
      return await window.Notification.requestPermission();
    } catch {
      return window.Notification.permission;
    }
  }, []);

  const refreshPushStatus = useCallback(async () => {
    if (typeof window === "undefined") return;
    const supported =
      hasNotificationApi() &&
      "serviceWorker" in navigator &&
      "PushManager" in window;

    setPushSupported(supported);
    setPushPermission(supported ? window.Notification.permission : "unsupported");

    if (!supported || !enabledRef.current) {
      setPushSubscribed(false);
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setPushSubscribed(Boolean(subscription));
      if (subscription && window.Notification.permission === "granted") {
        await savePushSubscription(subscription).catch(() => null);
      }
    } catch {
      setPushSubscribed(false);
    }
  }, []);

  const enablePushNotifications = useCallback(async () => {
    setPushError(null);
    if (typeof window === "undefined") return false;
    if (!enabledRef.current) {
      setPushError("Χρειάζεται σύνδεση χρήστη.");
      return false;
    }
    if (!hasNotificationApi() || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushError("Η συσκευή δεν υποστηρίζει push ειδοποιήσεις.");
      setPushSupported(false);
      setPushPermission("unsupported");
      return false;
    }

    try {
      setPushBusy(true);
      const permission =
        window.Notification.permission === "default"
          ? await window.Notification.requestPermission()
          : window.Notification.permission;
      setPushPermission(permission);
      if (permission !== "granted") {
        setPushError("Δεν δόθηκε άδεια ειδοποιήσεων.");
        return false;
      }

      const keyRes = await fetch("/api/notifications/push", {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const keyData = await keyRes.json().catch(() => null);
      const publicKey = String(keyData?.publicKey || "");
      if (!keyRes.ok || !keyData?.enabled || !publicKey) {
        setPushError("Οι push ειδοποιήσεις δεν είναι διαθέσιμες στον server.");
        return false;
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

      setPushSubscribed(true);
      return true;
    } catch {
      setPushError("Δεν ενεργοποιήθηκαν οι push ειδοποιήσεις.");
      return false;
    } finally {
      setPushBusy(false);
    }
  }, []);

  const disablePushNotifications = useCallback(async () => {
    setPushError(null);
    if (typeof window === "undefined") return false;
    if (!("serviceWorker" in navigator)) return false;

    try {
      setPushBusy(true);
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      const endpoint = subscription?.endpoint || "";

      if (endpoint) {
        await fetch("/api/notifications/push", {
          method: "DELETE",
          cache: "no-store",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ endpoint }),
        }).catch(() => null);
      }

      await subscription?.unsubscribe().catch(() => false);
      setPushSubscribed(false);
      return true;
    } catch {
      setPushError("Δεν απενεργοποιήθηκαν οι push ειδοποιήσεις.");
      return false;
    } finally {
      setPushBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setItems([]);
      setUnreadCount(0);
      setLoading(false);
      setError(null);
      initializedRef.current = false;
      seenIdsRef.current = new Set();
      return;
    }

    void refresh();
    const id = window.setInterval(refresh, pollMs);

    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onChanged = () => {
      void refresh();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    };
  }, [enabled, pollMs, refresh]);

  useEffect(() => {
    void refreshPushStatus();
  }, [enabled, refreshPushStatus]);

  return {
    items,
    unreadCount,
    loading,
    error,
    refresh,
    markAllRead,
    requestBrowserPermission,
    pushSupported,
    pushPermission,
    pushSubscribed,
    pushBusy,
    pushError,
    refreshPushStatus,
    enablePushNotifications,
    disablePushNotifications,
  };
}
