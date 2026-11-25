// Tableau de bord AEGIS interactif (écran du chef de prévention, Acte 3).
// Reprend les rubriques de l'application « AEGIS Prévention » (dashboard-local). Les valeurs affichées sont des
// DONNÉES DE DÉMONSTRATION, signalées comme telles à l'écran. Les textes fixes sont dans index.html (data-i18n).

const TXT = {
  fr: {
    zones: { A: 'Zone A · Entrée', B: 'Zone B · Atelier', C: 'Zone C · Quai' },
    cam: 'Caméra', online: 'En ligne', recall: 'Rappel actif · Casque manquant', clear: 'Aucun rappel actif',
    modes: { sound: 'Sonore', light: 'Visuel', both: 'Sonore et visuel', none: 'Aucun' },
    sent: (z, m) => `Signal testé · ${z} · ${m}`,
    nosig: z => `${z} · aucun signal configuré`,
    recv: 'Signal reçu · Zone B · Casque manquant',
    exp: 'Démo : aucun fichier n’est créé',
    run: 'En cours', done: 'Clôturée', close: 'Clôturer', reopen: 'Rouvrir'
  },
  en: {
    zones: { A: 'Zone A · Entrance', B: 'Zone B · Workshop', C: 'Zone C · Dock' },
    cam: 'Camera', online: 'Online', recall: 'Active reminder · Missing helmet', clear: 'No active reminder',
    modes: { sound: 'Sound', light: 'Visual', both: 'Sound and visual', none: 'None' },
    sent: (z, m) => `Signal tested · ${z} · ${m}`,
    nosig: z => `${z} · no signal configured`,
    recv: 'Signal received · Zone B · Missing helmet',
    exp: 'Demo: no file is created',
    run: 'In progress', done: 'Closed', close: 'Close', reopen: 'Reopen'
  }
};

// 4 caméras réparties sur 3 zones
const CAMS = {
  c1: { zone: 'A', n: 1, recall: false },
  c2: { zone: 'B', n: 2, recall: true },
  c3: { zone: 'B', n: 3, recall: false },
  c4: { zone: 'C', n: 4, recall: false }
};

export function initProof({ root, getLang = () => 'fr' }){
  const $ = s => root.querySelector(s), $$ = s => [...root.querySelectorAll(s)];
  const t = () => TXT[getLang()] || TXT.fr;
  const toast = $('.dx-toast'), cams = $$('.dx-cam'), zones = $$('.dx-z'), tabs = $$('.dx-tabs button'), panes = $$('.dx-pane');
  let cur = 'c2', toastTimer = 0, lastToast = null;

  function showToast(fn, kind = 'ok'){
    lastToast = fn;
    $('#dxToastTxt').textContent = fn();
    toast.dataset.kind = kind;
    toast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('on'), 3200);
  }

  function select(id){
    cur = id;
    const c = CAMS[id], L = t();
    cams.forEach(p => p.classList.toggle('sel', p.dataset.cam === id));
    zones.forEach(z => z.classList.toggle('sel', z.dataset.zone === c.zone));
    $('#dxCam').textContent = `${L.cam} ${String(c.n).padStart(2, '0')} · ${L.online}`;
    $('#dxZone').textContent = L.zones[c.zone];
    $('#dxIssue').textContent = c.recall ? L.recall : L.clear;
    $('.dx-side').dataset.alert = c.recall ? '1' : '0';
  }

  function tab(name){
    tabs.forEach(b => { const on = b.dataset.tab === name; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    panes.forEach(p => p.classList.toggle('on', p.dataset.pane === name));
  }

  // plan d'actions : clôturer / rouvrir une action (démo, rien n'est enregistré)
  const rows = $$('.dx-plan tbody tr');
  function paintPlan(){
    const L = t(); let done = 0;
    rows.forEach(r => {
      const d = r.dataset.done === '1'; done += d;
      const chip = r.querySelector('.dx-chip');
      chip.textContent = d ? L.done : L.run; chip.className = 'dx-chip ' + (d ? 'done' : 'run');
      r.querySelector('.dx-tog').textContent = d ? L.reopen : L.close;
    });
    $('#dxOpen').textContent = rows.length - done; $('#dxClosed').textContent = done;
  }
  rows.forEach(r => r.querySelector('.dx-tog').addEventListener('click', () => { r.dataset.done = r.dataset.done === '1' ? '0' : '1'; paintPlan(); }));

  const activate = (el, fn) => {
    el.addEventListener('click', e => { e.stopPropagation(); fn(); });
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); fn(); } });
  };
  tabs.forEach(b => b.addEventListener('click', () => tab(b.dataset.tab)));
  cams.forEach(p => activate(p, () => select(p.dataset.cam)));
  zones.forEach(z => activate(z, () => select(z.dataset.first)));
  $$('.dx-test').forEach(b => b.addEventListener('click', () => {
    const row = b.closest('tr'), z = row.dataset.zone, mode = row.querySelector('select').value;
    row.classList.remove('ping'); void row.offsetWidth; row.classList.add('ping');
    showToast(() => mode === 'none' ? t().nosig(t().zones[z]) : t().sent(t().zones[z], t().modes[mode]));
  }));
  $('#dxExport').addEventListener('click', () => showToast(() => t().exp));
  select(cur); paintPlan();

  return {
    refresh(){ select(cur); paintPlan(); if (lastToast && toast.classList.contains('on')) $('#dxToastTxt').textContent = lastToast(); },
    // appelé quand l'impulsion 3D part vers l'écran : le signal anonyme « arrive » sur le poste
    pulse(){
      const p = cams.find(x => x.dataset.cam === 'c2');
      if (p){ p.classList.remove('hit'); void p.getBoundingClientRect(); p.classList.add('hit'); }
      showToast(() => t().recv, 'alert');
    }
  };
}
