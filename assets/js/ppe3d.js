// Scène 3D « ce que voit le boîtier » (démo interactive de #preuve) : le monde partagé (world.js : chantier, ouvriers
// mannequins sans visage, vrai boîtier AEGIS au mur, cône de vision) + détections d'EPI en temps réel dessinées en 2D.
import * as THREE from 'three';
import { RoomEnvironment } from '../vendor/three/addons/environments/RoomEnvironment.js';
import { createWorld, poseAtTime, PHASES } from './world.js?v=18';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const CYC = PHASES.reduce((a, b) => a + b, 0);      // cycle de 14,2 s sur l'ouvrier « hero »

// `model` : promesse du modèle du boîtier (déjà chargé par main.js, pas de second téléchargement ; on en clone une instance).
// La boucle de rendu est pilotée par main.js : il appelle frame(now) tant que `running` est vrai.
export function initPPE({ wrap, gl, ov, ui, model }){
  const octx = ov.getContext('2d');
  let renderer, scene, camera, world = null, running = false, built = false, failed = false;
  let W = 960, H = 540, dpr = 1, T = 0, last = 0, on = true, onK = 1;   // onK : 0→1, fondu AVEC/SANS AEGIS (~300 ms)
  const disp = { people: 0, ok: 0, alerts: 0 };   // valeurs affichées, lissées
  const stats = { people: 0, ok: 0, alerts: 0 };
  let heroStatus = 'ok', alertUntil = 0, prevPhase = -1, fpsN = 0, fpsT = 0, fps = 30;
  let tx = 0, ty = 0;

  /* ---------- construction de la scène (lumières + monde partagé) ---------- */
  function build(){
    try {
      renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: true, powerPreference: 'high-performance' });
    } catch (e){ failed = true; wrap.classList.add('nogl'); return; }
    dpr = Math.min(devicePixelRatio || 1, 1.6);
    renderer.setPixelRatio(dpr);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x0b0d10); scene.fog = new THREE.Fog(0x0b0d10, 10, 24);
    camera = new THREE.PerspectiveCamera(42, 16 / 9, .1, 60);
    scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture;

    scene.add(new THREE.HemisphereLight(0x8fa2bd, 0x15161a, .75));
    const key = new THREE.DirectionalLight(0xfff1e0, 2.3); key.position.set(4, 7.5, 6.5); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -9, right: 9, top: 7, bottom: -5, near: .5, far: 26 }); key.shadow.bias = -.0004;
    scene.add(key);
    const rim = new THREE.PointLight(0xff7a30, 14, 16); rim.position.set(6, 2.6, -2); scene.add(rim);
    const fill = new THREE.PointLight(0x4fc3ff, 10, 16); fill.position.set(-6, 3, 3); scene.add(fill);

    built = true; resize();
    // le monde n'est créé qu'une fois le modèle du boîtier disponible (déjà téléchargé par main.js)
    Promise.resolve(model).then(tpl => {
      world = createWorld(THREE, { model: tpl ? tpl.clone(true) : null });
      scene.add(world.group);
    });
  }

  function resize(){
    if (!renderer) return;
    const r = wrap.getBoundingClientRect(); W = Math.max(2, r.width); H = Math.max(2, r.height);
    renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix();
    ov.width = W * dpr; ov.height = H * dpr;
  }
  new ResizeObserver(resize).observe(wrap);
  wrap.addEventListener('pointermove', e => { const r = wrap.getBoundingClientRect(); tx = (e.clientX - r.left) / r.width - .5; ty = (e.clientY - r.top) / r.height - .5; });

  /* ---------- overlay 2D : bounding boxes ---------- */
  const _b = new THREE.Box3(), _v = new THREE.Vector3(), _p = new THREE.Vector3(), _h = new THREE.Vector3();
  const _o1 = new THREE.Vector3(-.17, .22, 0), _o2 = new THREE.Vector3(.17, -.17, 0);
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
    world.workers.forEach(w => {
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

  /* ---------- boucle (appelée par main.js) ---------- */
  function frame(now){
    if (!running || !world) return;
    const dt = Math.min(.05, (now - last) / 1000 || .016); last = now; T += dt;
    fpsN++; fpsT += dt; if (fpsT > .6){ fps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; }
    onK = clamp(onK + (on ? dt : -dt) / .3, 0, 1);

    // scénario de l'ouvrier « hero » : 0 marche → 1 retire le casque → 2 sans casque (alerte) → 3 le remet → 4 repart
    const pose = poseAtTime(T % CYC);
    world.applyHero(pose, dt); heroStatus = pose.status;
    if (pose.phase === 2 && prevPhase !== 2 && on){ stats.alerts++; alertUntil = T + PHASES[2] - .3; }
    prevPhase = pose.phase;
    world.update(dt, T, camera);

    const cx = tx * 1.1 + Math.sin(T * .16) * .4, cy = 2.15 - ty * .3 + Math.sin(T * .23) * .06;
    camera.position.set(cx, cy + .2, 8.2); camera.lookAt(-.4, 1.35, 0);
    const alerting = T < alertUntil;
    world.applyAlert(alerting, T, onK, camera);

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
