// Focused actual Properties UI/asset/serialized-draft checks. No providers or database.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import sharp from 'sharp';
import { typescriptLoader } from './lib/load-typescript.mjs';

const require = createRequire(import.meta.url);
let checks = 0, requests = 0, updates = 0, nextId = 0;
const equal = (a, b) => { assert.deepEqual(a, b); checks++; };
const ok = value => { assert.ok(value); checks++; };
const oldFetch = globalThis.fetch;
globalThis.fetch = () => { requests++; throw Error('NETWORK_FORBIDDEN'); };
globalThis.__propertiesId = () => 'property-' + nextId++;
const fixtures = {
  react: 'export const useId=()=>globalThis.__propertiesId();',
  'next/image': 'export default function Image(props){return {type:"img",props};}',
  'lucide-react': ['Check', 'Circle', 'Info', 'ChevronDown', 'Film', 'Gamepad2', 'Lightbulb', 'Package', 'Clapperboard', 'WandSparkles'].map(name => 'export function '+name+'(props){return {type:"svg",props};}').join('\n'),
  '@/components/ui/select': 'export function Select(props){return {type:"select-fixture",props};}',
};
const elements = node => {
  if (node == null || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  if (typeof node.type === 'function') return elements(node.type(node.props));
  return node.props ? [node, ...elements(node.props.children)] : [];
};
const radios = tree => tree.filter(e => e.type === 'input' && e.props.type === 'radio');
const selected = tree => radios(tree).filter(e => e.props.checked).map(e => e.props.value);
const controls = tree => tree.filter(e => e.type === 'select-fixture');
const section = (tree, title) => {
  const node = tree.find(e => e.type === 'details' && elements(e.props.children).some(e => e.type === 'summary' && e.props.children[0] === title));
  assert.ok(node, 'Missing accordion: ' + title);
  return elements(node);
};
try {
  const bundle = await build({
    stdin: { contents: 'export {StudioGenerationProperties} from "./components/creation/studio-generation-properties";export {VisualStyleGallery} from "./components/creation/visual-style-gallery";export {StudioResolution} from "./components/creation/studio-resolution";', loader: 'tsx', resolveDir: process.cwd() },
    bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', tsconfig: resolve('tsconfig.json'),
    plugins: [{ name: 'properties-fixtures', setup(b) {
      b.onResolve({ filter: /.*/ }, args => Object.hasOwn(fixtures, args.path) ? { path: args.path, namespace: 'fixture' } : undefined);
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: fixtures[args.path] }));
    } }],
  });
  const loadedModule = { exports: {} };
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, loadedModule, loadedModule.exports);
  const { StudioGenerationProperties, VisualStyleGallery, StudioResolution } = loadedModule.exports;
  const settings = { duration: '10', aspectRatio: '9:16', resolution: '480p', visualStyle: 'Original', tone: 'Professional' };
  const options = {
    Duration: ['5', '10', '30'],
    'Visual Style': ['Original', 'Cartoon', 'Cinematic', 'Anime', 'Realistic'],
    Tone: ['Funny', 'Dramatic', 'Professional', 'Energetic', 'Storytelling'],
    Type: ['advertisement', 'explanation', 'unboxing'],
  };
  const fields = { Duration: 'duration', 'Visual Style': 'visualStyle', Tone: 'tone', Type: 'ugcType' };
  let current = { ...settings }, currentType = 'advertisement';
  const render = (studioMode = 'pro', extra = {}) => elements(StudioGenerationProperties({
    settings: current, ugcType: currentType, studioMode,
    onChange: value => { updates++; current = value; },
    onUgcTypeChange: value => { updates++; currentType = value; }, ...extra,
  }));
  const storage = new Map(), sessionStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  const loadDraft = () => typescriptLoader({}, { sessionStorage })('components/creation/guest-draft.ts');
  const paths = new Set();
  equal(selected(elements(VisualStyleGallery({ onChange: () => { throw Error('Render changed style'); } }))), ['Original']);
  const tree = render();
  equal(tree.filter(e => e.type === 'summary').map(e => e.props.children[0]), Object.keys(options));
  equal(controls(tree).length, 0);
  for (const detail of tree.filter(e => e.type === 'details')) {
    equal(detail.props.open, false); equal(detail.props.name, undefined);
    equal(detail.props.onToggle, undefined); // No sibling-close or project-write handler.
  }
  equal(new Set(radios(tree).map(e => e.props.name)).size, 4);
  const initialUpdates = updates; render(); render('basic'); equal(updates, initialUpdates);
  for (const [title, choices] of Object.entries(options)) {
    for (const value of choices) {
      const before = { ...current }, beforeType = currentType;
      const group = section(render(), title), input = radios(group).find(e => e.props.value === value);
      equal(radios(group).map(e => e.props.value), choices);
      equal(new Set(radios(group).map(e => e.props.name)).size, 1);
      const beforeUpdates = updates;
      input.props.onChange({ target: { checked: false } }); equal(updates, beforeUpdates);
      input.props.onChange({ target: { checked: true } }); equal(updates, beforeUpdates + 1);
      equal(current, title === 'Type' ? before : { ...before, [fields[title]]: value });
      equal(currentType, title === 'Type' ? value : beforeType);
      equal(selected(section(render(), title)), [value]);
      const basic = render('basic'); equal(radios(basic).length, 0);
      equal(basic.filter(e => e.type === 'summary').map(e => e.props.children[0]), ['Style & pacing']);
      equal(controls(basic).map(e => e.props.name), ['duration', 'visual-style', 'tone', 'ugc-type']);
      const control = controls(basic).find(e => e.props.name === { Duration: 'duration', 'Visual Style': 'visual-style', Tone: 'tone', Type: 'ugc-type' }[title]);
      equal(control.props.value, value);
      equal(selected(section(render(), title)), [value]);
      const brief = { title: 'Properties fixture', category: 'product-ad', prompt: 'Retained scene direction', creationType: 'ugc', ugcType: currentType, settings: current };
      loadDraft().rememberGuestDraft(brief, []);
      const restored = loadDraft().readGuestDraft();
      equal(JSON.parse(JSON.stringify(restored.brief.settings)), current); equal(restored.brief.ugcType, currentType);
      current = restored.brief.settings; currentType = restored.brief.ugcType;
      equal(selected(section(render(), title)), [value]);
      const next = choices[(choices.indexOf(value) + 1) % choices.length];
      control.props.onValueChange(next); equal(selected(section(render(), title)), [next]);
    }
    const group = section(render(), title);
    for (const radio of radios(group)) {
      ok(radio.props.className.includes('sr-only')); equal(radio.props.tabIndex, undefined); equal(radio.props.onKeyDown, undefined);
    }
    const card = group.find(e => e.props.className?.includes('peer-checked:border-primary'));
    for (const token of ['peer-focus-visible:ring-2', 'ring-offset-background', 'border-border', 'motion-reduce:transition-none']) ok(card.props.className.includes(token));
    for (const image of group.filter(e => e.type === 'img')) {
      equal(image.props.alt, ''); equal(image.props.width / image.props.height, 4 / 3); paths.add(image.props.src);
    }
    for (const input of radios(group).filter(e => e.props['aria-labelledby'])) {
      ok(group.some(e => e.props.id === input.props['aria-labelledby'])); equal(input.props['aria-describedby'], undefined);
    }
    const grid = group.find(e => e.props.className?.includes('grid-cols-['));
    ok(grid.props.className.includes('minmax(min(100%,')); ok(grid.props.className.includes('min-w-0'));
    ok(!/overflow-|max-h-|overscroll-/.test(grid.props.className));
    if (title !== 'Duration') {
      ok(card.props.className.includes('aspect-[4/3]'));
      ok(group.some(e => e.props.className?.includes('from-black/90') && e.props.className.includes('text-white') && e.props.className.includes('text-center')));
      equal(group.filter(e => e.type === 'p').length, 0);
      equal(radios(group).filter(e => e.props['aria-describedby']).length, 0);
    }
  }
  current.duration = '15';
  equal(selected(section(render(), 'Duration')), ['15']);
  equal(radios(section(render(), 'Duration')).map(e => e.props.value), ['15', '5', '10', '30']);
  radios(section(render(), 'Duration')).find(e => e.props.value === '10').props.onChange({ target: { checked: true } });
  equal(radios(section(render(), 'Duration')).map(e => e.props.value), ['5', '10', '30']);
  equal(section(render(), 'Duration').filter(e => e.type === 'path' && e.props.transform).map(e => e.props.transform), ['rotate(30 24 24)', 'rotate(60 24 24)', 'rotate(180 24 24)']);
  equal(render('pro', { ugcType: undefined }).filter(e => e.type === 'summary').map(e => e.props.children[0]), ['Duration', 'Visual Style', 'Tone']);
  equal(paths.size, 13);
  for (const resolution of ['480p', '720p', '1080p']) {
    let savedResolution = resolution, resolutionUpdates = 0;
    const renderResolution = imageCards => elements(StudioResolution({ value: savedResolution, imageCards, onChange: value => { savedResolution = value; resolutionUpdates++; } }));
    const gallery = renderResolution(true);
    equal(radios(gallery).map(e => e.props.value), ['480p', '720p', '1080p']);
    equal(selected(gallery), [resolution]); equal(resolutionUpdates, 0);
    const nextResolution = ['480p', '720p', '1080p'][(['480p', '720p', '1080p'].indexOf(resolution) + 1) % 3];
    radios(gallery).find(e => e.props.value === nextResolution).props.onChange({ target: { checked: true } });
    equal(savedResolution, nextResolution); equal(resolutionUpdates, 1);
    equal(selected(renderResolution(true)), [nextResolution]); equal(selected(renderResolution(false)), [nextResolution]);
    const group = gallery.find(e => e.type === 'fieldset');
    ok(gallery.some(e => e.props.id === group.props['aria-describedby']));
    const grid = gallery.find(e => e.props.className?.includes('grid-cols-['));
    ok(!/overflow-|max-h-|overscroll-/.test(grid.props.className));
    for (const image of gallery.filter(e => e.type === 'img')) { ok(image.props.src.startsWith('/images/resolutions/')); paths.add(image.props.src); }
    equal(render().filter(e => e.type === 'img' && e.props.src.includes('/resolutions/')).length, 0);
  }
  equal(paths.size, 16);
  let totalBytes = 0;
  for (const path of paths) {
    ok(path.startsWith('/images/'));
    const bytes = fs.readFileSync('public' + path), metadata = await sharp(bytes).metadata(); totalBytes += bytes.length;
    equal([metadata.width, metadata.height], [384, 288]); equal(metadata.format, 'webp');
    ok(bytes.length < 45_000);
  }
  const workspace = fs.readFileSync('components/creation/creation-workspace.tsx', 'utf8');
  const properties = workspace.slice(workspace.indexOf('properties={'));
  ok(properties.indexOf('title="Describe your scene"') < properties.indexOf('<StudioGenerationProperties'));
  ok(properties.indexOf('<StudioGenerationProperties') < properties.indexOf('title="Resolution"'));
  ok(workspace.includes('ugcType={creationType === "ugc" ? ugcType : undefined} onUgcTypeChange={setUgcType}'));
  equal(requests, 0);
  console.log(JSON.stringify({ passed: checks, assets: paths.size, totalBytes, networkRequests: requests, scope: 'Pro card handlers, independent accordions, Basic/Pro retention, draft refresh, legacy durations, accessible title-only cards, content-height grids without nested scrolling, responsive/theme classes and local WebPs. Hosted Save and browser visual/keyboard acceptance remain manual.' }));
} finally { globalThis.fetch = oldFetch; delete globalThis.__propertiesId; }
