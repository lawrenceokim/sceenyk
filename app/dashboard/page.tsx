import { redirect } from "next/navigation";

export default async function DashboardCompatibility({ searchParams }: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { page } = await searchParams;
  // Old project pagination used /dashboard?page=N#projects.
  if (typeof page === "string") redirect(`/dashboard/projects?page=${encodeURIComponent(page)}`);
  redirect("/create");
}
