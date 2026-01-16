// apps/web/app/artists/ArtistForm.tsx
"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  type FormEvent,
} from "react";

// Import the shared Button component so action buttons use the central
// button architecture. This ensures consistent styling and behaviour across
// the application.
import { Button } from "@/app/components/buttons";

/**
 * Pure form component for creating or editing an artist.
 *
 * This component encapsulates all UI state (form fields, validation, local
 * image preview) and emits the user's input via callbacks. It contains no
 * knowledge of how data is persisted or how navigation happens after a save
 * or cancel. Callers provide callbacks for submit, save completion and
 * cancellation. The form supports both create and edit modes – when
 * `artist` has an id it will initialise state from it and treat saves as
 * updates, otherwise it will create a new record.
 */

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

export type ArtistSaveResult = {
  /** The id of the saved artist */
  id: number;
  /** Optional absolute URL to the uploaded image */
  imageUrl?: string | null;
};

/**
 * Props for the ArtistForm component.
 *
 * - `artist` optional initial values; when omitted the form is in create mode
 *   and will generate a new record on submit.
 * - `onSubmit` invoked when the user submits the form. It receives the
 *   prepared FormData along with flags indicating whether this is a new
 *   record and the current artist id (if any). It must return a promise
 *   resolving to the saved id and optionally the image URL. On rejection
 *   the error will be surfaced to the user.
 * - `onSaveDone` optional callback invoked after internal state has been
 *   updated from the save result. Can be used to trigger navigation or
 *   additional side effects in callers.
 * - `onCancel` invoked when the user clicks the cancel button. Receives
 *   the current artist id (null for new records). Callers should
 *   implement appropriate navigation logic.
 */
export type ArtistFormProps = {
  artist?: ArtistForEdit | null;
  onSubmit: (
    fd: FormData,
    isNew: boolean,
    artistId: number | null,
  ) => Promise<ArtistSaveResult>;
  onSaveDone?: (result: ArtistSaveResult) => void;
  onCancel: (artistId: number | null) => void;

  /**
   * When true, the default action buttons rendered at the bottom of the form
   * are hidden. This allows callers to implement their own actions (e.g.
   * buttons in a shared ActionBar) while still delegating save/cancel logic
   * to this form via onSubmit/onCancel. Defaults to false for backwards
   * compatibility.
   */
  hideActions?: boolean;
};

// Helpers to normalise Greek names by removing tonos and converting to upper-case.
function toUpperNoTonos(input: string): string {
  const trimmed = input.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  const noMarks = trimmed.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return noMarks.toLocaleUpperCase("el-GR");
}

