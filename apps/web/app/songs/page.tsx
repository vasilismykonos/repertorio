// apps/web/app/songs/page.tsx
import type { Metadata } from "next";
import { getCurrentUserFromApi } from "@/lib/currentUser";
import { canCreateSong } from "@/lib/permissions";

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

  tagIds?: string | string[];
  listIds?: string | string[];

  composerIds?: string | string[];
  lyricistIds?: string | string[];

  singerFrontIds?: string | string[];
  singerBackIds?: string | string[];

  yearFrom?: string | string[];
  yearTo?: string | string[];

  composer?: string | string[];
  lyricist?: string | string[];

  lyrics?: string | string[];
  status?: string | string[];
  popular?: string | string[];
  createdByUserId?: string | string[];

  mode?: string | string[];
  return_to?: string | string[];
  listId?: string | string[];
};

type SongsPageProps = {
  searchParams?: SongsPageSearchParams;
};

export default async function SongsPage({ searchParams }: SongsPageProps) {
  const currentUser = await getCurrentUserFromApi().catch(() => null);

  const modeValue = searchParams?.mode;
  const mode = Array.isArray(modeValue) ? modeValue[0] : modeValue;

  const pickerMode = String(mode || "").trim() === "pick";
  const showCreateButton = !pickerMode && canCreateSong(currentUser?.role);

  return (
    <>
      <ActionBar
        left={
          <h1 style={{ margin: 0 }}>
            {pickerMode ? "Επιλογή τραγουδιού" : "Τραγούδια"}
          </h1>
        }
        right={
          showCreateButton ? (
            <LinkButton
              href="/songs/new"
              variant="primary"
              action="new"
              title="Νέο τραγούδι"
            >
              Νέο τραγούδι
            </LinkButton>
          ) : null
        }
      />
      <PageSuspense>
        <SongsSearchClient searchParams={searchParams || {}} />
      </PageSuspense>
    </>
  );
}