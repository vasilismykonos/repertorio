// apps/web/app/lists/groups/[id]/edit/page.tsx
import GroupEditClient from "../../shared/GroupEditClient";

export const dynamic = "force-dynamic";

export default function EditGroupPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  return (
    <GroupEditClient
      mode="edit"
      groupIdParam={params.id}
      searchParams={searchParams ?? {}}
    />
  );
}