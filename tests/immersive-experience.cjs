// 无第三方依赖。使用临时本地网址、独立 Chrome 配置，不接触用户浏览器数据。
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const vm = require('node:vm');
const { spawn, execFile } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'immersive-v3-1', 'index.html');
const chromePath = process.env.PELICAN_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const artifactArg = process.argv.indexOf('--artifacts');
const artifactDir = artifactArg >= 0 ? path.resolve(process.argv[artifactArg + 1]) : null;
const liveArg = process.argv.indexOf('--live-url');
const liveURL = liveArg >= 0 ? process.argv[liveArg + 1] : null;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

class CDP {
  constructor(url) {
    this.id = 0; this.pending = new Map(); this.errors = [];
    this.ws = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('浏览器调试连接超时')), 10000);
      this.ws.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
      this.ws.addEventListener('error', error => { clearTimeout(timeout); reject(error); }, { once: true });
    });
    this.ws.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) {
        const job = this.pending.get(message.id);
        if (!job) return;
        this.pending.delete(message.id); clearTimeout(job.timeout);
        if (message.error) job.reject(new Error(message.error.message)); else job.resolve(message.result);
      } else if (message.method === 'Runtime.exceptionThrown') {
        this.errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
      }
    });
  }
  async send(method, params = {}) {
    await this.ready;
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP 超时：${method}`)); }, 20000);
      this.pending.set(id, { resolve, reject, timeout });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  close() { this.ws.close(); }
}

async function waitFor(check, description, timeout = 15000) {
  const start = Date.now(); let lastError;
  while (Date.now() - start < timeout) {
    try { const value = await check(); if (value) return value; } catch (error) { lastError = error; }
    await delay(100);
  }
  throw new Error(`等待失败：${description}${lastError ? ` (${lastError.message})` : ''}`);
}

async function main() {
  const source = await fs.readFile(htmlPath, 'utf8');
  for (const [index, match] of [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries()) {
    new vm.Script(match[1], { filename: `inline-script-${index}.js` });
  }
  assert(source.includes('window.__pelicanLoading?.ready();'), '测试注入点应存在');
  const instrumented = source.replace('window.__pelicanLoading?.ready();', `
    window.__pelicanTest = { timer, audio, journey, prefs, STORE, CalmAudio, mainView, SCENES,
      savePrefs, renderPrefs, renderJourney, updateMainRest, runFocusAction, showWelcome,
      openSettings, selectTab, momentMarkup, openAlbum, showScene, token: Math.random() };
    window.__pelicanLoading?.ready();`);
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const filename = path.resolve(root, `.${pathname.endsWith('/') ? `${pathname}index.html` : pathname}`);
      if (!filename.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
      const content = filename === htmlPath ? instrumented : await fs.readFile(filename);
      const type = filename.endsWith('.html') ? 'text/html; charset=utf-8' : filename.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }); response.end(content);
    } catch (_) { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const siteURL = `http://127.0.0.1:${server.address().port}/immersive-v3-1/`;
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'pelican-experience-'));
  const chrome = spawn(chromePath, [
    '--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--disable-component-update', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  chrome.stderr.on('data', () => {}); // Drain diagnostic output so Chrome cannot block on a full pipe.
  let launchError; chrome.on('error', error => { launchError = error; });
  let browser, page; const cases = [];
  async function test(name, task) { await task(); cases.push(name); process.stdout.write(`PASS ${name}\n`); }
  async function value(expression) { return page.evaluate(`(() => { const a = window.__pelicanTest; ${expression} })()`); }
  async function click(id) {
    const point = await page.evaluate(`(() => { const el = document.getElementById(${JSON.stringify(id)}); el.scrollIntoView({block:'nearest'}); const r = el.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
  }
  async function ready(previousToken = null) {
    await waitFor(() => page.evaluate(`!!window.__pelicanTest && window.__pelicanTest.token !== ${JSON.stringify(previousToken)} && !document.getElementById('initial-loading')`), '页面进入可操作状态');
  }
  async function reload(seed) {
    const token = await value('return a.token;');
    // Seed after the old document's pagehide/beforeunload save, before the new app boots.
    const seedScript = seed === undefined ? null : await page.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `if(location.origin===${JSON.stringify(new URL(siteURL).origin)}){localStorage.clear();for(const [key,value] of Object.entries(${JSON.stringify(seed)}))localStorage.setItem(key,JSON.stringify(value));}`
    });
    try { await page.send('Page.reload', { ignoreCache: true }); await ready(token); }
    finally { if (seedScript) await page.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: seedScript.identifier }); }
  }
  async function viewport(width, height, mobile = false) {
    await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    await delay(180);
  }
  async function screenshot(name) {
    if (!artifactDir) return;
    await delay(750); // Capture settled artwork, not an intermediate pose/scene crossfade.
    await fs.mkdir(artifactDir, { recursive: true });
    const result = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await fs.writeFile(path.join(artifactDir, `${name}.png`), Buffer.from(result.data, 'base64'));
  }
  async function assertOnscreen(id) {
    const geometry = await page.evaluate(`(() => { const el=document.getElementById(${JSON.stringify(id)}),r=el.getBoundingClientRect(); return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,w:innerWidth,h:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth}; })()`);
    assert(!geometry.overflow && geometry.width > 0 && geometry.x >= 0 && geometry.y >= 0 && geometry.right <= geometry.w + 1 && geometry.bottom <= geometry.h + 1, `${id} 不应越出屏幕：${JSON.stringify(geometry)}`);
  }
  try {
    const port = await waitFor(async () => {
      if (launchError) throw launchError;
      return (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
    }, '独立测试浏览器启动', 45000);
    process.stdout.write('独立测试浏览器已启动，正在连接本地检查页面。\n');
    const version = await (await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(10000) })).json();
    browser = new CDP(version.webSocketDebuggerUrl);
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT', signal: AbortSignal.timeout(10000) })).json();
    page = new CDP(target.webSocketDebuggerUrl);
    await page.send('Runtime.enable'); await page.send('Page.enable'); await page.send('Network.enable');
    // 回归不依赖外部配乐服务器，真实声音用本地环境录音和噪声验证。
    await page.send('Network.setBlockedURLs', { urls: ['https://www.scottbuckley.com.au/*'] });
    await viewport(1440, 900);
    await page.send('Page.navigate', { url: siteURL }); await ready();

    await test('新用户提示可见，计时未开始且声音未强制播放', async () => {
      assert.deepEqual(await value(`return {welcome:!document.getElementById('welcome-card').hidden,status:a.timer.status,audio:a.audio.enabled};`), { welcome: true, status: 'idle', audio: false });
      await assertOnscreen('welcome-card'); await screenshot('welcome-desktop');
    });
    await test('首次提示适配手机竖屏和横屏', async () => {
      await viewport(375, 812, true); await assertOnscreen('welcome-card'); await screenshot('welcome-mobile');
      await viewport(844, 390, true); await assertOnscreen('welcome-card'); await screenshot('welcome-landscape');
      await viewport(375, 812, true);
    });
    await test('首次选择专注沿用地点，并在用户点击后开启声音', async () => {
      const scene = await value(`a.prefs.source='white';a.prefs.music=false;return a.journey.state.trip.scene;`);
      await click('welcome-focus');
      await waitFor(() => value(`return a.timer.status==='running' && !!a.audio.voice && a.audio.context?.state==='running';`), '专注和本地声音开始');
      assert.deepEqual(await value(`return {scene:a.journey.state.trip.scene,guide:document.getElementById('welcome-card').hidden,phase:document.getElementById('focus-phase').textContent};`), { scene, guide: true, phase: '专注中' });
      await assertOnscreen('focus-dock'); await screenshot('focus-mobile');
    });
    await test('专注暂停不改变旅行截止时间，状态明确可见', async () => {
      const deadline = await value('return a.journey.state.trip.endsAt;');
      await click('session-main');
      assert.equal(await value('return a.timer.status;'), 'paused');
      assert.equal(await value('return a.journey.state.trip.endsAt;'), deadline);
      assert.equal(await page.evaluate(`document.getElementById('focus-phase').textContent`), '专注已暂停');
      await screenshot('paused-mobile');
    });
    await test('隐藏数字仍保留状态，状态文字不每秒重复改写', async () => {
      await value(`a.prefs.hideTime=true;a.timer.render();window.phaseMutations=0;window.phaseObserver=new MutationObserver(r=>window.phaseMutations+=r.length);window.phaseObserver.observe(document.getElementById('focus-phase'),{childList:true,characterData:true,subtree:true});for(let i=0;i<4;i++)a.timer.render();return true;`);
      assert.deepEqual(await page.evaluate(`({clock:document.getElementById('clock').hidden,phase:document.getElementById('focus-phase').hidden,mutations:window.phaseMutations})`), { clock: true, phase: false, mutations: 0 });
      await value('window.phaseObserver.disconnect();a.prefs.hideTime=false;a.timer.render();return true;');
    });
    await test('刷新保留暂停计时、旅行和已收起提示', async () => {
      const before = await value('return {id:a.timer.session.id,remaining:a.timer.remaining(),trip:a.journey.state.trip.id};');
      await reload();
      const after = await value(`return {id:a.timer.session.id,remaining:a.timer.remaining(),trip:a.journey.state.trip.id,status:a.timer.status,guide:document.getElementById('welcome-card').hidden};`);
      assert.equal(after.id, before.id); assert.equal(after.trip, before.trip); assert.equal(after.status, 'paused');
      assert(Math.abs(after.remaining - before.remaining) < 1500); assert(after.guide);
    });
    await test('从设置重开提示不替换进行中的计时，Escape 可收起', async () => {
      const id = await value('a.openSettings();a.selectTab("preferences");document.getElementById("experience-help").open=true;return a.timer.session.id;');
      await click('show-welcome');
      await waitFor(() => page.evaluate(`!document.getElementById('welcome-card').hidden && !document.getElementById('settings-dialog').open`), '重新查看提示');
      assert(await page.evaluate(`document.getElementById('welcome-actions').hidden`));
      assert.equal(await value('return a.timer.session.id;'), id);
      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      assert(await page.evaluate(`document.getElementById('welcome-card').hidden`));
    });
    await test('声音状态区分静音、零音量、准备、播放、失败及部分失败', async () => {
      const actual = await value(`const old={...a.prefs};const s=new a.CalmAudio();a.prefs.muted=false;a.prefs.volume=38;a.prefs.music=true;
        const states=[s.statusInfo().state];s.enabled=true;s.starting=true;states.push(s.statusInfo().state);s.starting=false;s.context={state:'suspended'};states.push(s.statusInfo().state);
        s.context={state:'running'};s.voice={};states.push(s.statusInfo().state);s.musicError='配乐加载失败';states.push(s.statusInfo().state);
        a.prefs.volume=0;states.push(s.statusInfo().state);a.prefs.muted=true;states.push(s.statusInfo().state);Object.assign(a.prefs,old);return states;`);
      assert.deepEqual(actual, ['waiting', 'loading', 'recover', 'playing', 'music-error', 'zero', 'muted']);
    });
    await test('音频实际开启、静音、恢复及提示收起不反复出现', async () => {
      await click('sound-toggle'); await waitFor(() => value('return !!a.audio.voice;'), '声音加载');
      await click('sound-toggle'); assert.equal(await value('return a.prefs.muted;'), true);
      assert.equal(await page.evaluate(`document.getElementById('sound-feedback-text').textContent`), '已静音');
      await click('sound-feedback-dismiss'); await value('a.audio.updateUI();a.audio.updateUI();return true;');
      assert(await page.evaluate(`document.getElementById('sound-feedback').hidden`));
      await click('sound-toggle'); await waitFor(() => value('return !a.prefs.muted && !!a.audio.voice;'), '恢复声音');
    });
    await test('失败恢复入口保留计时和旅行，零音量可直达设置', async () => {
      const before = await value(`a.audio.error='回归测试：环境声暂不可用';a.audio.updateUI();return {id:a.timer.session.id,serial:a.audio.ambientSerial};`);
      assert.equal(await page.evaluate(`document.getElementById('sound-feedback-action').dataset.action`), 'retry');
      await click('sound-feedback-action'); await waitFor(() => value('return !a.audio.error && !a.audio.starting;'), '恢复重试');
      assert.equal(await value('return a.timer.session.id;'), before.id);
      assert(await value(`return a.audio.ambientSerial>${before.serial};`), '重试应重新准备环境声，不能只清除错误文字');
      await value('a.prefs.volume=0;a.audio.feedbackUntil=performance.now()+5000;a.audio.updateUI();return true;');
      await click('sound-feedback-action');
      assert(await page.evaluate(`document.getElementById('settings-dialog').open && !document.getElementById('panel-preferences').hidden && document.activeElement.id==='master-volume'`));
      await click('close-settings'); await waitFor(() => page.evaluate(`!document.getElementById('settings-dialog').open`), '关闭设置');
      await value('a.prefs.volume=38;a.audio.updateUI();return true;');
    });
    await test('已经播放时继续专注不闪现声音准备提示', async () => {
      await page.evaluate(`(async()=>{const a=window.__pelicanTest;a.audio.feedbackUntil=0;a.audio.updateUI();await a.audio.enable();})()`);
      assert(await page.evaluate(`document.getElementById('sound-feedback').hidden`));
    });
    await test('模拟专注结束只记录一次，进入休息使用同一坐姿资产', async () => {
      await value(`a.timer.resume();a.timer.session.endAt=Date.now()-1;a.timer.tick();a.timer.tick();return true;`);
      assert.equal(await value('return a.timer.records.length;'), 1);
      assert.equal(await value('return a.timer.status;'), 'complete');
      await click('session-main');
      assert.deepEqual(await value(`return {mode:a.timer.mode,status:a.timer.status,rest:document.getElementById('world').dataset.rest,phase:document.getElementById('focus-phase').textContent};`), { mode: 'break', status: 'running', rest: 'true', phase: '休息中' });
      await screenshot('rest-mobile');
      await click('session-main'); assert.equal(await page.evaluate(`document.getElementById('focus-phase').textContent`), '休息已暂停');
    });
    await test('背影捧杯与前景靠背层次明确，腿脚不跟随上身呼吸', async () => {
      const pose = await value(`const world=document.getElementById('world'),find=id=>world.querySelector('[id$="'+id+'"]');
        const character=find('rest-character'),bench=find('rest-bench'),head=find('rest-head'),cup=find('rest-coffee-cup');
        return {pose:character.dataset.pose,rearHead:head.querySelector('use').getAttribute('href').endsWith('pelican-back-head'),
          frontEye:!!find('rest-eye'),cupHeld:character.contains(cup)&&!!find('rest-cup-grip'),
          foreground:bench.dataset.layer==='foreground-backrest'&&!!(character.compareDocumentPosition(bench)&Node.DOCUMENT_POSITION_FOLLOWING),
          anchored:!find('rest-seated-legs').closest('.rest-breathe')&&!find('rest-near-foot').closest('.rest-breathe'),
          title:world.querySelector('title').textContent.includes('背身坐着喝咖啡')};`);
      assert.deepEqual(pose, { pose:'back-coffee',rearHead:true,frontEye:false,cupHeld:true,foreground:true,anchored:true,title:true });
      const shared = await value(`const host=document.createElement('div');host.innerHTML=a.momentMarkup({scene:'sanya',variant:1},'coffee-photo-');
        return !!host.querySelector('[data-pose="back-coffee"] [id$="rest-coffee-cup"]')&&!!host.querySelector('[data-layer="foreground-backrest"]');`);
      assert(shared, '休息照片必须复用相同的背影和咖啡杯');
    });
    await test('背影在三亚日落及休息照片中正常渲染', async () => {
      await value('a.mainView.setScene("sanya");return true;');
      await screenshot('coffee-sanya-mobile');
      if (artifactDir) {
        await viewport(1260, 760);
        await value(`const host=document.createElement('div');host.id='pose-review';host.style.cssText='position:fixed;inset:0;z-index:99999;background:#e7dbc1;display:flex;align-items:center';host.innerHTML=a.momentMarkup({scene:'sanya',variant:1},'pose-review-');const svg=host.querySelector('svg');svg.style.cssText='width:100%;height:auto;display:block';document.body.append(host);return true;`);
        await screenshot('coffee-sanya-postcard');
        await value(`document.getElementById('pose-review').remove();return true;`);
        await viewport(375, 812, true);
      }
    });
    await test('离线到期模拟最多结算当前旅行，重复刷新不重复奖励', async () => {
      const before = await value(`return Object.values(a.journey.state.stamps).reduce((n,s)=>n+s.visits,0);`);
      await page.evaluate(`window.__pelicanTest.journey.transaction(s=>{const duration=s.trip.endsAt-s.trip.startedAt;s.trip.endsAt=Date.now()-3600000;s.trip.startedAt=s.trip.endsAt-duration;s.trip.originStartedAt=s.trip.startedAt;return true;})`);
      await reload(); await reload();
      assert.equal(await value(`return Object.values(a.journey.state.stamps).reduce((n,s)=>n+s.visits,0);`), before + 1);
    });
    await test('所有地点三种照片的 SVG 资产引用完整且 ID 不重复', async () => {
      const issues = await value(`const issues=[];for(const scene of a.SCENES){for(let variant=0;variant<3;variant++){
        const host=document.createElement('div');host.innerHTML=a.momentMarkup({scene:scene.id,variant},'check-'+scene.id+'-'+variant+'-');
        const ids=[...host.querySelectorAll('[id]')].map(n=>n.id),set=new Set(ids);if(ids.length!==set.size)issues.push('重复 ID '+scene.id+variant);
        for(const el of host.querySelectorAll('*'))for(const attr of el.attributes){const refs=[...attr.value.matchAll(/url\\(#([^)]+)\\)/g)].map(m=>m[1]);if((attr.name==='href'||attr.name==='xlink:href')&&attr.value.startsWith('#'))refs.push(attr.value.slice(1));for(const ref of refs)if(!set.has(ref))issues.push('缺失 '+ref);}
      }}return issues;`);
      assert.deepEqual(issues, []);
    });
    await test('桌面、手机横屏和夜景状态提示无溢出', async () => {
      await viewport(1440, 900); await assertOnscreen('focus-dock'); await screenshot('rest-desktop');
      await viewport(844, 390, true); await assertOnscreen('focus-dock'); await screenshot('rest-landscape');
      await viewport(375, 812, true); await value('a.mainView.setScene("chongqing");document.body.dataset.uiTheme="night";return true;');
      await assertOnscreen('focus-dock'); await screenshot('rest-night');
    });
    await test('减少动态效果停止休息呼吸', async () => {
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await waitFor(() => value('return a.prefs.still;'), '系统减少动态效果');
      assert.equal(await page.evaluate(`getComputedStyle(document.querySelector('#world .rest-breathe')).animationName`), 'none');
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    });
    await test('已存偏好的老用户不弹引导并保留静音', async () => {
      const prefsKey = await value('return a.STORE.prefs;');
      await reload({ [prefsKey]: { focusMinutes: 50, muted: true, music: false } });
      assert.deepEqual(await value(`return {guide:document.getElementById('welcome-card').hidden,minutes:a.prefs.focusMinutes,muted:a.prefs.muted,enabled:a.audio.enabled};`), { guide: true, minutes: 50, muted: true, enabled: false });
    });
    await test('跳过引导不会启动计时，刷新不再次出现', async () => {
      await reload({}); await click('welcome-dismiss');
      assert.equal(await value('return a.timer.status;'), 'idle'); await reload();
      assert(await page.evaluate(`document.getElementById('welcome-card').hidden`));
    });
    await test('自由陪伴不生成专注记录，可从设置改回计时', async () => {
      await reload({}); await value('a.prefs.music=false;a.prefs.source="white";return true;'); await click('welcome-companion');
      assert.deepEqual(await value(`return {minutes:a.prefs.focusMinutes,status:a.timer.status,records:a.timer.records.length,dock:document.getElementById('focus-dock').hidden};`), { minutes: 0, status: 'idle', records: 0, dock: true });
      await value(`a.openSettings();a.selectTab('preferences');const s=document.getElementById('focus-duration');s.value='25';s.dispatchEvent(new Event('change'));return true;`);
      assert.equal(await value('return a.prefs.focusMinutes;'), 25);
      await screenshot('preferences-mobile');
    });
    await test('真实本地环境录音可加载并恢复为播放状态', async () => {
      await page.evaluate(`(async()=>{const a=window.__pelicanTest;a.prefs.source='scene';await a.audio.replaceAmbience();a.audio.updateUI();})()`);
      assert(await value('return !!a.audio.voice && a.audio.buffers.size>0 && a.audio.statusInfo().state==="playing";'));
    });
    await test('无未处理的浏览器脚本错误', async () => assert.deepEqual(page.errors, []));

    if (liveURL) await test('线上页面可进入，包含背影咖啡资产且不包含测试注入', async () => {
      await page.send('Page.navigate', { url: liveURL });
      await waitFor(() => page.evaluate(`location.href.startsWith(${JSON.stringify(liveURL)}) && !!document.getElementById('welcome-card') && !document.getElementById('initial-loading')`), '线上页面加载', 20000);
      assert(await page.evaluate(`!window.__pelicanTest && !document.getElementById('welcome-card').hidden && !!document.getElementById('focus-phase')`));
      assert(await page.evaluate(`!!document.querySelector('#world [data-pose="back-coffee"] [id$="rest-coffee-cup"]') && !!document.querySelector('#world [data-layer="foreground-backrest"]')`));
      await assertOnscreen('welcome-card'); await screenshot('published-mobile');
      assert.deepEqual(page.errors, []);
    });

    if (artifactDir) await fs.writeFile(path.join(artifactDir, 'results.json'), JSON.stringify({ timestamp: new Date().toISOString(), browser: version.Browser, cases, limitations: ['模拟视口不代表真实手机锁屏或耗电测试', '未进行人工音质试听', '未进行真实屏幕阅读器测试'] }, null, 2));
    process.stdout.write(`完成 ${cases.length} 项检查。\n`);
  } finally {
    if (page) page.close();
    if (browser) {
      try { await Promise.race([browser.send('Browser.close'), delay(1500)]); } catch (_) {}
      browser.close();
    }
    // Windows 下只清理本脚本创建的进程树，避免测试超时后残留独立浏览器。
    if (chrome.exitCode === null && chrome.pid) {
      if (process.platform === 'win32') await new Promise(resolve => execFile('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { windowsHide:true, timeout:5000 }, () => resolve()));
      else chrome.kill();
    }
    chrome.stderr.destroy(); chrome.unref();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
