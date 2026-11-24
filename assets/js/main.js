import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';
import { toCreasedNormals } from '../vendor/three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from '../vendor/three/addons/environments/RoomEnvironment.js';
import { initPPE } from './ppe3d.js?v=21';
import { initI18n, getLang, hud as hudText, msg, onLang, fmtNum } from './i18n.js?v=20';

/* ------------------------------------------------------------------ */
const HIDE_PARTS = ['body69062', 'body935', 'body27961'];   // pièces du CAD masquées (splitter PoE hors position, optique, plaque)
const TEAM_EMAIL = 'ugo.deproote@student.umons.ac.be';      // ← destinataire du formulaire de contact
/* ------------------------------------------------------------------ */

const GLB_URL = 'assets/boitier.glb?v=14';
let resolveModel;
const modelP = new Promise(r => { resolveModel = r; });   // modèle du boîtier partagé avec ppe3d.js

const qs = new URLSearchParams(location.search);
const SNAP = qs.has('snap');
const PERF = qs.has('perf') ? { t: 0, n: 0 } : null;   // ?perf : expose window.__aegis / __perf pour mesurer le coût du rendu
const DBG = (() => { const r = qs.get('rig'); return r ? r.split(',').map(Number) : null; })();   // debug pose : ?rig=px,py,rx,ry,s,lf,fw,bm,al
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
let renderer, scene, camera, rig, model, beam, halo;
// faisceau optique : position (repère du GLB, mètres), direction, longueur, rayon. Réglé sur la lentille sous la visière.
const BEAM = { pos: [.098, -.004, -.04], dir: [1, -.14, .22], len: .12, r: .034 };
const parts = {};
const rings = [];
let glOK = false;

