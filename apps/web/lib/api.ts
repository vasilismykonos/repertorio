// apps/web/lib/api.ts

// Βάση URL του NestJS API.
// Σε production θα το χτυπάμε σαν https://repertorio.net/api/v1,
// που θα γίνεται proxy από το Nginx προς το Nest (localhost:PORT/api/v1).
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://repertorio.net/api/v1";


export async function fetchJson<T>(path: string): Promise<T> {
  const url = `${API_BASE_URL}${path}`;

  const res = await fetch(url, {
    // Να μην κάνει caching σε dev
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `API error ${res.status} ${res.statusText} for ${url} – body: ${text}`,
    );
  }

  return (await res.json()) as T;
}

// ΝΕΑ ΣΥΝΑΡΤΗΣΗ για χρήση στη σελίδα /songs/[id]
export async function fetchSongById(id: number | string) {
  return fetchJson(`/songs/${id}`);
}
