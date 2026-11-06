import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import { typescriptLoader } from './lib/load-typescript.mjs';
import { connectedFixtureStory } from './lib/v3-connected-story-scenarios.mjs';
import { V3StoryboardContent } from '../components/creation/v3-storyboard-content.tsx';
import { DurationGallery } from '../components/creation/duration-gallery.tsx';
import { GenerationSettings } from '../components/creation/generation-settings.tsx';
const builder=createRequire(import.meta.url)('../lib/video-generation-package/builder.ts');
const normal=v=>JSON.parse(JSON.stringify(v));
const load=typescriptLoader({'@/lib/video-generation-package/builder':{...builder,packageDigest:(d,v)=>builder.packageDigest(d,normal(v)),canonicalJson:v=>builder.canonicalJson(normal(v))}},{structuredClone:normal}), {v3Input,v3Id}=load('scripts/final-video-v3-fixture.ts');
const {planStoryClips,validateConnectedStory}=load('lib/final-video-generation-v3/connected-story.ts');
const {validateCharacterCast}=load('lib/final-video-generation-v3/character-cast.ts');
const {storyboardDirectorInput}=load('lib/final-video-generation-v3/storyboard-director.ts');
const {connectedCastDirectorStoryboardSchema}=load('lib/final-video-generation-v3/contract.ts');
const {ugcSettingsSchema,legacyProjectSettingsSchema,saveStudioProjectSchema}=load('lib/projects/validation.ts');
const {proDurations}=load('lib/projects/options.ts');
const {generationInputsSchema}=load('lib/generation/validation.ts');
const {templateSnapshotSchema}=load('lib/marketplace/contract.ts');
let checks=0,networkCalls=0;
globalThis.fetch=async()=>{networkCalls++;throw Error('NETWORK_FORBIDDEN');};
const ok=value=>{assert.ok(value);checks++;},equal=(a,b)=>{assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));checks++;};
for(const duration of ['5','10','15','20','30','40','70','90','120']) {
 const settings={duration,aspectRatio:'9:16',visualStyle:'Realistic',tone:'Professional'},supported=['5','10','15','30'].includes(duration);
 equal(generationInputsSchema.safeParse({prompt:'A quiet studio.',category:'storytelling',settings,assetIds:[]}).success,supported);
 equal(templateSnapshotSchema.safeParse({version:1,category:'storytelling',instructions:'A quiet studio.',settings}).success,supported);
}
// The retail formula/configuration remains exact for every historical duration;
// extended drafts cannot become priced legacy workloads.
for(const duration of ['5','10','15','20','30','40','70','90','120']) {
 const rule={workload:{category:'cinematic',duration,operation:'new_generation',modelTier:'unassigned',quality:'workspace-default',features:[]},credits:7};
 const pricing=typescriptLoader({}, {process:{env:{SCEENYK_TEST_PRICING_JSON:JSON.stringify({version:'offline-m4',rules:[rule]})}}})('lib/pricing/config.ts');
 if(['5','10','15','30'].includes(duration))equal(pricing.quoteGenerationCost({category:'cinematic',settings:{duration}}).requiredCredits,7);
 else {assert.throws(()=>pricing.getPricingConfiguration());checks++;}
}
for(const duration of [10,30,40,70,90,120]) {
 const boundaries=planStoryClips(duration*1000),short=v3Input(boundaries.flatMap(b=>[4000,b.durationMs-4000])).storyboardContent;
 const story=duration>30?connectedFixtureStory(short,boundaries):short;
 const html=renderToStaticMarkup(createElement(V3StoryboardContent,{storyboard:story}));
 ok(html.includes(`${duration}s`));ok(html.includes(story.concept));equal((html.match(/Shot \d+<\//g)??[]).length,story.scenes.length);
 equal((html.match(/aria-label="Planned story clips"/g)??[]).length,duration>30?1:0);
 equal((html.match(/Clip timing:/g)??[]).length,duration>30?story.scenes.length:0);
 equal((html.match(/<summary/g)??[]).length,1+story.scenes.length+(duration>30?boundaries.length:0));
 if(duration>30)for(const clip of story.clips){ok(html.includes(`Clip ${clip.number} · ${clip.durationMs/1000}s`));ok(html.includes(clip.purpose));}
 // Shared Basic/legacy validation still rejects new Pro-only requests.
 const settings={duration:String(duration),aspectRatio:'9:16',visualStyle:'Realistic',tone:'Professional'};
 equal(ugcSettingsSchema.safeParse(settings).success,duration<=30);
 equal(legacyProjectSettingsSchema.safeParse(settings).success,duration<=30);
 equal(saveStudioProjectSchema.shape.settings.safeParse(settings).success,true);
}
// Multiple distinct characters, alternating speakers, one continuity contract.
const cast=[{characterId:v3Id(41),referenceId:v3Id(42),name:'Ari'},{characterId:v3Id(43),referenceId:v3Id(44),name:'Bea'}];
const boundaries=planStoryClips(70000),story=connectedFixtureStory(v3Input([10000,20000,15000,15000,10000]).storyboardContent,boundaries);
story.cast=cast;
story.scenes.forEach((shot,index)=>{shot.characterIds=cast.map(c=>c.characterId);shot.speech=[{speaker:'character',characterId:cast[index%2].characterId,text:index===0?'Look here.':'It continues.',startMs:shot.startMs+1000,endMs:shot.startMs+3000,delivery:load('lib/execution-v1/contract.ts').defaultDelivery(),deliveryNote:'Same calm voice throughout.'}];});
const parsed=connectedCastDirectorStoryboardSchema.parse(story);
validateConnectedStory(parsed,boundaries);checks++;
const refs=cast.map(c=>({id:c.referenceId,characterId:c.characterId,name:c.name,role:'character'}));
validateCharacterCast(parsed,refs);checks++;
const html=renderToStaticMarkup(createElement(V3StoryboardContent,{storyboard:parsed}));ok(html.includes('Ari, Bea'));ok(html.includes('Bea · '));
const swapped=structuredClone(parsed);swapped.scenes[0].speech[0].characterId=v3Id(55);
assert.throws(()=>validateCharacterCast(swapped,refs),/V3_CHARACTER_SPEAKER_INVALID/);checks++;
const brief={id:v3Id(2),title:'One connected story',prompt:'Two characters continue one quiet demonstration; no music.',duration:'70',aspect_ratio:'9:16',video_resolution:'1080p',visual_style:'Anime',tone:'Professional',category:'storytelling',ugc_type:'explanation',creation_type:'ugc'};
const instruction=storyboardDirectorInput(brief,['character','character','product','location'],{prompt:'Approved studio'},cast,boundaries);
const changedBoundaries=structuredClone(boundaries);changedBoundaries[0].durationMs-=1000;
assert.throws(()=>storyboardDirectorInput(brief,['character','character','product','location'],null,cast,changedBoundaries),/V3_CLIP_PLAN_CHANGED/);checks++;
for(const value of ['Ari','Bea','1080p','Anime','explanation','no music','clip-3','70000','continuityIn MUST exactly equal','localStartMs'])ok(instruction.includes(value));
// The duration UI preserves saved short values and has one checked radio.
for(const duration of [...proDurations.map(d=>d.value),'5','15']) {
 const markup=renderToStaticMarkup(createElement(DurationGallery,{value:duration,onChange:()=>{}}));
 equal((markup.match(/type="radio"/g)??[]).length,proDurations.length+(['5','15'].includes(duration)?1:0));
 equal((markup.match(/ checked=""/g)??[]).length,1);ok(markup.includes(`value="${duration}"`));
}
const settings={duration:'70',aspectRatio:'9:16',visualStyle:'Realistic',tone:'Professional'};
const basic=renderToStaticMarkup(createElement(GenerationSettings,{settings,onChange:()=>{}}));ok(basic.includes('70 seconds (saved Pro)'));
equal(networkCalls,0);console.info(JSON.stringify({connectedStoryUiAndCastChecks:checks,realNetworkCalls:networkCalls}));
