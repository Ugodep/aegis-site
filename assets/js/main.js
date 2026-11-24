import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';
import { toCreasedNormals } from '../vendor/three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from '../vendor/three/addons/environments/RoomEnvironment.js';
import { initPPE } from './ppe3d.js?v=18';
import { createWorld, poseAtStory, STORY } from './world.js?v=18';
import { initI18n, getLang, hud as hudText, msg, onLang, fmtNum } from './i18n.js?v=18';

/* ------------------------------------------------------------------ */
const HIDE_PARTS = ['body69062', 'body935', 'body27961'];   // pièces du CAD masquées (splitter PoE hors position, optique, plaque)
const TEAM_EMAIL = 'ugo.deproote@student.umons.ac.be';      // ← destinataire du formulaire de contact
/* ------------------------------------------------------------------ */

const GLB_URL = 'assets/boitier.glb?v=14';
let resolveModel;
const modelP = new Promise(r => { resolveModel = r; });   // modèle du boîtier partagé avec ppe3d.js

const qs = new URLSearchParams(location.search);
const SNAP = qs.has('snap');
// debug caméra : ?l=x,y,z,tx,ty,tz,fov,coque,écran,u (repère boîtier) ou ?w=… (repère monde)
const DBG = (() => { const l = qs.get('l'), w = qs.get('w'), v = l || w; return v ? { loc: !!l, a: v.split(',').map(Number) } : null; })();
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
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
  scene.fog = new THREE.Fog(0x0b0d10, 14, 34);   // le chantier se fond dans le fond de page

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
  camera.userData.vo = -1;   // force le recalcul du cadrage dans applyCamera()
  camera.updateProjectionMatrix();
}

/* ============================ KEYFRAMES (scroll → 3D) ============================ */
const S0 = 11;
// BASE : état du boîtier « hero » (rig) + caméra (cx…tz, fov, vo = décalage horizontal de l'image) + monde (wa = chantier visible,
// rg = boîtier hero visible, sh = opacité de la coque PLA, hd = écran interne, tr = flux de métadonnées)
const BASE = { px: 1.4, py: -.05, pz: 0, rx: .55, ry: 3.7, rz: 0, s: .8, ex: 0, al: 0, sc: 0, v: 1, m: 1, mv: 1,
  cx: 0, cy: 0, cz: 6.5, tx: 0, ty: 0, tz: 0, fov: 32, vo: 0, wa: 0, rg: 1, sh: 1, hd: 0, tr: 0 };
