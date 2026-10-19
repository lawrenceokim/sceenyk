import Link from "next/link";
import { documentationHref, documentationTopics, type DocumentationTopic } from "@/lib/documentation/content";
import { DocumentationNavigation } from "./documentation-navigation";
import { DocumentationReader } from "./documentation-reader";

export function DocumentationArticle({ topic }: { topic: DocumentationTopic }) {
  const index = documentationTopics.findIndex(item => item.slug === topic.slug);
  const previous = documentationTopics[index - 1];
  const next = documentationTopics[index + 1];
  return (
    <div className={`
      workspace-documentation [&&]:grid [&&]:[grid-template-rows:auto_minmax(0,_1fr)] [&&]:gap-[16px] [&&]:h-[100%]
      [&&]:min-w-[0] [&&]:min-h-[0] [&&]:pt-[20px] [&&]:pr-[16px] [&&]:pb-[0] [&&]:pl-[16px] [&&]:overflow-hidden
      @min-[760px]/documentation:[&&]:[grid-template-columns:198px_minmax(0,_1fr)]
      @min-[760px]/documentation:[&&]:[grid-template-rows:minmax(0,_1fr)] @min-[760px]/documentation:[&&]:gap-x-[40px]
      @min-[760px]/documentation:[&&]:pt-[32px] @min-[760px]/documentation:[&&]:pr-[22px]
      @min-[760px]/documentation:[&&]:pb-[0] @min-[760px]/documentation:[&&]:pl-[22px]
    `}>
      <DocumentationNavigation activeSlug={topic.slug} />
      <DocumentationReader key={topic.slug} topic={topic}>
        {topic.title !== "Documentation" && <h2 className={"workspace-doc-topic-title [.workspace-doc-article_&&]:text-[length:20px] [.workspace-doc-article_&&]:leading-[28px] [.workspace-doc-article_&&]:tracking-[-.025em] [.workspace-doc-article_>_&&_+_section]:mt-[20px]"}>{topic.title}</h2>}
        {topic.sections.map(section => (
          <section key={section.id} aria-labelledby={section.id}>
            {topic.title === "Documentation"
              ? <h2 id={section.id} tabIndex={-1}>{section.title}</h2>
              : <h3 id={section.id} tabIndex={-1}>{section.title}</h3>}
            {section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
            {section.links && <div className={`
      workspace-doc-actions [&&]:flex [&&]:flex-wrap [&&]:gap-[8px] [&&_a]:inline-flex [&&_a]:items-center
      [&&_a]:min-h-[28px] [&&_a]:pt-[3px] [&&_a]:pr-[8px] [&&_a]:pb-[3px] [&&_a]:pl-[8px]
      [&&_a]:[border:1px_solid_var(--border)] [&&_a]:rounded-[6px] [&&_a]:[background:var(--field)] [&&_a]:text-[length:11px]
      [&&_a]:leading-[16px] [&&_a]:font-[500] [&&_a:hover]:[background:var(--accent)]
      [@media_(pointer:_coarse)]:[&&_a]:min-h-[44px]
    `}>{section.links.map(link => <Link key={link.href} href={link.href} className="text-link">{link.label}</Link>)}</div>}
          </section>
        ))}
        <nav aria-label="Previous and next documentation topics" className={`
      workspace-doc-pagination [&&]:flex [&&]:flex-wrap [&&]:justify-between [&&]:gap-[12px]
      [&&]:[border-top:1px_solid_var(--border)] [&&]:pt-[20px] [&&]:text-[length:12px] [&&]:leading-[20px] [&&_a]:inline-flex
      [&&_a]:items-center [&&_a]:min-h-[32px] [@media_(pointer:_coarse)]:[&&_a]:min-h-[44px]
    `}>
          {previous && <Link href={documentationHref(previous.slug)} scroll={false} className="text-link">← {previous.label}</Link>}
          {next && <Link href={documentationHref(next.slug)} scroll={false} className="ml-auto text-link">{next.label} →</Link>}
        </nav>
      </DocumentationReader>
    </div>
  );
}
