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

  // 1) Standard container
  if (entries["META-INF/container.xml"]) {
    const buf = await zip.entryData("META-INF/container.xml");
    const containerXml = buf.toString("utf8");
    const match = containerXml.match(
      /<rootfile[^>]*full-path="([^"]+)"/i
    );
    if (match && match[1] && entries[match[1]]) {
      return match[1];
    }
  }

  // 2) Πρώτο .xml που δεν είναι container
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

/**
 * Πολύ ελαφρύ "fixer" ώστε τα XML από διάφορα εργαλεία (Audiveris κ.λπ.)
 * να είναι λίγο πιο φιλικά προς τον OSMD – αντίστοιχη λογική με το παλιό PHP.
 */
function fixXmlLikePhp(xml: string): string {
  let fixed = xml;

  // Αν δεν έχει xml header, πρόσθεσε ένα UTF-8 header.
  if (!fixed.trim().startsWith("<?xml")) {
    fixed = `<?xml version="1.0" encoding="UTF-8"?>\n` + fixed;
  }

  // Ενοποιημένα line endings
  fixed = fixed.replace(/\r\n/g, "\n");

  // Αν κάποιο εργαλείο έγραψε UTF-16 στο header, γύρνα το σε UTF-8
  fixed = fixed.replace(
    /<\?xml([^>]*encoding=["'])(utf-16|UTF-16)(["'][^>]*)\?>/,
    (_m, before, _enc, after) => `<?xml${before}UTF-8${after}?>`
  );

  // Πολύ απλό sanitizing σε μη μουσικά entities που ενοχλούν
  fixed = fixed.replace(/&nbsp;/g, " ");

  return fixed;
}

async function readXmlFromMxl(mxlPath: string): Promise<string> {
  const zip = new (StreamZip as any).async({ file: mxlPath });

  try {
    const xmlName = await findMainXmlEntry(zip);
    if (!xmlName) {
      throw new Error(`Δεν βρέθηκε XML entry στο MXL ${mxlPath}`);
    }

    const buf = await zip.entryData(xmlName);
    return buf.toString("utf8");
  } finally {
    await zip.close();
  }
}

/**
 * Επιστρέφει το path του score (σε public/scores) και αν είναι plain XML ή MXL.
 */
async function resolveScoreFile(id: string): Promise<
  | { kind: "xml"; path: string }
  | { kind: "mxl"; path: string }
  | null
> {
  const scoresDir = path.join(process.cwd(), "public", "scores");

  const mxlPath = path.join(scoresDir, `${id}.mxl`);
  if (await fileExists(mxlPath)) {
    return { kind: "mxl", path: mxlPath };
  }

  const musicXmlPath = path.join(scoresDir, `${id}.musicxml`);
  if (await fileExists(musicXmlPath)) {
    return { kind: "xml", path: musicXmlPath };
  }

  const xmlPath = path.join(scoresDir, `${id}.xml`);
  if (await fileExists(xmlPath)) {
    return { kind: "xml", path: xmlPath };
  }

  return null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = params.id;

  if (!id || !/^\d+$/.test(id)) {
    return new Response("Invalid score id", { status: 400 });
  }

  try {
    const resolved = await resolveScoreFile(id);
    if (!resolved) {
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
        "Content-Type":
          "application/vnd.recordare.musicxml+xml; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    console.error("API /api/scores/[id] error:", err);
    return new Response("Internal server error", { status: 500 });
  }
}
