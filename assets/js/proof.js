// Tableau de bord AEGIS interactif (écran du chef de prévention, Acte 3).
// Reprend les codes visuels de l'application (barre latérale cyan, cartes à liseré, graphiques en anneau).
// Toutes les valeurs affichées sont des DONNÉES DE DÉMONSTRATION, signalées comme telles à l'écran.
// Les textes fixes sont dans index.html (data-i18n) ; ici uniquement les textes dynamiques.

const TXT = {
  fr: {
    zone: 'Zone', bld: 'Bâtiment industriel', missing: 'Casque manquant', gloves: 'Gants manquants', clear: 'Aucun écart détecté',
    on: 'Signal local activé', idle: 'Surveillance active', cam: 'Caméra',
    sent: n => `Signal envoyé : Bâtiment industriel ${n} · 0 image transmise`,
    recv: 'Signal anonyme reçu · Zone B · Casque manquant',
    exp: 'Export simulé : aucun fichier n’est créé dans cette démo'
  },
  en: {
    zone: 'Zone', bld: 'Industrial building', missing: 'Missing helmet', gloves: 'Missing gloves', clear: 'No deviation detected',
    on: 'Local signal on', idle: 'Monitoring active', cam: 'Camera',
    sent: n => `Signal sent: Industrial building ${n} · 0 images transmitted`,
    recv: 'Anonymous signal received · Zone B · Missing helmet',
    exp: 'Simulated export: no file is created in this demo'
  }
};

// caméras cliquables du plan : zone, bâtiment, état
const CAMS = {
  c1: { zone: 'B', bld: 1, issue: 'missing' },
  c2: { zone: 'A', bld: 2, issue: null },
  c3: { zone: 'C', bld: 3, issue: 'gloves' },
  c4: { zone: 'D', bld: 4, issue: null },
  c5: { zone: 'A', bld: 5, issue: null }
};

export function initProof({ root, getLang = () => 'fr' }){
  const $ = s => root.querySelector(s), $$ = s => [...root.querySelectorAll(s)];
  const t = () => TXT[getLang()] || TXT.fr;
  const toast = $('.dx-toast'), pins = $$('.dx-cam'), tabs = $$('.dx-tabs button'), panes = $$('.dx-pane');
  let cur = 'c1', toastTimer = 0, lastToast = null;

  function showToast(fn, kind = 'ok'){
    lastToast = fn;
    toast.textContent = fn();
    toast.dataset.kind = kind;
    toast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('on'), 3400);
  }

  function select(id){
    cur = id;
    const c = CAMS[id], L = t();
    pins.forEach(p => p.classList.toggle('sel', p.dataset.cam === id));
    $('#dxZone').textContent = `${L.zone} ${c.zone} · ${L.bld} ${c.bld}`;
    $('#dxIssue').textContent = c.issue ? L[c.issue] : L.clear;
    $('#dxState').textContent = c.issue ? L.on : L.idle;
    $('#dxCam').textContent = `${L.cam} ${String(c.bld).padStart(2, '0')}`;
    $('.dx-side').dataset.alert = c.issue ? '1' : '0';
  }

  function tab(name){
    tabs.forEach(b => { const on = b.dataset.tab === name; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    panes.forEach(p => p.classList.toggle('on', p.dataset.pane === name));
  }

  tabs.forEach(b => b.addEventListener('click', () => tab(b.dataset.tab)));
  pins.forEach(p => {
    p.addEventListener('click', () => select(p.dataset.cam));
    p.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); select(p.dataset.cam); } });
  });
  $$('.dx-test').forEach(b => b.addEventListener('click', () => {
    const n = b.dataset.bld, row = b.closest('tr');
    row && (row.classList.remove('ping'), void row.offsetWidth, row.classList.add('ping'));
    showToast(() => t().sent(n));
  }));
  $$('.dx-chk').forEach(b => b.addEventListener('click', () => {
    const on = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', on);
  }));
  $('#dxExport').addEventListener('click', () => showToast(() => t().exp));
  select(cur);

  return {
    refresh(){ select(cur); if (lastToast && toast.classList.contains('on')) toast.textContent = lastToast(); },
    // appelé quand le faisceau 3D se verrouille : le signal anonyme « arrive » sur le poste
    pulse(){
      const p = pins.find(x => x.dataset.cam === 'c1');
      if (p){ p.classList.remove('hit'); void p.getBoundingClientRect(); p.classList.add('hit'); }
      showToast(() => t().recv, 'alert');
    }
  };
}
