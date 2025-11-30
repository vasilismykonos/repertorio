import { NextRequest } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import StreamZip from "node-stream-zip";

// Αν θες, μπορείς να το κάνεις dynamic για να μην cache-άρει aggressive
export const dynamic = "force-dynamic";

// ΣΗΜΑΝΤΙΚΟ: εδώ απλώς χαλαρώνουμε τον τύπο (δεν υπάρχει StreamZip.Async στα typings)
async function findXmlEntry(zip: any) {
  const entries = await zip.entries();

  // 1) Αν υπάρχει META-INF/container.xml, διαβάζουμε από εκεί το full-path
  const containerEntry = entries["META-INF/container.xml"];
  if (containerEntry) {
    const buf = await zip.entryData("META-INF/container.xml");
    const txt = buf.toString("utf-8");
    const match = txt.match(/<rootfile[^>]*full-path="([^"]+)"/i);
    if (match && match[1] && entries[match[1]]) {
      return match[1];
    }
  }

  // 2) Αλλιώς, πρώτο .xml που δεν είναι το container
  for (const [name] of Object.entries(entries)) {
    const lower = name.toLowerCase();
    if (lower.endsWith(".xml") && !lower.includes("container.xml")) {
      return name;
    }
  }

  return null;
}

function fixXmlLikePhp(xml: string): string {
  let fixed = xml;

  // Αν δεν έχει xml header, βάλε
  if (!fixed.trim().startsWith("<?xml")) {
    fixed =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      fixed;
  }

  // Μικρο-fixes παρόμοια με αυτά που έκανες στο PHP για Audiveris κ.λπ.
  // (βάζω 2 χαρακτηριστικά, μπορείς να προσθέσεις και άλλα αν χρειαστεί)
  fixed = fixed.replace(
    /<type>\s*u\s*<\/type>/gi,
    "<type>quarter</type>"
  );
  fixed = fixed.replace(
    /<type>\s*e\s*<\/type>/gi,
    "<type>eighth</type>"
  );

  return fixed;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;

    // Βάση: public/scores
    const scoresDir = path.join(process.cwd(), "public", "scores");

    // Προτεραιότητα: .mxl → .musicxml → .xml
    const mxlPath = path.join(scoresDir, `${id}.mxl`);
    const musicXmlPath = path.join(scoresDir, `${id}.musicxml`);
    const xmlPath = path.join(scoresDir, `${id}.xml`);

    let xmlText: string | null = null;

    // 1) Αν υπάρχει ήδη .musicxml ή .xml, απλώς τα διαβάζουμε
    try {
      await fs.access(musicXmlPath);
      xmlText = await fs.readFile(musicXmlPath, "utf-8");
    } catch {
      // ignore
    }

    if (!xmlText) {
      try {
        await fs.access(xmlPath);
        xmlText = await fs.readFile(xmlPath, "utf-8");
      } catch {
        // ignore
      }
    }

    // 2) Διαφορετικά, προσπαθούμε να ανοίξουμε το .mxl ως zip
    if (!xmlText) {
      try {
        await fs.access(mxlPath);
      } catch {
        return new Response("Score not found", { status: 404 });
      }

      const zip = new (StreamZip as any).async({ file: mxlPath });

      try {
        const xmlEntryName = await findXmlEntry(zip);
        if (!xmlEntryName) {
          await zip.close();
          return new Response("No XML entry inside MXL", {
            status: 500,
          });
        }

        const buf = await zip.entryData(xmlEntryName);
        await zip.close();

        xmlText = buf.toString("utf-8");
      } catch (err) {
        await zip.close().catch(() => {});
        console.error("MXL unzip error:", err);
        return new Response("Failed to extract MusicXML from MXL", {
          status: 500,
        });
      }
    }

    // Αν για οποιονδήποτε λόγο ακόμα δεν έχουμε XML, 500
    if (!xmlText) {
      return new Response("No XML content found", { status: 500 });
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
