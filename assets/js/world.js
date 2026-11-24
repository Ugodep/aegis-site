// Monde 3D partagé : chantier industriel, ouvriers mannequins, boîtier AEGIS fixé en hauteur (avec son cône de vision),
// écran interne du boîtier (acte 2) et bureau vitré du conseiller QSE (acte 3).
// Utilisé par main.js (récit au scroll dans #solution) ET ppe3d.js (démo interactive de #preuve).
// Les textures, géométries et matériaux sont mis en cache au niveau du module : jamais dupliqués d'un monde à l'autre.
// Le modèle du boîtier (boitier.glb) est fourni déjà chargé : aucun téléchargement ici.
import { drawEdge, drawQSE } from './screens.js?v=18';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * (3 - 2 * t);

export const HIDE = ['body69062', 'body935', 'body27961'];       // splitter PoE hors position, optique, plaque
export const BOX_POS = [-2.7, 2.7, -2.75];                       // position du boîtier au mur
export const LED_LOCAL = [-0.0687, -0.0097, -0.0381];            // body67406 (repère du GLB, en mètres)
export const SCREEN = { pos: [0.050, -0.003, -0.040], w: 0.064, h: 0.040 };   // panneau interne 64 × 40 mm

// Scénario de l'ouvrier : 0 marche → 1 retire le casque → 2 sans casque (alerte) → 3 le remet → 4 repart
export const PHASES = [3.8, 1.0, 4.2, 1.1, 4.1];                 // durées (s) pour la démo en boucle de #preuve
export const STORY_EDGES = [0, .12, .24, .58, .68, 1];           // bornes des phases en progression de scroll (récit)
export const STORY = { alertOn: .54, alertOff: .64, beacon: [.10, .62] };   // détection à l'écran dès .50, signal local dès .54

const X0 = -5.5, XC = -.2, X1 = 5.6;
const _pose = { x: 0, face: false, h: 0, status: 'ok', walking: true, phase: 0 };
export function heroPose(phase, f){
  const p = _pose; p.phase = phase;
  p.x = phase === 0 ? lerp(X0, XC, f) : phase < 4 ? XC : lerp(XC, X1, f);
  p.walking = phase === 0 || phase === 4;
  p.face = phase >= 1 && phase <= 3;
  p.h = phase === 1 ? ease(f) : phase === 2 ? 1 : phase === 3 ? 1 - ease(f) : 0;
  const missing = p.h > .55 && p.face;
  p.status = missing ? 'missing' : ((phase === 4 && f * PHASES[4] < 1.6) || (phase === 3 && p.h < .55)) ? 'fixed' : 'ok';
  return p;
}
// démo en boucle : temps (s) → pose ;  récit : progression u (0..1) → pose
export function poseAtTime(c){
  let acc = 0; for (let i = 0; i < 5; i++){ if (c < acc + PHASES[i] || i === 4) return heroPose(i, clamp((c - acc) / PHASES[i], 0, 1)); acc += PHASES[i]; }
}
export function poseAtStory(u){
  let i = 0; while (i < 4 && u >= STORY_EDGES[i + 1]) i++;
  return heroPose(i, clamp((u - STORY_EDGES[i]) / (STORY_EDGES[i + 1] - STORY_EDGES[i]), 0, 1));
}

