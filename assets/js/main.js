import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';
import { toCreasedNormals } from '../vendor/three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from '../vendor/three/addons/environments/RoomEnvironment.js';
import { initPPE } from './ppe3d.js?v=13';
import { initI18n, getLang, hud as hudText, msg, onLang } from './i18n.js?v=13';

/* ------------------------------------------------------------------ */
const HIDE_PARTS = ['body69062', 'body935', 'body27961'];   // pièces du CAD masquées (splitter PoE hors position, optique, plaque)
const TEAM_EMAIL = 'ugo.deproote@student.umons.ac.be';      // ← destinataire du formulaire de contact
/* ------------------------------------------------------------------ */

const qs = new URLSearchParams(location.search);
const SNAP = qs.has('snap');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const isMobile = () => innerWidth < 900;

initI18n();

/* ============================ SCROLL FLUIDE ============================ */
let lenis = null;
if (window.Lenis && !reduced && !SNAP) lenis = new Lenis({ lerp: .09, wheelMultiplier: .95 });
const scrollY_ = () => (lenis ? lenis.scroll : window.scrollY);

$$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
  const id = a.getAttribute('href');
  const el = id.length > 1 ? $(id) : null;
  if (!el) return;
  e.preventDefault();
  document.body.classList.remove('menu');
  lenis && lenis.start();
  if (lenis) lenis.scrollTo(el, { offset: 0, duration: 1.7, easing: t => 1 - Math.pow(1 - t, 4) });
  else el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
}));

/* ============================ SCÈNE 3D ============================ */
const canvas = $('#gl');
let renderer, scene, camera, rig, model, scan;
const parts = {};
const rings = [];
let glOK = false;

// décalage d'éclaté (mm) par pièce
const EX = {
  body12167: [0, 62, 0],  body31097: [0, -64, 0], body55189: [0, -20, 0], body27961: [0, 0, 58],
  body69062: [0, 16, 52], body935: [-54, -6, 0],  body67541: [0, -38, 0], body67406: [0, -44, 0],
  body67177: [0, -42, 0], body55342: [0, -42, 0], body67291: [0, -42, 0], body67583: [0, -42, 0]
};
const MAT = {
  body12167: { color: 0xf24a00, roughness: .42, metalness: 0, clearcoat: .45, clearcoatRoughness: .3, envMapIntensity: .8 },
  body31097: { color: 0x1d1f23, roughness: .45, metalness: .35 },
  body55189: { color: 0x0c5238, roughness: .5, metalness: .35 },
  body67541: { color: 0xc4c8cf, roughness: .25, metalness: 1 },
  body67406: { color: 0x202228, roughness: .4, metalness: .2, emissive: 0xff5a00, emissiveIntensity: 0 }
};

function buildScene(gltf){
  model = gltf.scene;
  model.traverse(o => {
    if (!o.isMesh) return;
    o.geometry = toCreasedNormals(o.geometry, .62);
    const def = MAT[o.name] || { color: 0x0f1115, roughness: .35, metalness: .6 };
    o.material = new THREE.MeshPhysicalMaterial({ envMapIntensity: 1.1, ...def });
    o.userData.ex = new THREE.Vector3(...(EX[o.name] || [0, -30, 0])).multiplyScalar(.001);
    o.geometry.computeBoundingBox();
    o.userData.c = o.geometry.boundingBox.getCenter(new THREE.Vector3());
    parts[o.name] = o;
  });
  HIDE_PARTS.forEach(n => { if (parts[n]) parts[n].visible = false; });
  model.position.set(0, 0, .02);
  rig.add(model);
}

