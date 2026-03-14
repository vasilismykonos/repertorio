// apps/web/app/lists/groups/new/page.tsx
import GroupEditClient from "../shared/GroupEditClient";

export const dynamic = "force-dynamic";

export default function NewGroupPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  return <GroupEditClient mode="create" searchParams={searchParams ?? {}} />;
}