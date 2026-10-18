import Link from "next/link";
import { documentationHref, documentationTopics, type DocumentationTopic } from "@/lib/documentation/content";
import { WorkspacePageHeader } from "@/components/workspace/workspace-page-header";
import { DocumentationNavigation } from "./documentation-navigation";

export function DocumentationArticle({ topic }: { topic: DocumentationTopic }) {
  const index = documentationTopics.findIndex(item => item.slug === topic.slug);
  const previous = documentationTopics[index - 1];
  const next = documentationTopics[index + 1];
  return (
    <div className="grid min-w-0 items-start gap-8 xl:grid-cols-[12rem_minmax(0,1fr)] 2xl:grid-cols-[12rem_minmax(0,1fr)_10rem]">
      <DocumentationNavigation activeSlug={topic.slug} />
      <article aria-label={topic.label} className="min-w-0 max-w-[46rem] space-y-10">
        <WorkspacePageHeader title={topic.title} description={topic.description} eyebrow="SCEENYK DOCUMENTATION" />
        {topic.sections.map(section => (
          <section key={section.id} aria-labelledby={section.id} className="space-y-4">
            <h2 id={section.id} tabIndex={-1} className="scroll-mt-24 rounded-sm text-xl font-semibold tracking-tight outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring lg:scroll-mt-8">{section.title}</h2>
            {section.paragraphs.map(paragraph => <p key={paragraph} className="text-body leading-8 text-muted-foreground">{paragraph}</p>)}
            {section.links && <div className="flex flex-wrap gap-x-6 gap-y-2">{section.links.map(link => <Link key={link.href} href={link.href} className="nav-link text-body-sm text-link">{link.label}</Link>)}</div>}
          </section>
        ))}
        <nav aria-label="Previous and next documentation topics" className="flex flex-wrap justify-between gap-4 border-t border-border pt-6 text-body-sm">
          {previous && <Link href={documentationHref(previous.slug)} className="nav-link text-link">← {previous.label}</Link>}
          {next && <Link href={documentationHref(next.slug)} className="nav-link ml-auto text-link">{next.label} →</Link>}
        </nav>
      </article>
      <nav aria-label="On this page" className="sticky top-8 hidden space-y-3 border-l border-border pl-4 text-body-sm 2xl:block">
        <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">On this page</p>
        <ul className="space-y-2">{topic.sections.map(section => <li key={section.id}><a href={`#${section.id}`} className="flex min-h-11 items-center rounded-sm py-2 leading-relaxed text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">{section.title}</a></li>)}</ul>
      </nav>
    </div>
  );
}
