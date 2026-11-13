import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { DocumentationArticle } from "@/components/documentation/documentation-article";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";
import { documentationTopics, findDocumentationTopic } from "@/lib/documentation/content";

type Props = { params: Promise<{ topic: string }> };

export function generateStaticParams() {
  return documentationTopics.filter(topic => topic.slug !== "getting-started").map(topic => ({ topic: topic.slug }));
}

export async function generateMetadata({ params }: Props) {
  const topic = findDocumentationTopic((await params).topic);
  return { title: topic ? `${topic.label} — Sceenyk Documentation` : "Documentation — Sceenyk", description: topic?.description };
}

export default function DocumentationTopicPage({ params }: Props) {
  return <Suspense fallback={
    <SkeletonRegion label="Loading documentation…" className="h-full space-y-3 px-4 pt-5 @min-[760px]/documentation:px-[22px] @min-[760px]/documentation:pt-8">
      <Skeleton className="h-7 w-48 max-w-full" />
      <Skeleton className="h-4 w-72 max-w-full" />
    </SkeletonRegion>
  }>
    <ResolvedDocumentationTopic params={params} />
  </Suspense>;
}

async function ResolvedDocumentationTopic({ params }: Props) {
  const { topic: slug } = await params;
  if (slug === "getting-started") redirect("/documentation");
  const topic = findDocumentationTopic(slug);
  if (!topic) notFound();
  return <DocumentationArticle topic={topic} />;
}
