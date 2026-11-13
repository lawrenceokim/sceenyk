import { DocumentationArticle } from "@/components/documentation/documentation-article";
import { documentationTopics } from "@/lib/documentation/content";

export const metadata = { title: "Documentation — Sceenyk", description: "Learn video creation, templates, Marketplace, purchases, credits and creator earnings in Sceenyk." };

export default function DocumentationPage() {
  return <DocumentationArticle topic={documentationTopics[0]} />;
}
