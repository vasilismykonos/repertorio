import React from "react";
import { notFound } from "next/navigation";
import { headers } from "next/headers";

import AssetEditPageClient from "./AssetEditPageClient";

type Props = {
  params: { id: string };
};

async function readAny(res: Response) {
  const t = await res.text().catch(() => "");
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return t;
  }
}

export default async function AssetEditPage({ params }: Props) {
  const idNum = Number(params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) notFound();
  // On the server we need an absolute URL otherwise undici fails to parse relative URLs.
  // Build the base URL from incoming headers (supports proxies).
  function getBaseUrlFromHeaders() {
    const h = headers();
    const proto = h.get("x-forwarded-proto") ?? "http";
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (!host) return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    return `${proto}://${host}`;
  }

  const h = headers();
  const base = getBaseUrlFromHeaders();
  const url = new URL(`/api/assets/${idNum}`, base).toString();
  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      // forward cookies for authenticated endpoints
      cookie: h.get("cookie") ?? "",
    },
  });

  if (!res.ok) {
    if (res.status === 404) notFound();
    const data = await readAny(res);
    throw new Error(data?.message || String(data) || `API error ${res.status}`);
  }

  const asset = await res.json();
  return <AssetEditPageClient idNum={idNum} asset={asset as any} />;
}