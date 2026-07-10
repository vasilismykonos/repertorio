"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";

import { Button } from "@/app/components/buttons";

type SealabsCandidate = {
  title: string;
  sourceUrl: string;
  composers?: string[];
  lyricists?: string[];
  singers?: string[];
  years?: string[];
  catalogNumbers?: string[];
  infoLines?: string[];
  recordings: number;
};

type SealabsResponse = {
  source: string;
  sealabsComposer: {
    value: string;
    label: string;
  };
  sealabsUrl: string;
  totals: {
    sealabsRows: number;
    sealabsUniqueTitles: number;
    repertorioSongsChecked: number;
    existingHidden: number;
    missingCandidates: number;
  };
  candidates: SealabsCandidate[];
};

type Props = {
  artistId: number;
};

function join(values?: string[], empty = "—") {
  const clean = (values ?? []).map((value) => value.trim()).filter(Boolean);
  return clean.length ? clean.join(", ") : empty;
}

function createSongHref(item: SealabsCandidate): string {
  const params = new URLSearchParams();
  params.set("title", item.title);

  const composerName = (item.composers ?? []).map((value) => value.trim()).filter(Boolean).join(", ");
  const lyricistName = (item.lyricists ?? []).map((value) => value.trim()).filter(Boolean).join(", ");

  if (composerName) params.set("composerName", composerName);
  if (lyricistName) params.set("lyricistName", lyricistName);
  if (item.sourceUrl) params.set("sourceUrl", item.sourceUrl);

  return `/songs/new?${params.toString()}`;
}

export default function SealabsComposerSongsClient({ artistId }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<SealabsResponse | null>(null);

  async function load() {
    if (loading) return;
    if (data) {
      setOpen((value) => !value);
      return;
    }

    setOpen(true);
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/artists/${artistId}/sealabs-composer-songs`, {
        cache: "no-store",
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.message || `Αποτυχία ελέγχου Sealabs (${res.status})`);
      }
      setData(body as SealabsResponse);
    } catch (err: any) {
      setError(err?.message || "Αποτυχία ελέγχου Sealabs.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <Button
        type="button"
        variant="secondary"
        action="search"
        onClick={load}
        disabled={loading}
        title="Έλεγχος τραγουδιών συνθέτη στο rebetiko.sealabs.net"
        showLabel
      >
        {loading ? "Έλεγχος Sealabs..." : data && open ? "Κλείσιμο Sealabs" : "Έλεγχος Sealabs"}
      </Button>

      {open ? (
        <div
          style={{
            marginTop: 12,
            border: "1px solid #2d3748",
            borderRadius: 12,
            background: "#101418",
            padding: 14,
          }}
        >
          {error ? (
            <div style={{ color: "#ffb4b4", fontWeight: 700 }}>{error}</div>
          ) : loading ? (
            <div style={{ color: "#ccc" }}>Ανάγνωση Sealabs και σύγκριση με Repertorio...</div>
          ) : data ? (
            <>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                  marginBottom: 12,
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>Υποψήφιες ελλείψεις από Sealabs</div>
                  <div style={{ color: "#aaa", fontSize: 13, marginTop: 4 }}>
                    Συνθέτης Sealabs: <strong>{data.sealabsComposer.label}</strong>
                  </div>
                  <div style={{ color: "#aaa", fontSize: 13, marginTop: 4 }}>
                    Γραμμές Sealabs: {data.totals.sealabsRows} · Μοναδικοί τίτλοι:{" "}
                    {data.totals.sealabsUniqueTitles} · Κρυμμένα ως υπάρχοντα:{" "}
                    {data.totals.existingHidden}
                  </div>
                </div>
                <a
                  href={data.sealabsUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "#66c2ff", fontWeight: 800, textDecoration: "none" }}
                >
                  Άνοιγμα Sealabs <ExternalLink size={14} style={{ verticalAlign: "-2px" }} />
                </a>
              </div>

              {data.candidates.length === 0 ? (
                <div style={{ color: "#ccc" }}>
                  Δεν βρέθηκαν υποψήφιες ελλείψεις. Όσα επέστρεψε το Sealabs φαίνεται να υπάρχουν ήδη στη
                  βάση.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {data.candidates.map((item) => (
                    <article
                      key={`${item.title}-${item.sourceUrl}`}
                      style={{
                        border: "1px solid #30363d",
                        borderRadius: 10,
                        padding: 12,
                        background: "#151a20",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 900, fontSize: 15 }}>{item.title}</div>
                          <div style={{ color: "#c7c7c7", fontSize: 13, marginTop: 5 }}>
                            Συνθέτης: {join(item.composers)} · Στιχουργός: {join(item.lyricists)}
                          </div>
                          <div style={{ color: "#aaa", fontSize: 13, marginTop: 4 }}>
                            Ερμηνεία: {join(item.singers)} · Έτη: {join(item.years)}
                          </div>
                          {item.infoLines?.length ? (
                            <div style={{ color: "#8fa3b8", fontSize: 12, marginTop: 6 }}>
                              {item.infoLines.slice(0, 2).join(" ")}
                            </div>
                          ) : null}
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ color: "#aaa", fontSize: 12, marginBottom: 8 }}>
                            {item.recordings} εγγραφές
                          </div>
                          <a
                            href={createSongHref(item)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              minHeight: 34,
                              padding: "0 12px",
                              borderRadius: 8,
                              background: "#0d6efd",
                              color: "#fff",
                              fontWeight: 900,
                              textDecoration: "none",
                              marginBottom: 8,
                            }}
                          >
                            Προσθήκη
                          </a>
                          <br />
                          <a
                            href={item.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: "#66c2ff", fontWeight: 800, textDecoration: "none" }}
                          >
                            Πηγή
                          </a>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