function computeDisplayTitle(
  firstNameRaw: string,
  lastNameRaw: string,
): string {
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

export default function ArtistForm({
  artist,
  onSubmit,
  onSaveDone,
  onCancel,
  hideActions = false,
}: ArtistFormProps) {
  // Keep internal id state so that newly created records can update the id.
  const [artistId, setArtistId] = useState<number | null>(artist?.id ?? null);
  const isNew = artistId == null;

  const [firstName, setFirstName] = useState(artist?.firstName ?? "");
  const [lastName, setLastName] = useState(artist?.lastName ?? "");
  // sex stored as "Άνδρας", "Γυναίκα" or ""
  const [sex, setSex] = useState(artist?.sex ?? "");
  const [bornYear, setBornYear] = useState(
    artist?.bornYear != null ? String(artist.bornYear) : "",
  );
  const [dieYear, setDieYear] = useState(
    artist?.dieYear != null ? String(artist.dieYear) : "",
  );
  // The imageUrl comes from the backend. We do not allow editing it directly.
  const [imageUrl, setImageUrl] = useState(artist?.imageUrl ?? "");
  const [wikiUrl, setWikiUrl] = useState(artist?.wikiUrl ?? "");
  const [biography, setBiography] = useState(artist?.biography ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // File upload and preview state.
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  // Cache-bust token for server image. Only set after a successful save.
  const [imageBust, setImageBust] = useState<number>(0);

  const computedTitle = useMemo(() => {
    return computeDisplayTitle(firstName, lastName);
  }, [firstName, lastName]);

  // Determine which preview URL to display: local preview first, then server image.
  const imagePreviewUrl = useMemo(() => {
    if (localPreviewUrl) return localPreviewUrl;
    const v = String(imageUrl ?? "").trim();
    if (!v) return null;
    if (!imageBust) return v;
    const sep = v.includes("?") ? "&" : "?";
    return `${v}${sep}v=${imageBust}`;
  }, [imageUrl, localPreviewUrl, imageBust]);

  // Reset image error when preview changes.
  useEffect(() => {
    setImgError(false);
  }, [imagePreviewUrl]);

  // Clean up object URL on unmount.
  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    };
  }, [localPreviewUrl]);

  function validateAndSetFile(file: File) {
    // Validate file type and size client-side.
    const okTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!okTypes.includes(String(file.type || "").toLowerCase())) {
      throw new Error("Επίλεξε εικόνα JPG/PNG/WebP.");
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error("Η εικόνα είναι πολύ μεγάλη (max 5MB).\n");
    }
    // Release previous preview and create new one.
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

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
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
      const bornYearVal = bornYear.trim() === "" ? "" : bornYear.trim();
      const dieYearVal = dieYear.trim() === "" ? "" : dieYear.trim();
      if (bornYearVal !== "" && Number.isNaN(Number(bornYearVal))) {
        throw new Error("Το έτος γέννησης δεν είναι έγκυρος αριθμός.");
      }
      if (dieYearVal !== "" && Number.isNaN(Number(dieYearVal))) {
        throw new Error("Το έτος θανάτου δεν είναι έγκυρος αριθμός.");
      }
      // Build multipart form data. Use strings for nullable numbers (empty string means null).
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
      // Delegate persistence to caller. It must throw on failure.
      const result = await onSubmit(fd, isNew, artistId);
      // Update local id and server image URL. When creating, update artistId.
      if (result && Number.isFinite(result.id)) {
        const newId = result.id;
        setArtistId(newId);
        // Update server image URL and bust cache if provided.
        const nextUrl = String(result.imageUrl ?? "").trim();
        if (nextUrl) {
          setImageUrl(nextUrl);
          setImageBust(Date.now());
        }
      }
      // Clear local file after save.
      setSelectedFile(null);
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
        setLocalPreviewUrl(null);
      }
      // Notify caller that save is done.
      if (onSaveDone && result) {
        onSaveDone(result);
      }
    } catch (err: any) {
      setError(err?.message || "Κάτι πήγε στραβά κατά την αποθήκευση.");
    } finally {
      setSaving(false);
    }
  }

  // Cancel handler passes the current id back to caller.
  function handleCancel() {
    onCancel(artistId);
  }

  const sexValue = (sex || "").trim();

  return (
    <>
      {/* Give the form a stable id so external buttons can trigger submission via form.requestSubmit() */}
      <form onSubmit={handleSubmit} className="form" id="artist-form">
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

            {/* Φύλο με 2 κουμπιά */}
            <div className="field">
              <label className="label">Φύλο (προαιρετικό)</label>

              <div className="segmented" role="group" aria-label="Φύλο">
                <Button
                  type="button"
                  variant="secondary"
                  className={`segBtn ${sexValue === "Άνδρας" ? "segBtnActive" : ""}`}
                  onClick={() => setSex(sexValue === "Άνδρας" ? "" : "Άνδρας")}
                  disabled={saving}
                >
                  Άνδρας
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  className={`segBtn ${sexValue === "Γυναίκα" ? "segBtnActive" : ""}`}
                  onClick={() => setSex(sexValue === "Γυναίκα" ? "" : "Γυναίκα")}
                  disabled={saving}
                >
                  Γυναίκα
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  className="segBtn segBtnClear"
                  onClick={() => setSex("")}
                  disabled={saving || !sexValue}
                  title="Καθαρισμός"
                >
                  Καθαρισμός
                </Button>
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
            {/* Preview εικόνας */}
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
                  style={{ display: imagePreviewUrl && !imgError ? "none" : "block" }}
                >
                  Δεν υπάρχει εικόνα για προβολή.
                </div>
              </div>
            </div>
            {/* Επιλογή εικόνας (χωρίς upload μέχρι Save) */}
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
        {/* Render default action buttons unless explicitly hidden by caller.  */}
        <div className="actions" style={{ display: hideActions ? "none" : undefined }}>
          {/*
            Replace raw <button> elements with the shared Button component. Using
            Button here aligns the form actions with the new button architecture
            and central styling. The primary button triggers form submission
            while the secondary button cancels the edit/create flow.
          */}
          <Button
            type="submit"
            variant="primary"
            disabled={saving}
            title="Αποθήκευση"
          >
            {saving ? "Αποθήκευση..." : "Αποθήκευση"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={saving}
            onClick={handleCancel}
            title="Άκυρο"
          >
            Άκυρο
          </Button>
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
        }
        .cardTitle {
          font-size: 18px;
          margin-bottom: 4px;
          font-weight: 700;
          color: #fff;
        }
        .cardSubtitle {
          font-size: 13px;
          color: #aaa;
        }
        .grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 14px;
        }
        .grid2 {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        .field.full {
          grid-column: 1 / -1;
        }

        /* σημαντικό για να μην ξεχειλίζουν τα παιδιά του grid */
        .field {
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-width: 0;
        }

        .label {
          font-size: 14px;
          font-weight: 600;
          color: #ddd;
        }
        .input,
        .textarea {
          padding: 8px 10px;
          border-radius: 6px;
          border: 1px solid #ffffffff;
          background: #ffffffff;
          color: #000000ff;
          font-size: 14px;
        }
        .inputDisabled {
          background: #222;
          color: #ffffffff;
          border-color: #333;
          cursor: not-allowed;
        }
        .textarea {
          resize: vertical;
        }
        .segmented {
          display: flex;
        }
        .segBtn {
          flex: 1;
          padding: 8px 10px;
          border: 1px solid #444;
          background: #222;
          color: #fff;
          cursor: pointer;
          font-size: 14px;
        }
        .segBtn + .segBtn {
          border-left: none;
        }
        .segBtnActive {
          background: #345;
          color: #fff;
        }
        .segBtnClear {
          background: #222;
          color: #aaa;
        }
        .dropZone {
          border: 2px dashed #444;
          border-radius: 8px;
          padding: 16px;
          text-align: center;
          cursor: pointer;
        }
        .dropZoneActive {
          border-color: #789;
          background: #222;
        }
        .dropZoneDisabled {
          opacity: 0.6;
          pointer-events: none;
        }
        .dropZoneTitle {
          font-size: 14px;
          margin-bottom: 4px;
          color: #ddd;
        }
        .dropZoneHint {
          font-size: 12px;
          color: #ffffffff;
        }
        .imagePreviewWrap {
          width: 100%;
          position: relative;
          border: 1px solid #444;
          border-radius: 8px;
          overflow: hidden;
          aspect-ratio: 1 / 1;
          background: #222;
        }
        .imagePreview {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .imagePreviewFallback {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          background: #222;
          color: #ffffffff;
          font-size: 12px;
          padding: 10px;
        }
        .actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
          margin-top: 10px;
        }
        .btn {
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
          border: 1px solid #444;
        }
        .btnPrimary {
          background: #345;
          color: #fff;
          border-color: #345;
        }
        .btnGhost {
          background: #222;
          color: #ddd;
        }
        @media (max-width: 768px) {
        .grid2 {
          grid-template-columns: 1fr;
        }

        .segmented {
          flex-wrap: wrap;
        }
      }

      `}</style>
    </>
  );
}