function initGL(){
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) { return false; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .92;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 1, .1, 60);
  camera.position.set(0, 0, 6.5);

  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture;
  const key = new THREE.DirectionalLight(0xfff4ea, 2.6); key.position.set(-3, 4, 5); scene.add(key);
  const rimO = new THREE.PointLight(0xff7a30, 20, 14); rimO.position.set(4.2, 1.2, -2.5); scene.add(rimO);
  const rimC = new THREE.PointLight(0x7fd0ff, 22, 16); rimC.position.set(-4.8, -1.0, -1.2); scene.add(rimC);
  scene.add(new THREE.AmbientLight(0x303030, .8));

  rig = new THREE.Group(); scene.add(rig);

  // plan de scan (étape 2) : cadre fin, sans grille
  scan = new THREE.Mesh(new THREE.PlaneGeometry(.275, .19), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { u: { value: 0 } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec2 vUv;uniform float u;void main(){vec2 c=abs(vUv-.5)*2.;float b=smoothstep(.93,1.,max(c.x,c.y));gl_FragColor=vec4(vec3(.16,.71,.96),(.015+b*.85)*u);}'
  }));
  scan.rotation.x = -Math.PI / 2; scan.position.z = -.03;
  rig.add(scan);

  // anneaux d'alerte (étape 3)
  for (let i = 0; i < 3; i++){
    const m = new THREE.Mesh(new THREE.RingGeometry(.97, 1, 96),
      new THREE.MeshBasicMaterial({ color: 0xff5a00, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    scene.add(m); rings.push(m);
  }
  resizeGL();
  return true;
}

function resizeGL(){
  if (!renderer) return;
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.position.z = camera.aspect < 1 ? 7.4 : 6.5;
  camera.updateProjectionMatrix();
}

/* ============================ KEYFRAMES (scroll → 3D) ============================ */
const S0 = 11;
const BASE = { px: 1.4, py: -.05, pz: 0, rx: .55, ry: 3.7, rz: 0, s: .8, ex: 0, al: 0, sc: 0, v: 1, m: 1, mv: 1 };
const K = (sec, f, o = {}, pin = false) => ({ sec, f, pin, ...BASE, ...o });
const KEYS = [
  K('#hero', .5, {}),
  K('#manifeste', .25, { px: 1.0, ry: 2.8, rx: .3, s: .6, v: 0 }),
  K('#terrain', .9, { v: 0 }),
  K('#solution', 0, { px: 1.45, s: .8, ry: 3.5 }, true),
  K('#solution', .17, { px: 1.45, s: .8, ry: 3.3 }, true),
  K('#solution', .31, { px: 1.0, s: .74, ex: 1, sc: 1, rx: .62, ry: 3.6 }, true),
  K('#solution', .46, { px: 1.0, s: .74, ex: 1, sc: 1, rx: .62, ry: 4.2 }, true),
  K('#solution', .59, { px: 1.45, s: .8, ex: 0, al: 1, rx: .5, ry: 3.7 }, true),
  K('#solution', .74, { px: 1.45, s: .8, ex: 0, al: 1, rx: .45, ry: 3.25 }, true),
  K('#solution', .9, { px: 2.6, py: 1.3, pz: -1.8, s: .5, al: 0, ry: 3.2, v: .9 }, true),
  K('#solution', 1, { px: 2.6, py: 1.3, pz: -1.8, s: .5, al: 0, ry: 3.5, v: .9 }, true),
  K('#solution', 1.04, { px: 2.6, py: 1.3, pz: -1.8, s: .5, ry: 3.5, v: 0 }, true),
  K('#stage', -.1, { px: 0, py: 0, rx: .6, ry: 3.3, s: .95, m: 0, v: 0 }),
  K('#stage', .2, { px: 0, py: 0, rx: .6, ry: 3.3, s: .95, m: 0, v: 1 }),
  K('#stage', .85, { px: 0, py: 0, rx: .6, ry: 3.3, s: .95, m: 0, v: 1 }),
  K('#stage', 1.15, { px: 0, py: 0, rx: .6, ry: 3.3, s: .95, m: 0, v: 0 }),
  K('#preuve', .3, { v: 0 }),
];
const PROPS = ['px', 'py', 'pz', 'rx', 'ry', 'rz', 's', 'ex', 'al', 'sc', 'v', 'm', 'mv'];
let anchors = [];
function computeAnchors(){
  const vh = innerHeight, sy = window.scrollY;
  anchors = KEYS.map(k => {
    const el = $(k.sec); if (!el) return null;
    const top = el.getBoundingClientRect().top + sy, h = el.offsetHeight;
    return { ...k, y: k.pin ? top + k.f * (h - vh) : top + k.f * h - vh * .5 };
  }).filter(Boolean).sort((a, b) => a.y - b.y);
}
function targetAt(y, out){
  const A = anchors, n = A.length;
  if (!n) return;
  if (y <= A[0].y) { PROPS.forEach(p => out[p] = A[0][p]); return; }
  if (y >= A[n - 1].y) { PROPS.forEach(p => out[p] = A[n - 1][p]); return; }
  let i = 0; while (i < n - 2 && y > A[i + 1].y) i++;
  const a = A[i], b = A[i + 1];
  let t = clamp((y - a.y) / (b.y - a.y || 1), 0, 1); t = t * t * (3 - 2 * t);
  PROPS.forEach(p => out[p] = a[p] + (b[p] - a[p]) * t);
}

const st = { ...BASE, s: .3, v: 0, ry: -2.4, rx: .9 };
const tg = { ...BASE };
let mx = 0, my = 0, smx = 0, smy = 0;
addEventListener('pointermove', e => { mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5; }, { passive: true });

const tagEls = $$('.part-tag');
const _v = new THREE.Vector3();
function updateTags(vis){
  tagEls.forEach(el => {
    const m = parts[el.dataset.part];
    if (!m || isMobile()) { el.style.opacity = 0; return; }
    _v.copy(m.userData.c); m.localToWorld(_v); _v.project(camera);
    const x = (_v.x * .5 + .5) * innerWidth, y = (-_v.y * .5 + .5) * innerHeight;
    el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
    el.style.opacity = clamp((st.ex - .55) / .45, 0, 1) * vis;
  });
}

const TAU = Math.PI * 2;
let userEx = 0, stageW = 0, yawO = 0, yawV = 0, pitO = 0, dragging = false, resetting = false;
let ready = false, lastT = performance.now(), time = 0;
function renderGL(dt, y){
  targetAt(y, tg);
  tg.ex = Math.max(tg.ex, userEx * stageW); tg.sc = Math.max(tg.sc, userEx * stageW * .7);
  const k = SNAP ? 1 : 1 - Math.exp(-dt * (ready ? 6.5 : 2.4));
  PROPS.forEach(p => st[p] += (tg[p] - st[p]) * k);

  const mob = isMobile();
  smx += (mx - smx) * (1 - Math.exp(-dt * 4)); smy += (my - smy) * (1 - Math.exp(-dt * 4));
  const mw = mob ? st.m : 0;
  const px = st.px * (1 - .88 * mw), py = st.py + .95 * mw, s = st.s * (1 - .48 * mw);
  const vis = ready ? st.v * (mob ? st.mv : 1) : 0;
  canvas.style.opacity = vis.toFixed(3);
  if (vis < .01 || !glOK){ tagEls.forEach(el => { el.style.opacity = 0; }); return; }

  rig.position.set(px, py + Math.sin(time * .9) * .035, st.pz);
  if (!dragging){ yawV *= .94; yawO += yawV; if (stageW < .05 || resetting){ const tgt = Math.round(yawO / TAU) * TAU; yawO += (tgt - yawO) * .08; pitO += (0 - pitO) * .08; if (Math.abs(yawO - tgt) < .002 && Math.abs(pitO) < .002) resetting = false; } }
  rig.rotation.set(st.rx + pitO + smy * .12, st.ry + yawO + Math.sin(time * .45) * .1 + smx * .28, st.rz);
  rig.scale.setScalar(S0 * s);

  const ex = st.ex;
  for (const n in parts){ const m = parts[n]; m.position.copy(m.userData.ex).multiplyScalar(ex); }
  const led = parts.body67406;
  if (led) led.material.emissiveIntensity = st.al * (1.5 + Math.sin(time * 14) * 1.2) + st.sc * .5;

  scan.material.uniforms.u.value = st.sc * .8;
  scan.position.y = Math.sin(time * 1.5) * .045 + .005;
  scan.scale.setScalar(1 + ex * .08);

  rings.forEach((r, i) => {
    const ph = ((time * .8 + i / 3) % 1);
    r.position.copy(rig.position); r.position.z += .3;
    r.scale.setScalar((.35 + ph * 1.5) * (s > .7 ? 1 : s + .3));
    r.material.opacity = st.al * Math.pow(1 - ph, 1.6) * .8;
    r.visible = st.al > .01;
  });
  camera.lookAt(0, 0, 0);
  scene.updateMatrixWorld(true);
  renderer.render(scene, camera);
  updateTags(vis);
}

/* ============================ UI : état du scroll ============================ */
const nav = $('#nav'), prog = $('#progress');
const SEC_IDS = ['hero', 'manifeste', 'constat', 'terrain', 'solution', 'boitier', 'preuve', 'cas', 'roi', 'ethique', 'eco', 'roadmap', 'equipe', 'faq', 'contact'];
const sections = SEC_IDS.map(id => $('#' + id));
const NAV_IDS = ['constat', 'solution', 'boitier', 'preuve', 'roi', 'ethique', 'equipe'];
const owner = (idx, set) => { for (let i = idx; i >= 0; i--) if (set.includes(SEC_IDS[i])) return SEC_IDS[i]; return null; };
const navLinks = $$('.links a');
let activeSec = -1;
const stepEls = $$('.step'), hudEl = $('#hud'), hudN = $('#hudN'), hudT = $('#hudT'), report = $('#report');
let curStep = -1;
const solution = $('#solution');
const stageEl = $('#stage'), exBtn = $('#exBtn');
const scrubs = [];

function updateUI(y){
  const vh = innerHeight, doc = document.documentElement.scrollHeight - vh;
  nav.classList.toggle('sc', y > 30);
  prog.style.transform = `scaleX(${doc > 0 ? clamp(y / doc, 0, 1) : 0})`;
  let a = 0; sections.forEach((s, i) => { if (s && s.getBoundingClientRect().top <= vh * .45) a = i; });
  if (a !== activeSec){
    activeSec = a;
    const late = SEC_IDS[a] === 'faq' || SEC_IDS[a] === 'contact';
    const nid = late ? null : '#' + owner(a, NAV_IDS);
    navLinks.forEach(l => l.classList.toggle('on', l.getAttribute('href') === nid));
  }
  { const r = stageEl.getBoundingClientRect(); stageW = clamp(1 - Math.abs((r.top + r.height / 2) - vh / 2) / (vh * .55), 0, 1); }
  scrubs.forEach(sc => {
    const r = sc.el.getBoundingClientRect(), p = clamp((vh * .82 - r.top) / (r.height + vh * .42), 0, 1), n = sc.w.length;
    sc.w.forEach((w, i) => { w.style.opacity = (.16 + .84 * clamp(p * (n + 3) - i, 0, 1)).toFixed(2); });
  });
  const top = solution.getBoundingClientRect().top + window.scrollY, H = solution.offsetHeight - vh;
  const p = clamp((y - top) / H, 0, 1);
  const si = Math.min(3, Math.floor(p * 4 + .0001));
  stepEls.forEach((el, i) => {
    el.style.setProperty('--p', clamp(p * 4 - i, 0, 1).toFixed(3));
    el.classList.toggle('on', i === si);
  });
  if (si !== curStep){
    curStep = si;
    hudN.textContent = '0' + (si + 1); hudT.textContent = hudText(si);
    hudEl.classList.toggle('off', si === 3);
    report.classList.toggle('on', si === 3);
  }
}
onLang(() => { if (curStep >= 0) hudT.textContent = hudText(curStep); });

/* ============================ révélations / compteurs ============================ */
function fmt(n){ return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
function countUp(el){
  if (el._done) return; el._done = true;
  const end = +el.dataset.count, pre = el.dataset.pre || '', suf = el.dataset.suf || '', sep = 'sep' in el.dataset;
  if (reduced || SNAP){ el.textContent = pre + (sep ? fmt(end) : end) + suf; return; }
  const t0 = performance.now(), D = 1500;
  (function f(now){
    const t = clamp((now - t0) / D, 0, 1), e = 1 - Math.pow(1 - t, 4), v = end * e;
    el.textContent = pre + (sep ? fmt(v) : Math.round(v)) + suf;
    if (t < 1) requestAnimationFrame(f);
  })(t0);
}
const io = new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return;
  e.target.classList.add('in'); io.unobserve(e.target);
  $$('[data-count]', e.target).forEach(countUp);
}), { threshold: .12, rootMargin: '0px 0px -6% 0px' });
$$('.rv').forEach(el => {
  const sibs = [...el.parentElement.children].filter(n => n.classList.contains('rv'));
  el.style.setProperty('--d', (Math.min(sibs.indexOf(el), 4) * .07).toFixed(2) + 's');
  io.observe(el);
});

