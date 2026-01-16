// apps/web/app/api/scores/[id]/route.ts
import { NextRequest } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import StreamZip from "node-stream-zip";

export const dynamic = "force-dynamic";

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Βρίσκει ποιο XML αρχείο μέσα στο .mxl είναι το main score.
 * 1) Δοκιμάζει META-INF/container.xml (standard MXL)
 * 2) Διαφορετικά, το πρώτο .xml που δεν είναι container.xml / META-INF
 */
async function findMainXmlEntry(zip: any): Promise<string | null> {
  const entries = await zip.entries();
  const names = Object.keys(entries);

  if (entries["META-INF/container.xml"]) {
    const buf = await zip.entryData("META-INF/container.xml");
    const containerXml = buf.toString("utf8");
    const match = containerXml.match(/<rootfile[^>]*full-path="([^"]+)"/i);
    if (match && match[1] && entries[match[1]]) {
      return match[1];
    }
  }

  for (const name of names) {
    const lower = name.toLowerCase();
    if (
      lower.endsWith(".xml") &&
      !lower.includes("container.xml") &&
      !lower.startsWith("meta-inf/")
    ) {
      return name;
    }
  }

  return null;
}

function fixXmlLikePhp(xml: string): string {
  let fixed = xml;

  if (!fixed.trim().startsWith("<?xml")) {
    fixed = `<?xml version="1.0" encoding="UTF-8"?>\n` + fixed;
  }

  fixed = fixed.replace(/\r\n/g, "\n");

  fixed = fixed.replace(
    /<\?xml([^>]*encoding=["'])(utf-16|UTF-16)(["'][^>]*)\?>/,
    (_m, before, _enc, after) => `<?xml${before}UTF-8${after}?>`,
  );

  fixed = fixed.replace(/&nbsp;/g, " ");
  
  return fixed;
}

async function readXmlFromMxl(mxlPath: string): Promise<string> {
  const zip = new (StreamZip as any).async({ file: mxlPath });

  try {
    const xmlName = await findMainXmlEntry(zip);
    if (!xmlName) throw new Error(`Δεν βρέθηκε XML entry στο MXL ${mxlPath}`);

    const buf = await zip.entryData(xmlName);
    return buf.toString("utf8");
  } finally {
    await zip.close();
  }
}

/**
 * Επιτρέπει είτε:
 * - "123" (id)
 * - "123.mxl" / "123.xml" / "123.musicxml"
 * - "some-file.mxl" (αν το API δίνει πραγματικό filename)
 *
 * Ασφάλεια:
 * - κάνει basename => κόβει path traversal
 * - δέχεται μόνο [A-Za-z0-9._-]
 */
function sanitizeIdOrFilename(input: string): string | null {
  const base = path.basename(String(input || "").trim());
  if (!base) return null;

  // allowlist characters (no spaces, no weird chars)
  if (!/^[A-Za-z0-9._-]+$/.test(base)) return null;

  return base;
}

/**
 * Resolve score file:
 * - Αν δώσεις filename με extension, το ψάχνει πρώτα αυτούσιο.
 * - Αλλιώς, θεωρεί το "id" και δοκιμάζει: .mxl, .musicxml, .xml
 */
async function resolveScoreFile(nameOrId: string): Promise<
  | { kind: "xml"; path: string }
  | { kind: "mxl"; path: string }
  | null
> {
  const scoresDir =
    process.env.SCORES_DIR?.trim() ||
    path.join(process.cwd(), "public", "scores");

  // 1) Αν έρχεται ως filename με extension, δοκίμασέ το αυτούσιο
  const directPath = path.join(scoresDir, nameOrId);
  if (await fileExists(directPath)) {
    const lower = nameOrId.toLowerCase();
    if (lower.endsWith(".mxl")) return { kind: "mxl", path: directPath };
    if (lower.endsWith(".musicxml") || lower.endsWith(".xml")) return { kind: "xml", path: directPath };
    // Αν είναι άγνωστη κατάληξη αλλά υπάρχει, δεν το σερβίρουμε ως score
    return null;
  }

  // 2) Αν δεν υπάρχει αυτούσιο, το θεωρούμε "id" χωρίς extension
  const idNoExt = nameOrId.replace(/\.(mxl|musicxml|xml)$/i, "");

  const mxlPath = path.join(scoresDir, `${idNoExt}.mxl`);
  if (await fileExists(mxlPath)) return { kind: "mxl", path: mxlPath };

  const musicXmlPath = path.join(scoresDir, `${idNoExt}.musicxml`);
  if (await fileExists(musicXmlPath)) return { kind: "xml", path: musicXmlPath };

  const xmlPath = path.join(scoresDir, `${idNoExt}.xml`);
  if (await fileExists(xmlPath)) return { kind: "xml", path: xmlPath };

  return null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const raw = params.id;
  const safe = sanitizeIdOrFilename(raw);

  if (!safe) {
    return new Response("Invalid score id/filename", { status: 400 });
  }

  try {
    const resolved = await resolveScoreFile(safe);

    if (!resolved) {
      const dir =
        process.env.SCORES_DIR?.trim() ||
        path.join(process.cwd(), "public", "scores");
      console.warn(`[api/scores] not found id=${safe} in dir=${dir}`);
      return new Response("Score not found", { status: 404 });
    }

    let xmlText: string;

    if (resolved.kind === "mxl") {
      xmlText = await readXmlFromMxl(resolved.path);
    } else {
      const buf = await fs.readFile(resolved.path);
      xmlText = buf.toString("utf8");
    }

    const fixedXml = fixXmlLikePhp(xmlText);

    return new Response(fixedXml, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.recordare.musicxml+xml; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    console.error("API /api/scores/[id] error:", err);
    return new Response("Internal server error", { status: 500 });
  }
}
