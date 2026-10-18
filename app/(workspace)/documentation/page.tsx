import { DocumentationArticle } from "@/components/documentation/documentation-article";
import { documentationTopics } from "@/lib/documentation/content";

export const metadata = { title: "Documentation — Sceenyk", description: "A guide to Studio, projects, templates, Marketplace and your Sceenyk account." };

export default function DocumentationPage() {
  return <DocumentationArticle topic={documentationTopics[0]} />;
}
