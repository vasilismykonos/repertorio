// apps/web/app/assets/[id]/edit/AssetEditPageClient.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Music2, List as ListIcon, Layers } from "lucide-react";

import ActionBar from "@/app/components/ActionBar";
import { A } from "@/app/components/buttons";

import AssetForm, {
  type AssetForEdit,
  type AssetAttachTarget,
  type AssetSaveResult,
} from "../../AssetForm";

type Props = {
  idNum: number;
  asset: AssetForEdit;
};

async function readAny(res: Response) {
  const t = await res.text().catch(() => "");
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return t;
  }
}

function cleanParam(v: string | null): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower === "undefined" || lower === "null") return null;
  return s;
}

function toPosInt(v: string | null): number | null {
  const s = cleanParam(v);
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

function contextIcon(ctx: AssetAttachTarget) {
  if (ctx.kind === "SONG") return <Music2 size={16} />;
  if (ctx.kind === "LIST") return <ListIcon size={16} />;
  return <Layers size={16} />;
}

function contextLabel(ctx: AssetAttachTarget) {
  if (ctx.kind === "SONG") {
    const t = ctx.title ? ` — ${ctx.title}` : "";
    return `Τραγούδι ${t}`;
  }
  if (ctx.kind === "LIST") {
    const t = ctx.title ? ` — ${ctx.title}` : "";
    return `Λίστα ${t}`;
  }
  if (ctx.kind === "LIST_ITEM") {
    const t = ctx.title ? ` — ${ctx.title}` : "";
    return `Τραγούδι λίστας ${t}`;
  }
  const t = ctx.title ? ` — ${ctx.title}` : "";
  return `Ομάδα λίστας ${t}`;
}

/**
 * Θέλουμε “πίσω εκεί που κλήθηκε”.
 *
 * Σειρά προτεραιότητας:
 * 1) returnTo query param (όταν ο caller το δίνει ρητά)
 * 2) history.back() (όταν υπάρχει πραγματικό navigation history)
 * 3) referrer (ίδιο origin)
 * 4) /assets
 */
export default function AssetEditPageClient({ idNum, asset }: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  const returnToParam = useMemo(() => cleanParam(sp.get("returnTo")), [sp]);
  const [referrerPath, setReferrerPath] = useState<string | null>(null);

  useEffect(() => {
    if (returnToParam) return;

    try {
      const ref = document.referrer || "";
      if (!ref) return;

      const refUrl = new URL(ref);
      if (refUrl.origin !== window.location.origin) return;

      const path = `${refUrl.pathname}${refUrl.search}${refUrl.hash}`;
      const cur = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (!path || path === cur) return;

      setReferrerPath(path);
    } catch {
      // ignore
    }
  }, [returnToParam]);

  const attachToFromQuery = useMemo<AssetAttachTarget | null>(() => {
    const songId = toPosInt(sp.get("songId"));
    if (songId) {
      return {
        kind: "SONG",
        songId,
        title: cleanParam(sp.get("songTitle")),
        slug: cleanParam(sp.get("songSlug")),
      };
    }

    const listId = toPosInt(sp.get("listId"));
    if (listId) {
      return {
        kind: "LIST",
        listId,
        title: cleanParam(sp.get("listTitle")),
      };
    }

    const listItemId = toPosInt(sp.get("listItemId"));
    if (listItemId) {
      return {
        kind: "LIST_ITEM",
        listItemId,
        title: cleanParam(sp.get("listItemTitle")),
      };
    }

    const listGroupId = toPosInt(sp.get("listGroupId"));
    if (listGroupId) {
      return {
        kind: "LIST_GROUP",
        listGroupId,
        title: cleanParam(sp.get("listGroupTitle")),
      };
    }

    return null;
  }, [sp]);

  const attachTo = useMemo<AssetAttachTarget | null>(() => {
    if (attachToFromQuery) return attachToFromQuery;

    const songs = asset?.songs ?? [];
    if (Array.isArray(songs) && songs.length === 1) {
      const s = songs[0];
      const sid = Number((s as any)?.id);
      if (Number.isFinite(sid) && sid > 0) {
        return {
          kind: "SONG",
          songId: sid,
          title: (s as any)?.title ?? null,
          slug: (s as any)?.slug ?? null,
        };
      }
    }

    return null;
  }, [attachToFromQuery, asset?.songs]);

  const backLabel = attachTo?.kind === "SONG" ? "Τραγούδι" : "Υλικό";

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const busy = saving || deleting;

  const backHref = useMemo(() => {
    return returnToParam || referrerPath || "/assets";
  }, [returnToParam, referrerPath]);

  function goBack() {
    if (busy) return;

    if (returnToParam) {
      router.push(returnToParam);
      return;
    }

    try {
      if (typeof window !== "undefined" && window.history.length > 1) {
        router.back();
        return;
      }
    } catch {
      // ignore
    }

    router.push(referrerPath || "/assets");
  }

  function onSaveClick() {
    window.dispatchEvent(new CustomEvent("asset:submit"));
  }

  async function persistForm(fd: FormData): Promise<AssetSaveResult> {
    const res = await fetch(`/api/assets/${idNum}/full`, {
      method: "PATCH",
      body: fd,
    });

    const data = await readAny(res);

    if (!res.ok) {
      return {
        ok: false,
        error: data?.message || String(data) || "Αποτυχία",
      };
    }

    return { ok: true, asset: data };
  }

  async function onDelete() {
    if (busy) return;
    if (!confirm("Σίγουρα διαγραφή;")) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/assets/${idNum}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await readAny(res);
        throw new Error(data?.message || String(data) || "Delete failed");
      }

      // ✅ ΜΗΝ κάνεις goBack() εδώ. Πήγαινε ρητά εκεί που θες και μετά refresh.
      const target = returnToParam || referrerPath || "/assets";
      router.replace(target);
      router.refresh();
    } catch (e: any) {
      alert(e?.message || "Σφάλμα στη διαγραφή");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div style={{ padding: "0 16px 40px", maxWidth: 760, margin: "0 auto" }}>
      <ActionBar
        left={
          <>
            {A.backLink({
              href: backHref,
              title: backLabel,
              label: backLabel,
            })}
          </>
        }
        right={
          <>
            {A.cancel({
              disabled: busy,
              onClick: goBack,
              title: "Ακύρωση",
              label: "Ακύρωση",
            })}

            {A.save({
              disabled: busy,
              loading: saving,
              onClick: onSaveClick,
              title: "Αποθήκευση",
              label: "Αποθήκευση",
              loadingLabel: "Αποθήκευση...",
            })}

            {A.del({
              disabled: busy,
              loading: deleting,
              onClick: onDelete,
              title: "Διαγραφή",
              label: "Διαγραφή",
              loadingLabel: "Διαγραφή...",
            })}
          </>
        }
      />

      {attachTo ? (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.05)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ display: "inline-flex", opacity: 0.9 }}>
            {contextIcon(attachTo)}
          </span>
          <div style={{ display: "grid", gap: 2 }}>
            <div style={{ opacity: 0.9 }}>{contextLabel(attachTo)}</div>
          </div>
        </div>
      ) : null}

      <div
        style={{
          marginTop: 16,
          padding: 24,
          borderRadius: 14,
          background: "var(--card-bg, #111)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
        }}
      >
        <AssetForm
          initial={asset}
          saving={saving}
          setSaving={setSaving}
          persist={persistForm}
          attachTo={attachTo}
          afterSave={() => {
            // ✅ μετά το save: ίδιο “target” και refresh
            const target = returnToParam || referrerPath || "/assets";
            router.replace(target);
            router.refresh();
          }}
        />
      </div>
    </div>
  );
}