// décalage d'éclaté (mm) par pièce
const EX = {
  body12167: [0, 62, 0],  body31097: [0, -64, 0], body55189: [0, -20, 0], body27961: [0, 0, 58],
  body69062: [0, 16, 52], body935: [-54, -6, 0],  body67541: [0, -38, 0], body67406: [0, -44, 0],
  body67177: [0, -42, 0], body55342: [0, -42, 0], body67291: [0, -42, 0], body67583: [0, -42, 0]
};
// Palette « studio hardware » fidèle au rendu SolidWorks. L'orange AEGIS est réservé à la LED et au faisceau optique.
const MAT = {
  body12167: { color: 0xcfd4dc, roughness: .34, metalness: .22, clearcoat: .25, clearcoatRoughness: .4, envMapIntensity: .6 },   // coque gris clair satiné
  body31097: { color: 0x16181d, roughness: .42, metalness: .55 },                                                               // châssis + bloc optique, noir graphite anodisé
  body55189: { color: 0x0d5c3e, roughness: .48, metalness: .1 },                                                                // Raspberry Pi 5 : vert PCB mat
  body67541: { color: 0xd5dae2, roughness: .22, metalness: .9 },                                                                // radiateur aluminium brossé
  body67406: { color: 0x202228, roughness: .4, metalness: .2, emissive: 0xff5a00, emissiveIntensity: 0 }                        // LED d'état
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
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 1, .1, 60);
  camera.position.set(0, 0, 6.5);

  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture;
  // éclairage studio 3 points : key blanche douce, rim froide rasante (arêtes, visière, relief), contre-jour chaud discret
  const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(-3, 4, 5); scene.add(key);
  const rimC = new THREE.PointLight(0x7dd3fc, 26, 16); rimC.position.set(-4.6, 1.4, -1.6); scene.add(rimC);
  const rimO = new THREE.PointLight(0xff5a00, 9, 14); rimO.position.set(4.6, -.4, -2.4); scene.add(rimO);
  scene.add(new THREE.AmbientLight(0x2a2e36, .45));

  // halo radial doux derrière le produit (suit le boîtier) ; aucun décor autour
  const hc = document.createElement('canvas'); hc.width = hc.height = 256; const hx = hc.getContext('2d');
  const hg = hx.createRadialGradient(128, 128, 0, 128, 128, 128);
  hg.addColorStop(0, 'rgba(125,211,252,.20)'); hg.addColorStop(.35, 'rgba(70,110,150,.09)'); hg.addColorStop(1, 'rgba(5,6,8,0)');
  hx.fillStyle = hg; hx.fillRect(0, 0, 256, 256);
  halo = new THREE.Mesh(new THREE.PlaneGeometry(13, 13), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(hc), transparent: true, depthWrite: false }));
  halo.position.z = -4; scene.add(halo);

  rig = new THREE.Group(); scene.add(rig);

  // faisceau optique (étape 1) : cône volumétrique discret devant la lentille, en orange AEGIS
  beam = new THREE.Mesh(new THREE.ConeGeometry(BEAM.r, BEAM.len, 40, 1, true), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { u: { value: 0 } },
    vertexShader: 'varying float vY;void main(){vY=position.y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying float vY;uniform float u;void main(){float t=clamp((vY/' + BEAM.len.toFixed(4) + ')+.5,0.,1.);gl_FragColor=vec4(1.,.35,0.,u*.26*(1.-t)*(1.-t));}'
  }));
  beam.geometry.translate(0, -BEAM.len / 2, 0);            // sommet à l'origine, ouverture vers -Y
  beam.position.set(...BEAM.pos); beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(...BEAM.dir).normalize());
  beam.visible = false; rig.add(beam);

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
// lf = coque soulevée (vue éclatée de la coque seule), fw = cadrage sur la LED, bm = faisceau optique
const BASE = { px: 1.4, py: -.05, pz: 0, rx: .55, ry: 3.7, rz: 0, s: .8, ex: 0, al: 0, sc: 0, v: 1, m: 1, mv: 1, lf: 0, fw: 0, bm: 0, my: 0 };   // my = décalage vertical supplémentaire en mobile (carte glass compacte en bas)
const K = (sec, f, o = {}, pin = false) => ({ sec, f, pin, ...BASE, ...o });
const KEYS = [
  K('#hero', .5, {}),
  K('#manifeste', .25, { px: 1.0, ry: 2.8, rx: .3, s: .6, v: 0 }),
  K('#terrain', .9, { v: 0 }),
  // 4 temps dans #solution : 01 (0–25 %) plan 3/4 + faisceau · 02 (25–55 %) coque soulevée · 03 (55–80 %) gros plan LED · 04 (80–100 %) coque refermée
  K('#solution', 0, { px: 1.3, s: .95, rx: .35, ry: 3.75, bm: 1 }, true),
  K('#solution', .22, { px: 1.3, s: 1, rx: .4, ry: 3.95, bm: 1 }, true),
  K('#solution', .32, { px: 1.2, s: .9, rx: .72, ry: 3.5, lf: 1 }, true),
  K('#solution', .52, { px: 1.2, s: .92, rx: .78, ry: 3.15, lf: 1 }, true),
  K('#solution', .62, { px: .45, s: 2.1, rx: .5, ry: 3.35, lf: 1, fw: 1, al: 1 }, true),
  K('#solution', .77, { px: .45, s: 2.1, rx: .5, ry: 3.2, lf: 1, fw: 1, al: 1 }, true),
  K('#solution', .84, { px: .15, s: .66, rx: .45, ry: 3.45, my: .5 }, true),
  K('#solution', .96, { px: .15, s: .66, rx: .45, ry: 3.6, my: .5 }, true),
  K('#solution', 1.04, { px: .15, s: .66, rx: .45, ry: 3.6, my: .5, v: 0 }, true),
  K('#stage', -.1, { px: 0, py: 0, rx: .6, ry: 3.3, s: .95, m: 0, v: 0 }),
  K('#stage', .2, { px: 0, py: 0, rx: .6, ry: 3.3, s: .95, m: 0, v: 1 }),
  K('#stage', .85, { px: 0, py: 0, rx: .6, ry: 3.3, s: .95, m: 0, v: 1 }),
  K('#stage', 1.15, { px: 0, py: 0, rx: .6, ry: 3.3, s: .95, m: 0, v: 0 }),
  K('#preuve', .3, { v: 0 }),
];
const PROPS = ['px', 'py', 'pz', 'rx', 'ry', 'rz', 's', 'ex', 'al', 'sc', 'v', 'm', 'mv', 'lf', 'fw', 'bm', 'my'];
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
    el.style.opacity = Math.max(clamp((st.ex - .55) / .45, 0, 1), clamp((st.lf - .55) / .45, 0, 1)) * (1 - clamp(st.fw * 2.2, 0, 1)) * vis;
  });
}

