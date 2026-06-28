import React from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

type Props = {
  params: { id: string };
  searchParams?: { returnTo?: string };
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
  const firstHeaderValue = (value: string | null | undefined) =>
    String(value || "")
      .split(",")[0]
      .trim();

  const proto = firstHeaderValue(h.get("x-forwarded-proto")) || "http";
  const host = firstHeaderValue(h.get("x-forwarded-host")) || firstHeaderValue(h.get("host"));
  if (!host) return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${proto}://${host}`;
}

function cleanReturnTo(value: string | undefined, fallback: string) {
  const raw = String(value || "").trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return fallback;
  return raw;
}

export default async function NotationEditorPage({ params, searchParams }: Props) {
  const assetId = Number(params.id);
  if (!Number.isInteger(assetId) || assetId <= 0) notFound();

  const base = getBaseUrlFromHeaders();
  const h = headers();
  const res = await fetch(new URL(`/api/assets/${assetId}`, base).toString(), {
    cache: "no-store",
    headers: { cookie: h.get("cookie") ?? "" },
  });
  if (res.status === 404) notFound();
  const asset = await readAny(res);
  if (!res.ok) throw new Error(asset?.message || String(asset) || `API error ${res.status}`);

  const returnTo = cleanReturnTo(searchParams?.returnTo, `/assets/${assetId}/edit`);
  const title = String(asset?.title || `Παρτιτούρα #${assetId}`);
  const editorSrc = `/smoosic/repertorio-editor.html?assetId=${assetId}&returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <section style={{ minHeight: "calc(100vh - 80px)", padding: "10px 10px 16px" }}>
      <div
        style={{
          maxWidth: 1500,
          margin: "0 auto",
          display: "grid",
          gap: 10,
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.62)", fontWeight: 800 }}>
              Επεξεργαστής παρτιτούρας
            </div>
            <h1
              style={{
                margin: 0,
                fontSize: "clamp(22px, 3vw, 34px)",
                lineHeight: 1.05,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={title}
            >
              {title}
            </h1>
          </div>
          <Link
            href={returnTo}
            style={{
              color: "#fff",
              textDecoration: "none",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 8,
              padding: "9px 12px",
              fontWeight: 900,
              background: "#111",
            }}
          >
            Πίσω
          </Link>
        </header>

        <iframe
          src={editorSrc}
          title={`Επεξεργασία παρτιτούρας ${title}`}
          style={{
            width: "100%",
            height: "calc(100vh - 158px)",
            minHeight: 620,
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 10,
            background: "#fff",
          }}
          allow="clipboard-read; clipboard-write"
        />
      </div>
    </section>
  );
}