/* ---------------------------------------------------------------- cache partagé */
let S = null;
function shared(THREE){
  if (S) return S;
  const canvasTex = (w, h, draw, repeat) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (repeat){ t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
    return t;
  };
  const hazardDraw = (x, w, h) => {
    x.fillStyle = '#ff5a00'; x.fillRect(0, 0, w, h); x.fillStyle = '#0c0d0f';
    for (let i = -2; i < 6; i++){ x.beginPath(); x.moveTo(i * 16, h); x.lineTo(i * 16 + 8, h); x.lineTo(i * 16 + 24, 0); x.lineTo(i * 16 + 16, 0); x.fill(); }
  };
  const radial = (stops) => canvasTex(128, 128, (x, w, h) => {
    const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); stops.forEach(s => g.addColorStop(s[0], s[1])); x.fillStyle = g; x.fillRect(0, 0, w, h);
  });
  const mats = new Map(), geos = new Map();
  S = {
    tex: {
      concrete: canvasTex(512, 512, (x, w, h) => {
        x.fillStyle = '#26282c'; x.fillRect(0, 0, w, h);
        for (let i = 0; i < 5000; i++){ const v = 28 + Math.random() * 30 | 0; x.fillStyle = `rgb(${v},${v + 1},${v + 3})`; x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3); }
        x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 2; x.strokeRect(0, 0, w, h);
      }, [14, 8]),
      hazard: canvasTex(64, 16, hazardDraw, [40, 1]),
      hazardM: canvasTex(64, 16, hazardDraw, [7, 1]),
      zone: canvasTex(512, 160, (x, w, h) => {
        x.clearRect(0, 0, w, h); x.font = '800 96px Archivo, Arial Black, sans-serif'; x.fillStyle = '#ffb400'; x.textBaseline = 'middle'; x.fillText('ZONE B', 14, h / 2 + 4);
      }),
      blob: radial([[0, 'rgba(0,0,0,.55)'], [1, 'rgba(0,0,0,0)']]),
      glow: radial([[0, 'rgba(255,170,60,.9)'], [.25, 'rgba(255,120,20,.35)'], [1, 'rgba(255,90,0,0)']])
    },
    M(c, r = .85, m = 0){ const k = c + '/' + r + '/' + m; if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, envMapIntensity: .4 })); return mats.get(k); },
    G(k, fn){ if (!geos.has(k)) geos.set(k, fn()); return geos.get(k); }
  };
  return S;
}

