// apps/web/app/artists/new/page.tsx
import ArtistEditForm from "../[id]/edit/ArtistEditForm";

export const dynamic = "force-dynamic";

export default function NewArtistPage() {
  // ✅ create mode: δεν περνάμε artist prop
  return (
    <section style={{ padding: "24px 16px", maxWidth: 920, margin: "0 auto" }}>
      <ArtistEditForm />
    </section>
  );
}
