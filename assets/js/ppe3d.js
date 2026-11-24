// Scène 3D « ce que voit le boîtier » : un chantier, des ouvriers mannequins (sans visage),
// le vrai boîtier AEGIS fixé au mur, son cône de vision, et des détections d'EPI en temps réel.
import * as THREE from 'three';
import { toCreasedNormals } from '../vendor/three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from '../vendor/three/addons/environments/RoomEnvironment.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * (3 - 2 * t);
const HIDE = ['body69062', 'body935', 'body27961'];

// `model` : promesse du modèle du boîtier (déjà chargé par main.js, pas de second téléchargement).
// La boucle de rendu est pilotée par main.js : il appelle frame(now) tant que `running` est vrai.
export function initPPE({ wrap, gl, ov, ui, model }){
  const octx = ov.getContext('2d');
  let renderer, scene, camera, running = false, built = false, failed = false;
  let W = 960, H = 540, dpr = 1, T = 0, last = 0, on = true, onK = 1;   // onK : 0→1, fondu AVEC/SANS AEGIS (~300 ms)
  const disp = { people: 0, ok: 0, alerts: 0 };   // valeurs affichées, lissées
  let hero = null, cone = null, coneMat = null, rings = [], boxLed = null, boxPos = new THREE.Vector3(-2.7, 2.7, -2.75);
  const workers = [];
  const stats = { people: 0, ok: 0, alerts: 0 };
  let heroStatus = 'ok', alertUntil = 0, prevPhase = -1, fpsN = 0, fpsT = 0, fps = 30;
  let tx = 0, ty = 0;

  /* ---------- ouvrier mannequin ---------- */
  const M = (c, r = .85, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, envMapIntensity: .4 });
  function makeWorker(o){
    const g = new THREE.Group();
    const skin = M(0x70757d, .8), pants = M(0x262c3a), shirt = M(o.shirt || 0x39424f), vest = M(o.vest, .65), stripe = M(0xe3e9f0, .35), boots = M(0x0f1012, .7);
    const put = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
    const legs = [-1, 1].map(s => {
      const p = new THREE.Group(); p.position.set(s * .1, .92, 0);
      put(new THREE.CapsuleGeometry(.072, .66, 4, 10), pants, 0, -.4, 0, p);
      put(new THREE.BoxGeometry(.13, .08, .27), boots, 0, -.86, .06, p);
      g.add(p); return p;
    });
    put(new THREE.CapsuleGeometry(.185, .3, 4, 14), shirt, 0, 1.2, 0).scale.set(1.05, 1, .72);
    put(new THREE.BoxGeometry(.4, .5, .25), vest, 0, 1.22, 0);
    put(new THREE.BoxGeometry(.408, .05, .258), stripe, 0, 1.08, 0);
    put(new THREE.BoxGeometry(.408, .05, .258), stripe, 0, 1.3, 0);
    const arms = [-1, 1].map(s => {
      const p = new THREE.Group(); p.position.set(s * .26, 1.42, 0);
      put(new THREE.CapsuleGeometry(.058, .46, 4, 10), shirt, 0, -.3, 0, p);
      put(new THREE.SphereGeometry(.062, 12, 10), skin, 0, -.63, 0, p);
      g.add(p); return p;
    });
    put(new THREE.CylinderGeometry(.05, .055, .08, 10), skin, 0, 1.5, 0);
    const head = put(new THREE.SphereGeometry(.118, 20, 16), skin, 0, 1.62, 0);
    const helmet = new THREE.Group();
    const hm = M(o.helmet, .35, .05);
    put(new THREE.SphereGeometry(.14, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), hm, 0, 0, 0, helmet);
    put(new THREE.CylinderGeometry(.158, .158, .022, 24), hm, 0, 0, 0, helmet).position.z = .01;
    put(new THREE.BoxGeometry(.05, .02, .24), hm, 0, .14, 0, helmet);
    helmet.position.set(0, 1.665, 0); g.add(helmet);
    g.traverse(n => { if (n.isMesh) n.castShadow = true; });
    return { g, legs, arms, head, helmet, speed: o.speed, dir: o.dir, z: o.z, x: o.x, ph: Math.random() * 6, h: 0, walking: true, id: o.id, isHero: !!o.hero };
  }

  /* ---------- construction de la scène ---------- */
  function build(){
    try {
      renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: true, powerPreference: 'high-performance' });
    } catch (e){ failed = true; wrap.classList.add('nogl'); return; }
    dpr = Math.min(devicePixelRatio || 1, 1.6);
    renderer.setPixelRatio(dpr);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15; renderer.outputColorSpace = THREE.SRGBColorSpace;
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x050608); scene.fog = new THREE.Fog(0x050608, 12, 26);
    camera = new THREE.PerspectiveCamera(42, 16 / 9, .1, 60);
    scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture;

    scene.add(new THREE.HemisphereLight(0x8fa2bd, 0x15161a, .75));
    const key = new THREE.DirectionalLight(0xfff1e0, 2.3); key.position.set(4, 7.5, 6.5); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -9, right: 9, top: 7, bottom: -5, near: .5, far: 26 }); key.shadow.bias = -.0004;
    scene.add(key);
    const rim = new THREE.PointLight(0xff5a00, 12, 16); rim.position.set(6, 2.6, -2); scene.add(rim);
    const fill = new THREE.PointLight(0x7dd3fc, 12, 16); fill.position.set(-6, 3, 3); scene.add(fill);

    // studio : aucun décor. Seuls un sol récepteur d'ombre (invisible) et un halo radial doux ancrent les ouvriers.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(44, 26), new THREE.ShadowMaterial({ opacity: .45 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    const hc = document.createElement('canvas'); hc.width = hc.height = 256; const hx = hc.getContext('2d');
    const hg = hx.createRadialGradient(128, 128, 0, 128, 128, 128);
    hg.addColorStop(0, 'rgba(125,211,252,.22)'); hg.addColorStop(.4, 'rgba(70,110,150,.09)'); hg.addColorStop(1, 'rgba(5,6,8,0)');
    hx.fillStyle = hg; hx.fillRect(0, 0, 256, 256);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(22, 12), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(hc), transparent: true, depthWrite: false }));
    halo.rotation.x = -Math.PI / 2; halo.position.set(0, .01, .2); scene.add(halo);

    // ouvriers
    const defs = [
      { id: 0, x: -7, z: -1.7, dir: 1, speed: .9, vest: 0xff6a00, shirt: 0x2d3f66, helmet: 0xf3f0e6 },
      { id: 1, x: -5.5, z: .35, dir: 1, speed: 1.45, vest: 0xd4ee00, shirt: 0x444a55, helmet: 0xf3f0e6, hero: true },
      { id: 2, x: 6, z: 1.55, dir: -1, speed: 1.05, vest: 0xff5a00, shirt: 0x202733, helmet: 0xffc400 }
    ];
    defs.forEach(d => { const w = makeWorker(d); w.g.position.set(d.x, 0, d.z); w.g.rotation.y = d.dir > 0 ? Math.PI / 2 : -Math.PI / 2; scene.add(w.g); workers.push(w); if (d.hero) hero = w; });

    // cône de vision
    const L = 6.2;
    const coneGeo = new THREE.ConeGeometry(2.7, L, 48, 1, true); coneGeo.translate(0, -L / 2, 0);
    coneMat = new THREE.MeshBasicMaterial({ color: 0x29b6f6, transparent: true, opacity: .055, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.copy(boxPos);
    const dir = new THREE.Vector3(.35, -2.4, 4.2).normalize();  // vers la zone de travail
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    scene.add(cone);
    for (let i = 0; i < 3; i++){
      const r = new THREE.Mesh(new THREE.RingGeometry(.96, 1, 64), new THREE.MeshBasicMaterial({ color: 0xff5a00, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      r.position.copy(boxPos); scene.add(r); rings.push(r);
    }

    // le vrai boîtier AEGIS, fixé au mur
    Promise.resolve(model).then(m => {
      if (!m) return;
      let led;
      m.traverse(o => {
        if (!o.isMesh) return;
        if (HIDE.includes(o.name)){ o.visible = false; return; }
        o.geometry = toCreasedNormals(o.geometry, .62); o.castShadow = true;
        // même palette « studio hardware » que la scène principale (orange réservé à la LED)
        const def = o.name === 'body12167' ? { color: 0xcfd4dc, roughness: .34, metalness: .22, clearcoat: .25, clearcoatRoughness: .4 } : o.name === 'body31097' ? { color: 0x16181d, roughness: .42, metalness: .55 } : o.name === 'body55189' ? { color: 0x0d5c3e, roughness: .48, metalness: .1 } : o.name === 'body67406' ? { color: 0x202228, emissive: 0xff5a00, emissiveIntensity: 0 } : { color: 0xd5dae2, roughness: .22, metalness: .9 };
        o.material = new THREE.MeshPhysicalMaterial({ envMapIntensity: .8, ...def });
        if (o.name === 'body67406') led = o;
      });
      boxLed = led;
      const holder = new THREE.Group(); holder.add(m); m.position.set(0, 0, .02);
      holder.scale.setScalar(5.2); holder.position.copy(boxPos); holder.rotation.set(.5, -.22, 0);
      scene.add(holder);
      // le boîtier flotte : pas de bras ni de plaque de fixation
    }).catch(() => {});
    built = true; resize();
  }

  function resize(){
    if (!renderer) return;
    const r = wrap.getBoundingClientRect(); W = Math.max(2, r.width); H = Math.max(2, r.height);
    renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix();
    ov.width = W * dpr; ov.height = H * dpr;
  }
  new ResizeObserver(resize).observe(wrap);
  wrap.addEventListener('pointermove', e => { const r = wrap.getBoundingClientRect(); tx = (e.clientX - r.left) / r.width - .5; ty = (e.clientY - r.top) / r.height - .5; });

  /* ---------- scénario (cycle de 14,2 s sur l'ouvrier « hero ») ---------- */
  const CYC = 14.2;
  function scenario(dt){
    const c = T % CYC;
    // phases : 0 marche → 1 retire le casque → 2 sans casque (alerte) → 3 le remet → 4 repart
    const P = [3.8, 1.0, 4.2, 1.1, 4.1], edge = []; P.reduce((a, d, i) => (edge[i] = a, a + d), 0);
    let phase = 0; for (let i = 0; i < 5; i++) if (c >= edge[i]) phase = i;
    const x0 = -5.5, xc = -.2, x1 = 5.6;
    let x;
    if (phase === 0) x = lerp(x0, xc, c / P[0]);
    else if (phase < 4) x = xc;
    else x = lerp(xc, x1, (c - edge[4]) / P[4]);
    hero.g.position.x = x; hero.walking = phase === 0 || phase === 4;
    hero.dir = 1;
    const faceCam = phase >= 1 && phase <= 3;
    const targetRot = faceCam ? .55 : Math.PI / 2;
    hero.g.rotation.y += (targetRot - hero.g.rotation.y) * clamp(dt * 5, 0, 1);
    // casque : 0 sur la tête → 1 dans la main
    if (phase === 1) hero.h = ease(clamp((c - edge[1]) / P[1], 0, 1));
    else if (phase === 2) hero.h = 1;
    else if (phase === 3) hero.h = 1 - ease(clamp((c - edge[3]) / P[3], 0, 1));
    else hero.h = 0;
    const missing = hero.h > .55 && phase >= 1 && phase <= 3;
    heroStatus = missing ? 'missing' : (phase === 4 && c - edge[4] < 1.6) || (phase === 3 && hero.h < .55) ? 'fixed' : 'ok';
    if (phase === 2 && prevPhase !== 2 && on){ stats.alerts++; alertUntil = T + P[2] - .3; }
    prevPhase = phase;
  }

  /* ---------- animation ---------- */
  const _b = new THREE.Box3(), _v = new THREE.Vector3(), _p = new THREE.Vector3(), _h = new THREE.Vector3();
  const _o1 = new THREE.Vector3(-.17, .22, 0), _o2 = new THREE.Vector3(.17, -.17, 0);
  function animateWorker(w, dt){
    if (!w.isHero){
      w.x += w.dir * w.speed * dt; if (w.x > 8) w.x = -8; if (w.x < -8) w.x = 8;
      w.g.position.x = w.x; w.walking = true;
    }
    const sp = w.speed * 4.2, t = T * sp + w.ph, amp = w.walking ? .55 : 0;
    w.legs[0].rotation.x = Math.sin(t) * amp; w.legs[1].rotation.x = -Math.sin(t) * amp;
    w.arms[0].rotation.x = -Math.sin(t) * amp * .8; w.arms[1].rotation.x = Math.sin(t) * amp * .8;
    w.g.position.y = w.walking ? Math.abs(Math.sin(t)) * .03 : 0;
    // casque (hero) : de la tête à la main droite
    const k = w.h;
    if (k > 0 || w.isHero){
      const hx = lerp(0, .3, k), hy = lerp(1.665, .84, k) + Math.sin(Math.PI * k) * .35, hz = lerp(0, .08, k);
      w.helmet.position.set(hx, hy, hz); w.helmet.rotation.set(lerp(0, -1.1, k), 0, lerp(0, -.6, k));
      if (k > .05) w.arms[1].rotation.x = lerp(w.arms[1].rotation.x, -.9 * Math.sin(Math.PI * Math.min(k, 1) * .9), .5);
    }
  }

  function project(vec){ _v.copy(vec).project(camera); return [(_v.x * .5 + .5) * W, (-_v.y * .5 + .5) * H]; }
  function bboxOf(obj){
    _b.setFromObject(obj); const mn = _b.min, mx = _b.max; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < 8; i++){ const p = project(_p.set(i & 1 ? mx.x : mn.x, i & 2 ? mx.y : mn.y, i & 4 ? mx.z : mn.z)); x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    return [x0, y0, x1 - x0, y1 - y0];
  }

  function bracket(x, y, w, h, c, l){
    octx.strokeStyle = c; octx.lineWidth = 2; octx.beginPath();
    octx.moveTo(x, y + l); octx.lineTo(x, y); octx.lineTo(x + l, y); octx.moveTo(x + w - l, y); octx.lineTo(x + w, y); octx.lineTo(x + w, y + l);
    octx.moveTo(x + w, y + h - l); octx.lineTo(x + w, y + h); octx.lineTo(x + w - l, y + h); octx.moveTo(x + l, y + h); octx.lineTo(x, y + h); octx.lineTo(x, y + h - l); octx.stroke();
  }
  function label(x, y, txt, bg, fs){
    octx.font = `700 ${fs}px "JetBrains Mono",monospace`; const w = octx.measureText(txt).width + 10;
    octx.fillStyle = bg; octx.fillRect(x, y - fs - 6, w, fs + 6); octx.fillStyle = '#06080a'; octx.fillText(txt, x + 5, y - 5);
  }
  function drawOverlay(){
    octx.setTransform(dpr, 0, 0, dpr, 0, 0); octx.clearRect(0, 0, W, H);
    if (onK < .01) return;
    octx.globalAlpha = onK;
    const fs = clamp(W / 90, 9, 13), conf = (id, o) => (0.93 + .05 * (.5 + .5 * Math.sin(T * 1.7 + id + o))).toFixed(2);
    workers.forEach(w => {
      const b = bboxOf(w.g); if (b[0] > W || b[0] + b[2] < 0) return;
      const bad = w.isHero && heroStatus === 'missing';
      const col = bad ? '#ff4a3d' : 'rgba(41,182,246,.85)';
      bracket(b[0], b[1], b[2], b[3], col, Math.min(14, b[2] * .25));
      octx.font = `600 ${fs - 1}px "JetBrains Mono",monospace`; octx.fillStyle = bad ? '#ff4a3d' : 'rgba(41,182,246,.95)';
      octx.fillText('PERSON ' + conf(w.id, 0), b[0], b[1] + b[3] + fs + 3);
      w.head.getWorldPosition(_h); const hs = [project(_p.copy(_h).add(_o1)), project(_p.copy(_h).add(_o2))];
      const hx = Math.min(hs[0][0], hs[1][0]), hy = Math.min(hs[0][1], hs[1][1]), hw = Math.abs(hs[1][0] - hs[0][0]), hh = Math.abs(hs[1][1] - hs[0][1]);
      const hcol = bad ? '#ff4a3d' : '#43c37a';
      bracket(hx, hy, hw, hh, hcol, Math.min(8, hw * .3));
      label(hx, hy - 1, bad ? 'NO HELMET' : 'HELMET ' + conf(w.id, 3), hcol, fs);
      if (w.isHero && heroStatus === 'fixed'){ octx.font = `700 ${fs}px "JetBrains Mono",monospace`; octx.fillStyle = '#43c37a'; octx.fillText('✓ CORRIGÉ', hx + hw + 6, hy + hh * .7); }
    });
  }

  /* ---------- boucle ---------- */
  function frame(now){
    if (!running) return;
    const dt = Math.min(.05, (now - last) / 1000 || .016); last = now; T += dt;
    fpsN++; fpsT += dt; if (fpsT > .6){ fps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; }
    scenario(dt);
    workers.forEach(w => animateWorker(w, dt));
    // caméra
    const cx = tx * 1.1 + Math.sin(T * .16) * .4, cy = 2.15 - ty * .3 + Math.sin(T * .23) * .06;
    camera.position.set(cx, cy + .2, 8.2); camera.lookAt(-.4, 1.35, 0);
    // alerte : cône + anneaux + LED du boîtier
    onK = clamp(onK + (on ? dt : -dt) / .3, 0, 1);
    const alerting = T < alertUntil;
    coneMat.color.setHex(alerting ? 0xff5a00 : 0x29b6f6);
    coneMat.opacity = (alerting ? .09 + Math.abs(Math.sin(T * 9)) * .05 : .055 + Math.sin(T * 1.3) * .012) * onK;
    if (boxLed) boxLed.material.emissiveIntensity = alerting ? (1.5 + Math.sin(T * 14) * 1.2) * onK : 0;
    rings.forEach((r, i) => { const ph = ((T * .9 + i / 3) % 1); r.position.copy(boxPos); r.position.z += .55; r.lookAt(camera.position); r.scale.setScalar(.25 + ph * 1.5); r.material.opacity = alerting ? Math.pow(1 - ph, 1.5) * .85 * onK : 0; });
    stats.people += dt * 3; stats.ok += dt * 2.6 * (heroStatus === 'missing' ? .66 : 1);
    renderer.render(scene, camera);
    drawOverlay();
    const kk = 1 - Math.exp(-dt * 7);
    disp.people += (stats.people - disp.people) * kk; disp.ok += (stats.ok - disp.ok) * kk; disp.alerts += (stats.alerts - disp.alerts) * kk;
    ui && ui({ people: Math.floor(disp.people), ok: Math.floor(disp.ok), alerts: Math.round(disp.alerts), alertOn: alerting && on, fps });
  }

  return {
    frame,
    get running(){ return running; },
    start(){
      if (failed || running) return;
      if (!built) build();
      if (failed) return;
      running = true; last = performance.now();
    },
    stop(){ running = false; },
    setOn(v){ on = v; }
  };
}
