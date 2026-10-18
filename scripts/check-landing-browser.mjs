// Read-only acceptance against a running production build. No database clients,
// session creation, provider requests, payments or hosted workflow dispatch.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import sharp from 'sharp';

const origin = process.argv[2] ?? 'http://localhost:3015';
assert.ok(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin), 'LOCAL_PRODUCTION_ONLY');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sceenyk-landing-acceptance-'));
const profile = path.join(directory, 'profile');
const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
const checks = [], screenshots = [], exceptions = [], requests = [];
let socket;
let currentCase = 'startup';
let currentRoute = '/';
function check(name, condition) { assert.ok(condition, name); checks.push(name); }
try {
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let n = 0; n < 150 && !fs.existsSync(portFile); n++) await delay(100);
  assert.ok(fs.existsSync(portFile), 'CHROME_AVAILABLE');
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0;
  const pending = new Map();
  socket.onclose = event => {
    for (const task of pending.values()) task.reject(new Error('CHROME_CONNECTION_CLOSED_' + event.code));
    pending.clear();
  };
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const task = pending.get(message.id); pending.delete(message.id);
      if (message.error) task?.reject(new Error(message.error.message)); else task?.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') {
      const detail = message.params.exceptionDetails;
      const description = String(detail.exception?.description ?? detail.text).split('\n')[0]
        .replace(/https?:\/\/[^\s)]+/g, '[url]').replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, '[token]');
      exceptions.push({ case: currentCase, route: currentRoute, message: description.slice(0, 300) });
    }
    if (message.method === 'Network.requestWillBeSent') requests.push({ url: message.params.request.url, method: message.params.request.method });
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error('CDP_TIMEOUT_' + method)); }, 20000);
    pending.set(id, { resolve: value => { clearTimeout(timeout); resolve(value); }, reject: error => { clearTimeout(timeout); reject(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error('BROWSER_EVALUATION_FAILED: ' + result.exceptionDetails.text);
    return result.result.value;
  };
  const wait = async expression => {
    for (let n = 0; n < 200; n++) { if (await evaluate(expression)) return; await delay(100); }
    throw new Error('BROWSER_TIMEOUT: ' + expression.slice(0, 100));
  };
  await call('Page.enable'); await call('Runtime.enable'); await call('Network.enable');
  await call('Page.addScriptToEvaluateOnNewDocument', { source: "window.__landingCLS=0;new PerformanceObserver(list=>{for(const entry of list.getEntries())if(!entry.hadRecentInput)window.__landingCLS+=entry.value}).observe({type:'layout-shift',buffered:true});" });
  const navigate = async route => {
    currentRoute = route;
    await call('Page.navigate', { url: origin + route });
    await wait("document.readyState==='complete' && location.pathname === " + JSON.stringify(route));
  };
  async function verifyOpaqueHero(label, phase) {
    const geometry=await evaluate("(()=>{const c=document.querySelector('h1').parentElement.parentElement.getBoundingClientRect(),s=document.querySelector('.sceenyk-landing-studioFrame').getBoundingClientRect();return {left:0,top:Math.max(0,Math.ceil(c.top+1)),width:innerWidth,bottom:Math.floor(Math.min(innerHeight,s.top-4)),copyTop:c.top,studioTop:s.top}})()");
    const visible=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await evaluate("document.querySelector('[data-landing-gallery] > div').style.visibility='hidden'");
    await delay(80);
    const hidden=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await evaluate("document.querySelector('[data-landing-gallery]').style.visibility=''");
    const crop={left:0,top:geometry.top,width:geometry.width,height:geometry.bottom-geometry.top};
    const first=await sharp(Buffer.from(visible.data,'base64')).extract(crop).removeAlpha().raw().toBuffer();
    const second=await sharp(Buffer.from(hidden.data,'base64')).extract(crop).removeAlpha().raw().toBuffer();
    let maxDifference=0,changedChannels=0;
    for(let i=0;i<first.length;i++){const delta=Math.abs(first[i]-second[i]);maxDifference=Math.max(maxDifference,delta);if(delta>1)changedChannels++;}
    const file=path.join(directory,label+'-'+phase+'-opacity.json');
    fs.writeFileSync(file,JSON.stringify({geometry,maxDifference,changedChannels},null,2));
    for(const [suffix,shot]of [['visible',visible],['gallery-hidden',hidden]]){const name=path.join(directory,label+'-'+phase+'-'+suffix+'.png');fs.writeFileSync(name,Buffer.from(shot.data,'base64'));screenshots.push(name);}
    check(label+' '+phase+' artwork cannot show through copy or pre-Studio gap',maxDifference<=1);
  }
  async function verifyFrostedNavbar(label) {
    await evaluate("(()=>{const r=document.querySelector('#marketplace-story article img').getBoundingClientRect();scrollTo({top:scrollY+r.top+24,behavior:'instant'})})()");await delay(350);
    const height=await evaluate("Math.ceil(document.querySelector('[data-landing-navbar]').getBoundingClientRect().height)");
    const actual=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await evaluate("(()=>{const s=document.createElement('style');s.id='frost-probe';s.textContent='[data-landing-navbar]::before{background:var(--background)!important}';document.head.append(s)})()");await delay(80);
    const solid=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await evaluate("document.getElementById('frost-probe').textContent='[data-landing-navbar]::before{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}'");await delay(80);
    const unblurred=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await evaluate("document.getElementById('frost-probe').remove()");
    const samples=[];
    for(const [name,shot]of [['frosted',actual],['solid-probe',solid],['unblurred-probe',unblurred]]){
      const buffer=Buffer.from(shot.data,'base64'),meta=await sharp(buffer).metadata();
      samples.push(await sharp(buffer).extract({left:0,top:0,width:meta.width,height}).removeAlpha().raw().toBuffer());
      const file=path.join(directory,label+'-navbar-'+name+'.png');fs.writeFileSync(file,buffer);screenshots.push(file);
    }
    const difference=(a,b)=>a.reduce((sum,value,i)=>sum+Math.abs(value-b[i]),0)/a.length;
    const result={visibleBackdropDifference:difference(samples[0],samples[1]),blurDifference:difference(samples[0],samples[2])};
    fs.writeFileSync(path.join(directory,label+'-navbar-frost.json'),JSON.stringify(result,null,2));
    check(label+' artwork stays visible through navbar tint',result.visibleBackdropDifference>.1);
    check(label+' navbar visibly distorts underlying artwork',result.blurDifference>.1);
  }
  let preferenceScript;
  async function configure(width, theme, reduced = false, height = 1000, deviceScaleFactor = 1, savedPreference = theme) {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile: width < 600 });
    await call('Emulation.setTouchEmulationEnabled', { enabled: width < 1000 });
    await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }, { name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }] });
    if (preferenceScript) await call('Page.removeScriptToEvaluateOnNewDocument', { identifier: preferenceScript });
    const script = await call('Page.addScriptToEvaluateOnNewDocument', { source: savedPreference === null ? "localStorage.removeItem('sceenyk-theme');" : `localStorage.setItem('sceenyk-theme',${JSON.stringify(savedPreference)});` });
    preferenceScript = script.identifier;
  }
  for (const width of [1440, 1024, 768, 390, 320]) {
    for (const theme of ['light', 'dark']) {
      const label = `${width}-${theme}`;
      currentCase = label;
      await configure(width, theme);
      await navigate('/');
      await wait("!!document.querySelector('[data-landing-navbar]') && document.querySelectorAll('[data-depth]').length===20");
      await wait("!document.querySelector('script[data-clerk-publishable-key]') || !!window.Clerk?.loaded");
      // Native lazy loading is exercised by real scrolling, not forced to eager.
      await evaluate("(async()=>{await document.fonts.ready;for(const section of document.querySelectorAll('main section')){section.scrollIntoView({behavior:'instant',block:'start'});await new Promise(r=>setTimeout(r,120));}scrollTo({top:0,behavior:'instant'});})()");
      await wait("Array.from(document.querySelectorAll('[data-landing-page] img')).filter(i=>i.getClientRects().length).every(i=>i.complete&&i.naturalWidth>0)");
      await delay(850);
      const state = await evaluate(`(()=>{
        const rect=s=>document.querySelector(s).getBoundingClientRect();
        const main=document.querySelector('[data-landing-page]');
        const images=[...main.querySelectorAll('img')].filter(i=>i.getClientRects().length);
        const prices=[...document.querySelectorAll('#pricing article')].map(e=>e.getBoundingClientRect().left);
        const nav=document.querySelector('[data-landing-navbar]');
        const title=document.querySelector('h1');
        const button=[...nav.querySelectorAll('button')].find(e=>e.getAttribute('aria-label')==='Open navigation');
        return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,dark:document.documentElement.classList.contains('dark'),h1:document.querySelectorAll('h1').length,titleFits:title.scrollWidth<=title.clientWidth+1,stageRatio:rect('img[alt^="Cinematic concept"]').width/rect('img[alt^="Cinematic concept"]').height,pricesStacked:new Set(prices.map(Math.round)).size===1,menuVisible:!!button&&!!button.getClientRects().length,imagesLoaded:images.every(i=>i.naturalWidth>0),optimized:images.every(i=>i.currentSrc.includes('/_next/image')),cls:window.__landingCLS,footer:!!document.querySelector('[data-landing-footer]'),links:[...main.querySelectorAll('a')].map(a=>a.getAttribute('href')),background:getComputedStyle(document.body).backgroundColor};
      })()`);
      fs.writeFileSync(path.join(directory, label + '-layout.json'), JSON.stringify(state, null, 2));
      const full = await call('Page.getLayoutMetrics');
      const screenshot = path.join(directory, label + '.png');
      const capture = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: Math.ceil(full.cssContentSize.height), scale: 1 } });
      fs.writeFileSync(screenshot, Buffer.from(capture.data, 'base64')); screenshots.push(screenshot);
      check(label + ' no horizontal overflow', state.scrollWidth <= state.width);
      check(label + ' expected theme', state.dark === (theme === 'dark'));
      check(label + ' one readable headline', state.h1 === 1 && state.titleFits);
      check(label + ' widescreen Studio preview', Math.abs(state.stageRatio - 16 / 9) < 0.015);
      check(label + ' optimized loaded images', state.imagesLoaded && state.optimized);
      check(label + ' no significant layout shift', state.cls < 0.1);
      check(label + ' footer and destinations', state.footer && state.links.includes('/create') && state.links.includes('/marketplace') && state.links.includes('/dashboard/settings/credits'));
      check(label + ' responsive pricing', width >= 700 || state.pricesStacked);
      check(label + ' responsive menu', state.menuVisible === (width < 1000));
      check(label + ' viewport hero with bottom-aligned foreground copy', await evaluate("(()=>{const h=document.querySelector('[data-landing-hero]'),c=document.querySelector('h1').parentElement.parentElement,r=c.getBoundingClientRect();return Math.abs(h.getBoundingClientRect().height-innerHeight)<2&&r.top>innerHeight*.58&&r.bottom>innerHeight*.85&&r.bottom<innerHeight&&getComputedStyle(c).zIndex>getComputedStyle(document.querySelector('[data-landing-gallery]')).zIndex})()"));
      check(label + ' frosted borderless fixed navigation with lower dissolve', await evaluate("(()=>{const n=document.querySelector('[data-landing-navbar]'),s=getComputedStyle(n),p=getComputedStyle(n,'::before');return s.position==='fixed'&&n.getBoundingClientRect().top===0&&p.backdropFilter.includes('blur')&&p.backdropFilter.includes('saturate')&&p.backgroundColor.includes('0.68')&&p.maskImage.includes('linear-gradient')&&parseFloat(p.bottom)<0&&p.pointerEvents==='none'&&s.borderBottomWidth==='0px'&&s.boxShadow==='none'})()"));
      check(label + ' navbar controls do not overlap brand', await evaluate("(()=>{const n=document.querySelector('[data-landing-navbar] > div');return n.firstElementChild.getBoundingClientRect().right<=n.lastElementChild.getBoundingClientRect().left})()"));
      check(label + ' two oversized faded edge layers behind artwork', await evaluate("(()=>{const tiles=[...document.querySelectorAll('[data-edge]')];return tiles.length===2&&tiles.every(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e),visible=Math.max(0,Math.min(innerWidth,r.right)-Math.max(0,r.left));return visible>0&&visible/r.width<.4&&parseFloat(s.opacity)<.35&&s.maskImage!=='none'&&s.zIndex==='0'&&r.width>innerWidth*.45})})()"));
      if ([1440,768,390].includes(width)) {
        const saveViewport = async suffix => {
          const file = path.join(directory, label + '-' + suffix + '.png');
          const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
          fs.writeFileSync(file, Buffer.from(shot.data, 'base64')); screenshots.push(file);
        };
        await saveViewport('hero');
        await verifyOpaqueHero(label,'initial');
        const copyTop=await evaluate("document.querySelector('h1').getBoundingClientRect().top");
        await evaluate("scrollTo({top:innerHeight*.6,behavior:'instant'})"); await delay(850);
        check(label + ' copy and story scroll over stationary gallery', await evaluate("(()=>{const g=document.querySelector('[data-landing-gallery]').getBoundingClientRect(),h=document.querySelector('[data-landing-hero]').getBoundingClientRect(),c=document.querySelector('[data-landing-content]'),r=c.getBoundingClientRect();return Math.abs(g.top)<1&&Math.abs(h.top+scrollY)<1&&Math.abs(document.querySelector('h1').getBoundingClientRect().top+scrollY-"+copyTop+")<1&&Math.abs(r.top-innerHeight*.4)<2&&c.contains(document.elementFromPoint(innerWidth/2,innerHeight*.7))&&document.querySelector('header').getBoundingClientRect().top===0})()"));
        check(label + ' increased section spacing', await evaluate("parseFloat(getComputedStyle(document.querySelector('[data-landing-content]')).rowGap)>=56"));
        await saveViewport('scroll-over');
        await verifyOpaqueHero(label,'scrolled');
        await evaluate("scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'})"); await delay(400);
        await wait("document.querySelector('[data-landing-footer] img[aria-hidden]')?.complete");
        check(label + ' footer decorative image loaded', await evaluate("(()=>{const i=document.querySelector('[data-landing-footer] img[aria-hidden]');return i.naturalWidth>0&&i.currentSrc.includes('/_next/image')&&getComputedStyle(i).objectFit==='cover'&&getComputedStyle(i).opacity<.3})()"));
        const footerContrast=await evaluate(`(()=>{
          const f=document.querySelector('[data-landing-footer]'),r=f.getBoundingClientRect(),img=f.querySelector('img[aria-hidden]');
          const canvas=document.createElement('canvas');canvas.width=Math.ceil(r.width);canvas.height=Math.ceil(r.height);const ctx=canvas.getContext('2d');
          const scale=Math.max(r.width/img.naturalWidth,r.height/img.naturalHeight);ctx.drawImage(img,(r.width-img.naturalWidth*scale)*.5,(r.height-img.naturalHeight*scale)*.52,img.naturalWidth*scale,img.naturalHeight*scale);
          const colorCanvas=document.createElement('canvas');colorCanvas.width=colorCanvas.height=1;const c=colorCanvas.getContext('2d');
          const rgb=value=>{c.clearRect(0,0,1,1);c.fillStyle=value;c.fillRect(0,0,1,1);return [...c.getImageData(0,0,1,1).data].slice(0,3)};
          const luminance=rgb=>rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
          const base=rgb(getComputedStyle(f).backgroundColor);let minimum=Infinity;const samples=[];
          for(const e of f.querySelectorAll('p,nav a,nav h2,.sceenyk-landing-footerBottom span,.sceenyk-landing-footerStudio')){
            const b=e.getBoundingClientRect(),foreground=luminance(rgb(getComputedStyle(e).color));
            for(const fraction of [.05,.5,.95]){const x=Math.min(canvas.width-1,Math.max(0,Math.round(b.left-r.left+b.width*fraction))),y=Math.min(canvas.height-1,Math.max(0,Math.round(b.top-r.top+b.height/2))),pixel=ctx.getImageData(x,y,1,1).data,alpha=.28*(1-(.7-.45*y/r.height)),background=luminance(base.map((v,i)=>v*(1-alpha)+pixel[i]*alpha));const ratio=(Math.max(foreground,background)+.05)/(Math.min(foreground,background)+.05);minimum=Math.min(minimum,ratio);samples.push({text:e.textContent.trim().slice(0,45),ratio});}
          }return {minimum,samples};
        })()`);
        fs.writeFileSync(path.join(directory,label+'-footer-contrast.json'),JSON.stringify(footerContrast,null,2));
        check(label + ' footer text contrast over supplied artwork', footerContrast.minimum>=4.5);
        await saveViewport('footer');
        await verifyFrostedNavbar(label);
        await evaluate("scrollTo({top:0,behavior:'instant'})");
      }
      if (width === 390 || width === 768) {
        const trigger=await evaluate("(()=>{const r=document.querySelector('[aria-label=\"Open navigation\"]').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()");
        await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...trigger, button: 'left', clickCount: 1 });
        await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...trigger, button: 'left', clickCount: 1 });
        await wait("!!document.querySelector('[role=dialog]')");
        await wait("document.querySelector('[role=dialog]')?.contains(document.activeElement)");
        await wait("Math.abs(document.querySelector('[data-slot=sheet-content]').getBoundingClientRect().left)<1");
        check(label + ' left menu beside logo and left drawer with account controls', await evaluate("(()=>{const m=document.querySelector('[aria-label=\"Open navigation\"]').getBoundingClientRect(),logo=[...document.querySelectorAll('[data-landing-navbar] a img')].find(e=>e.getClientRects().length).getBoundingClientRect(),d=document.querySelector('[data-slot=sheet-content]');return m.right<logo.left&&d.dataset.side==='left'&&Math.abs(d.getBoundingClientRect().left)<1&&!!d.querySelector('[data-landing-drawer-account]')&&![...document.querySelectorAll('[data-landing-navbar] button')].some(e=>e.textContent.trim()==='Sign In'&&e.getClientRects().length)})()"));
        check(label + ' menu focus enters drawer', await evaluate("document.querySelector('[role=dialog]').contains(document.activeElement)"));
        let trapped = true;
        for (let tab = 0; tab < 12; tab++) {
          await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
          await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
          await delay(60);
          trapped &&= await evaluate("document.querySelector('[role=dialog]').contains(document.activeElement)");
        }
        check(label + ' keyboard focus remains in drawer', trapped);
        await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await delay(400);
        check(label + ' menu Escape and focus return', await evaluate("!document.querySelector('[role=dialog]')&&document.activeElement.getAttribute('aria-label')==='Open navigation'"));
        await evaluate("document.querySelector('[aria-label=\"Open navigation\"]').click()");
        await wait("!!document.querySelector('[data-landing-drawer-account] button')&&!document.querySelector('[data-landing-drawer-account] button').disabled");
        await wait("Math.abs(document.querySelector('[data-slot=sheet-content]').getBoundingClientRect().left)<1&&getComputedStyle(document.querySelector('[data-slot=sheet-content]')).opacity==='1'");
        const drawerShot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
        const drawerFile=path.join(directory,label+'-drawer.png');fs.writeFileSync(drawerFile,Buffer.from(drawerShot.data,'base64'));screenshots.push(drawerFile);
        await evaluate("document.querySelector('[data-landing-drawer-account] button').click()");
        await wait("!!document.querySelector('.cl-modalContent')");
        await wait("document.querySelector('.cl-modalContent')?.contains(document.activeElement)");
        check(label + ' real Clerk modal receives focus', await evaluate("!document.querySelector('[data-slot=sheet-content]')&&document.querySelector('.cl-modalContent').contains(document.activeElement)"));
        await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await wait("!document.querySelector('.cl-modalContent')");
        check(label + ' Clerk modal dismisses', true);
      }
    }
  }
  await configure(1440, 'dark'); await navigate('/'); await delay(800);
  const resting = await evaluate("[...document.querySelectorAll('[data-depth]')].map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,matrix:getComputedStyle(e).transform.split(',').slice(0,4).join(',')}))");
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1200, y: 220 }); await delay(900);
  const movement = await evaluate("[...document.querySelectorAll('[data-depth]')].map(e=>({depth:Number(e.dataset.depth),x:parseFloat(e.style.getPropertyValue('--move-x'))||0,rotation:e.style.getPropertyValue('--rotation'),matrix:getComputedStyle(e).transform}))");
  check('fine-pointer independent depth', movement.some(e=>Math.abs(e.x)>1)&&Math.abs(movement.find(e=>e.depth===1).x)>Math.abs(movement.find(e=>e.depth===0.35).x)*2);
  check('parallax remains bounded with resting rotations', movement.every(e=>Math.abs(e.x)<=13&&e.rotation.endsWith('deg')));
  await verifyOpaqueHero('fine-pointer','moving');
  const moving = await evaluate("[...document.querySelectorAll('[data-depth]')].map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,matrix:getComputedStyle(e).transform.split(',').slice(0,4).join(',')}))");
  check('parallax preserves image sizes and rotation', moving.every((e,i)=>Math.abs(e.width-resting[i].width)<.05&&Math.abs(e.height-resting[i].height)<.05&&e.matrix===resting[i].matrix));
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1200, y: 20 }); await delay(1200);
  check('smooth return to rest and stopped frame loop', await evaluate("[...document.querySelectorAll('[data-depth]')].every(e=>Math.abs(parseFloat(e.style.getPropertyValue('--move-x'))||0)<.02)&&!document.querySelector('[data-parallax-active]')"));
  await configure(1440, 'light', true); await navigate('/'); await delay(800);
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1200, y: 220 }); await delay(300);
  check('reduced motion disables parallax, reveals and hero pinning', await evaluate("[...document.querySelectorAll('[data-depth]')].every(e=>!parseFloat(e.style.getPropertyValue('--move-x')))&&document.querySelector('[data-landing-page]').getAnimations({subtree:true}).length===0&&getComputedStyle(document.querySelector('[data-landing-gallery]')).position==='relative'"));
  await configure(390, 'light'); await navigate('/'); await delay(800);
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 300, y: 200 }); await delay(300);
  check('touch/mobile disables parallax', await evaluate("[...document.querySelectorAll('[data-depth]')].every(e=>!parseFloat(e.style.getPropertyValue('--move-x')))"));
  for (const theme of ['light','dark']) {
    // 200%/400% browser zoom reflow has these effective CSS viewport sizes.
    // This emulates that layout, without disabling or counteracting user zoom.
    for (const [width,height,scale,label] of [[390,844,1,'phone'],[844,390,1,'landscape'],[720,500,2,'zoom-200'],[360,250,4,'zoom-400']]) {
      currentCase = `${label}-${theme}`;
      await configure(width,theme,false,height,scale); await navigate('/'); await delay(850);
      check(currentCase + ' accessible reflow and fixed navbar', await evaluate("(()=>{const c=document.querySelector('h1').parentElement.parentElement,r=c.getBoundingClientRect(),h=document.querySelector('main section').getBoundingClientRect();return document.documentElement.scrollWidth<=innerWidth&&r.top>=document.querySelector('header').getBoundingClientRect().bottom&&r.bottom<=h.bottom&&document.querySelector('h1').scrollWidth<=document.querySelector('h1').clientWidth+1})()"));
      check(currentCase + ' viewport height or accessible short-height flow', await evaluate("(()=>{const h=document.querySelector('main section');return innerHeight<=540?getComputedStyle(h).position==='relative'&&h.getBoundingClientRect().height>=innerHeight:Math.abs(h.getBoundingClientRect().height-innerHeight)<2})()"));
      check(currentCase + ' navbar controls do not overlap brand', await evaluate("(()=>{const n=document.querySelector('[data-landing-navbar] > div');return n.firstElementChild.getBoundingClientRect().right<=n.lastElementChild.getBoundingClientRect().left})()"));
      const file=path.join(directory,currentCase+'.png');
      const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      fs.writeFileSync(file,Buffer.from(shot.data,'base64'));screenshots.push(file);
      if (height<=540) {
        await evaluate("(()=>{const a=document.querySelector('main section a');a.scrollIntoView({block:'center',behavior:'instant'});a.focus({preventScroll:true})})()");
        check(currentCase + ' foreground CTA reachable below fixed header', await evaluate("(()=>{const r=document.activeElement.getBoundingClientRect();return r.top>=document.querySelector('header').getBoundingClientRect().bottom&&r.bottom<=innerHeight})()"));
        if (scale===4) {
          const controls=path.join(directory,currentCase+'-controls.png');
          const capture=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
          fs.writeFileSync(controls,Buffer.from(capture.data,'base64'));screenshots.push(controls);
        }
      }
    }
  }
  await configure(390,'light'); await navigate('/'); await delay(800);
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  check('keyboard skip link visible', await evaluate("document.activeElement.classList.contains('skip-link')&&document.activeElement.getBoundingClientRect().top>=0"));
  await evaluate("document.querySelector('a[href=\"#pricing\"]').click()"); await delay(1000);
  fs.writeFileSync(path.join(directory, 'pricing-anchor.json'), JSON.stringify(await evaluate("({hash:location.hash,top:document.querySelector('#pricing').getBoundingClientRect().top,scrollY,viewport:innerHeight,margin:getComputedStyle(document.querySelector('#pricing')).scrollMarginTop})"), null, 2));
  check('Pricing anchor scrolls to content', await evaluate("location.hash==='#pricing'&&document.querySelector('#pricing').getBoundingClientRect().top>=0&&document.querySelector('#pricing').getBoundingClientRect().top<180"));
  await call('Emulation.setScriptExecutionDisabled', { value: true }); await navigate('/');
  check('server-rendered content has no motion-induced hiding', await evaluate("!!document.querySelector('h1')&&!!document.querySelector('#pricing')&&getComputedStyle(document.querySelector('#studio-preview')).opacity==='1'"));
  await call('Emulation.setScriptExecutionDisabled', { value: false });
  for (const route of ['/create', '/marketplace']) {
    await navigate(route);
    check(route + ' retains original public chrome', await evaluate("!document.querySelector('[data-landing-navbar]')&&!document.querySelector('[data-landing-footer]')&&!!document.querySelector('header')&&!!document.querySelector('footer')"));
  }
  for (const route of ['/', '/create', '/marketplace']) {
    currentCase='default-dark'+route;
    await configure(1440,'light',false,1000,1,null); await navigate(route); await delay(850);
    check(route+' defaults dark on light OS without a saved choice', await evaluate("document.documentElement.classList.contains('dark')&&localStorage.getItem('sceenyk-theme')===null"));
  }
  await configure(1440,'dark',false,1000,1,'light');await navigate('/');await delay(850);
  check('saved light overrides dark OS and dark app default',await evaluate("!document.documentElement.classList.contains('dark')"));
  await call('Page.reload');await wait("document.readyState==='complete'&&!!document.querySelector('[data-landing-navbar]')");await delay(850);
  check('saved light survives reload',await evaluate("!document.documentElement.classList.contains('dark')&&localStorage.getItem('sceenyk-theme')==='light'"));
  await configure(1440,'light',false,1000,1,'system');await navigate('/');await delay(850);
  check('explicit system follows light OS',await evaluate("!document.documentElement.classList.contains('dark')&&localStorage.getItem('sceenyk-theme')==='system'"));
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});await wait("document.documentElement.classList.contains('dark')");
  check('explicit system responds to OS change',true);
  check('server HTML defaults dark before scripts execute', /<html[^>]*class="[^"]*\bdark\b/.test(await (await fetch(origin)).text()));
  check('no browser exceptions', exceptions.length === 0);
  check('no application mutations or hosted workflow requests', !requests.some(r=>(r.url.startsWith(origin)&&r.method==='POST')||/inn\.gs|inngest\.com|api\.fal\.ai|api\.elevenlabs\.io/.test(r.url)));
  const result = { origin, checks, screenshots, exceptions, deployment: 'Local production build only; not deployed', limitations: ['Physical devices, non-Chromium browsers and screen-reader acceptance not performed.', 'Zoom checks emulate the effective CSS viewport and device pixel ratio at 200%/400%; browser toolbar zoom and mobile browser chrome are not physically exercised.', 'The unchanged root auth/Suspense shell needs JavaScript to reveal streamed HTML; landing and existing create HTML both retain that inherited limitation.'], directory };
  fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ checks: checks.length, screenshots: screenshots.length, directory, exceptions }, null, 2));
  await call('Browser.close');
} catch (error) {
  fs.writeFileSync(path.join(directory, 'failure.json'), JSON.stringify({ checks, screenshots, exceptions, error: error.message }, null, 2));
  console.error(JSON.stringify({ error: error.message, passed: checks.length, directory }));
  process.exitCode = 1;
} finally { socket?.close(); browser.kill(); }
