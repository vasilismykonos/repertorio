import { NextResponse } from "next/server";

export const runtime = "nodejs";

function apiV1Base() {
  return (
    process.env.API_V1_BASE_URL ||
    process.env.NEXT_PUBLIC_API_V1_BASE_URL ||
    process.env.API_BASE_URL ||
    "http://127.0.0.1:3003/api/v1"
  ).replace(/\/$/, "");
}

export async function GET(
  req: Request,
  ctx: { params: { jobId: string } },
) {
  try {
    const cookie = req.headers.get("cookie") ?? "";
    const authorization = req.headers.get("authorization") ?? "";
    const jobId = encodeURIComponent(String(ctx.params.jobId || ""));

    const res = await fetch(`${apiV1Base()}/assets/omr-jobs/${jobId}`, {
      cache: "no-store",
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(authorization ? { authorization } : {}),
      },
    });

    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { message: error?.message || "Internal error" },
      { status: 500 },
    );
  }
}
