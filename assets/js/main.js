import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';
import { toCreasedNormals } from '../vendor/three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from '../vendor/three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from '../vendor/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from '../vendor/three/addons/postprocessing/ShaderPass.js';
import { initProof } from './proof.js?v=23';
import { initI18n, getLang, msg, onLang, fmtNum } from './i18n.js?v=20';

/* ------------------------------------------------------------------ */
const HIDE_PARTS = ['body69062', 'body935', 'body27961'];   // pièces du CAD masquées (splitter PoE hors position, optique, plaque)
const TEAM_EMAIL = 'ugo.deproote@student.umons.ac.be';      // ← destinataire du formulaire de contact
/* ------------------------------------------------------------------ */

const GLB_URL = 'assets/boitier.glb?v=14';

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
let useBloom = false;
let renderer, scene, camera, rig, model, beam, halo, dust, beamPts, beamSeed, composer, bloomComposer, ledLight, floorGlow;
const bloomL = new THREE.Layers(), darkMat = new THREE.MeshBasicMaterial({ color: 0x000000 }), saved = new Map();
// faisceau optique : position (repère du GLB, mètres), direction, longueur, rayon. Réglé sur la lentille sous la visière.
// Le modèle est normalisé au chargement (centré en 0,0,0 ; plus grande dimension = NORM mètres) : ces valeurs sont donc relatives
// au centre de l'objet. Si le futur boitier.glb a l'optique ailleurs, il suffit d'ajuster BEAM.pos / BEAM.dir.
const NORM = .225;
// éclaté vertical de l'acte 2 (m) : coque +0,085 · carte Pi 5 + radiateur +0,025 · châssis -0,035
const XV = { body12167: .085, body31097: -.035 };
const ENV_I = .45;   // intensité de l'environnement studio (RoomEnvironment + PMREM) : reflets métalliques sur radiateur, chanfreins, châssis
const BEAM = { pos: [.098, -.0015, -.021], dir: [1, -.14, .22], len: .12, r: .034 };
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
    o.material = new THREE.MeshPhysicalMaterial({ ...def, envMapIntensity: ENV_I });
    o.userData.ex = new THREE.Vector3(...(EX[o.name] || [0, -30, 0])).multiplyScalar(.001);
    o.geometry.computeBoundingBox();
    o.userData.c = o.geometry.boundingBox.getCenter(new THREE.Vector3());
    parts[o.name] = o;
  });
  HIDE_PARTS.forEach(n => { if (parts[n]) parts[n].visible = false; });
  // normalisation : boîte englobante des pièces visibles → centrée sur l'origine, mise à l'échelle standard (NORM).
  // Cadrages et animations restent valides quand boitier.glb est remplacé par un autre modèle CAO.
  model.position.set(0, 0, 0); model.scale.setScalar(1); model.updateMatrixWorld(true);
  const box = new THREE.Box3();
  Object.values(parts).forEach(m => { if (m.visible) box.union(new THREE.Box3().setFromObject(m)); });
  if (!box.isEmpty()){
    const size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
    const k = NORM / Math.max(size.x, size.y, size.z, 1e-6);
    model.scale.setScalar(k); model.position.copy(ctr).multiplyScalar(-k);
  }
  rig.add(model);
}