const K = (sec, f, o = {}, pin = false) => ({ sec, f, pin, ...BASE, ...o });
// KW : clé de caméra dans le monde (interpolation linéaire = travelling continu) ; KL : mêmes valeurs mais caméra/cible en repère boîtier
const KW = (f, c, o = {}) => ({ ...K('#solution', f, { wa: 1, rg: 0, vo: 1, cx: c[0], cy: c[1], cz: c[2], tx: c[3], ty: c[4], tz: c[5], fov: c[6], ...o }, true), lin: true });
const KL = (f, c, o = {}) => ({ ...KW(f, c, { vo: .6, ...o }), loc: true });
const KEYS = [
  K('#hero', .5, {}),
  K('#manifeste', .25, { px: 1.0, ry: 2.8, rx: .3, s: .6, v: 0 }),
  K('#terrain', .9, { v: 0 }),
  // ---- #solution : séquence immersive en 3 actes (progression u = f) ----
  // ACTE 1 (0 → .35)  le terrain : l'ouvrier retire son casque près d'une machine ; la caméra monte vers le boîtier
  KW(-.02, [3.8, 2.9, 9.8, -.6, 1.4, -.4, 42], { v: 0 }),
  KW(.03, [3.8, 2.9, 9.8, -.6, 1.4, -.4, 42]),
  KW(.12, [1.6, 2.0, 5.8, -.5, 1.35, .2, 38]),
  KW(.26, [.6, 1.75, 4.4, -.3, 1.45, .3, 34]),
  KW(.35, [-1.9, 3.2, 1.6, -2.6, 2.75, -2.7, 38]),
  // ACTE 2 (.35 → .70)  traversée de la coque : coordonnées dans le repère du GLB (mètres) ; panneau interne en x .05, y -.003, z -.04
  KL(.42, [0, .1, .3, 0, 0, -.04, 38]),
  KL(.50, [.03, .07, 0, .04, -.005, -.04, 45], { sh: .08 }),
  KL(.56, [.012, .05, .03, .045, -.004, -.04, 50], { sh: .08, hd: 1 }),
  KL(.60, [.012, .05, .03, .045, -.004, -.04, 50], { sh: .08, hd: 1 }),
  KL(.66, [-.03, .06, .05, -.065, -.01, -.038, 55], { sh: .08, hd: 1 }),
  KL(.70, [.05, .12, .12, .02, 0, -.04, 45], { sh: 1, hd: 0 }),
  // ACTE 3 (.70 → 1)  le bureau du conseiller QSE : le flux ne transporte que des métadonnées
  KW(.76, [-1.6, 3.7, 3.0, 2.5, 3.6, -1.5, 40], { tr: 1 }),
  KW(.86, [5.0, 3.7, 1.7, 6.6, 3.6, -2.6, 34], { tr: 1 }),
  KW(.95, [6.6, 3.62, -.7, 6.6, 3.6, -2.88, 36], { tr: .3 }),
  KW(1, [6.6, 3.62, -.7, 6.6, 3.6, -2.88, 36], { tr: 0 }),
  KW(1.04, [6.6, 3.62, -.7, 6.6, 3.6, -2.88, 36], { v: 0 }),
  K('#stage', -.1, { px: 0, py: 0, rx: .6, ry: 3.3, s: .95, m: 0, v: 0 }),
  K('#stage', .2, { px: 0, py: 0, rx: .6, ry: 3.3, s: .95, m: 0, v: 1 }),
  K('#stage', .85, { px: 0, py: 0, rx: .6, ry: 3.3, s: .95, m: 0, v: 1 }),
  K('#stage', 1.15, { px: 0, py: 0, rx: .6, ry: 3.3, s: .95, m: 0, v: 0 }),
  K('#preuve', .3, { v: 0 }),
];
const PROPS = ['px', 'py', 'pz', 'rx', 'ry', 'rz', 's', 'ex', 'al', 'sc', 'v', 'm', 'mv', 'cx', 'cy', 'cz', 'tx', 'ty', 'tz', 'fov', 'vo', 'wa', 'rg', 'sh', 'hd', 'tr'];
let anchors = [];
const _lv = new THREE.Vector3();
let world = null;
function computeAnchors(){
  const vh = innerHeight, sy = window.scrollY;
  anchors = KEYS.map(k => {
    const el = $(k.sec); if (!el) return null;
    const top = el.getBoundingClientRect().top + sy, h = el.offsetHeight;
    if (k.loc){
      if (!world) return null;
      const c = world.boxToWorld(k.cx, k.cy, k.cz, _lv).toArray(), t = world.boxToWorld(k.tx, k.ty, k.tz, _lv).toArray();
      k = { ...k, cx: c[0], cy: c[1], cz: c[2], tx: t[0], ty: t[1], tz: t[2] };
    }
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
  let t = clamp((y - a.y) / (b.y - a.y || 1), 0, 1); if (!(a.lin && b.lin)) t = t * t * (3 - 2 * t);
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

// ---- récit 3D de #solution : le chantier partagé (world.js), piloté par la progression du scroll (su = 0..1) ----
let su = 0, suT = 0, alertK = 0, beaconK = 0, edgeAcc = 0, qseAcc = 0;
function updateWorld(dt){
  su += (suT - su) * (SNAP || DBG ? 1 : 1 - Math.exp(-dt * 6.5));
  const pose = poseAtStory(su), kk = 1 - Math.exp(-dt * 7);
  world.applyHero(pose, dt);
  world.update(dt, time, camera);
  alertK += ((su >= STORY.alertOn && su < STORY.alertOff ? 1 : 0) - alertK) * kk;
  beaconK += ((su >= STORY.beacon[0] && su < STORY.beacon[1] ? 1 : 0) - beaconK) * kk;
  world.applyAlert(alertK > .05, time, alertK > .05 ? alertK : 1, camera);
  world.setBeacon(beaconK, time);
  world.setShell(st.sh); world.setEdgeAlpha(st.hd); world.setTrail(st.tr, time);
  const lang = getLang();   // les libellés des écrans 2D suivent le toggle FR/EN à la frame suivante
  edgeAcc += dt; if (st.hd > .01 && edgeAcc > 1 / 30){ edgeAcc = 0; world.drawEdge({ u: su, T: time, lang, helmet: pose.h, missing: pose.status === 'missing', alert: alertK }); }
  qseAcc += dt; if (su > .6 && qseAcc > 1 / 24){ qseAcc = 0; world.drawQSE({ u: su, T: time, lang }); }
}
// caméra pilotée par les keyframes ; en portrait le fov s'élargit pour que le boîtier / l'écran QSE ne soient pas coupés
function applyCamera(){
  const wa = clamp(st.wa, 0, 1), port = camera.aspect < 1;
  camera.position.set(st.cx, st.cy, st.cz * (1 + (port ? .138 : 0) * (1 - wa)));
  let fov = st.fov;
  if (port && wa > 0) fov = lerp(fov, 2 * Math.atan(Math.tan(fov * Math.PI / 360) / camera.aspect) * 180 / Math.PI, wa);
  // desktop : l'image est décalée vers la droite (le texte occupe la gauche) ; portrait : vers le haut (le texte occupe le bas)
  const near = wa > .5 ? .01 : .1, vo = port ? 0 : st.vo * wa, vy = port ? innerHeight * .2 * wa : 0, key = vo * 1000 + vy;
  if (Math.abs(camera.fov - fov) > .01 || camera.near !== near || camera.userData.vo !== key){
    camera.fov = fov; camera.near = near; camera.userData.vo = key;
    if (key > .001) camera.setViewOffset(innerWidth, innerHeight, -innerWidth * .16 * vo, vy, innerWidth, innerHeight); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
  camera.lookAt(st.tx, st.ty, st.tz);
}

function renderGL(dt, y){
  stepAnims(dt);
  targetAt(y, tg);
  tg.ex = Math.max(tg.ex, userEx * stageW); tg.sc = Math.max(tg.sc, userEx * stageW * .7);
  const k = SNAP ? 1 : 1 - Math.exp(-dt * (ready ? 6.5 : 2.4));
  PROPS.forEach(p => st[p] += (tg[p] - st[p]) * k);
  suT = clamp((y - M.solTop) / (M.solH || 1), 0, 1);
  if (DBG && world){
    const [a0, a1, a2, b0, b1, b2, fv = 40, sh = 1, hd = 0, u = .5] = DBG.a;
    const c = DBG.loc ? world.boxToWorld(a0, a1, a2, _lv).toArray() : [a0, a1, a2], t = DBG.loc ? world.boxToWorld(b0, b1, b2, _lv).toArray() : [b0, b1, b2];
    Object.assign(st, { cx: c[0], cy: c[1], cz: c[2], tx: t[0], ty: t[1], tz: t[2], fov: fv, sh, hd, v: 1, wa: 1, rg: 0, vo: 0, tr: 0 }); suT = u;
  }

  const mob = isMobile();
  smx += (mx - smx) * (1 - Math.exp(-dt * 4)); smy += (my - smy) * (1 - Math.exp(-dt * 4));
  const mw = mob ? st.m : 0;
  const px = st.px * (1 - .88 * mw), py = st.py + .95 * mw, s = st.s * (1 - .48 * mw);
  const vis = ready ? st.v * (mob ? st.mv : 1) : 0;
  canvas.style.opacity = vis.toFixed(3);
  if (vis < .01 || !glOK){ tagEls.forEach(el => { el.style.opacity = 0; }); return; }

  rig.position.set(px, py + Math.sin(time * .9) * .035, st.pz);
  if (!dragging && !rstAnim){ yawV *= .94; yawO += yawV; if (stageW < .05){ const tgt = Math.round(yawO / TAU) * TAU; yawO += (tgt - yawO) * .08; pitO += (0 - pitO) * .08; } }
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
  rig.visible = st.rg > .5;
  const wOn = !!world && st.wa > .5;
  if (world) world.group.visible = wOn;   // le chantier n'est rendu que pendant #solution
  if (wOn) updateWorld(dt);
  applyCamera();
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
const STEP_AT = [0, .17, .35, .70, 1];   // étapes 01/02 = acte 1, 03 = acte 2 (boîtier), 04 = acte 3 (bureau QSE)
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
  if (si !== curStep){
    curStep = si;
    hudN.textContent = '0' + (si + 1); hudT.textContent = hudText(si);
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
    renderGL(dt, y);
    if (ppe && ppe.running) ppe.frame(now);   // scène « preuve » : rendue dans la même boucle, seulement si visible
  }
  cursorTick && cursorTick();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Le GLB n'est téléchargé qu'une seule fois : la scène principale utilise l'original, la scène « preuve » un clone.
function buildWorld(tpl){
  world = createWorld(THREE, { model: tpl.clone(true), getLang });
  world.group.visible = false; scene.add(world.group);
  // précompilation des shaders pendant l'écran de chargement (évite un à-coup à l'entrée dans #solution)
  world.group.visible = true; try { renderer.compile(scene, camera); } catch (e) {} world.group.visible = false;
  remeasure();   // résout les keyframes exprimées dans le repère du boîtier
}
new GLTFLoader().loadAsync(GLB_URL, e => { if (e.lengthComputable) setPct(e.loaded / e.total * 90); })
  .then(g => {
    g.scene.traverse(o => { if (o.isMesh) o.geometry = toCreasedNormals(o.geometry, .62); });   // une seule fois : géométrie partagée par toutes les instances
    const tpl = g.scene.clone(true);
    resolveModel(tpl);
    if (glOK){ buildScene(g); buildWorld(tpl); }
    setPct(100);
    Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 2500))]).then(() => setTimeout(start, 300));
  })
  .catch(err => { console.error(err); resolveModel(null); glOK = false; start(); });
