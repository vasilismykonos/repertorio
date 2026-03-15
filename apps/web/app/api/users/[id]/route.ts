// apps/web/app/api/users/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { fetchJson } from "@/lib/api";

// Τύπος για την απόκριση του Nest API
type ApiUserResponse = {
  id: number;
  email: string | null;
  username: string | null;
  displayName: string | null;
  role: string;
  avatarUrl?: string | null;
  profile?: unknown | null;
  createdAt?: string;
  updatedAt?: string;
};

// Μικρό helper για HTML redirect page
function buildRedirectHtml(targetPath: string): string {
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

function normalizeNullableString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const v = String(value).trim();
  return v === "" ? null : v;
}

// GET /api/users/[id] -> HTML redirect σε /users/[id]
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

// PATCH /api/users/[id] -> JSON proxy προς Nest PATCH /users/:id
export async function PATCH(
  req: NextRequest,
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
    const incoming = await req.json().catch(() => null);

    if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const input = incoming as {
      displayName?: unknown;
      role?: unknown;
      avatarUrl?: unknown;
      profile?: unknown;
    };

    const body: {
      displayName?: string | null;
      role?: string;
      avatarUrl?: string | null;
      profile?: unknown | null;
    } = {};

    if ("displayName" in input) {
      body.displayName = normalizeNullableString(input.displayName);
    }

    if ("role" in input && input.role != null) {
      body.role = String(input.role).trim();
    }

    if ("avatarUrl" in input) {
      body.avatarUrl = normalizeNullableString(input.avatarUrl);
    }

    if ("profile" in input) {
      body.profile = input.profile ?? null;
    }

    const updated = await fetchJson<ApiUserResponse>(`/users/${idNum}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (err: any) {
    console.error("PATCH /api/users/[id] failed for id=", rawId, err);

    const message =
      typeof err?.message === "string" && err.message.trim()
        ? err.message
        : "Update failed";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}

// POST /api/users/[id] -> legacy form submit support, redirect πίσω στο /users/[id]
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
    const role = formData.get("role");
    const avatarUrl = formData.get("avatarUrl");

    const body: {
      displayName?: string | null;
      role?: string;
      avatarUrl?: string | null;
    } = {};

    if (displayName !== null) {
      body.displayName = normalizeNullableString(displayName);
    }

    if (role !== null) {
      body.role = String(role).trim();
    }

    if (avatarUrl !== null) {
      body.avatarUrl = normalizeNullableString(avatarUrl);
    }

    await fetchJson<ApiUserResponse>(`/users/${idNum}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  } catch (err) {
    ok = false;
    console.error("POST /api/users/[id] failed for id=", rawId, err);
  }

  const targetPath = ok ? `/users/${idNum}` : `/users/${idNum}?error=1`;
  const html = buildRedirectHtml(targetPath);

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// DELETE /api/users/[id] -> proxy σε Nest DELETE /users/:id
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
    await fetchJson<{ ok?: boolean }>(`/users/${idNum}`, {
      method: "DELETE",
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("Delete user failed for id=", rawId, err);
    return NextResponse.json(
      { ok: false, error: "Delete failed" },
      { status: 500 },
    );
  }
}