import { NextResponse } from "next/server";

export const dynamic = "force-static";

const ASSET_LINKS = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "net.repertorio.twa",
      sha256_cert_fingerprints: [
        "00:3F:A6:BF:35:C0:C8:F4:C7:A5:7B:02:88:50:D9:FB:77:DD:02:D9:52:8D:A5:AC:F4:7D:D0:BE:F6:9A:C1:14",
      ],
    },
  },
];

export function GET() {
  return NextResponse.json(ASSET_LINKS, {
    headers: {
      "cache-control": "public, max-age=3600",
    },
  });
}
