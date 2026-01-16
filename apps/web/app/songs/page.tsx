// apps/web/app/songs/page.tsx
import type { Metadata } from "next";
import SongsSearchClient from "./SongsSearchClient";

import ActionBar from "@/app/components/ActionBar";
import { LinkButton } from "@/app/components/buttons";
import PageSuspense from "@/app/components/PageSuspense";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Τραγούδια | Repertorio Next",
  description: "Αναζήτηση τραγουδιών στο Repertorio Next.",
};

export type SongsPageSearchParams = {
  take?: string | string[];
  skip?: string | string[];

  q?: string | string[];
  search_term?: string | string[];

  chords?: string | string[];
  partiture?: string | string[];
  category_id?: string | string[];
  rythm_id?: string | string[];

  // ✅ tags
  tagIds?: string | string[];

  // ✅ ids (multi CSV)
  composerIds?: string | string[];
  lyricistIds?: string | string[];

  // ✅ singers
  singerFrontIds?: string | string[];
  singerBackIds?: string | string[];

  // ✅ year range
  yearFrom?: string | string[];
  yearTo?: string | string[];

  // legacy (αν έρθουν από παλιό url)
  composer?: string | string[];
  lyricist?: string | string[];

  lyrics?: string | string[];
  status?: string | string[];
  popular?: string | string[];
  createdByUserId?: string | string[];
};

type SongsPageProps = {
  searchParams?: SongsPageSearchParams;
};

export default function SongsPage({ searchParams }: SongsPageProps) {
  return (
    <>
      <ActionBar
        left={<h1 style={{ margin: 0 }}>Τραγούδια</h1>}
        right={
          <LinkButton href="/songs/new" variant="primary" action="new" title="Νέο τραγούδι">
            Νέο τραγούδι
          </LinkButton>
        }
      />
      <PageSuspense>
        <SongsSearchClient searchParams={searchParams || {}} />
      </PageSuspense>
    </>
  );
}
