import Link from "next/link";
import { documentationHref, documentationTopics, type DocumentationTopic } from "@/lib/documentation/content";
import { DocumentationNavigation } from "./documentation-navigation";
import { DocumentationReader } from "./documentation-reader";

export function DocumentationArticle({ topic }: { topic: DocumentationTopic }) {
  const index = documentationTopics.findIndex(item => item.slug === topic.slug);
  const previous = documentationTopics[index - 1];
  const next = documentationTopics[index + 1];
  return (
    <div className="workspace-documentation">
      <DocumentationNavigation activeSlug={topic.slug} />
      <DocumentationReader key={topic.slug} topic={topic}>
        {topic.title !== "Documentation" && <h2 className="workspace-doc-topic-title">{topic.title}</h2>}
        {topic.sections.map(section => (
          <section key={section.id} aria-labelledby={section.id}>
            {topic.title === "Documentation"
              ? <h2 id={section.id} tabIndex={-1}>{section.title}</h2>
              : <h3 id={section.id} tabIndex={-1}>{section.title}</h3>}
            {section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
            {section.links && <div className="workspace-doc-actions">{section.links.map(link => <Link key={link.href} href={link.href} className="text-link">{link.label}</Link>)}</div>}
          </section>
        ))}
        <nav aria-label="Previous and next documentation topics" className="workspace-doc-pagination">
          {previous && <Link href={documentationHref(previous.slug)} scroll={false} className="text-link">← {previous.label}</Link>}
          {next && <Link href={documentationHref(next.slug)} scroll={false} className="ml-auto text-link">{next.label} →</Link>}
        </nav>
      </DocumentationReader>
    </div>
  );
}
