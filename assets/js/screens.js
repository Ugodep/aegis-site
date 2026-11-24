// Écrans dessinés en Canvas 2D (rendus en haute définition ×2) et plaqués en texture dans la scène 3D :
//   · drawEdge : « ce que calcule le boîtier » (acte 2) : bounding boxes EPI, floutage du visage, télémétrie locale
//   · drawQSE  : dashboard statistique ANONYME du conseiller en prévention (acte 3) : jamais d'image caméra, jamais de nom
// Tous les libellés lisent la langue active (s.lang) : un clic sur FR/EN les met à jour à la frame suivante.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = t => 1 - Math.pow(1 - t, 3);
const seg = (u, a, b) => clamp((u - a) / (b - a), 0, 1);

const C = { bg: '#07090b', bg2: '#0e1114', line: '#262b31', tx: '#e8edf2', mut: '#8b939d', or: '#ff5a00', cy: '#29b6f6', ok: '#43c37a', bad: '#ff4a3d' };
const MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';
const SANS = 'Archivo, "Helvetica Neue", Arial, sans-serif';

const TXT = {
  fr: {
    noHelmet: 'SANS CASQUE', helmet: 'CASQUE', gloves: 'GANTS', person: 'PERSONNE', face: 'VISAGE FLOUTÉ',
    alert: 'ALERTE LOCALE · SIGNAL ACTIVÉ', clear: 'EPI CONFORME', foot: 'IA EMBARQUÉE · 30 FPS · 0 IMAGE STOCKÉE',
    head: 'AEGIS · TRAITEMENT LOCAL · RASPBERRY PI 5',
    dash: 'AEGIS · Dashboard QSE', sub: 'Aperçu du jour', anon: '100 % ANONYME',
    k1: 'Quasi-accidents évités', k2: 'Alertes locales', k3: 'EPI conformes',
    zones: 'Alertes par zone', sim: 'SIMULATION · données illustratives',
    nTitle: 'PRÉVENTION · ZONE B · 10:15', nL1: 'Oubli casque détecté → Signal local activé', nL2: '→ EPI remis', nLegal: '100 % ANONYME · 0 DONNÉE BIOMÉTRIQUE',
    nav: ['Aperçu', 'Zones', 'Rapports'], today: 'aujourd\'hui'
  },
  en: {
    noHelmet: 'NO HELMET', helmet: 'HELMET', gloves: 'GLOVES', person: 'PERSON', face: 'FACE MASKED',
    alert: 'LOCAL ALERT · SIGNAL ON', clear: 'PPE COMPLIANT', foot: 'EDGE AI · 30 FPS · 0 IMAGE SAVED',
    head: 'AEGIS · LOCAL PROCESSING · RASPBERRY PI 5',
    dash: 'AEGIS · HSE Dashboard', sub: 'Today\'s overview', anon: '100% ANONYMOUS',
    k1: 'Near-misses avoided', k2: 'Local alerts', k3: 'PPE compliant',
    zones: 'Alerts by zone', sim: 'SIMULATION · illustrative data',
    nTitle: 'PREVENTION · ZONE B · 10:15', nL1: 'Missing helmet detected → Local signal on', nL2: '→ PPE back on',
    nLegal: '100% ANONYMOUS · 0 BIOMETRIC DATA',
    nav: ['Overview', 'Zones', 'Reports'], today: 'today'
  }
};

function bracket(x, g, y, w, h, c, l, lw = 2){
  g.strokeStyle = c; g.lineWidth = lw; g.beginPath();
  g.moveTo(x, y + l); g.lineTo(x, y); g.lineTo(x + l, y);
  g.moveTo(x + w - l, y); g.lineTo(x + w, y); g.lineTo(x + w, y + l);
  g.moveTo(x + w, y + h - l); g.lineTo(x + w, y + h); g.lineTo(x + w - l, y + h);
  g.moveTo(x + l, y + h); g.lineTo(x, y + h); g.lineTo(x, y + h - l); g.stroke();
}
function tag(g, x, y, txt, bg, fs = 10){
  g.font = `700 ${fs}px ${MONO}`;
  const w = g.measureText(txt).width + 10;
  g.fillStyle = bg; g.fillRect(x, y - fs - 6, w, fs + 6);
  g.fillStyle = '#05070a'; g.fillText(txt, x + 5, y - 5);
  return w;
}