const TAU = Math.PI * 2;
let userEx = 0, stageW = 0, yawO = 0, yawV = 0, pitO = 0, dragging = false;
let ready = false, lastT = performance.now(), time = 0;

// Transitions des boutons « Vue éclatée / Assembler / Recentrer » : power3.out sur 650 ms.
// Toute prise en main manuelle (souris, doigt, clavier) annule l'interpolation automatique.
const TW = 650, ease3 = t => 1 - Math.pow(1 - t, 3);
let exAnim = null, rstAnim = null;
const cancelAnims = () => { exAnim = rstAnim = null; };
function stepAnims(dt){
  if (exAnim){
    exAnim.t += dt * 1000;
    const k = Math.min(1, exAnim.t / TW);
    userEx = exAnim.from + (exAnim.to - exAnim.from) * ease3(k);
    if (k >= 1) exAnim = null;
  }
  if (rstAnim){
    rstAnim.t += dt * 1000;
    const k = Math.min(1, rstAnim.t / TW), e = ease3(k);
    yawO = rstAnim.y0 + (rstAnim.y1 - rstAnim.y0) * e; pitO = rstAnim.p0 * (1 - e); yawV = 0;
    if (k >= 1) rstAnim = null;
  }
}

function renderGL(dt, y){
  stepAnims(dt);
  targetAt(y, tg);
  tg.ex = Math.max(tg.ex, userEx * stageW);
  const k = SNAP ? 1 : 1 - Math.exp(-dt * (ready ? 6.5 : 2.4));
  PROPS.forEach(p => st[p] += (tg[p] - st[p]) * k);
  if (DBG){ const [a, b, c, d, e, f = 0, g = 0, h = 0, i = 0] = DBG; Object.assign(st, { px: a, py: b, rx: c, ry: d, s: e, lf: f, fw: g, bm: h, al: i, v: 1, m: 0, ex: 0 }); }

  const mob = isMobile();
  smx += (mx - smx) * (1 - Math.exp(-dt * 4)); smy += (my - smy) * (1 - Math.exp(-dt * 4));
  const mw = mob ? st.m : 0;
  const px = st.px * (1 - .88 * mw), py = st.py + (.95 + st.my) * mw, s = st.s * (1 - .48 * mw);
  const vis = ready ? st.v * (mob ? st.mv : 1) : 0;
  canvas.style.opacity = vis.toFixed(3);
  if (vis < .01 || !glOK){ tagEls.forEach(el => { el.style.opacity = 0; }); return; }

  const bx = px, by = py + Math.sin(time * .9) * .035;
  rig.position.set(bx, by, st.pz);
  if (!dragging && !rstAnim){ yawV *= .94; yawO += yawV; if (stageW < .05){ const tgt = Math.round(yawO / TAU) * TAU; yawO += (tgt - yawO) * .08; pitO += (0 - pitO) * .08; } }
  rig.rotation.set(st.rx + pitO + smy * .12, st.ry + yawO + Math.sin(time * .45) * .1 + smx * .28, st.rz);
  rig.scale.setScalar(S0 * s);

  const ex = st.ex, lf = st.lf;
  for (const n in parts){ const m = parts[n]; m.position.copy(m.userData.ex).multiplyScalar(ex); m.rotation.x = 0; }
  const shell = parts.body12167;                      // vue éclatée de la coque seule : montée verticale (+Y) avec léger tilt
  if (shell){ shell.position.y += lf * .1; shell.rotation.x = -lf * .2; }
  if (parts.body31097) parts.body31097.position.y -= lf * .03;   // le châssis descend un peu : les annotations ne se chevauchent plus
  const led = parts.body67406;
  if (led) led.material.emissiveIntensity = st.al * (1.5 + Math.sin(time * 14) * 1.2);

  // cadrage : la LED vient se placer au point visé (px, py)
  rig.updateMatrixWorld(true);
  if (led && st.fw > .001){
    _v.copy(led.userData.c); led.localToWorld(_v);
    rig.position.x -= (_v.x - bx) * st.fw; rig.position.y -= (_v.y - by) * st.fw; rig.position.z -= (_v.z - st.pz) * st.fw;
    rig.updateMatrixWorld(true);
  }
  // halo derrière le produit
  halo.position.x = rig.position.x * .7; halo.position.y = rig.position.y * .7;
  // faisceau optique (étape 1)
  beam.visible = st.bm > .01; beam.material.uniforms.u.value = st.bm * (.75 + Math.sin(time * 1.6) * .15);
  // onde circulaire qui part de la LED
  if (led) { _v.copy(led.userData.c); led.localToWorld(_v); }
  rings.forEach((r, i) => {
    const ph = ((time * .8 + i / 3) % 1);
    r.position.copy(_v); r.position.z += .15;
    r.scale.setScalar((.3 + ph * 1.5) * clamp(s * .75, .5, 1.6));
    r.material.opacity = st.al * Math.pow(1 - ph, 1.6) * .85;
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
const stepEls = $$('.step'), hudEl = $('#hud'), hudN = $('#hudN'), hudT = $('#hudT');
const megaEl = $('#mega'), megaSp = $$('#mega span'), studioEl = $('#studio'), gYolo = $('#gYolo'), gBento = $('#gBento');
const STEP_AT = [0, .25, .55, .80, 1];   // 01 plug & play · 02 coque soulevée · 03 LED / alerte · 04 rapports QSE
let curStep = -1, inSolPrev = false;
const solution = $('#solution');
const stageEl = $('#stage'), exBtn = $('#exBtn');
const scrubs = [];
let ppe = null, cursorTick = null;   // pilotés par la boucle rAF unique (voir loop())

// Mesures de layout mises en cache : recalculées au resize / changement de langue, jamais par frame.
const M = { secTops: [], stageC: 0, scrubs: [], solTop: 0, solH: 1, doc: 1 };
function measure(){
  const sy = window.scrollY, abs = el => el.getBoundingClientRect().top + sy;
  M.secTops = sections.map(s => s ? abs(s) : Infinity);
  const sr = stageEl.getBoundingClientRect(); M.stageC = sr.top + sy + sr.height / 2;
  M.scrubs = scrubs.map(sc => { const r = sc.el.getBoundingClientRect(); return { top: r.top + sy, h: r.height }; });
  M.solTop = abs(solution); M.solH = solution.offsetHeight - innerHeight;
  M.doc = document.documentElement.scrollHeight - innerHeight;
}

function updateUI(y){
  const vh = innerHeight, doc = M.doc;
  nav.classList.toggle('sc', y > 30);
  prog.style.transform = `scaleX(${doc > 0 ? clamp(y / doc, 0, 1) : 0})`;
  let a = 0; M.secTops.forEach((t, i) => { if (t - y <= vh * .45) a = i; });
  if (a !== activeSec){
    activeSec = a;
    const late = SEC_IDS[a] === 'faq' || SEC_IDS[a] === 'contact';
    const nid = late ? null : '#' + owner(a, NAV_IDS);
    navLinks.forEach(l => l.classList.toggle('on', l.getAttribute('href') === nid));
  }
  stageW = clamp(1 - Math.abs((M.stageC - y) - vh / 2) / (vh * .55), 0, 1);
  scrubs.forEach((sc, k) => {
    const m = M.scrubs[k]; if (!m) return;
    const p = clamp((vh * .82 - (m.top - y)) / (m.h + vh * .42), 0, 1), n = sc.w.length;
    sc.w.forEach((w, i) => { w.style.opacity = (.16 + .84 * clamp(p * (n + 3) - i, 0, 1)).toFixed(2); });
  });
  const top = M.solTop, H = M.solH;
  const p = clamp((y - top) / H, 0, 1);
  let si = 0; while (si < 3 && p >= STEP_AT[si + 1] - .0001) si++;
  stepEls.forEach((el, i) => {
    el.style.setProperty('--p', clamp((p - STEP_AT[i]) / (STEP_AT[i + 1] - STEP_AT[i]), 0, 1).toFixed(3));
    el.classList.toggle('on', i === si);
  });
  const inSol = y > top - vh * .6 && y < top + H + vh * .6;   // studio noir + typographie monumentale pendant #solution
  if (inSol !== inSolPrev){ inSolPrev = inSol; megaEl.classList.toggle('show', inSol); studioEl.classList.toggle('show', inSol); }
  if (si !== curStep){
    curStep = si;
    hudN.textContent = '0' + (si + 1); hudT.textContent = hudText(si);
    megaSp.forEach((el, i) => el.classList.toggle('on', i === si));
    gYolo.classList.toggle('on', si === 2); gBento.classList.toggle('on', si === 3);
  }
}
onLang(() => { if (curStep >= 0) hudT.textContent = hudText(curStep); });

/* ============================ révélations / compteurs ============================ */
const countText = (el, v) => (el.dataset.pre || '') + ('sep' in el.dataset ? fmtNum(v) : Math.round(v)) + (el.dataset.suf || '');
function countUp(el){
  if (el._done) return; el._done = true;
  const end = +el.dataset.count;
  if (reduced || SNAP){ el.textContent = countText(el, end); return; }
  const t0 = performance.now(), D = 1500;
  (function f(now){
    const t = clamp((now - t0) / D, 0, 1), e = 1 - Math.pow(1 - t, 4);
    el.textContent = countText(el, end * e);
    if (t < 1) requestAnimationFrame(f);
  })(t0);
}
// changement de langue : les nombres déjà affichés prennent le bon séparateur (128 939 ↔ 128,939)
onLang(() => $$('[data-count]').forEach(el => { el.textContent = countText(el, +el.dataset.count); }));
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
// titres : révélation par masque vertical. On observe le PARENT (un élément masqué par son propre
// clip-path n'est jamais considéré comme intersectant par l'IntersectionObserver).
const ioT = new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return;
  $$('.rvt', e.target).forEach(h => h.classList.add('in')); ioT.unobserve(e.target);
}), { threshold: .12, rootMargin: '0px 0px -6% 0px' });
new Set($$('.rvt').map(h => h.parentElement)).forEach(p => ioT.observe(p));

