// app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      // Αν είναι πρώτη φορά login, περνάμε extra info
      if (account && profile) {
        token.provider = account.provider;
        token.picture = (profile as any).picture;
      }
      return token;
    },
    async session({ session, token }) {
      // Περνάμε custom δεδομένα στο session
      if (token) {
        (session.user as any).picture = token.picture;
        (session.user as any).provider = token.provider;
      }
      return session;
    },
  },
});

export { handler as GET, handler as POST };
