// Actual source-card handlers with isolated hook primitives; no browser/network.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const bundle = await build({
  absWorkingDir: process.cwd(), tsconfig: path.resolve('tsconfig.json'),
  entryPoints: ['components/creation/studio-reference-sources.tsx'],
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic',
  plugins: [{ name: 'source-card-fixtures', setup(builder) {
    builder.onResolve({ filter: /^(react|@\/components\/(ui\/button|account-action)|\.\/(local-media-preview|persistent-media-preview))$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => {
      if (args.path === 'react') return { contents: 'export const useId=()=>"fixture",useRef=()=>({current:null});' };
      const name = args.path.endsWith('button') ? 'Button' : args.path.endsWith('account-action') ? 'AccountAction' : args.path.endsWith('local-media-preview') ? 'LocalMediaThumbnail' : 'PersistentMediaPreview';
      return { contents: `export function ${name}(props){return props.children;}` };
    });
  } }],
});
const bundled = { exports: {} };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, bundled, bundled.exports);
const { StudioReferenceSources } = bundled.exports;
const nodes = tree => !tree ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : typeof tree === 'object' && tree.props ? [tree, ...nodes(tree.props.children)] : [];
const text = tree => tree == null || typeof tree === 'boolean' ? '' : Array.isArray(tree) ? tree.map(text).join('') : typeof tree === 'object' ? text(tree.props?.children) : String(tree);
let checks = 0;
const check = (label, value) => { assert.ok(value, label); checks++; };
const network = globalThis.fetch;
globalThis.fetch = async () => { throw Error('NETWORK_FORBIDDEN'); };
try {
  for (const role of ['character', 'product']) {
    const calls = [];
    const local = { id: `${role}-local`, referenceId: `${role}-reference`, studioRole: role, kind: 'image', file: new File(['fixture'], `${role}.png`, { type: 'image/png' }) };
    const props = {
      label: role, addLabel: `Add ${role}`, role, references: [], uploadStates: {}, busy: false, signedIn: true, authReady: true,
      onAdd: files => calls.push(['add', files]), onUpload: media => calls.push(['retry', media]),
      onRemoveLocal() {}, onRemoveAsset() {}, onRecover() {}, onNameChange: (asset, value) => calls.push(['name', asset.id, value]),
    };
    const picker = nodes(StudioReferenceSources(props)).find(node => node.type === 'input' && node.props.type === 'file');
    picker.props.onChange({ currentTarget: { files: [], value: '' } });
    check(`${role}: canceled picker creates no selection/upload`, calls.length === 0);
    const input = { files: [local.file], value: 'selected' };
    picker.props.onChange({ currentTarget: input });
    check(`${role}: selection is local and clears only the picker value`, calls[0][0] === 'add' && calls[0][1][0] === local.file && input.value === '');
    props.references = [{ id: local.referenceId, images: [{ local }] }];
    for (const state of [{ status: 'preparing' }, { status: 'uploading', progress: 42 }, { status: 'verifying' }]) {
      props.uploadStates = { [local.id]: state }; props.busy = true;
      const tree = StudioReferenceSources(props);
      check(`${role}: ${state.status} affects only its image card`, nodes(tree).filter(node => node.props['aria-busy'] === true).length === 1);
      check(`${role}: ${state.status} retains the exact local File preview`, nodes(tree).some(node => node.type?.name === 'LocalMediaThumbnail' && node.props.media === local));
      if (state.status === 'uploading') check(`${role}: progress is local`, text(tree).includes('Uploading · 42%'));
    }
    props.uploadStates = { [local.id]: { status: 'failed', message: 'Fixture upload failed' } }; props.busy = false;
    const failed = StudioReferenceSources(props);
    check(`${role}: failure preserves preview and removes spinner`, text(failed).includes('Fixture upload failed') && !nodes(failed).some(node => node.props['aria-busy'] === true) && nodes(failed).some(node => node.type?.name === 'LocalMediaThumbnail'));
    const retry = nodes(failed).find(node => node.type?.name === 'Button' && text(node) === 'Retry upload');
    retry.props.onClick();
    check(`${role}: retry reuses the selected media`, calls.at(-1)[0] === 'retry' && calls.at(-1)[1] === local);
    const asset = { id: `${role}-saved`, filename: local.file.name, status: 'uploaded', referenceName: 'Saved name', studioRole: role };
    props.references = [{ id: local.referenceId, images: [{ asset }] }];
    const saved = StudioReferenceSources(props);
    const name = nodes(saved).find(node => node.type === 'input' && node.props.name === `${role}-name`);
    check(`${role}: saved image replaces only local preview`, nodes(saved).some(node => node.type?.name === 'PersistentMediaPreview' && node.props.asset === asset) && !nodes(saved).some(node => node.type?.name === 'LocalMediaThumbnail'));
    check(`${role}: name field is available after saving`, name?.props.value === 'Saved name' && !name.props.disabled);
    check(`${role}: persisted image announces save completion`, text(saved).includes('Image saved'));
    name.props.onChange({ target: { value: 'New name' } });
    check(`${role}: name edits use the persisted asset`, calls.at(-1).join(',') === `name,${asset.id},New name`);
    props.references = []; props.uploadStates = {}; props.busy = true;
    check(`${role}: another slot uploading does not show a loader here`, !nodes(StudioReferenceSources(props)).some(node => node.props['aria-busy'] === true));
  }
  console.log(JSON.stringify({ passed: checks, scope: 'Actual Character/Product card preview, progress, failure, retry, cancel and names; zero network calls' }));
} finally { globalThis.fetch = network; }
