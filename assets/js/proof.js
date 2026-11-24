// Comparateur interactif AVEC / SANS AEGIS (#preuve), construit sur de VRAIES captures terrain du prototype.
//  · AVEC AEGIS  : la capture est analysée « en direct » : balayage, bounding boxes EPI (casque / gants), floutage du visage,
//                   alerte locale et compteurs qui s'incrémentent (cycle de 7 s).
//  · SANS AEGIS  : la même image vue par une caméra classique : rien n'est détecté, l'oubli passe inaperçu.
// Deux scénarios : « casque oublié » (yolo-sans.jpg) et « équipé » (yolo-avec.jpg). Aucune identité : visages déjà floutés.
// La boucle est pilotée par main.js (frame(now) appelé seulement quand la section est visible).

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = t => 1 - Math.pow(1 - t, 3);
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);

// zones en coordonnées de l'image : [x, y, largeur, hauteur]
const SCN = {
  missing: { src: 'assets/img/yolo-sans.jpg?v=9', w: 940, h: 677, ok: false,
    person: [200, 38, 352, 639], head: [310, 8, 155, 165], hands: [[495, 398, 48, 78], [368, 488, 80, 104]], face: [395, 98, 58] },
  equipped: { src: 'assets/img/yolo-avec.jpg?v=9', w: 940, h: 659, ok: true,
    person: [5, 30, 375, 620], head: [105, 8, 158, 200], hands: [[143, 428, 214, 118]], face: [185, 150, 62] }
};
const TXT = {
  fr: { person: 'PERSONNE', helmetOk: 'CASQUE', helmetKo: 'SANS CASQUE', glovesOk: 'GANTS', glovesKo: 'SANS GANTS', face: 'VISAGE FLOUTÉ · 0 ms', scan: 'ANALYSE LOCALE' },
  en: { person: 'PERSON', helmetOk: 'HELMET', helmetKo: 'NO HELMET', glovesOk: 'GLOVES', glovesKo: 'NO GLOVES', face: 'FACE BLURRED · 0 ms', scan: 'LOCAL ANALYSIS' }
};
const C = { ok: '#43c37a', bad: '#ff4a3d', cy: '#29b6f6', tx: '#06080a' };
const CYCLE = 7;     // durée d'un cycle d'analyse (s)