function initGL(){
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) { return false; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 1);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.FogExp2(0x000000, .042);   // brouillard atmosphérique : la profondeur se fond dans le noir
  camera = new THREE.PerspectiveCamera(32, 1, .1, 60);
  camera.position.set(0, 0, 6.5);

  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture;
  // éclairage studio 3 points : key blanche douce, rim froide rasante (arêtes, visière, relief), contre-jour chaud discret
  const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(-3, 4, 5); scene.add(key);
  const rimC = new THREE.PointLight(0x7dd3fc, 26, 16); rimC.position.set(-4.6, 1.4, -1.6); scene.add(rimC);
  const rimO = new THREE.PointLight(0xff5a00, 9, 14); rimO.position.set(4.6, -.4, -2.4); scene.add(rimO);
  scene.add(new THREE.AmbientLight(0x2a2e36, .45));
  // lumière orange synchronisée sur la LED : elle éclaire réellement la courbe de la coque
  ledLight = new THREE.PointLight(0xff5a00, 0, 5, 2); scene.add(ledLight);

  // halo radial doux derrière le produit (suit le boîtier) ; aucun décor autour
  const hc = document.createElement('canvas'); hc.width = hc.height = 256; const hx = hc.getContext('2d');
  const hg = hx.createRadialGradient(128, 128, 0, 128, 128, 128);
  hg.addColorStop(0, 'rgba(125,211,252,.075)'); hg.addColorStop(.35, 'rgba(70,110,150,.03)'); hg.addColorStop(1, 'rgba(5,6,8,0)');
  hx.fillStyle = hg; hx.fillRect(0, 0, 256, 256);
  halo = new THREE.Mesh(new THREE.PlaneGeometry(13, 13), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(hc), transparent: true, depthWrite: false, fog: false }));
  halo.position.z = -4; scene.add(halo);

  // sol studio : disque lumineux aplati sous le produit, dégradé radial → noir pur (aucun horizon), ancre le boîtier dans l'espace
  const fc = document.createElement('canvas'); fc.width = fc.height = 256; const fx = fc.getContext('2d');
  const fg = fx.createRadialGradient(128, 128, 0, 128, 128, 128);
  fg.addColorStop(0, 'rgba(160,178,205,.30)'); fg.addColorStop(.28, 'rgba(110,125,150,.14)'); fg.addColorStop(.62, 'rgba(60,70,90,.04)'); fg.addColorStop(1, 'rgba(0,0,0,0)');
  fx.fillStyle = fg; fx.fillRect(0, 0, 256, 256);
  floorGlow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(fc), transparent: true, depthWrite: false, fog: false }));
  floorGlow.renderOrder = -1; scene.add(floorGlow);

  rig = new THREE.Group(); scene.add(rig);

  // faisceau optique (étape 1) : cône volumétrique discret devant la lentille, en orange AEGIS
  beam = new THREE.Mesh(new THREE.ConeGeometry(BEAM.r, BEAM.len, 48, 1, true), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { u: { value: 0 } },
    vertexShader: 'varying float vY;varying float vF;void main(){vY=position.y;vec4 mv=modelViewMatrix*vec4(position,1.);vec3 n=normalize(normalMatrix*normal);vF=abs(dot(n,normalize(-mv.xyz)));gl_Position=projectionMatrix*mv;}',
    fragmentShader: 'varying float vY;varying float vF;uniform float u;void main(){float t=clamp((vY/' + BEAM.len.toFixed(4) + ')+.5,0.,1.);float a=u*.17*pow(1.-t,1.6)*smoothstep(0.,.14,t+.02)*pow(smoothstep(.18,1.,vF),1.6);gl_FragColor=vec4(1.,.42,.08,a);}'
  }));
  beam.geometry.translate(0, -BEAM.len / 2, 0);            // sommet à l'origine, ouverture vers -Y
  beam.position.set(...BEAM.pos); beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(...BEAM.dir).normalize());
  beam.visible = false; rig.add(beam);
  // micro-particules qui glissent le long du faisceau
  const BN = 70; beamSeed = Float32Array.from({ length: BN * 3 }, () => Math.random());
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BN * 3), 3));
  beamPts = new THREE.Points(bg, new THREE.PointsMaterial({ color: 0xffb27a, size: .015, transparent: true, opacity: .5, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  beamPts.frustumCulled = false; beam.add(beamPts);

  // anneaux d'alerte (étape 3)
  for (let i = 0; i < 3; i++){
    const m = new THREE.Mesh(new THREE.RingGeometry(.97, 1, 96),
      new THREE.MeshBasicMaterial({ color: 0xff5a00, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    scene.add(m); rings.push(m);
  }
  // poussière lumineuse en profondeur
  const N = 650, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++){ pos[i * 3] = (Math.random() - .5) * 20; pos[i * 3 + 1] = (Math.random() - .5) * 11; pos[i * 3 + 2] = -14 + Math.random() * 19; }
  const dc = document.createElement('canvas'); dc.width = dc.height = 32; const dx = dc.getContext('2d');
  const dg = dx.createRadialGradient(16, 16, 0, 16, 16, 16); dg.addColorStop(0, 'rgba(255,255,255,1)'); dg.addColorStop(1, 'rgba(255,255,255,0)'); dx.fillStyle = dg; dx.fillRect(0, 0, 32, 32);
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dust = new THREE.Points(pg, new THREE.PointsMaterial({ map: new THREE.CanvasTexture(dc), color: 0x9fd8ff, size: .06, transparent: true, opacity: .32, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(dust);
  beamPts.material.map = dust.material.map; beamPts.material.needsUpdate = true;
  // bloom sélectif léger (seuil .88, force .38, rayon .45) : seuls la LED et le faisceau rayonnent, la coque reste nette.
  // Désactivé sur écrans très denses (mobiles) pour tenir 60 FPS.
  useBloom = (devicePixelRatio || 1) <= 2;
  if (useBloom){
    bloomL.set(1);
    [parts.body67406, beam, beamPts].forEach(o => o && o.layers.enable(1));
    rings.forEach(r => r.layers.enable(1));
    bloomComposer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType }));
    bloomComposer.renderToScreen = false;
    bloomComposer.addPass(new RenderPass(scene, camera));
    bloomComposer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), .38, .45, .88));
    composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 }));
    composer.addPass(new RenderPass(scene, camera));
    const mix = new ShaderPass(new THREE.ShaderMaterial({
      uniforms: { baseTexture: { value: null }, bloomTexture: { value: bloomComposer.renderTarget2.texture } },
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'uniform sampler2D baseTexture;uniform sampler2D bloomTexture;varying vec2 vUv;void main(){gl_FragColor=texture2D(baseTexture,vUv)+texture2D(bloomTexture,vUv);}'
    }), 'baseTexture');
    composer.addPass(mix);
    composer.addPass(new OutputPass());
  }
  resizeGL();
  return true;
}

