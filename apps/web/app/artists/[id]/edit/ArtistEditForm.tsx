// apps/web/app/artists/[id]/edit/ArtistEditForm.tsx
"use client";

import { useState } from "react";
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

export default function ArtistEditForm({ artist }: ArtistEditFormProps) {
  const router = useRouter();

  const [title, setTitle] = useState(artist.title ?? "");
  const [firstName, setFirstName] = useState(artist.firstName ?? "");
  const [lastName, setLastName] = useState(artist.lastName ?? "");
  const [sex, setSex] = useState(artist.sex ?? "");
  const [bornYear, setBornYear] = useState(
    artist.bornYear != null ? String(artist.bornYear) : "",
  );
  const [dieYear, setDieYear] = useState(
    artist.dieYear != null ? String(artist.dieYear) : "",
  );
  const [imageUrl, setImageUrl] = useState(artist.imageUrl ?? "");
  const [biography, setBiography] = useState(artist.biography ?? "");
  const [wikiUrl, setWikiUrl] = useState(artist.wikiUrl ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);

    try {
      const payload: any = {
        title: title.trim(),
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
        sex: sex.trim() || null,
        imageUrl: imageUrl.trim() || null,
        biography: biography.trim() || null,
        wikiUrl: wikiUrl.trim() || null,
      };

      const bornYearNum = bornYear.trim() === "" ? null : Number(bornYear);
      const dieYearNum = dieYear.trim() === "" ? null : Number(dieYear);

      if (Number.isNaN(bornYearNum as number)) {
        throw new Error("Το έτος γέννησης δεν είναι έγκυρος αριθμός.");
      }
      if (Number.isNaN(dieYearNum as number)) {
        throw new Error("Το έτος θανάτου δεν είναι έγκυρος αριθμός.");
      }

      payload.bornYear = bornYearNum;
      payload.dieYear = dieYearNum;

      const res = await fetch(`${API_BASE_URL}/artists/${artist.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
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

      setSuccess("Οι αλλαγές αποθηκεύτηκαν επιτυχώς.");
      // redirect πίσω στο προφίλ καλλιτέχνη
      router.push(`/artists/${artist.id}`);
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Κάτι πήγε στραβά κατά την αποθήκευση.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        maxWidth: 800,
      }}
    >
      {error && (
        <div
          style={{
            padding: "8px 12px",
            backgroundColor: "#4b1f1f",
            color: "#ffcccc",
            borderRadius: 4,
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          style={{
            padding: "8px 12px",
            backgroundColor: "#1f4b2a",
            color: "#ccffdd",
            borderRadius: 4,
            fontSize: 14,
          }}
        >
          {success}
        </div>
      )}

      <div>
        <label
          htmlFor="title"
          style={{ display: "block", marginBottom: 4, fontSize: 14 }}
        >
          Εμφανιζόμενος τίτλος (π.χ. «Σοφία Μανουσάκη»)
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          style={{
            width: "100%",
            padding: "8px 10px",
            borderRadius: 4,
            border: "1px solid #444",
            backgroundColor: "#111",
            color: "#fff",
          }}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
          gap: 12,
        }}
      >
        <div>
          <label
            htmlFor="firstName"
            style={{ display: "block", marginBottom: 4, fontSize: 14 }}
          >
            Όνομα
          </label>
          <input
            id="firstName"
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 4,
              border: "1px solid #444",
              backgroundColor: "#111",
              color: "#fff",
            }}
          />
        </div>

        <div>
          <label
            htmlFor="lastName"
            style={{ display: "block", marginBottom: 4, fontSize: 14 }}
          >
            Επώνυμο
          </label>
          <input
            id="lastName"
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 4,
              border: "1px solid #444",
              backgroundColor: "#111",
              color: "#fff",
            }}
          />
        </div>

        <div>
          <label
            htmlFor="sex"
            style={{ display: "block", marginBottom: 4, fontSize: 14 }}
          >
            Φύλο
          </label>
          <input
            id="sex"
            type="text"
            value={sex}
            onChange={(e) => setSex(e.target.value)}
            placeholder="π.χ. F, M ή κείμενο"
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 4,
              border: "1px solid #444",
              backgroundColor: "#111",
              color: "#fff",
            }}
          />
        </div>

        <div>
          <label
            htmlFor="bornYear"
            style={{ display: "block", marginBottom: 4, fontSize: 14 }}
          >
            Έτος γέννησης
          </label>
          <input
            id="bornYear"
            type="number"
            value={bornYear}
            onChange={(e) => setBornYear(e.target.value)}
            placeholder="π.χ. 1985"
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 4,
              border: "1px solid #444",
              backgroundColor: "#111",
              color: "#fff",
            }}
          />
        </div>

        <div>
          <label
            htmlFor="dieYear"
            style={{ display: "block", marginBottom: 4, fontSize: 14 }}
          >
            Έτος θανάτου
          </label>
          <input
            id="dieYear"
            type="number"
            value={dieYear}
            onChange={(e) => setDieYear(e.target.value)}
            placeholder="αν υπάρχει"
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 4,
              border: "1px solid #444",
              backgroundColor: "#111",
              color: "#fff",
            }}
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="imageUrl"
          style={{ display: "block", marginBottom: 4, fontSize: 14 }}
        >
          Εικόνα (URL)
        </label>
        <input
          id="imageUrl"
          type="text"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://..."
          style={{
            width: "100%",
            padding: "8px 10px",
            borderRadius: 4,
            border: "1px solid #444",
            backgroundColor: "#111",
            color: "#fff",
          }}
        />
      </div>

      <div>
        <label
          htmlFor="wikiUrl"
          style={{ display: "block", marginBottom: 4, fontSize: 14 }}
        >
          Σύνδεσμος Wikipedia
        </label>
        <input
          id="wikiUrl"
          type="text"
          value={wikiUrl}
          onChange={(e) => setWikiUrl(e.target.value)}
          placeholder="https://el.wikipedia.org/..."
          style={{
            width: "100%",
            padding: "8px 10px",
            borderRadius: 4,
            border: "1px solid #444",
            backgroundColor: "#111",
            color: "#fff",
          }}
        />
      </div>

      <div>
        <label
          htmlFor="biography"
          style={{ display: "block", marginBottom: 4, fontSize: 14 }}
        >
          Βιογραφία
        </label>
        <textarea
          id="biography"
          value={biography}
          onChange={(e) => setBiography(e.target.value)}
          rows={10}
          style={{
            width: "100%",
            padding: "8px 10px",
            borderRadius: 4,
            border: "1px solid #444",
            backgroundColor: "#111",
            color: "#fff",
            resize: "vertical",
          }}
        />
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          type="submit"
          disabled={saving}
          style={{
            padding: "8px 16px",
            borderRadius: 4,
            border: "none",
            backgroundColor: saving ? "#444" : "#1e88e5",
            color: "#fff",
            fontWeight: 600,
            cursor: saving ? "default" : "pointer",
          }}
        >
          {saving ? "Αποθήκευση..." : "Αποθήκευση"}
        </button>
        <button
          type="button"
          onClick={() => {
            router.push(`/artists/${artist.id}`);
          }}
          style={{
            padding: "8px 16px",
            borderRadius: 4,
            border: "1px solid #444",
            backgroundColor: "transparent",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Άκυρο
        </button>
      </div>
    </form>
  );
}

