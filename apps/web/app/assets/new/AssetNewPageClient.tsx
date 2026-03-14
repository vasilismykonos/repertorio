// apps/web/app/assets/new/AssetNewPageClient.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import ActionBar from "@/app/components/ActionBar";
import { A } from "@/app/components/buttons";
import Button from "@/app/components/buttons/Button";

import AssetForm, {
  type AssetAttachTarget,
  type AssetForEdit,
  type AssetSaveResult,
} from "../AssetForm";

const empty: AssetForEdit = {
  id: null,
  kind: "FILE",
  type: "PDF",
  title: "",
  url: "",
  filePath: "",
  mimeType: "",
  sizeBytes: "",
  songs: [],
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

export default function AssetNewPageClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const attachTo = useMemo<AssetAttachTarget | null>(() => {
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

  const [saving, setSaving] = useState(false);

  const backHref = useMemo(() => {
    return returnToParam || referrerPath || "/assets";
  }, [returnToParam, referrerPath]);

  function goBack() {
    if (saving) return;

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

  async function persistForm(fd: FormData): Promise<AssetSaveResult> {
    const res = await fetch(`/api/assets/full`, { method: "POST", body: fd });
    const data = await readAny(res);
    if (!res.ok) return { ok: false, error: data?.message || String(data) || "Αποτυχία" };
    return { ok: true, asset: data };
  }

  return (
    <section style={{ padding: "0px 10px", maxWidth: 980, margin: "0 auto" }}>
      <ActionBar
        left={
          <>
            {A.backLink({
              href: backHref,
              title: "Πίσω",
              label: "Πίσω",
            })}
          </>
        }
        right={
          <>
            {A.cancel({
              disabled: saving,
              onClick: goBack,
              title: "Ακύρωση",
              label: "Ακύρωση",
            })}

            <Button
              disabled={saving}
              onClick={() => {
                const ev = new CustomEvent("asset:submit");
                window.dispatchEvent(ev);
              }}
            >
              Αποθήκευση
            </Button>
          </>
        }
      />

      <AssetForm
        initial={empty}
        saving={saving}
        setSaving={setSaving}
        persist={persistForm}
        attachTo={attachTo}
        afterSave={() => {
          // ✅ Μετά το create: γύρνα εκεί που σε κάλεσαν (returnTo/referrer/assets)
          router.push(backHref);
          router.refresh();
        }}
      />
    </section>
  );
}