$('#burger').addEventListener('click', () => {
  const on = document.body.classList.toggle('menu');
  lenis && (on ? lenis.stop() : lenis.start());
});

// formulaire → mailto
const form = $('#form'), formMsg = $('#formMsg');
form.addEventListener('submit', e => {
  e.preventDefault();
  const f = new FormData(form), nom = (f.get('nom') || '').trim(), email = (f.get('email') || '').trim();
  const okN = nom.length > 1, okE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  form.nom.classList.toggle('err', !okN); form.email.classList.toggle('err', !okE);
  if (!okN || !okE){ formMsg.textContent = msg('err'); formMsg.style.color = 'var(--bad)'; return; }
  const body = `Nom : ${nom}\nEmail : ${email}\nEntreprise : ${f.get('entreprise') || '-'}\n\n${f.get('message') || ''}`;
  location.href = `mailto:${TEAM_EMAIL}?subject=${encodeURIComponent('Demande de démo AEGIS — ' + nom)}&body=${encodeURIComponent(body)}`;
  formMsg.textContent = msg('ok'); formMsg.style.color = 'var(--ok)';
});

/* ============================ boîtier interactif ============================ */
{
  let last = null;
  stageEl.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; dragging = true; resetting = false; last = { x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch' }; try { stageEl.setPointerCapture(e.pointerId); } catch (_) {} });
  stageEl.addEventListener('pointermove', e => {
    if (!dragging || !last) return;
    const dx = e.clientX - last.x, dy = e.clientY - last.y; last.x = e.clientX; last.y = e.clientY;
    yawO += dx * .009; yawV = dx * .009;
    if (!last.touch) pitO = clamp(pitO + dy * .005, -.9, .9);
    $('.stage-hint').style.opacity = 0;
  });
  const up = () => { dragging = false; last = null; };
  stageEl.addEventListener('pointerup', up); stageEl.addEventListener('pointercancel', up);
  stageEl.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft'){ yawV -= .06; e.preventDefault(); }
    if (e.key === 'ArrowRight'){ yawV += .06; e.preventDefault(); }
    if ((e.key === 'Enter' || e.key === ' ') && e.target === stageEl){ exBtn.click(); e.preventDefault(); }
  });
  exBtn.addEventListener('click', () => { userEx = userEx ? 0 : 1; exBtn.classList.toggle('on', !!userEx); });
  $('#rstBtn').addEventListener('click', () => { resetting = true; yawV = 0; });
}

