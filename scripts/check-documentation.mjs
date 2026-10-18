// Validate the public documentation graph and destinations against real routes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { typescriptLoader } from './lib/load-typescript.mjs';

const { documentationTopics: topics, documentationHref, findDocumentationTopic } = typescriptLoader()('lib/documentation/content.ts');
const checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); };
const routes = [];
function walk(directory) {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) walk(file);
    else if (item.name === 'page.tsx') {
      const parts = path.relative('app',path.dirname(file)).split(path.sep).filter(part => !part.startsWith('('));
      routes.push('/'+parts.join('/'));
    }
  }
}
walk('app');
check('topic slugs are unique', new Set(topics.map(topic=>topic.slug)).size === topics.length);
for (const topic of topics) {
  check('topic is addressable '+topic.slug, findDocumentationTopic(topic.slug) === topic);
  check('topic route exists '+topic.slug, routes.includes(documentationHref(topic.slug)) || routes.includes('/documentation/[topic]'));
  check('stable unique anchors '+topic.slug, topic.sections.length > 0 && new Set(topic.sections.map(s=>s.id)).size === topic.sections.length && topic.sections.every(s=>/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s.id)));
  for (const section of topic.sections) for (const link of section.links??[]) {
    const url = new URL(link.href,'https://example.test');
    check('internal product destination '+link.href, url.origin === 'https://example.test' && !url.search);
    if (url.pathname.startsWith('/documentation')) {
      const target = findDocumentationTopic(url.pathname.split('/')[2] || 'getting-started');
      check('documentation target resolves '+link.href, !!target && (!url.hash || target.sections.some(s=>'#'+s.id === url.hash)));
    } else check('product route exists '+link.href, routes.includes(url.pathname));
  }
}
check('unknown topic cannot resolve', findDocumentationTopic('unknown-topic') === undefined);
check('index has canonical destination', documentationHref('getting-started') === '/documentation');
const publicText = JSON.stringify(topics);
check('no internal operational documents leak into the public guide', !/SUPABASE|R2_|INNGEST|CLERK_SECRET|service_role|internal_user_roles|acceptance fixture|sk_test_|sb_secret_|X-Amz-/i.test(publicText));
console.log(JSON.stringify({ passed: checks.length, topics: topics.length, anchors: topics.reduce((count,t)=>count+t.sections.length,0), evidence: 'Public content graph and actual App Router destinations', checks }));