/* ---------------------------------------------------------------- ouvrier mannequin */
function makeWorker(THREE, o){
  const { M, G } = shared(THREE);
  const g = new THREE.Group();
  const skin = M(0x70757d, .8), pants = M(0x262c3a), shirt = M(o.shirt || 0x39424f), vest = M(o.vest, .65), stripe = M(0xe3e9f0, .35), boots = M(0x0f1012, .7);
  const put = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  const legs = [-1, 1].map(s => {
    const p = new THREE.Group(); p.position.set(s * .1, .92, 0);
    put(G('leg', () => new THREE.CapsuleGeometry(.072, .66, 4, 10)), pants, 0, -.4, 0, p);
    put(G('boot', () => new THREE.BoxGeometry(.13, .08, .27)), boots, 0, -.86, .06, p);
    g.add(p); return p;
  });
  put(G('torso', () => new THREE.CapsuleGeometry(.185, .3, 4, 14)), shirt, 0, 1.2, 0).scale.set(1.05, 1, .72);
  put(G('vest', () => new THREE.BoxGeometry(.4, .5, .25)), vest, 0, 1.22, 0);
  put(G('str', () => new THREE.BoxGeometry(.408, .05, .258)), stripe, 0, 1.08, 0);
  put(G('str', () => new THREE.BoxGeometry(.408, .05, .258)), stripe, 0, 1.3, 0);
  const arms = [-1, 1].map(s => {
    const p = new THREE.Group(); p.position.set(s * .26, 1.42, 0);
    put(G('arm', () => new THREE.CapsuleGeometry(.058, .46, 4, 10)), shirt, 0, -.3, 0, p);
    put(G('hand', () => new THREE.SphereGeometry(.062, 12, 10)), skin, 0, -.63, 0, p);
    g.add(p); return p;
  });
  put(G('neck', () => new THREE.CylinderGeometry(.05, .055, .08, 10)), skin, 0, 1.5, 0);
  const head = put(G('head', () => new THREE.SphereGeometry(.118, 20, 16)), skin, 0, 1.62, 0);
  const helmet = new THREE.Group();
  const hm = M(o.helmet, .35, .05);
  put(G('hdome', () => new THREE.SphereGeometry(.14, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2)), hm, 0, 0, 0, helmet);
  put(G('hbrim', () => new THREE.CylinderGeometry(.158, .158, .022, 24)), hm, 0, 0, 0, helmet).position.z = .01;
  put(G('hridge', () => new THREE.BoxGeometry(.05, .02, .24)), hm, 0, .14, 0, helmet);
  helmet.position.set(0, 1.665, 0); g.add(helmet);
  // ombre portée « blob » (pas de shadow map dans le récit : plus léger)
  const blob = new THREE.Mesh(G('blob', () => new THREE.PlaneGeometry(1.1, 1.1)), new THREE.MeshBasicMaterial({ map: shared(THREE).tex.blob, transparent: true, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = .015; g.add(blob);
  return { g, legs, arms, head, helmet, speed: o.speed, dir: o.dir, z: o.z, x: o.x, ph: Math.random() * 6, h: 0, walking: true, id: o.id, isHero: !!o.hero };
}

/* ---------------------------------------------------------------- le monde */
// opts : { model (clone du GLB déjà chargé), getLang, withOffice }
export function createWorld(THREE, opts){
  const { model, getLang = () => 'fr' } = opts;
  const { M, G, tex } = shared(THREE);
  const group = new THREE.Group(); group.name = 'world';
  const add = o => { group.add(o); return o; };
  const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(G(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), mat); m.position.set(x, y, z); return add(m); };

  // sol + marquages
  const ground = new THREE.Mesh(G('ground', () => new THREE.PlaneGeometry(44, 26)), new THREE.MeshStandardMaterial({ map: tex.concrete, roughness: .92, envMapIntensity: .2 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; add(ground);
  const flat = (w, d, x, z, mat) => { const m = new THREE.Mesh(G(`f${w},${d}`, () => new THREE.PlaneGeometry(w, d)), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, .012, z); add(m); return m; };
  const yellow = new THREE.MeshBasicMaterial({ color: 0xffb400 });
  flat(44, .13, 0, -2.3, yellow); flat(44, .13, 0, 2.55, yellow);
  const dash = new THREE.MeshBasicMaterial({ color: 0xcfcfc8, transparent: true, opacity: .35 });
  for (let i = -9; i < 9; i++) flat(.9, .1, i * 1.6 + .4, .1, dash);
  flat(4.6, 2.5, 0, .35, new THREE.MeshBasicMaterial({ color: 0xff3b2e, transparent: true, opacity: .09, depthWrite: false }));
  flat(2.8, .88, -3.9, 1.75, new THREE.MeshBasicMaterial({ map: tex.zone, transparent: true, opacity: .8, depthWrite: false }));

  // mur, bandeau de danger, tuyau, colonnes, bidons
  const wall = box(34, 5.2, .3, M(0x24272c, .95), 0, 2.6, -3.5); wall.receiveShadow = true;
  const band = new THREE.Mesh(G('band', () => new THREE.PlaneGeometry(34, .34)), new THREE.MeshBasicMaterial({ map: tex.hazard })); band.position.set(0, .2, -3.34); add(band);
  const pipe = new THREE.Mesh(G('pipe', () => new THREE.CylinderGeometry(.13, .13, 34, 16)), M(0x6e747d, .4, .7)); pipe.rotation.z = Math.PI / 2; pipe.position.set(0, 4.15, -3.22); pipe.castShadow = true; add(pipe);
  [-6, 0, 6].forEach(x => box(.08, .3, .2, M(0x3a3d43), x, 4.15, -3.25));
  [-2.5, 2.9, 7.5, -8].forEach(x => { box(.28, 5.2, .28, M(0x3b3e45, .6, .4), x, 2.6, -3.2).castShadow = true; box(.3, .5, .3, yellow, x, .75, -3.2); });
  for (let i = 0; i < 3; i++){ const b = new THREE.Mesh(G('barrel', () => new THREE.CylinderGeometry(.3, .3, .95, 20)), M(i === 1 ? 0xc8c8c0 : 0xff5a00, .45, .3)); b.position.set(-6.9 + i * .72, .48, -2.5 + (i % 2) * .5); b.castShadow = true; add(b); }

  // conteneur bleu + bureau vitré du conseiller QSE posé dessus
  const cont = box(2.6, 2.5, 2.4, M(0x1d4a73, .6, .2), 6.6, 1.25, -2); cont.castShadow = cont.receiveShadow = true;
  for (let i = 0; i < 7; i++) box(.04, 2.3, .06, M(0x17374f), 5.5 + i * .32, 1.25, -.78);
  const office = new THREE.Group(); office.position.set(6.6, 2.5, -2); add(office);
  const ow = M(0x8e959d, .8, .1), od = M(0x2a3038, .6, .3);
  const oBox = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(G(`o${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), mat); m.position.set(x, y, z); office.add(m); return m; };
  oBox(2.7, .06, 2.5, od, 0, 1.53, 0);                      // toit
  oBox(.06, 1.5, 2.4, ow, -1.32, .75, 0);                   // mur gauche
  oBox(.06, 1.5, 2.4, ow, 1.32, .75, 0);                    // mur droit
  oBox(2.6, 1.5, .06, ow, 0, .75, -1.2);                    // mur du fond
  oBox(2.6, .5, .06, od, 0, .25, 1.2);                      // allège
  oBox(2.6, .08, .06, od, 0, 1.46, 1.2);                    // linteau
  const glass = new THREE.Mesh(G('glass', () => new THREE.PlaneGeometry(2.6, .94)), new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: .07, depthWrite: false, side: THREE.DoubleSide }));
  glass.position.set(0, .97, 1.2); glass.renderOrder = 5; office.add(glass);
  oBox(1.5, .06, .7, M(0x8a6a44, .6), 0, .72, -.65);        // bureau
  oBox(.06, .72, .06, od, -.65, .36, -.4); oBox(.06, .72, .06, od, .65, .36, -.4); oBox(.06, .72, .06, od, -.65, .36, -.9); oBox(.06, .72, .06, od, .65, .36, -.9);
  oBox(.34, .24, .34, od, 0, .3, .15); oBox(.4, .05, .4, M(0x1a1d22, .5), 0, .46, .15); oBox(.4, .4, .06, M(0x1a1d22, .5), 0, .68, .33);   // chaise
  oBox(.12, .06, .06, od, 0, .78, -.78);                    // pied d'écran
  oBox(1.0, .66, .04, M(0x0d0f12, .4, .6), 0, 1.12, -.9);   // moniteur (cadre)
  const qse = makeScreen(THREE, 1280, 800, 2);
  const qseMesh = new THREE.Mesh(G('qse', () => new THREE.PlaneGeometry(.94, .588)), new THREE.MeshBasicMaterial({ map: qse.tex, toneMapped: false }));
  qseMesh.position.set(0, 1.12, -.876); office.add(qseMesh);
  qse.draw = (s) => drawQSE(qse.g, 640, 400, s);
  qse.draw({ u: 0, T: 0, lang: getLang() }); qse.tex.needsUpdate = true;

  // machine à risque + gyrophare
  const machine = new THREE.Group(); machine.position.set(2.1, 0, -1.5); add(machine);
  const mm = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(G(`m${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), mat); m.position.set(x, y, z); m.castShadow = true; machine.add(m); return m; };
  mm(1.9, 1.5, 1.2, M(0x2a3039, .55, .5), 0, .75, 0);
  mm(.9, .5, .8, M(0x4a525e, .45, .6), 0, 1.75, 0);
  mm(.16, .9, .16, M(0x6e747d, .4, .7), -.5, 1.45, .3); mm(.16, .9, .16, M(0x6e747d, .4, .7), .5, 1.45, .3);
  const stripe = new THREE.Mesh(G('mstripe', () => new THREE.PlaneGeometry(1.9, .2)), new THREE.MeshBasicMaterial({ map: tex.hazardM })); stripe.position.set(0, .2, .605); machine.add(stripe);
  const beaconMat = new THREE.MeshStandardMaterial({ color: 0x3a2000, emissive: 0xff8a00, emissiveIntensity: 0, roughness: .4 });
  const beacon = new THREE.Mesh(G('beacon', () => new THREE.CylinderGeometry(.11, .13, .22, 16)), beaconMat); beacon.position.set(.7, 1.61, -.3); machine.add(beacon);
  const halo = new THREE.Mesh(G('halo', () => new THREE.PlaneGeometry(1.4, 1.4)), new THREE.MeshBasicMaterial({ map: tex.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  halo.position.copy(beacon.position); halo.position.y += .05; machine.add(halo);

  // ouvriers
  const workers = []; let hero = null;
  [
    { id: 0, x: -7, z: -1.7, dir: 1, speed: .9, vest: 0xff6a00, shirt: 0x2d3f66, helmet: 0xf3f0e6 },
    { id: 1, x: -5.5, z: .35, dir: 1, speed: 1.45, vest: 0xd4ee00, shirt: 0x444a55, helmet: 0xf3f0e6, hero: true },
    { id: 2, x: 6, z: 1.55, dir: -1, speed: 1.05, vest: 0xff5a00, shirt: 0x202733, helmet: 0xffc400 }
  ].forEach(d => { const w = makeWorker(THREE, d); w.g.position.set(d.x, 0, d.z); w.g.rotation.y = d.dir > 0 ? Math.PI / 2 : -Math.PI / 2; add(w.g); workers.push(w); if (d.hero) hero = w; });

  // cône de vision + anneaux d'alerte (extérieur)
  const boxPos = new THREE.Vector3(...BOX_POS);
  const L = 6.2;
  const coneGeo = G('cone', () => { const g = new THREE.ConeGeometry(2.7, L, 48, 1, true); g.translate(0, -L / 2, 0); return g; });
  const coneMat = new THREE.MeshBasicMaterial({ color: 0x29b6f6, transparent: true, opacity: .055, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const cone = new THREE.Mesh(coneGeo, coneMat); cone.position.copy(boxPos);
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(.35, -2.4, 4.2).normalize());
  add(cone);
  const rings = [];
  for (let i = 0; i < 3; i++){
    const r = new THREE.Mesh(G('ring', () => new THREE.RingGeometry(.96, 1, 64)), new THREE.MeshBasicMaterial({ color: 0xff5a00, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    r.position.copy(boxPos); add(r); rings.push(r);
  }

  // le vrai boîtier AEGIS (modèle partagé), fixé au mur ; coque à opacité réglable pour l'acte 2
  const holder = new THREE.Group();
  const shell = [], waves = [];
  let led = null;
  const edge = makeScreen(THREE, 1024, 640, 2);
  edge.draw = (s) => drawEdge(edge.g, 512, 320, s);
  const panel = new THREE.Mesh(G('edgePanel', () => new THREE.PlaneGeometry(SCREEN.w, SCREEN.h)), new THREE.MeshBasicMaterial({ map: edge.tex, toneMapped: false, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  const frame = new THREE.LineSegments(G('edgeFrame', () => new THREE.EdgesGeometry(new THREE.PlaneGeometry(SCREEN.w + .003, SCREEN.h + .003))), new THREE.LineBasicMaterial({ color: 0xff5a00, transparent: true, opacity: 0 }));
  if (model){
    const m = model; m.traverse(o => {
      if (!o.isMesh) return;
      if (HIDE.includes(o.name)){ o.visible = false; return; }
      o.castShadow = true;
      const def = o.name === 'body12167' ? { color: 0xf24a00, roughness: .42, clearcoat: .45 } : o.name === 'body31097' ? { color: 0x1d1f23, roughness: .45, metalness: .35 }
        : o.name === 'body55189' ? { color: 0x0c5238, roughness: .5 } : o.name === 'body67406' ? { color: 0x202228, emissive: 0xff5a00, emissiveIntensity: 0 } : { color: 0xc4c8cf, roughness: .3, metalness: 1 };
      o.material = new THREE.MeshPhysicalMaterial({ envMapIntensity: .8, ...def });
      if (o.name === 'body67406') led = o;
      if (o.name === 'body12167') shell.push({ m: o.material, min: .08 });
      if (o.name === 'body31097') shell.push({ m: o.material, min: .22 });
    });
    holder.add(m); m.position.set(0, 0, .02);
    panel.position.set(...SCREEN.pos); panel.rotation.x = -Math.PI / 2 + .35; frame.position.copy(panel.position); frame.rotation.copy(panel.rotation);
    panel.renderOrder = frame.renderOrder = 10;   // l'écran reste lisible à travers la coque translucide
    m.add(panel); m.add(frame);
    for (let i = 0; i < 3; i++){
      const r = new THREE.Mesh(G('wave', () => new THREE.RingGeometry(.9, 1, 48)), new THREE.MeshBasicMaterial({ color: 0xff7a30, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      r.visible = false; r.renderOrder = 11; m.add(r); waves.push(r);
    }
    holder.scale.setScalar(5.2); holder.position.copy(boxPos); holder.rotation.set(.5, -.22, 0);
    add(holder);
    const arm = box(.1, .1, .75, M(0x9aa6b8, .4, .8), boxPos.x + .7, boxPos.y + .05, -3.05); arm.castShadow = true;
    box(.5, .7, .06, M(0x9aa6b8, .4, .8), boxPos.x + .7, boxPos.y + .05, -3.33);
  }

  // flux lumineux discret (métadonnées chiffrées uniquement, jamais de vidéo) : boîtier → bureau QSE
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-2.35, 2.55, -2.2), new THREE.Vector3(-.9, 3.6, -1.7), new THREE.Vector3(2.0, 4.1, -1.3), new THREE.Vector3(4.6, 3.8, -.9), new THREE.Vector3(6.6, 3.6, -2.5)
  ]);
  const trail = new THREE.Group(); add(trail);
  const trailLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(60)), new THREE.LineBasicMaterial({ color: 0x29b6f6, transparent: true, opacity: 0 }));
  trail.add(trailLine);
  const dots = [];
  for (let i = 0; i < 9; i++){
    const d = new THREE.Mesh(G('dot', () => new THREE.BoxGeometry(.03, .03, .03)), new THREE.MeshBasicMaterial({ color: 0x7fd0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    trail.add(d); dots.push(d);
  }
  trail.visible = false;

  /* ---- API ---- */
  const _q = new THREE.Vector3();
  const api = {
    group, workers, hero, boxPos, holder, cone, coneMat, rings, office, machine, qse, edge, curve,
    get led(){ return led; },
    // repère GLB (mètres) → monde ; indispensable pour les keyframes caméra « dans le boîtier »
    boxToWorld(x, y, z, out){ holder.updateWorldMatrix(true, true); return model.localToWorld(out.set(x, y, z)); },
    // coque PLA : a = 1 opaque … 0.08 translucide. transparent/depthWrite ne sont activés que pendant la translucidité.
    setShell(a){
      shell.forEach(s => { const o = lerp(s.min, 1, clamp((a - .08) / .92, 0, 1)); s.m.opacity = o; s.m.transparent = o < .999; s.m.depthWrite = o > .6; });
    },
    setEdgeAlpha(a){ panel.material.opacity = a; frame.material.opacity = a; panel.visible = frame.visible = a > .01; },
    // pose de l'ouvrier « hero » (marche, casque retiré / remis)
    applyHero(p, dt){
      hero.g.position.x = p.x; hero.walking = p.walking; hero.dir = 1;
      hero.g.rotation.y += ((p.face ? .55 : Math.PI / 2) - hero.g.rotation.y) * clamp(dt * 5, 0, 1);
      hero.h = p.h;
    },
    // k = intensité d'affichage (0..1) ; alerting = signal local actif
    applyAlert(alerting, T, k = 1, cam = null){
      coneMat.color.setHex(alerting ? 0xff5a00 : 0x29b6f6);
      coneMat.opacity = (alerting ? .09 + Math.abs(Math.sin(T * 9)) * .05 : .055 + Math.sin(T * 1.3) * .012) * k;
      if (led) led.material.emissiveIntensity = alerting ? (1.5 + Math.sin(T * 14) * 1.2) * k : 0;
      rings.forEach((r, i) => { const ph = ((T * .9 + i / 3) % 1); r.position.set(boxPos.x, boxPos.y, boxPos.z + .55); if (cam) r.lookAt(cam.position); r.scale.setScalar(.25 + ph * 1.5); r.material.opacity = alerting ? Math.pow(1 - ph, 1.5) * .85 * k : 0; });
      waves.forEach((r, i) => {
        const ph = ((T * .9 + i / 3) % 1);
        r.visible = alerting && k > .01;
        r.position.set(LED_LOCAL[0], LED_LOCAL[1], LED_LOCAL[2] + .02 + ph * .13); r.scale.setScalar(.012 + ph * .1);
        r.material.opacity = Math.pow(1 - ph, 1.4) * .9 * k;
      });
    },
    // gyrophare de la machine (danger) : 0..1
    setBeacon(a, T){ const p = a * (.6 + .4 * Math.sin(T * 8)); beaconMat.emissiveIntensity = p * 3; halo.material.opacity = p * .85; },
    // flux boîtier → bureau : a = opacité, p = progression de l'« impulsion »
    setTrail(a, T){
      trail.visible = a > .01; if (!trail.visible) return;
      trailLine.material.opacity = a * .35;
      dots.forEach((d, i) => { const ph = (T * .3 + i / dots.length) % 1; curve.getPoint(ph, _q); d.position.copy(_q); d.material.opacity = a * .8 * Math.sin(Math.PI * ph); });
    },
    // animations autonomes (marche des ouvriers, orientation du halo)
    update(dt, T, camera){
      workers.forEach(w => animateWorker(w, dt, T));
      halo.quaternion.copy(camera.quaternion);
    },
    // écrans dessinés : redessinés seulement quand nécessaires (le worker de rendu appelle selon visibilité)
    drawEdge(s){ edge.draw(s); edge.tex.needsUpdate = true; },
    drawQSE(s){ qse.draw(s); qse.tex.needsUpdate = true; },
    lang: getLang
  };
  return api;
}

function makeScreen(THREE, w, h, scale){
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d'); g.scale(scale, scale);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter; tex.anisotropy = 4;
  return { cv, g, tex, draw: null };
}

export function animateWorker(w, dt, T){
  if (!w.isHero){
    w.x += w.dir * w.speed * dt; if (w.x > 8) w.x = -8; if (w.x < -8) w.x = 8;
    w.g.position.x = w.x; w.walking = true;
  }
  const sp = w.speed * 4.2, t = T * sp + w.ph, amp = w.walking ? .55 : 0;
  w.legs[0].rotation.x = Math.sin(t) * amp; w.legs[1].rotation.x = -Math.sin(t) * amp;
  w.arms[0].rotation.x = -Math.sin(t) * amp * .8; w.arms[1].rotation.x = Math.sin(t) * amp * .8;
  w.g.position.y = w.walking ? Math.abs(Math.sin(t)) * .03 : 0;
  const k = w.h;   // casque (hero) : de la tête à la main droite
  if (k > 0 || w.isHero){
    const hx = lerp(0, .3, k), hy = lerp(1.665, .84, k) + Math.sin(Math.PI * k) * .35, hz = lerp(0, .08, k);
    w.helmet.position.set(hx, hy, hz); w.helmet.rotation.set(lerp(0, -1.1, k), 0, lerp(0, -.6, k));
    if (k > .05) w.arms[1].rotation.x = lerp(w.arms[1].rotation.x, -.9 * Math.sin(Math.PI * Math.min(k, 1) * .9), .5);
  }
}
