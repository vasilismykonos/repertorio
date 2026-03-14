// apps/web/app/assets/shared/AssetEditPageClient.tsx
"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ActionBar from "@/app/components/ActionBar";
import { A } from "@/app/components/buttons";
import Button from "@/app/components/buttons/Button";
import { Save, Trash2, Upload } from "lucide-react";

type Props = {
  mode: "create" | "edit";
  asset: any | null;
};

function cleanText(v: any) {
  return String(v ?? "").trim().replace(/\s+/g, " ");
}

export default function AssetEditPageClient({ mode, asset }: Props) {
  const router = useRouter();

  const [kind, setKind] = useState<"FILE" | "LINK">(asset?.kind === "LINK" ? "LINK" : "FILE");
  const [type, setType] = useState<string>(String(asset?.type ?? "GENERIC"));
  const [title, setTitle] = useState<string>(asset?.title ?? "");
  const [url, setUrl] = useState<string>(asset?.url ?? "");
  const [filePath, setFilePath] = useState<string>(asset?.filePath ?? "");
  const [file, setFile] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);

  const canDelete = mode === "edit" && asset?.id;

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      // multipart
      const fd = new FormData();
      fd.set("kind", kind);
      fd.set("type", cleanText(type) || "GENERIC");
      fd.set("title", cleanText(title) || "");

      if (kind === "LINK") {
        const u = cleanText(url);
        if (!u) {
          alert("Βάλε URL");
          return;
        }
        fd.set("url", u);
      } else {
        // FILE
        // αν είναι create -> απαιτείται file
        // αν είναι edit -> file optional (αλλιώς κρατάμε παλιό filePath)
        if (mode === "create" && !file) {
          alert("Διάλεξε αρχείο για upload");
          return;
        }
        if (file) fd.set("file", file);

        // κρατάμε και το παλιό (σε update χωρίς νέο file)
        if (!file && filePath) fd.set("filePath", filePath);
      }

      const endpoint =
        mode === "create"
          ? "/api/v1/assets/full"
          : `/api/v1/assets/${asset.id}/full`;

      const res = await fetch(endpoint, {
        method: mode === "create" ? "POST" : "PATCH",
        body: fd,
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        alert(t || "Σφάλμα αποθήκευσης");
        return;
      }

      router.push("/assets");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!canDelete) return;
    if (!confirm("Διαγραφή υλικού;")) return;

    const res = await fetch(`/api/v1/assets/${asset.id}`, { method: "DELETE" });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      alert(t || "Σφάλμα διαγραφής");
      return;
    }

    router.push("/assets");
    router.refresh();
  }

  const right = useMemo(() => {
    return (
      <>
        <Button type="button" variant="primary" onClick={save} icon={Save} title="Αποθήκευση">
          {saving ? "..." : "Αποθήκευση"}
        </Button>
        {canDelete ? (
          <Button type="button" variant="danger" onClick={remove} icon={Trash2} title="Διαγραφή">
            Διαγραφή
          </Button>
        ) : null}
      </>
    );
  }, [saving, canDelete, kind, type, title, url, file, filePath]);

  return (
    <section style={{ padding: "0px 10px", maxWidth: 900, margin: "0 auto" }}>
      <ActionBar
        left={<>{A.backLink({ href: "/assets", title: "Πίσω", label: "Πίσω" })}</>}
        right={right}
      />

      <div
        style={{
          marginTop: 10,
          border: "1px solid #222",
          background: "#0f0f0f",
          borderRadius: 14,
          padding: 14,
          display: "grid",
          gridTemplateColumns: "repeat(12, 1fr)",
          gap: 12,
        }}
      >
        <div style={{ gridColumn: "span 6" }}>
          <label style={{ display: "block", fontSize: 13, color: "#cfcfcf", marginBottom: 6 }}>Kind</label>
          <select
            className="song-edit-input-light"
            value={kind}
            onChange={(e) => {
              const next = e.currentTarget.value === "LINK" ? "LINK" : "FILE";
              setKind(next);
              setFile(null);
              if (next === "LINK") {
                setFilePath("");
              } else {
                setUrl("");
              }
            }}
          >
            <option value="FILE">FILE</option>
            <option value="LINK">LINK</option>
          </select>
        </div>

        <div style={{ gridColumn: "span 6" }}>
          <label style={{ display: "block", fontSize: 13, color: "#cfcfcf", marginBottom: 6 }}>Type</label>
          <select className="song-edit-input-light" value={type} onChange={(e) => setType(e.currentTarget.value)}>
            <option value="GENERIC">GENERIC</option>
            <option value="PDF">PDF</option>
            <option value="SCORE">SCORE</option>
            <option value="AUDIO">AUDIO</option>
            <option value="IMAGE">IMAGE</option>
            <option value="YOUTUBE">YOUTUBE</option>
            <option value="SPOTIFY">SPOTIFY</option>
          </select>
        </div>

        <div style={{ gridColumn: "span 12" }}>
          <label style={{ display: "block", fontSize: 13, color: "#cfcfcf", marginBottom: 6 }}>Τίτλος</label>
          <input
            className="song-edit-input-light"
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            placeholder="π.χ. Lead Sheet v2"
          />
        </div>

        {kind === "LINK" ? (
          <div style={{ gridColumn: "span 12" }}>
            <label style={{ display: "block", fontSize: 13, color: "#cfcfcf", marginBottom: 6 }}>URL</label>
            <input
              className="song-edit-input-light"
              value={url}
              onChange={(e) => setUrl(e.currentTarget.value)}
              placeholder="https://..."
            />
          </div>
        ) : (
          <>
            <div style={{ gridColumn: "span 12" }}>
              <label style={{ display: "block", fontSize: 13, color: "#cfcfcf", marginBottom: 6 }}>
                Upload αρχείο
              </label>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  type="file"
                  onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)}
                  style={{ color: "#eaeaea" }}
                />

                {file ? (
                  <span style={{ fontSize: 13, color: "#bdbdbd" }}>
                    {file.name} ({Math.round(file.size / 1024)} KB)
                  </span>
                ) : null}

                {!file && filePath ? (
                  <a
                    href={filePath}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 13, color: "#eaeaea", textDecoration: "underline" }}
                    title="Άνοιγμα υπάρχοντος αρχείου"
                  >
                    Υπάρχον αρχείο
                  </a>
                ) : null}
              </div>

              <div style={{ marginTop: 6, fontSize: 12, color: "#9a9a9a" }}>
                Θα αποθηκευτεί στο <code>/home/reperto/uploads/assets/&lt;type&gt;</code>
              </div>
            </div>

            {/* για edit χωρίς νέο file: δείχνουμε το stored path */}
            <div style={{ gridColumn: "span 12" }}>
              <label style={{ display: "block", fontSize: 13, color: "#cfcfcf", marginBottom: 6 }}>
                File path (DB)
              </label>
              <input
                className="song-edit-input-light"
                value={filePath}
                onChange={(e) => setFilePath(e.currentTarget.value)}
                placeholder="/uploads/assets/..."
              />
              <div style={{ marginTop: 6, fontSize: 12, color: "#9a9a9a" }}>
                Συνήθως δεν το αλλάζεις χειροκίνητα. Μπαίνει αυτόματα μετά το upload.
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}