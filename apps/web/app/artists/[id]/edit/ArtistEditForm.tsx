// apps/web/app/artists/[id]/edit/ArtistEditForm.tsx
"use client";

import React, { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const API_BASE_URL = "https://api.repertorio.net/api/v1";

export type ArtistForEdit = {
  id: number;
  title: string;
  firstName: string | null;
  lastName: string | null;
  sex: string | null;
  bornYear: number | null;
  dieYear: number | null;
  imageUrl: string | null;
  biography: string | null;
  wikiUrl: string | null;
};

type ArtistEditFormProps = {
  artist: ArtistForEdit;
};

function toUpperNoTonos(input: string): string {
  const trimmed = input.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  const noMarks = trimmed.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return noMarks.toLocaleUpperCase("el-GR");
}

function computeDisplayTitle(firstNameRaw: string, lastNameRaw: string): string {
  const firstName = toUpperNoTonos(firstNameRaw);
  const lastName = toUpperNoTonos(lastNameRaw);

  if (lastName && firstName) {
    const initial = firstName.charAt(0);
    return `${lastName} ${initial}.`;
  }
  if (lastName) return lastName;
  if (firstName) return firstName;
  return "";
}

export default function ArtistEditForm({ artist }: ArtistEditFormProps) {
  const router = useRouter();

  const [firstName, setFirstName] = useState(artist.firstName ?? "");
  const [lastName, setLastName] = useState(artist.lastName ?? "");

  // ✅ sex θα επιλέγεται από 2 κουμπιά (Άνδρας/Γυναίκα)
  // κρατάμε string για backward-compat: "Άνδρας" | "Γυναίκα" | ""
  const [sex, setSex] = useState(artist.sex ?? "");

  const [bornYear, setBornYear] = useState(
    artist.bornYear != null ? String(artist.bornYear) : "",
  );
  const [dieYear, setDieYear] = useState(
    artist.dieYear != null ? String(artist.dieYear) : "",
  );

  // ⚠️ imageUrl πλέον ΔΕΝ αλλάζει από input URL. Γεμίζει μόνο από upload.
  const [imageUrl, setImageUrl] = useState(artist.imageUrl ?? "");
  const [wikiUrl, setWikiUrl] = useState(artist.wikiUrl ?? "");
  const [biography, setBiography] = useState(artist.biography ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ✅ upload state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const computedTitle = useMemo(() => {
    return computeDisplayTitle(firstName, lastName);
  }, [firstName, lastName]);

  // ✅ για προβολή εικόνας
  const imagePreviewUrl = useMemo(() => {
    const v = String(imageUrl ?? "").trim();
    return v ? v : null;
  }, [imageUrl]);

  async function uploadImageFile(file: File) {
    setError(null);

    // client-side validation
    const okTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!okTypes.includes(file.type)) {
      throw new Error("Επίλεξε εικόνα JPG/PNG/WebP.");
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error("Η εικόνα είναι πολύ μεγάλη (max 5MB).");
    }

    const fd = new FormData();
    fd.append("file", file);

    setUploadingImage(true);
    try {
      const res = await fetch(`${API_BASE_URL}/artists/${artist.id}/image`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });

      if (!res.ok) {
        let message = `Αποτυχία upload (HTTP ${res.status})`;
        try {
          const data = await res.json();
          if (data?.message) {
            message = Array.isArray(data.message)
              ? data.message.join(", ")
              : String(data.message);
          }
        } catch {
          // ignore
        }
        throw new Error(message);
      }

      const data = await res.json();
      const nextUrl = String(data?.imageUrl ?? "").trim();
      if (!nextUrl) throw new Error("Δεν επιστράφηκε imageUrl από το API.");

      setImageUrl(nextUrl);
    } finally {
      setUploadingImage(false);
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;

    try {
      await uploadImageFile(f);
    } catch (err: any) {
      setError(err?.message || "Αποτυχία upload εικόνας.");
    }
  }

  async function onDropFile(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);

    if (uploadingImage) return;

    const f = e.dataTransfer.files?.[0];
    if (!f) return;

    try {
      await uploadImageFile(f);
    } catch (err: any) {
      setError(err?.message || "Αποτυχία upload εικόνας.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const normalizedFirstName = toUpperNoTonos(firstName);
      const normalizedLastName = toUpperNoTonos(lastName);

      const titleToSave = computeDisplayTitle(
        normalizedFirstName,
        normalizedLastName,
      );
      if (!titleToSave) {
        throw new Error(
          "Συμπλήρωσε τουλάχιστον Επώνυμο (και προαιρετικά Όνομα).",
        );
      }

      const bornYearNum = bornYear.trim() === "" ? null : Number(bornYear);
      const dieYearNum = dieYear.trim() === "" ? null : Number(dieYear);

      if (Number.isNaN(bornYearNum as number)) {
        throw new Error("Το έτος γέννησης δεν είναι έγκυρος αριθμός.");
      }
      if (Number.isNaN(dieYearNum as number)) {
        throw new Error("Το έτος θανάτου δεν είναι έγκυρος αριθμός.");
      }

      const payload: any = {
        title: titleToSave,

        firstName: normalizedFirstName || null,
        lastName: normalizedLastName || null,

        // ✅ sex: είτε "Άνδρας"/"Γυναίκα" είτε null
        sex: sex.trim() || null,

        bornYear: bornYearNum,
        dieYear: dieYearNum,

        imageUrl: imageUrl.trim() || null,

        wikiUrl: wikiUrl.trim() || null,
        biography: biography.trim() || null,
      };

      const res = await fetch(`${API_BASE_URL}/artists/${artist.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let message = `Αποτυχία αποθήκευσης (HTTP ${res.status})`;
        try {
          const data = await res.json();
          if (data?.message) {
            message = Array.isArray(data.message)
              ? data.message.join(", ")
              : String(data.message);
          }
        } catch {
          // ignore
        }
        throw new Error(message);
      }

      router.push(`/artists/${artist.id}`);
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Κάτι πήγε στραβά κατά την αποθήκευση.");
    } finally {
      setSaving(false);
    }
  }

  const sexValue = (sex || "").trim(); // "", "Άνδρας", "Γυναίκα"

  return (
    <>
      <form onSubmit={handleSubmit} className="form">
        {error && (
          <div className="alert alertError" role="alert">
            {error}
          </div>
        )}

        <div className="card">
          <div className="cardHeader">
            <div>
              <h2 className="cardTitle">Βασικά στοιχεία</h2>
            </div>
          </div>

          <div className="grid grid2">
            <div className="field full">
              <label className="label" htmlFor="title">
                Τίτλος (αυτόματο)
              </label>
              <input
                id="title"
                type="text"
                value={computedTitle}
                readOnly
                disabled
                className="input inputDisabled"
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="lastName">
                Επώνυμο
              </label>
              <input
                id="lastName"
                type="text"
                value={toUpperNoTonos(lastName)}
                onChange={(e) => setLastName(toUpperNoTonos(e.target.value))}
                required
                className="input"
                placeholder="π.χ. ΤΣΙΤΣΑΝΗΣ"
                inputMode="text"
                autoComplete="family-name"
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="firstName">
                Όνομα
              </label>
              <input
                id="firstName"
                type="text"
                value={toUpperNoTonos(firstName)}
                onChange={(e) => setFirstName(toUpperNoTonos(e.target.value))}
                className="input"
                placeholder="π.χ. ΒΑΣΙΛΗΣ"
                inputMode="text"
                autoComplete="given-name"
              />
            </div>

            {/* ✅ Φύλο με 2 κουμπιά */}
            <div className="field">
              <label className="label">Φύλο (προαιρετικό)</label>

              <div className="segmented" role="group" aria-label="Φύλο">
                <button
                  type="button"
                  className={`segBtn ${
                    sexValue === "Άνδρας" ? "segBtnActive" : ""
                  }`}
                  onClick={() => setSex(sexValue === "Άνδρας" ? "" : "Άνδρας")}
                  disabled={saving || uploadingImage}
                >
                  Άνδρας
                </button>

                <button
                  type="button"
                  className={`segBtn ${
                    sexValue === "Γυναίκα" ? "segBtnActive" : ""
                  }`}
                  onClick={() => setSex(sexValue === "Γυναίκα" ? "" : "Γυναίκα")}
                  disabled={saving || uploadingImage}
                >
                  Γυναίκα
                </button>

                {/* Προαιρετικό: κουμπί καθαρισμού */}
                <button
                  type="button"
                  className="segBtn segBtnClear"
                  onClick={() => setSex("")}
                  disabled={saving || uploadingImage || !sexValue}
                  title="Καθαρισμός"
                >
                  Καθαρισμός
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="cardHeader">
            <div>
              <h2 className="cardTitle">Χρονολογία</h2>
            </div>
          </div>

          <div className="grid grid2">
            <div className="field">
              <label className="label" htmlFor="bornYear">
                Έτος γέννησης
              </label>
              <input
                id="bornYear"
                type="number"
                value={bornYear}
                onChange={(e) => setBornYear(e.target.value)}
                className="input"
                placeholder="π.χ. 1915"
                inputMode="numeric"
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="dieYear">
                Έτος θανάτου
              </label>
              <input
                id="dieYear"
                type="number"
                value={dieYear}
                onChange={(e) => setDieYear(e.target.value)}
                className="input"
                placeholder="π.χ. 1984"
                inputMode="numeric"
              />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="cardHeader">
            <div>
              <h2 className="cardTitle">Σύνδεσμοι & πολυμέσα</h2>
            </div>
          </div>

          <div className="grid">
            {/* ✅ Preview εικόνας */}
            <div className="field">
              <div className="imagePreviewWrap">
                {imagePreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imagePreviewUrl}
                    alt="Εικόνα καλλιτέχνη"
                    className="imagePreview"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display =
                        "none";
                      const parent = e.currentTarget.parentElement;
                      if (parent) {
                        const el = parent.querySelector(
                          ".imagePreviewFallback",
                        ) as HTMLElement | null;
                        if (el) el.style.display = "block";
                      }
                    }}
                  />
                ) : null}

                <div
                  className="imagePreviewFallback"
                  style={{ display: imagePreviewUrl ? "none" : "block" }}
                >
                  Δεν υπάρχει εικόνα για προβολή.
                </div>
              </div>
            </div>

            {/* ✅ Upload / Drag & Drop ΜΟΝΟ */}
            <div className="field">
              <label className="label">Εικόνα (Upload ή Drag & Drop)</label>

              <div
                className={`dropZone ${dragOver ? "dropZoneActive" : ""} ${
                  uploadingImage ? "dropZoneDisabled" : ""
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!uploadingImage) setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDropFile}
                onClick={() => {
                  if (!uploadingImage) fileInputRef.current?.click();
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (uploadingImage) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                aria-disabled={uploadingImage}
              >
                <div className="dropZoneTitle">
                  {uploadingImage
                    ? "Ανέβασμα εικόνας..."
                    : "Ρίξε εδώ μια εικόνα ή κάνε κλικ για επιλογή"}
                </div>
                <div className="dropZoneHint">JPG/PNG/WebP έως 5MB</div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={onPickFile}
                style={{ display: "none" }}
                disabled={uploadingImage}
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="wikiUrl">
                Wikipedia (URL)
              </label>
              <input
                id="wikiUrl"
                type="url"
                value={wikiUrl}
                onChange={(e) => setWikiUrl(e.target.value)}
                className="input"
                placeholder="https://el.wikipedia.org/..."
                inputMode="url"
                autoComplete="url"
              />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="cardHeader">
            <div>
              <h2 className="cardTitle">Βιογραφία</h2>
              <p className="cardSubtitle">
                Προτείνεται σύντομο κείμενο με βασικές πληροφορίες.
              </p>
            </div>
          </div>

          <div className="field">
            <label className="label" htmlFor="biography">
              Κείμενο
            </label>
            <textarea
              id="biography"
              value={biography}
              onChange={(e) => setBiography(e.target.value)}
              rows={10}
              className="textarea"
              placeholder="Γράψε εδώ..."
            />
          </div>
        </div>

        <div className="actions">
          <button
            type="submit"
            disabled={saving || uploadingImage}
            className="btn btnPrimary"
          >
            {saving ? "Αποθήκευση..." : "Αποθήκευση"}
          </button>

          <button
            type="button"
            disabled={saving || uploadingImage}
            className="btn btnGhost"
            onClick={() => router.push(`/artists/${artist.id}`)}
          >
            Άκυρο
          </button>
        </div>
      </form>

      <style jsx>{`
        :global(*),
        :global(*::before),
        :global(*::after) {
          box-sizing: border-box;
        }

        .form {
          display: flex;
          flex-direction: column;
          gap: 14px;
          width: 100%;
          max-width: 920px;
          overflow-x: hidden;
        }

        .alert {
          padding: 10px 12px;
          border-radius: 10px;
          font-size: 14px;
          line-height: 1.35;
          border: 1px solid #3a3a3a;
          background: #141414;
          width: 100%;
        }
        .alertError {
          border-color: #5b2a2a;
          background: #241010;
          color: #ffd0d0;
        }

        .card {
          border: 1px solid #2f2f2f;
          background: #111;
          border-radius: 14px;
          padding: 14px;
          width: 100%;
        }

        .cardHeader {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 10px;
        }

        .cardTitle {
          margin: 0;
          font-size: 16px;
          font-weight: 700;
          color: #fff;
        }

        .cardSubtitle {
          margin: 6px 0 0 0;
          font-size: 13px;
          color: #b8b8b8;
          line-height: 1.35;
        }

        .grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
          width: 100%;
          min-width: 0;
        }

        @media (min-width: 640px) {
          .grid2 {
            grid-template-columns: 1fr 1fr;
          }
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-width: 0;
          width: 100%;
        }

        .full {
          grid-column: 1 / -1;
        }

        .label {
          font-size: 13px;
          color: #eaeaea;
        }

        .input,
        .textarea {
          width: 100%;
          max-width: 100%;
          min-width: 0;

          border-radius: 10px;
          border: 1px solid #cfcfcf;
          background: #ffffff;
          color: #000000;
          padding: 10px 12px;
          font-size: 14px;
          outline: none;

          box-sizing: border-box;
        }

        .input::placeholder,
        .textarea::placeholder {
          color: #6b7280;
        }

        .input:focus,
        .textarea:focus {
          border-color: #111111;
        }

        .inputDisabled {
          background: #f3f4f6;
          color: #4b5563;
          cursor: not-allowed;
        }

        .textarea {
          resize: vertical;
          min-height: 180px;
        }

        .imagePreviewWrap {
          width: 100%;
          border: 1px solid #2f2f2f;
          border-radius: 14px;
          background: #0f0f0f;
          padding: 10px;
          overflow: hidden;
        }

        .imagePreview {
          display: block;
          width: 100%;
          height: auto;
          max-height: 360px;
          object-fit: contain;
          border-radius: 10px;
          background: #000;
        }

        .imagePreviewFallback {
          font-size: 13px;
          color: #cfcfcf;
          padding: 10px;
          border-radius: 10px;
          background: #141414;
          border: 1px dashed #3a3a3a;
        }

        .dropZone {
          width: 100%;
          border: 2px dashed #3a3a3a;
          border-radius: 14px;
          background: #0f0f0f;
          padding: 14px;
          cursor: pointer;
          user-select: none;
        }

        .dropZoneActive {
          border-color: #1e88e5;
          background: #0b1622;
        }

        .dropZoneDisabled {
          opacity: 0.7;
          cursor: default;
        }

        .dropZoneTitle {
          font-size: 14px;
          font-weight: 700;
          color: #ffffff;
        }

        .dropZoneHint {
          margin-top: 6px;
          font-size: 13px;
          color: #b8b8b8;
          line-height: 1.35;
        }

        /* ✅ Segmented control για Φύλο */
        .segmented {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .segBtn {
          border-radius: 12px;
          padding: 10px 14px;
          font-size: 14px;
          font-weight: 700;
          border: 1px solid #3a3a3a;
          background: transparent;
          color: #fff;
          cursor: pointer;
          max-width: 100%;
        }

        .segBtn:disabled {
          opacity: 0.6;
          cursor: default;
        }

        .segBtnActive {
          border: none;
          background: #1e88e5;
          color: #fff;
        }

        .segBtnClear {
          border: 1px dashed #3a3a3a;
          color: #d6d6d6;
        }

        .actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: flex-start;
          align-items: center;

          border: 1px solid #2f2f2f;
          background: #0f0f0f;
          border-radius: 14px;
          padding: 12px;
          width: 100%;
        }

        @media (max-width: 480px) {
          .actions {
            flex-direction: column;
            align-items: stretch;
          }
          .btn {
            width: 100%;
          }
        }

        .btn {
          border-radius: 12px;
          padding: 10px 14px;
          font-size: 14px;
          font-weight: 700;
          border: 1px solid #3a3a3a;
          background: transparent;
          color: #fff;
          cursor: pointer;
          max-width: 100%;
        }

        .btn:disabled {
          opacity: 0.6;
          cursor: default;
        }

        .btnPrimary {
          border: none;
          background: #1e88e5;
        }

        .btnGhost {
          background: transparent;
        }
      `}</style>
    </>
  );
}
