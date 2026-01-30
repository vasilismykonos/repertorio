// apps/web/app/api/users/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { fetchJson } from "@/lib/api";

// Απλός τύπος για την απόκριση του Nest API
type ApiUserResponse = {
  id: number;
  email: string | null;
  username: string | null;
  displayName: string | null;
  role: string;
};

// Μικρό helper για να φτιάχνουμε HTML σελίδα που κάνει redirect
function buildRedirectHtml(targetPath: string): string {
  // Σιγουρευόμαστε ότι το targetPath ξεκινάει με /
  const safePath = targetPath.startsWith("/") ? targetPath : `/${targetPath}`;

  return `<!DOCTYPE html>
<html lang="el">
  <head>
    <meta charset="utf-8" />
    <title>Μεταφορά...</title>
    <meta http-equiv="refresh" content="0; url=${safePath}" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <p>Μεταφορά... Αν δεν γίνει αυτόματα, πατήστε
      <a href="${safePath}">εδώ</a>.
    </p>
    <script>
      window.location.href = ${JSON.stringify(safePath)};
    </script>
  </body>
</html>`;
}

function parseId(rawId: string): number | null {
  const idNum = Number(rawId);
  if (!Number.isFinite(idNum) || idNum <= 0) return null;
  return idNum;
}

// GET /api/users/[id] -> απλή HTML σελίδα που σε στέλνει στο /users/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const idNum = parseId(params.id);
  const html = buildRedirectHtml(idNum ? `/users/${idNum}` : "/users");

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// POST /api/users/[id] -> update μέσω form submit (HTML form) και redirect πίσω στο /users/[id]
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const rawId = params.id;
  const idNum = parseId(rawId);

  if (!idNum) {
    const html = buildRedirectHtml("/users");
    return new NextResponse(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  let ok = true;

  try {
    const formData = await req.formData();

    const displayName = formData.get("displayName");
    const username = formData.get("username");
    const email = formData.get("email");
    const role = formData.get("role");

    const body: {
      displayName?: string;
      username?: string | null;
      email?: string | null;
      role?: string;
    } = {};

    if (displayName !== null) {
      const v = String(displayName).trim();
      body.displayName = v;
    }

    if (username !== null) {
      const v = String(username).trim();
      body.username = v === "" ? null : v;
    }

    if (email !== null) {
      const v = String(email).trim();
      body.email = v === "" ? null : v;
    }

    // ΠΡΟΣ ΤΟ ΠΑΡΟΝ επιτρέπουμε αλλαγή role χωρίς επιπλέον έλεγχο από το web app
    if (role !== null) {
      body.role = String(role);
    }

    // Κλήση προς Nest API: PATCH /users/:id
    await fetchJson<ApiUserResponse>(`/users/${idNum}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  } catch (err) {
    ok = false;
    console.error("Update user failed for id=", rawId, err);
  }

  const targetPath = ok ? `/users/${idNum}` : `/users/${idNum}?error=1`;
  const html = buildRedirectHtml(targetPath);

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// DELETE /api/users/[id] -> proxy σε Nest DELETE /users/:id (για το κουμπί διαγραφής)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const rawId = params.id;
  const idNum = parseId(rawId);

  if (!idNum) {
    return NextResponse.json(
      { ok: false, error: "Invalid user id" },
      { status: 400 },
    );
  }

  try {
    // Αν το fetchJson σου επιστρέφει πάντα JSON, εδώ μπορεί να μην υπάρχει body.
    // Οπότε ζητάμε JSON αλλά δεν μας ενδιαφέρει το payload.
    await fetchJson<{ ok?: boolean }>(`/users/${idNum}`, { method: "DELETE" });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("Delete user failed for id=", rawId, err);
    return NextResponse.json(
      { ok: false, error: "Delete failed" },
      { status: 500 },
    );
  }
}