// texte « scrub » : les mots s'allument au scroll
function splitScrub(){
  scrubs.length = 0;
  $$('.scrub').forEach(el => {
    const words = el.textContent.trim().split(/\s+/);
    el.innerHTML = words.map(w => `<span class="w${/^(déjà|already|l.IA|the AI)/i.test(w) || /^(IA|AI)[.!]?$/.test(w) ? ' hl' : ''}">${w}</span>`).join(' ');
    scrubs.push({ el, w: [...el.children] });
  });
}
splitScrub();
onLang(splitScrub);

/* ============================ scène 3D « ce que voit le boîtier » ============================ */
{
  const wrap = $('#cam3d'), stP = $('#stP'), stOk = $('#stOk'), stAl = $('#stAl'), camAlert = $('#camAlert'), camTime = $('#camTime'), camFps = $('#camFps');
  const ppe = initPPE({ wrap, gl: $('#ppeGl'), ov: $('#ppeOv'), glb: 'assets/boitier.glb?v=13', ui: d => {
    stP.textContent = d.people; stOk.textContent = d.ok; stAl.textContent = d.alerts;
    camAlert.classList.toggle('on', d.alertOn); camFps.textContent = d.fps;
    camTime.textContent = new Date().toTimeString().slice(0, 8);
  } });
  new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? ppe.start() : ppe.stop()), { threshold: .08 }).observe(wrap);
  $$('#seg button').forEach(b => b.addEventListener('click', () => {
    const onMode = b.dataset.m === '1';
    $$('#seg button').forEach(x => x.classList.toggle('on', x === b));
    wrap.classList.toggle('off', !onMode); ppe.setOn(onMode);
  }));
}

