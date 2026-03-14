// apps/web/app/assets/page.tsx
import React from "react";
import { headers } from "next/headers";

import AssetsPageClient from "./AssetsPageClient";

type SearchParams = {
  q?: string;
  kind?: string;
  type?: string;
  unlinked?: string;
  page?: string;
  pageSize?: string;
};

type Props = {
  searchParams?: SearchParams;
};

async function readAny(res: Response) {
  const t = await res.text().catch(() => "");
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return t;
  }
}

function getBaseUrlFromHeaders(): string {
  const h = headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${proto}://${host}`;
}

export default async function AssetsPage({ searchParams }: Props) {
  const sp = searchParams ?? {};

  const q = String(sp.q ?? "").trim();
  const kind = String(sp.kind ?? "").trim();
  const type = String(sp.type ?? "").trim();
  const unlinked = String(sp.unlinked ?? "").trim();

  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(sp.pageSize ?? 50) || 50));

  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (kind) qs.set("kind", kind);
  if (type) qs.set("type", type);
  if (unlinked) qs.set("unlinked", unlinked);
  qs.set("page", String(page));
  qs.set("pageSize", String(pageSize));

  const h = headers();
  const base = getBaseUrlFromHeaders();
  const url = new URL(`/api/assets?${qs.toString()}`, base).toString();

  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      cookie: h.get("cookie") ?? "",
    },
  });

  const data = await readAny(res);
  if (!res.ok) {
    throw new Error(data?.message || String(data) || `API error ${res.status}`);
  }

  return (
    <AssetsPageClient
      initialQuery={{ q, kind, type, unlinked, page }}
      data={data as any}
    />
  );
}