// passe de bloom sélectif : tout ce qui n'est pas sur la couche bloom est rendu en noir (il occulte, mais ne rayonne pas)
function darken(o){
  if (o.isMesh && !bloomL.test(o.layers)){ saved.set(o, o.material); o.material = darkMat; }
  else if ((o === dust || o === halo || o === floorGlow) && o.visible){ saved.set(o, true); o.visible = false; }
}
function restore(){
  saved.forEach((v, o) => { if (v === true) o.visible = true; else o.material = v; });
  saved.clear();
}
function renderBloom(){
  const bg = scene.background; scene.background = null;
  scene.traverse(darken);
  bloomComposer.render();
  restore(); scene.background = bg;
  composer.render();
}

function resizeGL(){
  if (!renderer) return;
  renderer.setSize(innerWidth, innerHeight, false);
  if (composer){
    composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight);
    bloomComposer.setPixelRatio(renderer.getPixelRatio() * .5); bloomComposer.setSize(innerWidth, innerHeight);
  }
  camera.aspect = innerWidth / innerHeight;
  camera.position.z = camera.aspect < 1 ? 7.4 : 6.5;
  camera.updateProjectionMatrix();
}

/* ============================ KEYFRAMES (scroll → 3D) ============================ */
const S0 = 11;
// lz = plongée dans la lentille · fh = macro sur le radiateur · fw = cadrage sur la LED · ld = LED allumée · lf = coque soulevée · bm = faisceau · al = onde d'alerte
const BASE = { px: 0, py: 0, pz: 0, rx: .5, ry: 3.7, rz: 0, s: 1, ex: 0, al: 0, sc: 0, v: 1, lf: 0, fw: 0, bm: 0, lz: 0, fh: 0, ld: 0, xv: 0 };
// K(section, fraction, desktop, mobile) : le dernier argument ne surcharge que le mobile (< 900 px)
const K = (sec, f, o = {}, mob = {}) => ({ sec, f, ...BASE, ...o, mob });
// Composition : le boîtier n'est jamais derrière le texte (texte à gauche → boîtier à droite, etc.).
const KEYS = [
  // Acte 0 : texte en haut, boîtier 3/4 dans la moitié basse
  K('#hero', .5, { py: -1.0, s: 1.0, rx: .42, ry: 3.78, ld: 1 }, { py: -.95, s: .66 }),
  // Acte 1 : plan rasant le long de la visière et de la lentille (boîtier à droite), puis glissement vers l'ouverture
  K('#vision', 0, { px: 1.15, py: -.3, s: 1.2, rx: .35, ry: 4.1, bm: 1, ld: 1 }, { px: 0, py: .7, s: .75 }),
  K('#vision', .25, { px: .9, py: -.1, s: 1.3, rx: .3, ry: 4.25, bm: 1, ld: 1 }, { px: 0, py: .7, s: .75 }),
  K('#vision', .55, { lz: .85, px: 1.1, py: -.1, s: 2.8, rx: .1, ry: 4.6, bm: 1, ld: 1 }, { px: 0, py: .8, s: 1.5 }),
  K('#vision', .85, { fh: 1, px: 1.2, py: 0, s: 2.4, rx: .75, ry: 3.6, ld: 1 }, { px: 0, py: .8, s: 1.2 }),
  // Acte 2 : boîtier éclaté dans la moitié droite, texte à gauche
  K('#architecture', .5, { xv: 1, px: 1.65, py: -.05, s: 1.05, rx: .3, ry: 3.45, ld: 1 }, { px: 0, py: .8, s: .7 }),
  K('#architecture', .78, { xv: 1, px: 1.65, py: -.05, s: 1.05, rx: .34, ry: 3.2, ld: 1 }, { px: 0, py: .8, s: .7 }),
  // Acte 3 : petit, quart supérieur gauche, LED qui pulse
  K('#preuve', 0, { fw: 1, px: -1.5, py: .72, s: .9, rx: .55, ry: 3.95, al: 1, ld: 1 }, { fw: 1, px: 0, py: 1.2, s: .5 }),
  K('#preuve', .5, { fw: 1, px: -1.5, py: .72, s: .9, rx: .55, ry: 3.95, al: 1, ld: 1 }, { fw: 1, px: 0, py: 1.2, s: .5 }),
  // Acte 4 : au centre de la moitié haute, manipulable à 360°
  K('#boitier', .5, { px: 0, py: .78, s: .95, rx: .6, ry: 3.3 }, { py: 1.0, s: .66 }),
  // le canvas disparaît avant le dossier B2B : le boîtier ne passe jamais derrière le titre
  K('#boitier', .92, { px: 0, py: .78, s: .95, rx: .6, ry: 3.3, v: 0 }, { py: 1.0, s: .66 }),
];
const PROPS = ['px', 'py', 'pz', 'rx', 'ry', 'rz', 's', 'ex', 'al', 'sc', 'v', 'lf', 'fw', 'bm', 'lz', 'fh', 'ld', 'xv'];
let anchors = [];
function computeAnchors(){
  const vh = innerHeight, sy = window.scrollY;
  anchors = KEYS.map(k => {
    const el = $(k.sec); if (!el) return null;
    const top = el.getBoundingClientRect().top + sy, h = el.offsetHeight;
    return { ...k, ...(isMobile() ? k.mob : {}), y: top + k.f * h - vh * .5 };
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

const _v = new THREE.Vector3(), _lw = new THREE.Vector3(), _ld = new THREE.Vector3();

const pinEls = $$('.pin').map(el => {
  const pt = (el.dataset.pt || '').split(',').map(Number);
  return { el, part: el.dataset.part, pt: pt.length === 3 ? new THREE.Vector3(...pt) : null, edge: el.dataset.edge === 'left', corners: null };
});
function updatePins(vis){
  const show = !isMobile() && innerWidth >= 1100 && vis > .01;
  const k = show ? clamp((st.xv - .6) / .4, 0, 1) * vis : 0;
  const leader = innerWidth * .56;
  pinEls.forEach(p => {
    const m = parts[p.part];
    if (!m || k < .01){ if (p.on){ p.el.style.opacity = 0; p.on = false; } return; }
    p.on = true;
    let x, y;
    if (p.edge){
      // ancre sur l'arête latérale extérieure : le coin de la boîte englobante le plus à gauche à l'écran (le libellé ne passe jamais derrière la coque)
      if (!p.corners){ const b = m.geometry.boundingBox; p.corners = []; for (let i = 0; i < 8; i++) p.corners.push(new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z)); }
      let best = 1e9;
      p.corners.forEach(c => { _v.copy(c); m.localToWorld(_v); _v.project(camera); const cx = (_v.x * .5 + .5) * innerWidth; if (cx < best){ best = cx; x = cx; y = (-_v.y * .5 + .5) * innerHeight; } });
    } else {
      _v.copy(p.pt || m.userData.c); m.localToWorld(_v); _v.project(camera);
      x = (_v.x * .5 + .5) * innerWidth; y = (-_v.y * .5 + .5) * innerHeight;
    }
    p.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
    p.el.style.setProperty('--w', Math.max(28, x - leader).toFixed(0) + 'px');
    p.el.style.opacity = k.toFixed(2);
  });
}

const reticle = $('#reticle');
let retOn = false;
function updateReticle(vis){
  const k = vis > .01 ? clamp((st.lz - .25) / .45, 0, 1) * vis : 0;
  if (k < .01){ if (retOn){ reticle.style.opacity = 0; retOn = false; } return; }
  retOn = true;
  _v.set(...BEAM.pos).applyMatrix4(rig.matrixWorld).project(camera);
  const x = (_v.x * .5 + .5) * innerWidth, y = (-_v.y * .5 + .5) * innerHeight;
  reticle.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
  reticle.style.opacity = k.toFixed(2);
  reticle.classList.toggle('lock', st.lz > .78);
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
  if (DBG){ const [a, b, c, d, e, f = 0, g = 0, h = 0, i = 0] = DBG; Object.assign(st, { px: a, py: b, rx: c, ry: d, s: e, lf: f, fw: g, bm: h, al: i, v: 1, ex: 0 }); }

  const mob = isMobile();
  const pk = 1 - Math.exp(-dt * 3.8);   // ≈ lerp 0,06 par frame à 60 FPS
  smx += ((dragging ? 0 : mx) - smx) * pk; smy += ((dragging ? 0 : my) - smy) * pk;
  const px = st.px, py = st.py, s = st.s;
  const vis = ready ? st.v : 0;
  canvas.style.opacity = vis.toFixed(3);
  if (vis < .01 || !glOK){ updatePins(0); updateReticle(0); return; }

  const bx = px, by = py + Math.sin(time * 1.1) * .004 * S0 * s;   // respiration ±0,004 m
  rig.position.set(bx, by, st.pz);
  if (!dragging && !rstAnim){ yawV *= .94; yawO += yawV; if (stageW < .05){ const tgt = Math.round(yawO / TAU) * TAU; yawO += (tgt - yawO) * .08; pitO += (0 - pitO) * .08; } }
  rig.rotation.set(st.rx + pitO + smy * .12, st.ry + yawO + Math.sin(time * .45) * .1 + smx * .28, st.rz);
  rig.scale.setScalar(S0 * s);

  const ex = st.ex, lf = st.lf;
  for (const n in parts){ const m = parts[n]; m.position.copy(m.userData.ex).multiplyScalar(ex); m.rotation.x = 0; if (st.xv > .001) m.position.y += st.xv * (XV[n] ?? .025); }
  const shell = parts.body12167;                      // vue éclatée de la coque seule : montée verticale (+Y) avec léger tilt
  if (shell){ shell.position.y += lf * .1; shell.rotation.x = -lf * .2; }
  if (parts.body31097) parts.body31097.position.y -= lf * .03;   // le châssis descend un peu : les annotations ne se chevauchent plus
  const led = parts.body67406;
  const pulse = .82 + .18 * Math.sin(time * (st.al > .5 ? 7 : 2.4));
  const ledK = clamp(st.ld * .9 + st.al * .3, 0, 1) * pulse;
  if (led) led.material.emissiveIntensity = 2.2 * ledK;   // bloom : seule la LED dépasse le seuil

  // cadrages : un point d'intérêt (lentille, LED, radiateur) vient se placer au point visé (px, py)
  rig.updateMatrixWorld(true);
  const focus = (v, w) => { rig.position.x -= (v.x - bx) * w; rig.position.y -= (v.y - by) * w; rig.position.z -= (v.z - st.pz) * w; rig.updateMatrixWorld(true); };
  if (st.lz > .001){ _v.set(...BEAM.pos).applyMatrix4(rig.matrixWorld); focus(_v, st.lz); }
  if (led && st.fw > .001){ _v.copy(led.userData.c); led.localToWorld(_v); focus(_v, st.fw); }
  const hs = parts.body55189;   // Raspberry Pi 5 (+ radiateur)
  if (hs && st.fh > .001){ _v.copy(hs.userData.c); hs.localToWorld(_v); focus(_v, st.fh); }
  // halo derrière le produit
  halo.position.x = rig.position.x * .7; halo.position.y = rig.position.y * .7;
  floorGlow.position.set(rig.position.x, rig.position.y - (.36 + st.xv * .42) * s, rig.position.z - .6);
  floorGlow.scale.set(4.4 * s, 1.2 * s, 1);
  floorGlow.material.opacity = (1 - clamp(st.lz * 1.6, 0, 1)) * (1 - clamp(st.fh * .8, 0, .8));
  dust.rotation.y = time * .02; dust.position.y = (y * .0007) % 5; dust.position.z = st.pz * .5;
  // faisceau optique (étape 1)
  if (st.bm > .01){
    const pa = beamPts.geometry.attributes.position, L = BEAM.len, R = BEAM.r;
    for (let i = 0; i < pa.count; i++){
      const t = (beamSeed[i * 3] + time * (.12 + beamSeed[i * 3 + 1] * .12)) % 1, a = beamSeed[i * 3 + 2] * 6.283, r = R * t * Math.sqrt(beamSeed[i * 3 + 1]);
      pa.setXYZ(i, Math.cos(a) * r, -t * L, Math.sin(a) * r);
    }
    pa.needsUpdate = true; beamPts.material.opacity = .55 * st.bm;
  }
  beam.visible = st.bm > .01; beam.material.uniforms.u.value = st.bm * (.75 + Math.sin(time * 1.6) * .15);
  // onde circulaire qui part de la LED
  if (led) { _v.copy(led.userData.c); led.localToWorld(_v); {
    const ls = clamp(s / .9, .5, 1.6);
    _lw.set(...BEAM.pos).applyMatrix4(rig.matrixWorld);
    _ld.set(...BEAM.dir).normalize().transformDirection(rig.matrixWorld);
    ledLight.position.copy(_lw).addScaledVector(_ld, .3 * ls);   // devant la lentille avant
    ledLight.distance = .95 * ls;                                  // portée courte : n'atteint pas le creux supérieur de la coque
  } }
  ledLight.intensity = ledK * (.5 + st.al * 2.0) * (isMobile() ? .5 : 1);
  rings.forEach((r, i) => {
    const ph = ((time * .8 + i / 3) % 1);
    r.position.copy(_v); r.position.z += .15;
    r.scale.setScalar((.3 + ph * 1.5) * clamp(s * .75, .5, 1.6));
    r.material.opacity = st.al * Math.pow(1 - ph, 1.6) * .85;
    r.visible = st.al > .01;
  });
  camera.lookAt(0, 0, 0);
  scene.updateMatrixWorld(true);
  if (composer && useBloom) renderBloom(); else renderer.render(scene, camera);
  updatePins(vis); updateReticle(vis);
}

/* ============================ UI : état du scroll ============================ */
const nav = $('#nav'), prog = $('#progress');
const SEC_IDS = ['hero', 'vision', 'architecture', 'preuve', 'boitier', 'dossier'];
const sections = SEC_IDS.map(id => $('#' + id));
const acts = $$('.act');
const navLinks = $$('.links a');
let activeSec = -1, shPrev = 0;
const rail = $('#rail'), railLinks = $$('a', rail);
const stageEl = $('#boitier'), exBtn = $('#exBtn');

// Mesures de layout mises en cache : recalculées au resize / changement de langue, jamais par frame.
const M = { secTops: [], stageC: 0, doc: 1 };
function measure(){
  const sy = window.scrollY, abs = el => el.getBoundingClientRect().top + sy;
  M.secTops = sections.map(s => s ? abs(s) : Infinity);
  const sr = stageEl.getBoundingClientRect(); M.stageC = sr.top + sy + sr.height / 2;
  M.doc = document.documentElement.scrollHeight - innerHeight;
}
let proof = null, cursorTick = null;   // piloté par la boucle rAF unique (voir loop())

function updateUI(y){
  const vh = innerHeight, doc = M.doc;
  nav.classList.toggle('sc', y > 30);
  prog.style.transform = `scaleX(${doc > 0 ? clamp(y / doc, 0, 1) : 0})`;
  let a = 0; M.secTops.forEach((t, i) => { if (t - y <= vh * .5) a = i; });
  if (a !== activeSec){
    activeSec = a;
    const nid = a === 0 ? null : '#' + SEC_IDS[a];
    navLinks.forEach(l => l.classList.toggle('on', l.getAttribute('href') === nid));
    acts.forEach((el, i) => el.classList.toggle('on', i === a));
    railLinks.forEach((l, i) => l.classList.toggle('on', i === a));
    rail.classList.toggle('off', a >= 5);
  }
  stageW = clamp(1 - Math.abs((M.stageC - y) - vh / 2) / (vh * .55), 0, 1);
  const sh = 160 - ((y * .1) % 220);   // balayage lumineux des dégradés argentés, piloté par le scroll
  if (Math.abs(sh - shPrev) > .8){ shPrev = sh; document.documentElement.style.setProperty('--sh', sh.toFixed(1) + '%'); }
}

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
// simulateur ROI : 3 800 € / boîtier, un accident grave évité = 200 000 €
{
  const n = $('#roiN'), nv = $('#roiNv'), inv = $('#roiInv'), inv2 = $('#roiInv2'), acc = $('#roiAcc'), net = $('#roiNet'), pay = $('#roiPay'), bar = $('#roiBar');
  const UNIT = 3800, ACC = 200000, eur = v => fmtNum(v) + ' €';
  const sim = () => {
    const c = +n.value, I = c * UNIT, N = ACC - I, mo = I / (ACC / 12);
    n.style.setProperty('--p', ((c - 2) / 48 * 100).toFixed(1) + '%');
    nv.textContent = c; inv.textContent = inv2.textContent = eur(I); acc.textContent = eur(ACC);
    net.textContent = (N < 0 ? '−' : '') + eur(Math.abs(N));
    pay.textContent = mo.toFixed(1).replace('.', getLang() === 'en' ? '.' : ',');
    bar.style.setProperty('--w', Math.min(100, I / ACC * 100).toFixed(1) + '%');
  };
  n.addEventListener('input', sim); onLang(sim); sim();
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
  $$('.bc, .fcard').forEach(el => {
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

// titre du hero : entrée mot par mot, masquage vertical
const h1 = $('#h1');
function splitHero(){
  const txt = h1.textContent.trim();
  h1.setAttribute('aria-label', txt);
  h1.innerHTML = txt.split(/\s+/).map((w, i) => `<span class="w" aria-hidden="true" style="--i:${i}"><span>${w}</span></span>`).join(' ');
}
splitHero(); onLang(splitHero);

/* ============================ boîtier interactif ============================ */
{
  let last = null;
  stageEl.addEventListener('pointerdown', e => { if (e.target.closest('button,a,.fcard')) return; dragging = true; cancelAnims(); exBtn.classList.toggle('on', userEx > .5); last ={ x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch' }; try { stageEl.setPointerCapture(e.pointerId); } catch (_) {} });
  stageEl.addEventListener('pointermove', e => {
    if (!dragging || !last) return;
    const dx = e.clientX - last.x, dy = e.clientY - last.y; last.x = e.clientX; last.y = e.clientY;
    yawO += dx * .009; yawV = dx * .009;
    if (!last.touch) pitO = clamp(pitO + dy * .005, -.9, .9);
    $('.drag-badge').style.opacity = 0;
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

/* ============================ comparateur AVEC / SANS AEGIS (vraies captures terrain) ============================ */
{
  const wrap = $('#cam3d'), stP = $('#stP'), stOk = $('#stOk'), stAl = $('#stAl'), camAlert = $('#camAlert'), camTime = $('#camTime'), camFps = $('#camFps');
  // n'écrit dans le DOM que si la valeur a changé (évite des dizaines de réécritures par seconde)
  const put = (el, v) => { if (el._v !== v){ el._v = v; el.textContent = v; } };
  let alertPrev = false;
  proof = initProof({ wrap, img: $('#cmpImg'), ov: $('#cmpOv'), getLang, ui: d => {
    put(stP, d.people); put(stOk, d.ok); put(stAl, d.alerts); put(camFps, d.fps);
    if (d.alertOn !== alertPrev){ alertPrev = d.alertOn; camAlert.classList.toggle('on', d.alertOn); }
    put(camTime, new Date().toTimeString().slice(0, 8));
  } });
  new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? proof.start() : proof.stop()), { threshold: .08 }).observe(wrap);
  $$('#seg button').forEach(b => b.addEventListener('click', () => {
    const onMode = b.dataset.m === '1';
    $$('#seg button').forEach(x => x.classList.toggle('on', x === b));
    $('#seg').dataset.v = onMode ? 0 : 1;
    wrap.classList.toggle('off', !onMode); proof.setOn(onMode);
  }));
  $$('#cmpScn button').forEach(b => b.addEventListener('click', () => {
    $$('#cmpScn button').forEach(x => x.classList.toggle('on', x === b));
    $('#cmpScn').dataset.v = b.dataset.s === 'equipped' ? 1 : 0;
    proof.setScenario(b.dataset.s);
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
  if (at){ const [id, f] = at.split(':'), el = $('#' + id); y = el.getBoundingClientRect().top + window.scrollY + (+f) * el.offsetHeight - innerHeight * .5; }
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
    if (proof && proof.running) proof.frame(now);   // comparateur #preuve : dans la même boucle, seulement si visible
  }
  cursorTick && cursorTick();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

new GLTFLoader().loadAsync(GLB_URL, e => { if (e.lengthComputable) setPct(e.loaded / e.total * 90); })
  .then(g => {
    if (glOK) buildScene(g);
    setPct(100);
    Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 2500))]).then(() => setTimeout(start, 300));
  })
  .catch(err => { console.error(err); glOK = false; start(); });
