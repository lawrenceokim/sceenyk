// Studio-only visual phase. Guest browser state/local Files only: no account,
// save, upload, generation, checkout, publishing or hosted workflow operations.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import nextEnv from '@next/env';
import { deployedBrowser } from './lib/deployed-browser.mjs';

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const baseline = process.argv.includes('--baseline');
const origin = process.env.VISUAL_ORIGIN ?? 'http://localhost:3018';
await deployedBrowser(origin, [], async ({ call: browserCall, evaluate, wait, navigate, dir, exceptions, onProtocolEvent }) => {
  const call=async(method,params)=>{try{return await browserCall(method,params);}catch(error){console.log(JSON.stringify({failedProtocol:method}));throw error;}};
  const layouts = [], captures = [], requests = [];
  await call('Network.enable');
  onProtocolEvent('Network.requestWillBeSent', event => requests.push(event.request.url));
  const resize = async (width, height) => {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor:1, mobile:width<768 });
    await delay(300);
  };
  const click = async selector => {
    const point=await evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
    await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
    await delay(250);
  };
  const key = async key => {
    // Native dialog dismissal needs the platform Escape code as well as the
    // DOM key name (the navigation Sheet handles the DOM event directly).
    const windowsVirtualKeyCode=({Escape:27,Tab:9,ArrowRight:39,ArrowLeft:37,Enter:13,PageDown:34})[key]??0;
    await call('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode});
    await call('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode});
    await delay(200);
  };
  const capture = async name => {
    // Headless Chrome can capture only a dirty paint region after pointer input.
    // Request a full repaint, restoring the exact body style before capture.
    await call('Page.bringToFront');
    await evaluate(`(async () => {
      await document.fonts.ready;
      const opacity=document.body.style.opacity;
      const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      document.body.style.opacity='0.99';await frame();
      document.body.style.opacity=opacity;await frame();
    })()`);
    await delay(250);
    // The first read also flushes the software compositor on Windows.
    await call('Page.captureScreenshot',{format:'png',fromSurface:true});
    await delay(60);
    const shot = await call('Page.captureScreenshot',{format:'png',fromSurface:true});
    fs.writeFileSync(path.join(dir,name+'.png'),Buffer.from(shot.data,'base64'));
    captures.push(name+'.png');
  };
  const geometry = () => evaluate(`(() => {
    const rect = selector => {const e=document.querySelector(selector);if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
    return {width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight,
      sidebar:rect('[aria-label="Workspace sidebar"]'),sources:rect('.studio-sources'),stage:rect('.studio-stage'),properties:rect('.studio-properties'),toolbar:rect('.studio-toolbar'),preview:rect('.studio-empty,.studio-media'),inlineSources:getComputedStyle(document.querySelector('.studio-sources')).display!=='none'};
  })()`);
  const setValue = (selector,value) => evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});const prototype=e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  try {
    const legacy=await fetch(origin+'/create?tag=one&tag=two&next=%2Fprojects%2Fexample',{redirect:'manual'});
    assert.equal(legacy.status,308);assert.equal(legacy.headers.get('location'),'/studio?tag=one&tag=two&next=%2Fprojects%2Fexample');
    await resize(1366,626);
    await call('Page.navigate',{url:origin+'/create?tag=one&tag=two#review'});
    await wait('location.pathname==="/studio"&&!!document.querySelector("textarea")');
    assert.equal(await evaluate('location.search+location.hash'),'?tag=one&tag=two#review','Legacy query and fragment preserved');
    await wait('!!document.querySelector("textarea")&&!!window.Clerk?.loaded');
    assert.ok(await evaluate('!window.Clerk.user'),'Guest Studio');
    const sizes = baseline ? [[1360,620],[1366,626],[550,623]] : [[1600,900],[1440,900],[1366,626],[1363,623],[1364,625],[550,608],[1360,620],[1200,800],[1024,768],[768,1024],[767,844],[550,623],[390,844],[320,640]];
    for (const dark of [true,false]) {
      await evaluate(`localStorage.setItem('sceenyk-theme','${dark?'dark':'light'}');window.dispatchEvent(new Event('sceenyk-theme-change'))`);
      for (const [width,height] of sizes) {
        await resize(width,height);
        const values = await geometry();
        assert.equal(await evaluate('getComputedStyle(document.documentElement).scrollbarWidth'),'none','Workspace root scrollbar hidden');
        assert.ok(values.documentWidth<=width+1,'No horizontal overflow');
        if (!baseline) {
          assert.equal(values.toolbar.height,54,'Screenshot-tuned toolbar');
          if (width>=1200) {
            assert.equal(values.sidebar.width,252,'Reference navigation width');
            assert.equal(values.sources.width,254,'Reference Sources rail');
            assert.equal(values.properties.width,252,'Reference inspector width');
            assert.ok(values.inlineSources&&values.stage.width>=400,'Four useful desktop areas');
            assert.equal(values.stage.y,8,'Viewport inset');
          }
          if (width<1024) assert.ok(!values.inlineSources,'Tablet/mobile Sources overlay');
          if (width<1200) assert.ok(values.properties.y>values.stage.y+values.stage.height,'Tablet/mobile Stage then Properties');
          if (width>=1024) assert.ok(values.documentHeight<=height+1,'Desktop panel scrolling');
        }
        layouts.push({theme:dark?'dark':'light',...values});
        await capture(`studio-${width}x${height}-${dark?'dark':'light'}`);
      }
      if (!baseline) {
        await resize(1363,623);
        await click('.studio-aspect-trigger');
        await wait('!!document.querySelector(".studio-aspect-popup")');
        assert.equal(await evaluate('document.querySelectorAll(".studio-aspect-popup input[type=radio]").length'),3,'Only existing ratios');
        const previous=await evaluate('document.querySelector(".studio-aspect-popup input:checked").value');
        await key('ArrowRight');
        assert.notEqual(await evaluate('document.querySelector(".studio-aspect-popup input:checked").value'),previous,'Native radio keyboard navigation');
        await capture('aspect-popover-'+(dark?'dark':'light'));
        await key('Escape');
        await wait('!document.querySelector(".studio-aspect-popup")');
        assert.ok(await evaluate('document.activeElement.classList.contains("studio-aspect-trigger")'),'Aspect focus return');
        await click('.studio-aspect-trigger'); await click('.studio-properties > header');
        await wait('!document.querySelector(".studio-aspect-popup")');
        for(const [name,scale,width,height] of [['zoom-125',1.25,1091,498],['zoom-150',1.5,911,417],['tablet',1,1024,768]]) {
          await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:scale,mobile:false});await delay(350);
          await click('.studio-sources-trigger');
          const panel=await evaluate('(() => {const e=document.querySelector(".studio-sources"),r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,modal:e.matches(":modal"),lock:document.body.style.overflow};})()');
          assert.equal(panel.width,254,'Reference-width floating rail');assert.ok(!panel.modal&&panel.lock!=='hidden','Tablet panel keeps background usable');
          assert.ok(Math.abs(panel.x-(width-262))<=1,'Right viewport anchor');
          await capture(name+'-sources-'+(dark?'dark':'light'));
          await click('.studio-sources-close');
          await click('.studio-aspect-trigger');await capture(name+'-aspect-'+(dark?'dark':'light'));await key('Escape');
          assert.ok((await geometry()).documentWidth<=width,'Zoom/tablet no overflow');
          layouts.push({theme:dark?'dark':'light',scenario:name,zoom:scale,...await geometry()});
        }
        for(const width of [390,320]) {
          await resize(width,844);await click('.studio-sources-trigger');
          assert.ok(await evaluate('document.activeElement.closest(".studio-sources")!==null'),'Modal focus inside');
          for(let step=0;step<12;step++)await key('Tab');
          assert.ok(await evaluate('document.activeElement.closest(".studio-sources")!==null'),'Modal traps keyboard focus');
          assert.equal(await evaluate('getComputedStyle(document.querySelector(".studio-sources .studio-panel-body")).scrollbarWidth'),'none','Sources scrollbar hidden');
          await capture('sources-'+width+'-'+(dark?'dark':'light'));await key('Escape');
          await click('.studio-aspect-trigger');await capture('aspect-'+width+'-'+(dark?'dark':'light'));await key('Escape');
          assert.equal(await evaluate('document.body.style.overflow'),'','Mobile scroll lock restored');
        }
      }
      await resize(1366,626);
      await click('button[aria-label="Collapse sidebar"]');
      assert.equal((await geometry()).sidebar.width,64);
      await capture('studio-collapsed-'+(dark?'dark':'light'));
      await click('button[aria-label="Expand sidebar"]');
      if (!baseline) {
        await click('.studio-inspector:nth-child(3) > summary');
        await capture('inspector-expanded-'+(dark?'dark':'light'));
        await click('.studio-inspector:nth-child(3) > summary');
        await resize(550,608);
        await click('button[aria-label="Open workspace navigation"]');
        await capture('mobile-navigation-'+(dark?'dark':'light')); await key('Escape');
        await wait('!document.querySelector("[data-slot=sheet-content]")');
        await click('.studio-sources-trigger');
        assert.ok(await evaluate('(() => {const r=document.querySelector("dialog:modal").getBoundingClientRect();return r.x===8&&r.y===8&&r.width===innerWidth-16&&r.height===innerHeight-16&&document.body.style.overflow==="hidden";})()'),'Inset mobile modal and scroll lock');
        await capture('mobile-sources-'+(dark?'dark':'light')); await key('Escape');
        assert.ok(await evaluate('document.activeElement.classList.contains("studio-sources-trigger")'),'Sources focus return');
      }
    }
    if (!baseline) {
      await resize(1366,626);
      await click('.studio-inspector:nth-child(2) > summary');
      await setValue('textarea[name="prompt"]','A quiet shoreline at dusk, with soft blue light and slow camera movement.');
      await setValue('input[name="title"]','Studio visual review');
      const before = await evaluate('[document.querySelector("textarea").value,document.querySelector("input[name=title]").value]');
      await click('button[aria-label="Collapse sidebar"]'); await click('button[aria-label="Expand sidebar"]');
      assert.deepEqual(await evaluate('[document.querySelector("textarea").value,document.querySelector("input[name=title]").value]'),before,'Navigation retains draft inputs');
      await capture('prompt-expanded-light');
      const file=path.resolve('public/images',fs.readdirSync('public/images').find(name=>name.endsWith('.png')));
      const doc=await call('DOM.getDocument'); const input=await call('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'input[type=file]'});
      await call('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[file]});
      await wait('!!document.querySelector(".studio-media img")?.naturalWidth');
      await capture('studio-local-source-light');
      await resize(550,623); const source=await evaluate('document.querySelector(".studio-media img").src');
      await click('.studio-sources-trigger'); await key('Escape');
      assert.equal(await evaluate('document.querySelector(".studio-media img").src'),source,'Sources retains preview');
      await resize(320,400); await click('.studio-sources-trigger');
      await evaluate('document.querySelector(".studio-sources .studio-panel-body").focus()');await key('PageDown');
      assert.ok(await evaluate('document.querySelector(".studio-sources .studio-panel-body").scrollTop>0'),'Keyboard scrolls hidden-bar panel');
      await evaluate('document.querySelector(".studio-sources .studio-panel-body").scrollTop=0');
      await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:150,y:200});
      await call('Input.dispatchMouseEvent',{type:'mouseWheel',x:150,y:200,deltaY:220,deltaX:0,pointerType:'mouse'});await delay(200);
      assert.ok(await evaluate('document.querySelector(".studio-sources .studio-panel-body").scrollTop>0'),'Wheel scrolls hidden-bar panel');
      await capture('mobile-sources-scrolled-light');
      await evaluate('window.sourcesTree=document.querySelector(".studio-sources");true');
      await resize(1024,768);
      assert.ok(await evaluate('window.sourcesTree===document.querySelector(".studio-sources")&&document.querySelector(".studio-sources").open&&!document.querySelector(".studio-sources").matches(":modal")&&document.body.style.overflow!=="hidden"'),'Modal becomes usable tablet panel without remount');
      await resize(1366,626); assert.ok((await geometry()).documentHeight<=627,'Import/resize remains contained');
      assert.equal(await evaluate('document.querySelector(".studio-media img").src'),source,'Resize retains local media');
      await navigate('/documentation');await click('[data-workspace-shell] a[href="/"]');
      await wait('location.pathname==="/"&&getComputedStyle(document.documentElement).scrollbarWidth==="auto"');
      assert.equal(await evaluate('getComputedStyle(document.documentElement).scrollbarWidth'),'auto','Client navigation restores landing scrollbar');
      for(const route of ['/documentation','/']) {
        await navigate(route);
        assert.equal(await evaluate('getComputedStyle(document.documentElement).scrollbarWidth'),route==='/'?'auto':'none','Workspace-only scrollbar scope '+route);
        assert.ok(await evaluate("!Array.from(document.querySelectorAll('a')).some(a=>a.getAttribute('href')==='/create')"),'Current navigation links use Studio');
      }

    }
    assert.ok(!requests.some(url=>/inngest\.(com|net)|api\.elevenlabs|generativelanguage|fal\.(ai|run)/.test(url)),'No hosted workflow/provider requests');
    assert.equal(exceptions.length,0,'No browser exceptions');
    fs.writeFileSync(path.join(dir,'studio-reference-report.json'),JSON.stringify({phase:'Studio only',baseline,scope:'Guest UI and existing local artwork only; no backend mutations',layouts,captures,exceptions},null,2));
    console.log(JSON.stringify({evidence:dir,layouts:layouts.length,captures:captures.length,exceptions:exceptions.length}));
  } catch (error) {
    await capture('failure');
    fs.writeFileSync(path.join(dir,'studio-reference-report.json'),JSON.stringify({baseline,layouts,captures,exceptions,error:error.message},null,2));
    const focus=await evaluate(`({active:document.activeElement?.tagName,classes:String(document.activeElement?.className),label:document.activeElement?.getAttribute('aria-label'),modal:!!document.querySelector('dialog:modal'),bodyOverflow:document.body.style.overflow})`);
    console.log(JSON.stringify({evidence:dir,failure:error.message,focus})); throw error;
  }
});