// spotlight + bordure lumineuse : variables CSS mises à jour uniquement pendant le survol
if (matchMedia('(hover:hover) and (pointer:fine)').matches && !reduced){
  $$('.fact, .ledger li, .pivot, .case').forEach(el => {
    el.classList.add('spot');
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', (e.clientX - r.left).toFixed(0) + 'px');
      el.style.setProperty('--my', (e.clientY - r.top).toFixed(0) + 'px');
    }, { passive: true });
  });
}

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
  stageEl.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; dragging = true; cancelAnims(); exBtn.classList.toggle('on', userEx > .5); last ={ x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch' }; try { stageEl.setPointerCapture(e.pointerId); } catch (_) {} });
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
    if (e.key === 'ArrowLeft'){ rstAnim = null; yawV -= .06; e.preventDefault(); }
    if (e.key === 'ArrowRight'){ rstAnim = null; yawV += .06; e.preventDefault(); }
    if ((e.key === 'Enter' || e.key === ' ') && e.target === stageEl){ exBtn.click(); e.preventDefault(); }
  });
  exBtn.addEventListener('click', () => {
    const to = (exAnim ? exAnim.to : userEx) > .5 ? 0 : 1;
    exAnim = reduced ? null : { t: 0, from: userEx, to };
    if (reduced) userEx = to;
    exBtn.classList.toggle('on', !!to);
  });
  $('#rstBtn').addEventListener('click', () => {
    yawV = 0;
    const y1 = Math.round(yawO / TAU) * TAU;
    if (reduced){ yawO = y1; pitO = 0; return; }
    rstAnim = { t: 0, y0: yawO, y1, p0: pitO };
  });
}

