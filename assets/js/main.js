import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';
import { toCreasedNormals } from '../vendor/three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from '../vendor/three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from '../vendor/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from '../vendor/three/addons/postprocessing/ShaderPass.js';
import { initProof } from './proof.js?v=34';
import { initI18n, getLang, msg, onLang, fmtNum } from './i18n.js?v=34';

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
if (window.Lenis && !reduced && !SNAP) lenis = new Lenis({ lerp: .085, wheelMultiplier: .95 });
const scrollY_ = () => (lenis ? lenis.scroll : window.scrollY);

$$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
  const id = a.getAttribute('href');
  const el = id.length > 1 ? $(id) : null;
  if (!el) return;
  e.preventDefault();
  document.body.classList.remove('menu');
  lenis && lenis.start();
  // acte 3 : on arrive une fois le recul terminé, poste de travail entièrement visible
  const off = el.id === 'preuve' ? (el.offsetHeight - innerHeight) * .72 : 0;
  if (lenis) lenis.scrollTo(el, { offset: off, duration: 1.7, easing: t => 1 - Math.pow(1 - t, 4) });
  else window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + off, behavior: reduced ? 'auto' : 'smooth' });
}));

/* ============================ SCÈNE 3D ============================ */
const canvas = $('#gl');
let useBloom = false;
let renderer, scene, camera, rig, model, beam, halo, dust, beamPts, beamSeed, composer, bloomComposer, ledLight, floorGlow, softLight, backGlow, mixPass;
const bloomL = new THREE.Layers(), darkMat = new THREE.MeshBasicMaterial({ color: 0x000000 }), saved = new Map();
// faisceau optique : position (repère du GLB, mètres), direction, longueur, rayon. Réglé sur la lentille sous la visière.
// Le modèle est normalisé au chargement (centré en 0,0,0 ; plus grande dimension = NORM mètres) : ces valeurs sont donc relatives
// au centre de l'objet. Si le futur boitier.glb a l'optique ailleurs, il suffit d'ajuster BEAM.pos / BEAM.dir.
const NORM = .225;
// éclaté vertical de l'acte 2 (m) : coque +0,068 · carte Pi 5 + radiateur +0,025 · châssis -0,035
const XV = { body12167: .068, body31097: -.035 };
const ENV_I = .45;   // intensité de l'environnement studio (RoomEnvironment + PMREM) : reflets métalliques sur radiateur, chanfreins, châssis
const BEAM = { pos: [.098, .0035, 0], dir: [1, -.06, 0], len: .12, r: .034 };
const parts = {};
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
  body55189: { color: 0x15171b, roughness: .44, metalness: .62, clearcoat: .45, clearcoatRoughness: .32 },                      // Raspberry Pi 5 : noir obsidienne satiné
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
  renderer.setClearColor(0x000000, 0);   // transparent : le calque typographique #depth reste visible derrière le boîtier

  scene = new THREE.Scene();
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
    fragmentShader: 'varying float vY;varying float vF;uniform float u;void main(){float t=clamp((vY/' + BEAM.len.toFixed(4) + ')+.5,0.,1.);float a=u*.085*pow(1.-t,1.6)*smoothstep(0.,.14,t+.02)*pow(smoothstep(.18,1.,vF),1.6);gl_FragColor=vec4(1.,.42,.08,a);}'
  }));
  beam.geometry.translate(0, -BEAM.len / 2, 0);            // sommet à l'origine, ouverture vers -Y
  beam.position.set(...BEAM.pos); beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(...BEAM.dir).normalize());
  beam.visible = false; rig.add(beam);
  // micro-particules qui glissent le long du faisceau
  const BN = 70; beamSeed = Float32Array.from({ length: BN * 3 }, () => Math.random());
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BN * 3), 3));
  beamPts = new THREE.Points(bg, new THREE.PointsMaterial({ color: 0xffb27a, size: .015, transparent: true, opacity: .5, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  beamPts.frustumCulled = false; beam.add(beamPts);

  // acte 3 : faisceau optique discret vers la droite, éclairage studio doux, fine impulsion « signal anonyme » vers l'écran
  softLight = new THREE.PointLight(0xdfe8ff, 0, 7, 2); scene.add(softLight);
  // acte 2 : halo rétro-éclairé doux derrière l'assemblage éclaté
  const bc = document.createElement('canvas'); bc.width = bc.height = 256; const bx2 = bc.getContext('2d');
  const bgr = bx2.createRadialGradient(128, 128, 0, 128, 128, 128);
  bgr.addColorStop(0, 'rgba(150,190,255,.26)'); bgr.addColorStop(.4, 'rgba(90,130,200,.10)'); bgr.addColorStop(1, 'rgba(0,0,0,0)');
  bx2.fillStyle = bgr; bx2.fillRect(0, 0, 256, 256);
  backGlow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(bc), transparent: true, depthWrite: false, fog: false }));
  backGlow.renderOrder = -2; backGlow.visible = false; scene.add(backGlow);

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
    bloomComposer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType }));
    bloomComposer.renderToScreen = false;
    bloomComposer.addPass(new RenderPass(scene, camera));
    bloomComposer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), .38, .45, .88));
    composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 }));
    composer.addPass(new RenderPass(scene, camera));
    const mix = mixPass = new ShaderPass(new THREE.ShaderMaterial({
      uniforms: { baseTexture: { value: null }, bloomTexture: { value: bloomComposer.renderTarget2.texture }, uAb: { value: 0 } },
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      // alpha conservé (calque typographique derrière) ; uAb = micro-décalage chromatique, non nul seulement aux pics de vitesse
      fragmentShader: 'uniform sampler2D baseTexture;uniform sampler2D bloomTexture;uniform float uAb;varying vec2 vUv;void main(){vec2 o=(vUv-.5)*uAb;vec4 b=texture2D(baseTexture,vUv);if(uAb>.0001){b.r=texture2D(baseTexture,vUv+o).r;b.b=texture2D(baseTexture,vUv-o).b;}vec3 g=texture2D(bloomTexture,vUv).rgb;gl_FragColor=vec4(b.rgb+g,clamp(b.a+max(g.r,max(g.g,g.b)),0.,1.));}'
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
  else if ((o === dust || o === halo || o === floorGlow || o === backGlow) && o.visible){ saved.set(o, true); o.visible = false; }
}
function restore(){
  saved.forEach((v, o) => { if (v === true) o.visible = true; else o.material = v; });
  saved.clear();
}
function renderBloom(){
  scene.traverse(darken);
  bloomComposer.render();
  restore();
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
const BASE = { px: 0, py: 0, pz: 0, rx: .5, ry: 3.7, rz: 0, s: 1, ex: 0, al: 0, sc: 0, v: 1, lf: 0, fw: 0, bm: 0, lz: 0, fh: 0, ld: 0, xv: 0, gd: 0 };
// K(section, fraction, desktop, mobile) : le dernier argument ne surcharge que le mobile (< 900 px)
const K = (sec, f, o = {}, mob = {}) => ({ sec, f, ...BASE, ...o, mob });
// Composition : le boîtier n'est jamais derrière le texte (texte à gauche → boîtier à droite, etc.).
const KEYS = [
  // Acte 0 : texte en haut, boîtier 3/4 dans la moitié basse
  K('#hero', .5, { py: -1.0, s: 1.0, rx: .42, ry: 3.78, ld: 1 }, { py: -.95, s: .66 }),
  // Acte 1 : approche continue de l'optique (boîtier à droite), sans palier, qui enchaîne sur l'ouverture
  K('#vision', .02, { px: 1.15, py: -.28, s: 1.2, rx: .36, ry: 4.1, bm: 1, ld: 1 }, { px: 0, py: .7, s: .74 }),
  K('#vision', .45, { lz: .5, px: 1.22, py: -.1, s: 1.85, rx: .22, ry: 4.48, bm: 1, ld: 1 }, { px: 0, py: .78, s: 1.05 }),
  K('#architecture', 0, { xv: .12, px: 1.45, py: -.06, s: 1.4, rx: .34, ry: 3.9, ld: 1 }, { px: 0, py: .8, s: .86 }),
  // Acte 2 : boîtier éclaté dans la moitié droite, texte à gauche
  K('#architecture', .5, { xv: 1, px: 1.65, py: -.04, s: 1.0, rx: .52, ry: 3.95, rz: -.05, ld: .25 }, { px: 0, py: .8, s: .68 }),
  K('#architecture', .78, { xv: 1, px: 1.65, py: -.04, s: 1.0, rx: .5, ry: 3.82, rz: -.035, ld: .25 }, { px: 0, py: .8, s: .68 }),
  // Acte 3 (épinglé) : boîtier entier en haut à gauche, lentille tournée vers la droite (vers l'écran), faisceau rasant sur la grille
  K('#preuve', 0, { pin: true, ax: true, px: -1.86, py: .87, s: .66, rx: .3, ry: 5.48, ld: 1, gd: 1 }, { px: -.08, py: 1.52, s: .36 }),
  K('#preuve', 1, { pin: true, ax: true, px: -1.86, py: .87, s: .66, rx: .3, ry: 5.48, ld: 1, gd: 1 }, { px: -.08, py: 1.52, s: .36 }),
  // Acte 4 : au centre de la moitié haute, manipulable à 360°
  K('#boitier', .5, { px: 0, py: .78, s: .95, rx: .6, ry: 3.3 }, { py: 1.0, s: .66 }),
  // le canvas disparaît avant le dossier B2B : le boîtier ne passe jamais derrière le titre
  K('#boitier', .72, { px: 0, py: .78, s: .95, rx: .6, ry: 3.3, v: 0 }, { py: 1.0, s: .66 }),
];
const PROPS = ['px', 'py', 'pz', 'rx', 'ry', 'rz', 's', 'ex', 'al', 'sc', 'v', 'lf', 'fw', 'bm', 'lz', 'fh', 'ld', 'xv', 'gd'];
let anchors = [];
function computeAnchors(){
  const vh = innerHeight, sy = window.scrollY;
  anchors = KEYS.map(k => {
    const el = $(k.sec); if (!el) return null;
    const top = el.getBoundingClientRect().top + sy, h = el.offsetHeight;
    const o = { ...k, ...(isMobile() ? k.mob : {}), y: k.pin ? top + k.f * (h - vh) : top + k.f * h - vh * .5 };
    // acte 3 sur desktop : la position suit le ratio de l'écran pour que la visière ne soit jamais coupée par le bord gauche
    if (k.ax && !isMobile()){ const a = innerWidth / vh / 1.6; o.px *= clamp(a, .74, 1.2); o.s *= clamp(a, .78, 1.08); }
    return o;
  }).filter(Boolean).sort((a, b) => a.y - b.y);
  computeSlopes();
}
// Spline cubique monotone (Fritsch-Carlson) : vitesse continue d'une clé à l'autre, sans dépassement.
// La caméra ne s'arrête que sur les vrais paliers (deux clés identiques) et aux changements de sens.
function hermite(y0, y1, v0, v1, m0, m1, y){
  const d = y1 - y0 || 1, t = clamp((y - y0) / d, 0, 1), t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * v0 + (t3 - 2 * t2 + t) * d * m0 + (-2 * t3 + 3 * t2) * v1 + (t3 - t2) * d * m1;
}
function slope(x0, x1, x2, v0, v1, v2){
  const h0 = x1 - x0 || 1, h1 = x2 - x1 || 1, d0 = (v1 - v0) / h0, d1 = (v2 - v1) / h1;
  if (d0 * d1 <= 0) return 0;
  const w0 = 2 * h1 + h0, w1 = h1 + 2 * h0;
  return (w0 + w1) / (w0 / d0 + w1 / d1);
}
function computeSlopes(){
  anchors.forEach((a, i) => {
    a.m = {};
    const p0 = anchors[i - 1], p2 = anchors[i + 1];
    PROPS.forEach(p => { a.m[p] = p0 && p2 ? slope(p0.y, a.y, p2.y, p0[p], a[p], p2[p]) : 0; });
  });
}
function targetAt(y, out){
  const A = anchors, n = A.length;
  if (!n) return;
  if (y <= A[0].y) { PROPS.forEach(p => out[p] = A[0][p]); return; }
  if (y >= A[n - 1].y) { PROPS.forEach(p => out[p] = A[n - 1][p]); return; }
  let i = 0; while (i < n - 2 && y > A[i + 1].y) i++;
  const a = A[i], b = A[i + 1];
  PROPS.forEach(p => out[p] = hermite(a.y, b.y, a[p], b[p], a.m[p], b.m[p], y));
}

const st = { ...BASE, s: .3, v: 0, ry: -2.4, rx: .9 };
const tg = { ...BASE };
let mx = 0, my = 0, smx = 0, smy = 0;
addEventListener('pointermove', e => { mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5; }, { passive: true });

const _v = new THREE.Vector3(), _lw = new THREE.Vector3(), _ld = new THREE.Vector3();

let hlPart = null;
const HL_PARTS = ['body12167', 'body55189', 'body31097'];
const setHL = (part, el) => { hlPart = part; $$('[data-part].hl').forEach(x => x.classList.remove('hl')); if (part) $$(`.pin[data-part="${part}"], .pill[data-part="${part}"]`).forEach(x => x.classList.add('hl')); };
$$('.pill[data-part], .pin .pt').forEach(el => {
  const part = el.dataset.part || el.parentElement.dataset.part;
  ['pointerenter', 'focus'].forEach(ev => el.addEventListener(ev, () => setHL(part)));
  ['pointerleave', 'blur'].forEach(ev => el.addEventListener(ev, () => setHL(null)));
});

// annotations de l'acte 2 : libellés en colonne à gauche du boîtier, ordre strict haut → bas, écart vertical garanti,
// reliés à leur pièce par une ligne brisée de 1 px terminée par un point lumineux
const MIN_GAP = 54;
const pinSvg = $('#pinSvg'), SVGNS = 'http://www.w3.org/2000/svg';
const pinEls = $$('.pin').map(el => {
  const pt = (el.dataset.pt || '').split(',').map(Number);
  const g = document.createElementNS(SVGNS, 'g'), line = document.createElementNS(SVGNS, 'polyline'),
    halo = document.createElementNS(SVGNS, 'circle'), dot = document.createElementNS(SVGNS, 'circle');
  halo.setAttribute('r', '6'); halo.setAttribute('class', 'ph'); dot.setAttribute('r', '3'); dot.setAttribute('class', 'pd');
  g.append(line, halo, dot); g.style.opacity = 0; pinSvg.appendChild(g);
  return { el, g, line, halo, dot, part: el.dataset.part, pt: pt.length === 3 ? new THREE.Vector3(...pt) : null, edge: el.dataset.edge === 'left', samples: null, x: 0, y: 0 };
});
function project(v, m){
  _v.copy(v); m.localToWorld(_v); _v.project(camera);
  return [(_v.x * .5 + .5) * innerWidth, (-_v.y * .5 + .5) * innerHeight];
}
function hidePins(){
  pinEls.forEach(p => { if (p.on){ p.el.style.opacity = 0; p.g.style.opacity = 0; p.el.classList.remove('live'); p.on = false; } });
}
function updatePins(vis){
  const show = !isMobile() && innerWidth >= 1100 && vis > .01;
  const k = show ? clamp((st.xv - .6) / .4, 0, 1) * vis : 0;
  if (k < .01 || pinEls.some(p => !parts[p.part])){ hidePins(); return; }
  pinEls.forEach(p => {
    const m = parts[p.part];
    if (p.edge){
      // ancre sur la silhouette réelle : le sommet de la pièce le plus à gauche à l'écran (échantillon de ~300 sommets)
      if (!p.samples){
        const pos = m.geometry.attributes.position, step = Math.max(1, Math.floor(pos.count / 300));
        p.samples = []; for (let i = 0; i < pos.count; i += step) p.samples.push(new THREE.Vector3().fromBufferAttribute(pos, i));
      }
      let best = 1e9;
      p.samples.forEach(v => { const [x, y] = project(v, m); if (x < best){ best = x; p.x = x; p.y = y; } });
    } else [p.x, p.y] = project(p.pt || m.userData.c, m);
  });
  // colonne des libellés (bord droit), et positions verticales : ordre du HTML conservé, écart minimal garanti
  const col = Math.max(innerWidth * .555, innerWidth * .38 + 240);
  const ys = pinEls.map(p => p.y);
  for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + MIN_GAP);
  const overflow = ys[ys.length - 1] - (innerHeight - 48);
  if (overflow > 0) for (let i = 0; i < ys.length; i++) ys[i] -= overflow;
  ys[0] = Math.max(ys[0], 96);
  for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + MIN_GAP);
  pinEls.forEach((p, i) => {
    p.on = true;
    const ly = ys[i], elbow = Math.max(col + 10, Math.min(col + 28, p.x - 14));
    p.el.style.transform = `translate3d(${col.toFixed(1)}px,${ly.toFixed(1)}px,0)`;
    p.line.setAttribute('points', `${(col + 3).toFixed(1)},${ly.toFixed(1)} ${elbow.toFixed(1)},${ly.toFixed(1)} ${p.x.toFixed(1)},${p.y.toFixed(1)}`);
    [p.dot, p.halo].forEach(c => { c.setAttribute('cx', p.x.toFixed(1)); c.setAttribute('cy', p.y.toFixed(1)); });
    p.el.style.opacity = p.g.style.opacity = k.toFixed(2);
    p.el.classList.toggle('live', k > .6);
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

let roll = 0, lastY = 0, locked = false;
const smooth = t => t * t * (3 - 2 * t);
// cycle de détection (6,4 s) : flux calme, puis bref passage à l'ambre quand un oubli d'EPI est signalé
function detection(){
  const c = time % 6.4;
  return { c, lock: smooth(clamp((c - 3.6) / .6, 0, 1)) * (1 - smooth(clamp((c - 5.4) / .7, 0, 1))) };
}
// arc optique fin entre la lentille et le bord gauche du Studio Display, dessiné en 2D (géométrie de l'écran mise en cache)
const linkCv = $('#a3Link'), linkCtx = linkCv.getContext('2d'), packet = $('#packet');
let linkOn = false;
function clearLink(){
  if (!linkOn) return;
  linkOn = false; linkCtx.clearRect(0, 0, linkCv.width, linkCv.height); packet.style.opacity = 0;
}
// Reproduit la transformation CSS du poste : perspective(1700px) scale() rotateY() rotateX(), origine au milieu du bord droit.
// (lx, ly) : point en coordonnées de mise en page du poste ; renvoie sa position réelle à l'écran, sans lecture de layout par frame.
function windowPoint(lx, ly){
  const g = M.st, sc = 1.15 - .15 * pullQ, rad = Math.PI / 180;
  const a = reduced ? 0 : (-8 + 4 * pullQ) * rad, b = reduced ? 0 : 1.5 * pullQ * rad, k = reduced ? 1 : sc;
  const x = lx - g.w, y = ly - g.h / 2;
  const y1 = y * Math.cos(b), z1 = y * Math.sin(b);                          // rotateX
  const x2 = x * Math.cos(a) + z1 * Math.sin(a), z2 = -x * Math.sin(a) + z1 * Math.cos(a);   // rotateY
  const f = reduced ? 1 : 1700 / (1700 - z2);                                // scale puis perspective
  return [g.l + g.w + x2 * k * f, g.t - .02 * g.h + y1 * k * f];             // -.02 h : translate(0,-52 %) du poste
}
// boîte englobante à l'écran du boîtier, pour que la pilule ne passe jamais sur la visière
const _c = new THREE.Vector3();
function deviceBottom(shift){
  let bottom = 0;
  for (let i = 0; i < 8; i++){
    _c.set((i & 1 ? 1 : -1) * NORM / 2, (i & 2 ? 1 : -1) * .023, (i & 4 ? 1 : -1) * .04).applyMatrix4(rig.matrixWorld).project(camera);
    bottom = Math.max(bottom, (-_c.y * .5 + .5) * innerHeight - shift);
  }
  return bottom;
}

function drawLink(y){
  const { c, lock } = detection();
  const isLock = st.gd > .85 && c > 5.15 && c < 5.9;   // la notification arrive quand l'impulsion atteint l'écran
  if (isLock && !locked && proof) proof.pulse();
  locked = isLock;
  if (isMobile() || st.gd < .05 || !M.st || activeSec !== 3){ clearLink(); return; }   // jamais d'arc sans fenêtre visible
  linkOn = true;
  const top3 = M.secTops[3], shift = y < top3 ? top3 - y : Math.min(0, top3 + M.a3Len - y);   // décalage de la section épinglée
  _v.set(...BEAM.pos).applyMatrix4(rig.matrixWorld).project(camera);
  const x0 = (_v.x * .5 + .5) * innerWidth, y0 = (-_v.y * .5 + .5) * innerHeight - shift;
  const g = M.st;
  const [x2, y2] = windowPoint(g.wl, g.wt + g.wh * .5);      // bord gauche exact de .glass-win, transformation 3D comprise
  const x1 = x0 + (x2 - x0) * .5, y1 = Math.min(y0, y2) - 62;
  const at = t => { const u = 1 - t; return [u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2]; };
  const ctx = linkCtx, dpr = Math.min(devicePixelRatio || 1, 2);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, innerWidth, innerHeight);
  const a = st.gd * Math.min(1, st.v);
  // double trait fin, dégradé cyan → ambre, avec une lueur large et discrète
  const grad = ctx.createLinearGradient(x0, y0, x2, y2);
  grad.addColorStop(0, '#30B0C7'); grad.addColorStop(.55, '#30B0C7'); grad.addColorStop(1, '#FF5A00');
  ctx.lineCap = 'round'; ctx.strokeStyle = grad;
  const arc = off => { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x1, y1 + off * 2, x2, y2); ctx.stroke(); };
  ctx.globalAlpha = a * .16; ctx.lineWidth = 9; arc(0);
  ctx.globalAlpha = a * .95; ctx.lineWidth = 1.6; arc(-3);
  ctx.globalAlpha = a * .6; ctx.lineWidth = 1; arc(3);
  // un point lumineux glisse du boîtier vers l'écran (toutes les 3,2 s ; il arrive à c = 5,2 s, avec la notification)
  const q = ((c - 2 + 6.4) % 3.2) / 3.2, e = smooth(q);
  for (let k = 14; k >= 0; k--){
    const tt = e - k * .011; if (tt < 0) continue;
    const [px, py] = at(tt);
    ctx.globalAlpha = a * (1 - k / 15) * (k ? .5 : 1) * Math.min(1, q * 8, (1 - q) * 12);
    ctx.fillStyle = k ? (tt > .6 ? '#FF5A00' : '#30B0C7') : '#fff';
    ctx.shadowColor = tt > .6 ? '#FF5A00' : '#30B0C7'; ctx.shadowBlur = k ? 0 : 16;
    ctx.beginPath(); ctx.arc(px, py, k ? 2.3 - k * .12 : 3.4, 0, 6.2832); ctx.fill();
  }
  ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  // prises lumineuses aux deux extrémités : l'arc part de l'optique et se branche sur le bord de la fenêtre
  [[x0, y0, '#30B0C7'], [x2, y2, '#FF5A00']].forEach(([ex, ey, col]) => {
    ctx.globalAlpha = a * .3; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(ex, ey, 7, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(ex, ey, 2.8, 0, 6.2832); ctx.fill();
  });
  ctx.globalAlpha = 1;
  // pilule SOUS l'arc : sous le point le plus bas de la courbe sur sa largeur, sous le boîtier, au-dessus du titre, hors de la fenêtre
  const [mxp] = at(.5);
  const px = Math.max(12, Math.min(mxp - g.pw / 2, x2 - g.pw - 18));
  let under = deviceBottom(shift) + 16;
  for (let n = 0; n <= 24; n++){ const [qx, qy] = at(n / 24); if (qx >= px - 8 && qx <= px + g.pw + 8) under = Math.max(under, qy + 18); }
  const py = Math.min(under, g.titleTop - g.ph - 14);
  packet.style.transform = `translate3d(${px.toFixed(1)}px,${py.toFixed(1)}px,0)`;
  packet.style.opacity = a.toFixed(2);
  packet.classList.toggle('amber', lock > .5);
}

function renderGL(dt, y){
  stepAnims(dt);
  targetAt(y, tg);
  tg.ex = Math.max(tg.ex, userEx * stageW);
  const k = SNAP ? 1 : 1 - Math.exp(-dt * (ready ? 5.2 : 2.4));
  PROPS.forEach(p => st[p] += (tg[p] - st[p]) * k);
  if (DBG){ const [a, b, c, d, e, f = 0, g = 0, h = 0, i = 0] = DBG; Object.assign(st, { px: a, py: b, rx: c, ry: d, s: e, lf: f, fw: g, bm: h, al: i, v: 1, ex: 0 }); }

  const mob = isMobile();
  const pk = 1 - Math.exp(-dt * 3.8);   // ≈ lerp 0,06 par frame à 60 FPS
  smx += ((dragging ? 0 : mx) - smx) * pk; smy += ((dragging ? 0 : my) - smy) * pk;
  const px = st.px, py = st.py, s = st.s;
  const vis = ready ? Math.min(st.v, tg.v) : 0;   // la disparition suit le scroll sans retard (avant le dossier B2B)
  const speed = (y - lastY) / Math.max(dt, .008) / innerHeight; lastY = y;
  const rollT = SNAP || reduced ? 0 : clamp(speed / 2.4, -1, 1) * .11;
  roll += (rollT - roll) * (1 - Math.exp(-dt * 4.2));
  canvas.style.opacity = vis.toFixed(3);
  if (vis < .01 || !glOK){ updatePins(0); clearLink(); return; }

  const bx = px, by = py + Math.sin(time * 1.1) * .004 * S0 * s;   // respiration ±0,004 m
  rig.position.set(bx, by, st.pz);
  if (!dragging && !rstAnim){ yawV *= .94; yawO += yawV; if (stageW < .05){ const tgt = Math.round(yawO / TAU) * TAU; yawO += (tgt - yawO) * .08; pitO += (0 - pitO) * .08; } }
  rig.rotation.set(st.rx + pitO + smy * .12, st.ry + yawO + Math.sin(time * .45) * .1 + smx * .28, st.rz);
  rig.scale.setScalar(S0 * s);

  const ex = st.ex, lf = st.lf;
  for (const n in parts){ const m = parts[n]; m.position.copy(m.userData.ex).multiplyScalar(ex); m.rotation.x = 0; if (st.xv > .001) m.position.y += st.xv * ((XV[n] ?? .025) + Math.sin(time * 1.05 + (n === 'body12167' ? 0 : n === 'body31097' ? 4.2 : 2.1)) * .0022); }
  HL_PARTS.forEach(n => {   // pièce mise en valeur par le survol d'une annotation ou d'une pilule
    const m = parts[n]; if (!m) return;
    m.userData.hl = (m.userData.hl || 0) + (((hlPart === n && st.xv > .3) ? 1 : 0) - (m.userData.hl || 0)) * (1 - Math.exp(-dt * 9));
    m.material.emissive.setHex(0x2f7ddb); m.material.emissiveIntensity = m.userData.hl * (.34 + .12 * Math.sin(time * 6));
  });
  const shell = parts.body12167;                      // vue éclatée de la coque seule : montée verticale (+Y) avec léger tilt
  if (shell){ shell.position.y += lf * .1; shell.rotation.x = -lf * .2; }
  if (parts.body31097) parts.body31097.position.y -= lf * .03;   // le châssis descend un peu : les annotations ne se chevauchent plus
  const led = parts.body67406;
  const alarm = st.gd * detection().lock;
  const pulse = .82 + .18 * Math.sin(time * (alarm > .5 ? 14 : 2.4));
  const ledK = clamp(st.ld * .85 + alarm * .4, 0, 1) * pulse;
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
    pa.needsUpdate = true; beamPts.material.opacity = .3 * st.bm;
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
  ledLight.intensity = ledK * (.5 + alarm * 1.8) * (isMobile() ? .5 : 1);
  softLight.intensity = 7 * st.gd;
  if (st.gd > .02){ _lw.set(...BEAM.pos).applyMatrix4(rig.matrixWorld); const k = clamp(s / .7, .45, 1.2); softLight.position.set(_lw.x - 1.1 * k, _lw.y + 1.2 * k, _lw.z + 1.6); }
  backGlow.visible = st.xv > .02; backGlow.material.opacity = clamp(st.xv, 0, 1);
  backGlow.position.set(rig.position.x, rig.position.y, rig.position.z - 1.4); backGlow.scale.set(5.6 * s, 3.9 * s, 1);
  camera.lookAt(0, 0, 0);
  camera.rotateZ(roll);
  if (mixPass) mixPass.uniforms.uAb.value = Math.max(0, Math.abs(roll) / .11 - .55) * .016;
  scene.updateMatrixWorld(true);
  if (composer && useBloom) renderBloom(); else renderer.render(scene, camera);
  updatePins(vis);
  drawLink(y);
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
const depthEls = $$('#depth span'), station = $('#station'), a3Fade = $('#a3Fade');
let pullQ = 0, pullPrev = -1, fadePrev = -1, inA4 = false;

// Mesures de layout mises en cache : recalculées au resize / changement de langue, jamais par frame.
const M = { secTops: [], stageC: 0, doc: 1, a3Len: 1 };
function measure(){
  const sy = window.scrollY, abs = el => el.getBoundingClientRect().top + sy;
  M.secTops = sections.map(s => s ? abs(s) : Infinity);
  const sr = stageEl.getBoundingClientRect(); M.stageC = sr.top + sy + sr.height / 2;
  M.doc = document.documentElement.scrollHeight - innerHeight;
  M.a3Len = Math.max(1, sections[3].offsetHeight - innerHeight);
  const win = $('.glass-win', station), pk = $('#packet');
  M.st = { l: station.offsetLeft, t: station.offsetTop, w: station.offsetWidth, h: station.offsetHeight,
    wl: win.offsetLeft, wt: win.offsetTop, wh: win.offsetHeight, pw: pk.offsetWidth || 250, ph: pk.offsetHeight || 34, titleTop: $('#preuve .act-t').offsetTop };
  const cv = $('#a3Link'), dpr = Math.min(devicePixelRatio || 1, 2), W = Math.round(innerWidth * dpr), H = Math.round(innerHeight * dpr);
  if (cv.width !== W || cv.height !== H){ cv.width = W; cv.height = H; }
  pullPrev = -1;
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
  const on4 = y > M.secTops[4] - vh * .4 && y < M.secTops[4] + vh * .16;
  if (on4 !== inA4 || !stageEl.dataset.ready){
    inA4 = on4; stageEl.dataset.ready = '1'; stageEl.classList.toggle('out', !on4);
    if (!on4){   // le défilement seul ne déclenche pas pointermove : on réinitialise le curseur ici
      const c = $('#cur'); if (c.classList.contains('deg')){ c.classList.remove('on', 'deg'); $('#curT').textContent = ''; }
      dragging = false;
    }
  }
  // mots géants derrière le boîtier : parallaxe horizontale
  depthEls.forEach(el => {
    const i = +el.dataset.a, on = i === a && a !== 3;
    el.classList.toggle('on', on);
    if (on){ const f = clamp((y - M.secTops[i]) / (i === 3 ? M.a3Len : vh), -.6, 1.2); el.style.setProperty('--dx', ((.3 - f) * innerWidth * .22).toFixed(1) + 'px'); }
  });
  // acte 3 : l'écran démarre en gros plan, puis la caméra recule et révèle le poste de travail
  const top3 = M.secTops[3], q = smooth(clamp((y - top3) / (M.a3Len * .62), 0, 1));
  pullQ = q;
  if (Math.abs(q - pullPrev) > .001){
    pullPrev = q;
    const mob = isMobile(), sc = mob ? 1.06 - .06 * q : 1.15 - .15 * q;
    station.style.transform = reduced ? 'none' : `perspective(1700px) scale(${sc.toFixed(4)}) rotateY(${mob ? 0 : (-8 + 4 * q).toFixed(2)}deg) rotateX(${mob ? 0 : (1.5 * q).toFixed(2)}deg)`;
  }
  // le titre et l'écran s'effacent dès que la section quitte l'écran : le boîtier ne traverse jamais le texte
  const fade = 1 - clamp((y - top3 - M.a3Len) / (vh * .26), 0, 1);
  if (Math.abs(fade - fadePrev) > .01){ fadePrev = fade; a3Fade.style.opacity = fade.toFixed(2); a3Fade.style.visibility = fade < .02 ? 'hidden' : ''; }
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
      if (el.classList.contains('bc') && !el.classList.contains('b-ct') && el.classList.contains('in')){   // tilt 3D ±2,4°
        const nx = (e.clientX - r.left) / r.width - .5, ny = (e.clientY - r.top) / r.height - .5;
        el.classList.add('tilting');
        el.style.transform = `perspective(1100px) rotateX(${(-ny * 4.8).toFixed(2)}deg) rotateY(${(nx * 4.8).toFixed(2)}deg)`;
      }
    }, { passive: true });
    el.addEventListener('pointerleave', () => { el.classList.remove('tilting'); el.style.transform = ''; });
  });
  // attraction magnétique des pilules principales
  $$('.btn, .pill-w, .cine').forEach(el => {
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      el.style.translate = `${((e.clientX - r.left - r.width / 2) * .16).toFixed(1)}px ${((e.clientY - r.top - r.height / 2) * .24).toFixed(1)}px`;
    }, { passive: true });
    el.addEventListener('pointerleave', () => { el.style.translate = ''; });
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

/* ============================ tableau de bord du chef de prévention ============================ */
proof = initProof({ root: $('#station'), getLang });
onLang(() => proof.refresh());

/* ============================ mode Cinéma : parcours automatique ~18 s, Hero → Acte 4 ============================ */
let cineTick = null;
{
  const btn = $('#cine');
  let run = null;
  const go = y => { if (lenis) lenis.scrollTo(y, { immediate: true, force: true }); else window.scrollTo(0, y); };
  const stop = () => { run = null; btn.classList.remove('on'); };
  btn.addEventListener('click', () => {
    if (run) return stop();
    document.body.classList.remove('menu'); lenis && lenis.start();
    measure(); computeAnchors();
    const T = M.secTops, vh = innerHeight, d = vh * .07;
    // [temps (s), position] : autour de chaque acte le défilement ralentit sans jamais s'arrêter
    const k = [[0, 0], [1, d], [3.6, T[1] - d], [5, T[1] + d], [7.2, T[2] - d], [8.8, T[2] + d],
      [11, T[3] + M.a3Len * .3], [14.2, T[3] + M.a3Len * .74], [15.4, T[3] + M.a3Len * .9], [18, T[4]]];
    const m = k.map((p, i) => i && i < k.length - 1 ? slope(k[i - 1][0], p[0], k[i + 1][0], k[i - 1][1], p[1], k[i + 1][1]) : 0);
    run = { t: 0, k, m };
    btn.classList.add('on'); go(0);
  });
  ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach(ev => addEventListener(ev, e => {
    if (run && !(e.target.closest && e.target.closest('#cine'))) stop();
  }, { passive: true, capture: true }));
  cineTick = dt => {
    if (!run) return;
    run.t += dt;
    const { k, m } = run, end = k[k.length - 1];
    if (run.t >= end[0]){ go(end[1]); return stop(); }
    let i = 0; while (i < k.length - 2 && run.t > k[i + 1][0]) i++;
    go(hermite(k[i][0], k[i + 1][0], k[i][1], k[i + 1][1], m[i], m[i + 1], run.t));
  };
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
    let label = !inp && dc ? dc.dataset.cursor : '';
    if (label === '↔ 360°' && !inA4) label = '';
    lab.textContent = label ? (getLang() === 'en' && EN[label] ? EN[label] : label) : '';
    cur.classList.toggle('on', !!label);
    cur.classList.toggle('deg', label === '↔ 360°');
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
  cineTick && cineTick(dt);
  lenis && lenis.raf(now);
  const y = scrollY_();
  updateUI(y);
  if (document.hidden === false){
    if (PERF){ const t0 = performance.now(); renderGL(dt, y); PERF.t += performance.now() - t0; PERF.n++; window.__perf = PERF; window.__aegis = { renderer, camera, rig, parts, st }; }
    else renderGL(dt, y);
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
