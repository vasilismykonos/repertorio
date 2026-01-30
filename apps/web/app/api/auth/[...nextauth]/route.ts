// apps/web/app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import type { NextAuthOptions } from "next-auth";

const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
  ],
  callbacks: {
    async redirect({ url, baseUrl }) {
      // 1) relative urls => same origin
      if (url.startsWith("/")) return `${baseUrl}${url}`;

      // 2) absolute urls => allow only same origin
      try {
        const u = new URL(url);
        if (u.origin === baseUrl) return url;
      } catch {
        // ignore
      }

      // 3) anything else => safe fallback
      return baseUrl;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
