// app/lib/api.ts

// ΠΡΟΣΩΡΙΝΑ: Καρφωμένη βάση URL για το NestJS API
// Αγνοούμε τα env για να είμαστε 100% σίγουροι που χτυπάει.
const API_BASE_URL = "http://127.0.0.1:3000/api/v1";

export async function fetchJson<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  // Αν το path είναι σχετικό (π.χ. "/songs/search?..."), το ενώνουμε με το API_BASE_URL
  const url = path.startsWith("http") ? path : `${API_BASE_URL}${path}`;

  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `API error ${res.status} ${res.statusText} for ${url} – body: ${body.slice(
        0,
        500
      )}`
    );
  }

  return (await res.json()) as T;
}