/* ============================ ACTE 2 : écran interne du boîtier (512 × 320) ============================ */
// s : { u (progression 0..1 du récit), T (temps s), lang, helmet (0 = sur la tête → 1 = retiré), missing (bool), alert (0..1) }
export function drawEdge(g, W, H, s){
  const t = TXT[s.lang] || TXT.fr, u = s.u, T = s.T;
  g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
  // grille + balayage
  g.strokeStyle = 'rgba(41,182,246,.07)'; g.lineWidth = 1;
  for (let x = 0; x <= W; x += 32){ g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y <= H; y += 32){ g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  const sy = ((T * 70) % (H + 40)) - 20;
  const gr = g.createLinearGradient(0, sy - 20, 0, sy + 20); gr.addColorStop(0, 'rgba(41,182,246,0)'); gr.addColorStop(.5, 'rgba(41,182,246,.16)'); gr.addColorStop(1, 'rgba(41,182,246,0)');
  g.fillStyle = gr; g.fillRect(0, sy - 20, W, 40);

  // bandeau haut
  g.fillStyle = C.bg2; g.fillRect(0, 0, W, 24); g.fillStyle = C.line; g.fillRect(0, 24, W, 1);
  g.font = `600 9px ${MONO}`; g.fillStyle = C.mut; g.fillText(t.head, 10, 15);
  g.fillStyle = (Math.sin(T * 6) > 0) ? C.bad : '#5a1d19'; g.beginPath(); g.arc(W - 16, 12, 3.5, 0, 7); g.fill();

  // silhouette (aucune image caméra : un pictogramme)
  const cx = 256, helmetOn = s.helmet < .5;
  const lift = clamp(s.helmet, 0, 1);
  g.save();
  g.fillStyle = '#1b2026'; g.strokeStyle = '#2b323a'; g.lineWidth = 1.5;
  g.beginPath(); g.rect(cx - 52, 128, 104, 112); g.fill(); g.stroke();                 // torse
  g.fillStyle = '#c9430a'; g.fillRect(cx - 40, 138, 80, 92);                                    // gilet
  g.fillStyle = '#dfe5ec'; g.fillRect(cx - 40, 168, 80, 7); g.fillRect(cx - 40, 196, 80, 7);    // bandes réfléchissantes
  g.fillStyle = '#1b2026'; g.fillRect(cx - 46, 240, 38, 62); g.fillRect(cx + 8, 240, 38, 62);   // jambes
  g.fillStyle = '#1b2026'; g.beginPath(); g.arc(cx, 98, 31, 0, 7); g.fill(); g.stroke();       // tête
  // mains
  const hands = [[cx - 66, 232], [cx + 66, 232]];
  hands.forEach(h => { g.fillStyle = '#2b323a'; g.beginPath(); g.arc(h[0], h[1], 11, 0, 7); g.fill(); });
  // casque (sur la tête, ou soulevé puis tenu)
  const hy = 80 - lift * 58, hx = cx + lift * 58;
  g.fillStyle = '#f3f0e6'; g.beginPath(); g.arc(hx, hy + 10, 34, Math.PI, 0); g.fill();
  g.fillRect(hx - 38, hy + 9, 76, 7);
  g.restore();

  // visage : pixelisé dès la détection (Privacy by Design, 0 ms)
  const maskOn = u >= .54;
  if (maskOn){
    g.save(); g.beginPath(); g.arc(cx, 100, 29, 0, 7); g.clip();
    const bs = 8;
    for (let y = 70; y < 132; y += bs) for (let x = cx - 32; x < cx + 32; x += bs){
      const v = 70 + ((x * 7 + y * 13) % 5) * 22; g.fillStyle = `rgb(${v},${v + 4},${v + 10})`; g.fillRect(x, y, bs, bs);
    }
    g.restore();
  }

  // détections
  const det = seg(u, .50, .53);
  if (det > 0){
    g.globalAlpha = det;
    const pc = C.cy;
    bracket(cx - 84, g, 62, 168, 244, pc, 16, 1.6);
    g.font = `600 9px ${MONO}`; g.fillStyle = pc; g.fillText(t.person + ' 0.97', cx - 84, 316 - 4);
    // tête
    const bad = s.missing, hc = bad ? C.bad : C.ok;
    const hb = [cx - 40 + (helmetOn ? 0 : 0), 54, 80, 64];
    bracket(hb[0], g, hb[1], hb[2], hb[3], hc, 11, 2);
    tag(g, hb[0], hb[1] - 1, bad ? `${t.noHelmet} · 94%` : `${t.helmet} · 97%`, hc, 10);
    // gants
    if (seg(u, .52, .54) > 0){
      g.globalAlpha = seg(u, .52, .54);
      hands.forEach((h, i) => { bracket(h[0] - 17, g, h[1] - 17, 34, 34, C.ok, 8, 1.6); });
      tag(g, hands[0][0] - 17, hands[0][1] - 18, `${t.gloves} · 98%`, C.ok, 9);
    }
    g.globalAlpha = det;
    if (maskOn){
      const k = 1 - clamp((u - .54) / .015, 0, 1);               // flash à l'activation
      tag(g, cx + 36, 98, `${t.face} · 0ms`, k > 0 ? '#ffffff' : C.cy, 9);
    }
    g.globalAlpha = 1;
  }

  // alerte locale
  const al = s.alert;
  if (al > .01){
    g.fillStyle = `rgba(255,90,0,${.18 + .12 * Math.abs(Math.sin(T * 7))})`; g.fillRect(0, 26, W, 5);
    g.font = `700 11px ${MONO}`; g.fillStyle = C.or; g.fillText(t.alert, 12, 52);
  } else if (u > .66){
    g.font = `700 11px ${MONO}`; g.fillStyle = C.ok; g.fillText(t.clear, 12, 52);
  }

  // télémétrie
  g.fillStyle = C.bg2; g.fillRect(0, H - 22, W, 22); g.fillStyle = C.line; g.fillRect(0, H - 22, W, 1);
  g.font = `700 10px ${MONO}`; g.fillStyle = C.cy; g.fillText(t.foot, 10, H - 8);
}

/* ============================ ACTE 3 : écran du conseiller QSE (640 × 400) ============================ */
// s : { u, T, lang }
export function drawQSE(g, W, H, s){
  const t = TXT[s.lang] || TXT.fr, u = s.u;
  g.fillStyle = '#0b0d10'; g.fillRect(0, 0, W, H);
  // en-tête
  g.fillStyle = '#12161a'; g.fillRect(0, 0, W, 38); g.fillStyle = C.line; g.fillRect(0, 38, W, 1);
  g.fillStyle = C.or; g.fillRect(14, 12, 14, 14);
  g.font = `800 14px ${SANS}`; g.fillStyle = C.tx; g.fillText(t.dash, 38, 24);
  g.font = `600 10px ${MONO}`; const aw = g.measureText(t.anon).width + 20;
  g.strokeStyle = C.ok; g.lineWidth = 1; g.strokeRect(W - aw - 14, 10, aw, 20); g.fillStyle = C.ok; g.fillText(t.anon, W - aw - 4, 24);
  // navigation
  g.fillStyle = '#0e1114'; g.fillRect(0, 39, 118, H - 39); g.fillStyle = C.line; g.fillRect(118, 39, 1, H - 39);
  g.font = `600 12px ${SANS}`;
  t.nav.forEach((n, i) => { g.fillStyle = i === 0 ? C.tx : C.mut; if (i === 0){ g.fillStyle = 'rgba(255,90,0,.12)'; g.fillRect(0, 56 + i * 34, 118, 30); g.fillStyle = C.or; g.fillRect(0, 56 + i * 34, 3, 30); g.fillStyle = C.tx; } g.fillText(n, 18, 76 + i * 34); });

  // titre
  g.font = `700 13px ${SANS}`; g.fillStyle = C.tx; g.fillText(t.sub, 138, 66);

  // KPI : le compteur de quasi-accidents évités s'incrémente quand la notification arrive
  const inc = ease(seg(u, .855, .90)), val = inc > .5 ? 1 : 0;
  const tiles = [
    [t.k1, '+' + (val), C.or, inc > .01 && inc < 1],
    [t.k2, String(3 + val), C.tx, false],
    [t.k3, '96 %', C.ok, false]
  ];
  tiles.forEach((k, i) => {
    const x = 138 + i * 160, y = 80, w = 150, h = 78;
    g.fillStyle = '#11151a'; g.fillRect(x, y, w, h); g.strokeStyle = C.line; g.lineWidth = 1; g.strokeRect(x + .5, y + .5, w - 1, h - 1);
    g.font = `600 9.5px ${MONO}`; g.fillStyle = C.mut; g.fillText(k[0].toUpperCase().slice(0, 24), x + 10, y + 20);
    const pop = k[3] ? 1 + .12 * Math.sin(inc * Math.PI) : 1;
    g.save(); g.translate(x + 10, y + 62); g.scale(pop, pop);
    g.font = `800 34px ${SANS}`; g.fillStyle = k[2]; g.fillText(k[1], 0, 0); g.restore();
    if (i === 0){ g.font = `600 9px ${MONO}`; g.fillStyle = C.mut; g.fillText(t.today, x + w - 10 - g.measureText(t.today).width, y + 62); }
  });

  // barres par zone (illustratif)
  g.font = `600 10px ${MONO}`; g.fillStyle = C.mut; g.fillText(t.zones.toUpperCase(), 138, 186);
  const bars = [['A', .30], ['B', .46 + .22 * inc], ['C', .22], ['D', .38]];
  bars.forEach((b, i) => {
    const x = 138 + i * 112, y0 = 340, hh = 120 * b[1];
    g.fillStyle = b[0] === 'B' ? C.or : '#2a3038'; g.fillRect(x, y0 - hh, 88, hh);
    g.font = `700 11px ${MONO}`; g.fillStyle = b[0] === 'B' ? C.tx : C.mut; g.fillText('ZONE ' + b[0], x + 4, y0 + 14);
  });
  g.font = `500 9px ${MONO}`; g.fillStyle = '#5d6670'; g.fillText(t.sim, 138, H - 10);

  // notification en direct (glisse depuis le haut)
  const n = ease(seg(u, .78, .82));
  if (n > .01){
    const w = 410, h = 98, x = W - w - 16, y = 50 - (1 - n) * 130;
    g.save(); g.globalAlpha = Math.min(1, n * 1.4);
    g.fillStyle = '#12161a'; g.fillRect(x, y, w, h); g.strokeStyle = '#3a4048'; g.lineWidth = 1; g.strokeRect(x + .5, y + .5, w - 1, h - 1);
    g.fillStyle = C.or; g.fillRect(x, y, 5, h);
    g.font = `800 13px ${SANS}`; g.fillStyle = C.tx; g.fillText(t.nTitle, x + 18, y + 26);
    g.font = `500 12px ${SANS}`; g.fillStyle = '#c9d0d8'; g.fillText(t.nL1, x + 18, y + 48); g.fillText(t.nL2, x + 18, y + 66);
    g.font = `700 9.5px ${MONO}`; g.fillStyle = C.ok; g.fillText(t.nLegal, x + 18, y + 87);
    g.restore();
  }
}
