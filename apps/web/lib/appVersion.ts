//apps/web/lib/appVersion.ts
import { readFileSync } from "fs";
import path from "path";

let cached: string | null = null;

export function getAppVersion(): string {
  if (cached) return cached;

  try {
    // Στο runtime του Next, process.cwd() στο apps/web
    const pkgPath = path.join(process.cwd(), "package.json");
    const raw = readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw);
    cached = String(pkg.version || "0.0.0");
    return cached;
  } catch {
    return "0.0.0";
  }
}