// texte « scrub » : les mots s'allument au scroll
function splitScrub(){
  scrubs.length = 0;
  $$('.scrub').forEach(el => {
    const words = el.textContent.trim().split(/\s+/);
    el.innerHTML = words.map(w => `<span class="w${/^(déjà|already|l.IA|the AI)/i.test(w) || /^(IA|AI)[.!]?$/.test(w) ? ' hl' : ''}">${w}</span>`).join(' ');
    scrubs.push({ el, w: [...el.children] });
  });
  measure();
}
splitScrub();
onLang(splitScrub);

/* ============================ scène 3D « ce que voit le boîtier » ============================ */
{
  const wrap = $('#cam3d'), stP = $('#stP'), stOk = $('#stOk'), stAl = $('#stAl'), camAlert = $('#camAlert'), camTime = $('#camTime'), camFps = $('#camFps');
  // n'écrit dans le DOM que si la valeur a changé (évite des dizaines de réécritures par seconde)
  const put = (el, v) => { if (el._v !== v){ el._v = v; el.textContent = v; } };
  let alertPrev = false;
  ppe = initPPE({ wrap, gl: $('#ppeGl'), ov: $('#ppeOv'), model: modelP, ui: d => {
    put(stP, d.people); put(stOk, d.ok); put(stAl, d.alerts); put(camFps, d.fps);
    if (d.alertOn !== alertPrev){ alertPrev = d.alertOn; camAlert.classList.toggle('on', d.alertOn); }
    put(camTime, new Date().toTimeString().slice(0, 8));
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
  cursorTick = () => { cx += (tx - cx) * .32; cy += (ty - cy) * .32; cur.style.transform = `translate3d(${cx.toFixed(1)}px,${cy.toFixed(1)}px,0)`; };
}

/* ============================ démarrage ============================ */
glOK = initGL();
computeAnchors();
const remeasure = () => { computeAnchors(); measure(); };
addEventListener('resize', () => { resizeGL(); remeasure(); });
new ResizeObserver(remeasure).observe(document.body);

const ldBar = $('#ldBar'), ldPct = $('#ldPct');
function setPct(p){ ldBar.style.width = p + '%'; ldPct.textContent = Math.round(p); }

function start(){
  document.body.classList.add('ready');
  $('#loader').classList.add('done');
  remeasure();
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
  if (document.hidden === false){
    if (PERF){ const t0 = performance.now(); renderGL(dt, y); PERF.t += performance.now() - t0; PERF.n++; window.__perf = PERF; window.__aegis = { renderer, camera, rig, parts, st }; }
    else renderGL(dt, y);
    if (ppe && ppe.running) ppe.frame(now);   // scène « preuve » : rendue dans la même boucle, seulement si visible
  }
  cursorTick && cursorTick();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Le GLB n'est téléchargé qu'une seule fois : la scène principale utilise l'original, la scène « preuve » un clone.
new GLTFLoader().loadAsync(GLB_URL, e => { if (e.lengthComputable) setPct(e.loaded / e.total * 90); })
  .then(g => {
    resolveModel(g.scene.clone(true));
    if (glOK) buildScene(g);
    setPct(100);
    Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 2500))]).then(() => setTimeout(start, 300));
  })
  .catch(err => { console.error(err); resolveModel(null); glOK = false; start(); });
