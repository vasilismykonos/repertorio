import { MetadataRoute } from "next";

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_BASE_URL ||
  "https://repertorio.net"
).replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  const privatePaths = [
    "/api/",
    "/api/v1/",
    "/rooms-api/",
    "/settings",
    "/me",
    "/chat",
    "/rooms",
    "/songs/offline-shell",
    "/lists/offline-shell",
    "/offline",
    "/admin",
    "/*/edit",
    "/*/new",
  ];
  const blockedBots = [
    "MJ12bot",
    "AhrefsBot",
    "SemrushBot",
    "DotBot",
    "PetalBot",
    "Bytespider",
    "Barkrowler",
    "BLEXBot",
    "DataForSeoBot",
    "SerpstatBot",
    "CCBot",
    "ClaudeBot",
    "GPTBot",
    "OAI-SearchBot",
    "Amazonbot",
    "YandexBot",
    "Baiduspider",
  ];

  return {
    rules: [
      ...blockedBots.map((userAgent) => ({
        userAgent,
        disallow: "/",
      })),
      {
        userAgent: "Applebot",
        allow: "/",
        disallow: privatePaths,
        crawlDelay: 10,
      },
      {
        userAgent: "*",
        allow: "/",
        disallow: privatePaths,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