export function initProof({ wrap, img, ov, ui, getLang = () => 'fr' }){
  const ctx = ov.getContext('2d');
  let running = false, on = true, onK = 1, scnKey = 'missing', scn = SCN.missing;
  let W = 960, H = 540, dpr = 1, T = 0, last = 0, c0 = 0, prevC = 99, fpsN = 0, fpsT = 0, fps = 60, alertSent = false;
  const stats = { people: 0, ok: 0, alerts: 0 };
  const disp = { people: 0, ok: 0, alerts: 0 };

  function resize(){
    const r = wrap.getBoundingClientRect(); W = Math.max(2, r.width); H = Math.max(2, r.height);
    dpr = Math.min(devicePixelRatio || 1, 2);
    ov.width = W * dpr; ov.height = H * dpr;
  }
  new ResizeObserver(resize).observe(wrap); resize();

  function restart(){ c0 = T; prevC = 99; alertSent = false; }
  function setScenario(k){
    if (!SCN[k] || k === scnKey) return;
    scnKey = k; scn = SCN[k];
    img.src = scn.src; img.width = scn.w; img.height = scn.h;
    wrap.dataset.scn = k; restart();
  }

  /* ---------- dessin (coordonnées image → canvas, image « contain » dans le cadre) ---------- */
  function bracket(x, y, w, h, col, l, a){
    ctx.globalAlpha = onK * a; ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath();
    ctx.moveTo(x, y + l); ctx.lineTo(x, y); ctx.lineTo(x + l, y);
    ctx.moveTo(x + w - l, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + l);
    ctx.moveTo(x + w, y + h - l); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - l, y + h);
    ctx.moveTo(x + l, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - l); ctx.stroke();
  }
  // pastille : fond sombre opaque + fine bordure de la couleur du cadre. Posée juste AU-DESSUS du cadre (y = bord bas de la pastille),
  // elle recouvre proprement les textes incrustés dans la photo au lieu de se mélanger avec eux.
  function chip(x, y, txt, col, a, fs){
    ctx.globalAlpha = onK * a;
    ctx.font = `700 ${fs}px "JetBrains Mono",monospace`;
    const w = ctx.measureText(txt).width + 14, h = fs + 10, yy = Math.max(y, h + 2);
    ctx.fillStyle = 'rgba(8,9,12,.9)'; ctx.fillRect(x, yy - h, w, h);
    ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.strokeRect(x + .6, yy - h + .6, w - 1.2, h - 1.2);
    ctx.fillStyle = col; ctx.fillText(txt, x + 7, yy - 7);
  }
  function draw(c){
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    if (onK < .01) return;
    const s = Math.min(W / scn.w, H / scn.h), ox = (W - scn.w * s) / 2, oy = (H - scn.h * s) / 2;
    const t = TXT[getLang()] || TXT.fr, fs = Math.max(11, 14 / Math.max(s, .5));
    ctx.save(); ctx.translate(ox, oy); ctx.scale(s, s);
    ctx.beginPath(); ctx.rect(0, 0, scn.w, scn.h); ctx.clip();

    // balayage d'analyse (0 → 1,3 s)
    const sc = seg(c, 0, 1.3);
    if (sc > 0 && sc < 1){
      const y = sc * scn.h, g = ctx.createLinearGradient(0, y - 60, 0, y + 6);
      g.addColorStop(0, 'rgba(41,182,246,0)'); g.addColorStop(1, 'rgba(41,182,246,.38)');
      ctx.globalAlpha = onK; ctx.fillStyle = g; ctx.fillRect(0, y - 60, scn.w, 66);
      ctx.fillStyle = C.cy; ctx.fillRect(0, y, scn.w, 2);
    }
    const good = scn.ok, col = good ? C.ok : C.bad;
    // personne
    const pa = ease(seg(c, .25, .75)), [px, py, pw, ph] = scn.person, e = (1 - pa) * 14;
    bracket(px - e, py - e, pw + 2 * e, ph + 2 * e, C.cy, 30, pa);
    chip(px, py - 4, t.person, C.cy, pa, fs);
    // tête / casque
    const ha = ease(seg(c, .6, 1.05)), [hx, hy, hw, hh] = scn.head;
    bracket(hx - 6, hy - 6, hw + 12, hh + 12, col, 22, ha);
    chip(hx - 6, hy - 10, good ? t.helmetOk : t.helmetKo, col, ha, fs);
    // mains / gants
    const ga = ease(seg(c, .9, 1.35));
    scn.hands.forEach((h, i) => {
      bracket(h[0] - 6, h[1] - 6, h[2] + 12, h[3] + 12, col, 14, ga);
      if (i === 0) chip(h[0] - 6, h[1] - 32, good ? t.glovesOk : t.glovesKo, col, ga, fs);
    });
    // visage : mosaïque instantanée puis pastille (le flou est déjà dans l'image : aucune identité)
    const fa = ease(seg(c, 1.25, 1.6)), [fx, fy, fr] = scn.face;
    if (fa > 0){
      const k = 1 - clamp((c - 1.3) / .6, 0, 1);
      if (k > 0){
        ctx.save(); ctx.beginPath(); ctx.arc(fx, fy, fr, 0, 7); ctx.clip(); ctx.globalAlpha = onK * k * .55;
        for (let y = fy - fr; y < fy + fr; y += 12) for (let x = fx - fr; x < fx + fr; x += 12){ const v = 90 + ((x * 7 + y * 13) % 5) * 22; ctx.fillStyle = `rgb(${v},${v + 4},${v + 10})`; ctx.fillRect(x, y, 12, 12); }
        ctx.restore();
      }
      ctx.globalAlpha = onK * fa; ctx.strokeStyle = C.cy; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(fx, fy, fr + 8, 0, 7); ctx.stroke();
      chip(fx + fr + 12, fy + 6, t.face, C.cy, fa, fs);
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  /* ---------- boucle (appelée par main.js) ---------- */
  function frame(now){
    if (!running) return;
    const dt = Math.min(.05, (now - last) / 1000 || .016); last = now; T += dt;
    fpsN++; fpsT += dt; if (fpsT > .6){ fps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; }
    onK = clamp(onK + (on ? dt : -dt) / .3, 0, 1);
    const c = (T - c0) % CYCLE;
    if (on){
      if (c < prevC){ stats.people++; if (scn.ok) stats.ok++; alertSent = false; }   // nouveau cycle : une personne analysée
      if (!scn.ok && !alertSent && c > 1.5){ alertSent = true; stats.alerts++; }
    }
    prevC = c;
    draw(c);
    const k = 1 - Math.exp(-dt * 7);
    disp.people += (stats.people - disp.people) * k; disp.ok += (stats.ok - disp.ok) * k; disp.alerts += (stats.alerts - disp.alerts) * k;
    const alertOn = on && !scn.ok && c > 1.5 && c < 5.8;
    ui && ui({ people: Math.round(disp.people), ok: Math.round(disp.ok), alerts: Math.round(disp.alerts), alertOn, fps });
  }

  return {
    frame,
    get running(){ return running; },
    start(){ if (running) return; running = true; last = performance.now(); restart(); },
    stop(){ running = false; },
    setOn(v){ if (v && !on) restart(); on = v; },
    setScenario
  };
}
