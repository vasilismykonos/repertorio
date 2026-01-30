import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserFromApi } from "@/lib/currentUser";

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromApi(req);

  //console.log("[api/current-user] user =", user);

  return NextResponse.json({
    ok: true,
    user,
  });
}