/* ============================ curseur ============================ */
if (matchMedia('(hover:hover) and (pointer:fine)').matches && !reduced){
  const cur = $('#cur'), lab = $('#curT');
  const EN = { 'Écrire': 'Write', 'Voir': 'View', 'Glisser': 'Drag', 'Envoyer': 'Send', 'Haut': 'Top' };
  let cx = 0, cy = 0, tx = 0, ty = 0, first = true;
  addEventListener('pointermove', e => {
    tx = e.clientX; ty = e.clientY;
    if (first){ cx = tx; cy = ty; first = false; document.documentElement.classList.add('has-cur'); document.body.classList.add('has-cur'); }
    const t = e.target, q = s => t.closest && t.closest(s);
    const inp = q('input,textarea'), dc = q('[data-cursor]'), link = q('a,button,summary,label');
    cur.classList.toggle('bar', !!inp);
    const label = !inp && dc ? dc.dataset.cursor : '';
    lab.textContent = label ? (getLang() === 'en' && EN[label] ? EN[label] : label) : '';
    cur.classList.toggle('on', !!label);
    cur.classList.toggle('hov', !inp && !label && !!link);
  }, { passive: true });
  addEventListener('pointerdown', () => cur.classList.add('press'));
  addEventListener('pointerup', () => cur.classList.remove('press'));
  document.documentElement.addEventListener('mouseleave', () => document.body.classList.remove('has-cur'));
  document.documentElement.addEventListener('mouseenter', () => { if (!first) document.body.classList.add('has-cur'); });
  (function f(){ cx += (tx - cx) * .32; cy += (ty - cy) * .32; cur.style.transform = `translate3d(${cx.toFixed(1)}px,${cy.toFixed(1)}px,0)`; requestAnimationFrame(f); })();
}

