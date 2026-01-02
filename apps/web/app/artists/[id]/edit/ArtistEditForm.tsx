// apps/web/app/artists/[id]/edit/ArtistEditForm.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.repertorio.net/api/v1"
).replace(/\/$/, "");

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
  // ✅ create mode: δεν περνάμε artist
  artist?: ArtistForEdit | null;
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

  // ✅ NEW: επιτρέπει create mode
  const [artistId, setArtistId] = useState<number | null>(artist?.id ?? null);
  const isNew = artistId == null;

  const [firstName, setFirstName] = useState(artist?.firstName ?? "");
  const [lastName, setLastName] = useState(artist?.lastName ?? "");

  // ✅ sex θα επιλέγεται από 2 κουμπιά (Άνδρας/Γυναίκα)
  // κρατάμε string για backward-compat: "Άνδρας" | "Γυναίκα" | ""
  const [sex, setSex] = useState(artist?.sex ?? "");

  const [bornYear, setBornYear] = useState(
    artist?.bornYear != null ? String(artist.bornYear) : "",
  );
  const [dieYear, setDieYear] = useState(
    artist?.dieYear != null ? String(artist.dieYear) : "",
  );

  // ⚠️ imageUrl ΔΕΝ αλλάζει από input URL. Γεμίζει ΜΟΝΟ από backend μετά από Save.
  const [imageUrl, setImageUrl] = useState(artist?.imageUrl ?? "");
  const [wikiUrl, setWikiUrl] = useState(artist?.wikiUrl ?? "");
  const [biography, setBiography] = useState(artist?.biography ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ✅ file state: ΔΕΝ ανεβαίνει μέχρι να πατηθεί Save
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // ✅ local preview + img error state
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  // ✅ cache-bust token ΜΟΝΟ μετά από επιτυχημένο Save (όχι Date.now() στο render)
  const [imageBust, setImageBust] = useState<number>(0);

  const computedTitle = useMemo(() => {
    return computeDisplayTitle(firstName, lastName);
  }, [firstName, lastName]);

  // ✅ για προβολή εικόνας: local πρώτα, μετά server
  // ✅ cache-bust μόνο αν imageBust > 0 (μετά από Save)
  const imagePreviewUrl = useMemo(() => {
    if (localPreviewUrl) return localPreviewUrl;

    const v = String(imageUrl ?? "").trim();
    if (!v) return null;

    if (!imageBust) return v;

    const sep = v.includes("?") ? "&" : "?";
    return `${v}${sep}v=${imageBust}`;
  }, [imageUrl, localPreviewUrl, imageBust]);

  // ✅ reset imgError όταν αλλάζει το preview url
  useEffect(() => {
    setImgError(false);
  }, [imagePreviewUrl]);

  // ✅ cleanup ObjectURL (memory leak prevention)
  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    };
  }, [localPreviewUrl]);

  function validateAndSetFile(file: File) {
    // client-side validation
    const okTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!okTypes.includes(String(file.type || "").toLowerCase())) {
      throw new Error("Επίλεξε εικόνα JPG/PNG/WebP.");
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error("Η εικόνα είναι πολύ μεγάλη (max 5MB).");
    }

    // ✅ local preview ΑΜΕΣΩΣ (χωρίς upload)
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    const objUrl = URL.createObjectURL(file);
    setLocalPreviewUrl(objUrl);
    setSelectedFile(file);
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;

    try {
      setError(null);
      validateAndSetFile(f);
    } catch (err: any) {
      setError(err?.message || "Αποτυχία επιλογής εικόνας.");
    }
  }

  function onDropFile(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);

    if (saving) return;

    const f = e.dataTransfer.files?.[0];
    if (!f) return;

    try {
      setError(null);
      validateAndSetFile(f);
    } catch (err: any) {
      setError(err?.message || "Αποτυχία επιλογής εικόνας.");
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

      // bornYear/dieYear: στέλνουμε strings στο multipart (ή "" για null)
      const bornYearVal = bornYear.trim() === "" ? "" : bornYear.trim();
      const dieYearVal = dieYear.trim() === "" ? "" : dieYear.trim();

      // basic validation numeric (client)
      if (bornYearVal !== "" && Number.isNaN(Number(bornYearVal))) {
        throw new Error("Το έτος γέννησης δεν είναι έγκυρος αριθμός.");
      }
      if (dieYearVal !== "" && Number.isNaN(Number(dieYearVal))) {
        throw new Error("Το έτος θανάτου δεν είναι έγκυρος αριθμός.");
      }

      // ✅ ΕΝΑ request: multipart (fields + optional file)
      const fd = new FormData();
      fd.set("title", titleToSave);
      fd.set("firstName", normalizedFirstName || "");
      fd.set("lastName", normalizedLastName || "");
      fd.set("sex", sex.trim() || "");
      fd.set("bornYear", bornYearVal);
      fd.set("dieYear", dieYearVal);
      fd.set("wikiUrl", wikiUrl.trim() || "");
      fd.set("biography", biography.trim() || "");

      if (selectedFile) {
        fd.set("file", selectedFile);
      }

      const url = isNew
        ? `${API_BASE_URL}/artists/full`
        : `${API_BASE_URL}/artists/${artistId}/full`;

      const res = await fetch(url, {
        method: isNew ? "POST" : "PATCH",
        credentials: "include",
        body: fd,
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

      const data = await res.json().catch(() => null);

      const savedId = Number(data?.id ?? artistId);
      if (!Number.isFinite(savedId) || savedId <= 0) {
        throw new Error("Δεν επιστράφηκε έγκυρο id από το API.");
      }

      setArtistId(savedId);

      // ✅ ενημέρωση imageUrl (αν υπάρχει) + cache-bust μετά από επιτυχές Save
      const nextUrl = String(data?.imageUrl ?? "").trim();
      if (nextUrl) {
        setImageUrl(nextUrl);
        setImageBust(Date.now());
      }

      // ✅ καθαρίζουμε local file preview μετά το Save
      setSelectedFile(null);
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
        setLocalPreviewUrl(null);
      }

      router.push(`/artists/${savedId}`);
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
                  className={`segBtn ${sexValue === "Άνδρας" ? "segBtnActive" : ""}`}
                  onClick={() => setSex(sexValue === "Άνδρας" ? "" : "Άνδρας")}
                  disabled={saving}
                >
                  Άνδρας
                </button>

                <button
                  type="button"
                  className={`segBtn ${sexValue === "Γυναίκα" ? "segBtnActive" : ""}`}
                  onClick={() => setSex(sexValue === "Γυναίκα" ? "" : "Γυναίκα")}
                  disabled={saving}
                >
                  Γυναίκα
                </button>

                <button
                  type="button"
                  className="segBtn segBtnClear"
                  onClick={() => setSex("")}
                  disabled={saving || !sexValue}
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
                {imagePreviewUrl && !imgError ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={imagePreviewUrl}
                    src={imagePreviewUrl}
                    alt="Εικόνα καλλιτέχνη"
                    className="imagePreview"
                    onLoad={() => setImgError(false)}
                    onError={() => setImgError(true)}
                  />
                ) : null}

                <div
                  className="imagePreviewFallback"
                  style={{
                    display: imagePreviewUrl && !imgError ? "none" : "block",
                  }}
                >
                  Δεν υπάρχει εικόνα για προβολή.
                </div>
              </div>
            </div>

            {/* ✅ Επιλογή εικόνας (χωρίς upload μέχρι Save) */}
            <div className="field">
              <label className="label">
                Εικόνα (θα αποθηκευτεί μόνο όταν πατήσεις Αποθήκευση)
              </label>

              <div
                className={`dropZone ${dragOver ? "dropZoneActive" : ""} ${
                  saving ? "dropZoneDisabled" : ""
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!saving) setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDropFile}
                onClick={() => {
                  if (!saving) fileInputRef.current?.click();
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (saving) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                aria-disabled={saving}
              >
                <div className="dropZoneTitle">
                  {saving
                    ? "Αποθήκευση..."
                    : selectedFile
                      ? `Επιλεγμένο: ${selectedFile.name}`
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
                disabled={saving}
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
          <button type="submit" disabled={saving} className="btn btnPrimary">
            {saving ? "Αποθήκευση..." : "Αποθήκευση"}
          </button>

          <button
            type="button"
            disabled={saving}
            className="btn btnGhost"
            onClick={() => {
              if (isNew) router.push("/artists");
              else router.push(`/artists/${artistId}`);
            }}
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
