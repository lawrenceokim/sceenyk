import { notFound, redirect } from "next/navigation";
import { DocumentationArticle } from "@/components/documentation/documentation-article";
import { documentationTopics, findDocumentationTopic } from "@/lib/documentation/content";

type Props = { params: Promise<{ topic: string }> };

export function generateStaticParams() {
  return documentationTopics.filter(topic => topic.slug !== "getting-started").map(topic => ({ topic: topic.slug }));
}

export async function generateMetadata({ params }: Props) {
  const topic = findDocumentationTopic((await params).topic);
  return { title: topic ? `${topic.label} — Sceenyk Documentation` : "Documentation — Sceenyk", description: topic?.description };
}

export default async function DocumentationTopicPage({ params }: Props) {
  const { topic: slug } = await params;
  if (slug === "getting-started") redirect("/documentation");
  const topic = findDocumentationTopic(slug);
  if (!topic) notFound();
  return <DocumentationArticle topic={topic} />;
}