/* ============================ démarrage ============================ */
glOK = initGL();
computeAnchors();
addEventListener('resize', () => { resizeGL(); computeAnchors(); });
new ResizeObserver(() => computeAnchors()).observe(document.body);

const ldBar = $('#ldBar'), ldPct = $('#ldPct');
function setPct(p){ ldBar.style.width = p + '%'; ldPct.textContent = Math.round(p); }

function start(){
  document.body.classList.add('ready');
  $('#loader').classList.add('done');
  ready = true;
  let y = qs.get('y');
  const at = qs.get('at'); // debug : ?at=solution:.38
  if (at){ const [id, f] = at.split(':'), el = $('#' + id); y = el.getBoundingClientRect().top + window.scrollY + (+f) * (el.offsetHeight - (id === 'solution' ? innerHeight : 0)); }
  if (y !== null){ const go = () => { window.scrollTo(0, +y); lenis && lenis.scrollTo(+y, { immediate: true }); }; SNAP ? setTimeout(go, 1500) : go(); }
}

function loop(now){
  const dt = Math.min(.05, (now - lastT) / 1000); lastT = now; time += dt;
  lenis && lenis.raf(now);
  const y = scrollY_();
  updateUI(y);
  if (document.hidden === false) renderGL(dt, y);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

if (glOK){
  new GLTFLoader().loadAsync('assets/boitier.glb?v=9', e => { if (e.lengthComputable) setPct(e.loaded / e.total * 90); })
    .then(g => {
      buildScene(g);
      setPct(100);
      Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 2500))]).then(() => setTimeout(start, 300));
    })
    .catch(err => { console.error(err); glOK = false; start(); });
} else {
  setPct(100); setTimeout(start, 300);
}
