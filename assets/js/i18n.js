// FR (défaut, lu depuis le HTML) / EN
const EN = {
  'tag.shell':'Shell · 3D printed (PLA)','tag.board':'Raspberry Pi 5 + cooling','tag.base':'Vented base plate',
  'nav.constat':'The problem','nav.solution':'Solution','nav.boitier':'The device','nav.preuve':'Proof','nav.ethique':'Ethics','nav.equipe':'Team',
  'cta.demo':'Request a demo','cta.how':'How it works',
  'hero.k':'BAB2 project · Faculty of Engineering, Mons · 2026',
  'hero.h1':'<span class="ln"><span>AI that protects</span></span><span class="ln"><span class="or">without watching</span></span>',
  'hero.p':'AEGIS installs directly on the <b>cameras already in place</b> on your industrial sites and construction projects. No new infrastructure, no spying: just a local artificial intelligence that detects missing protective equipment (PPE) and prevents accidents in real time.',
  'hero.t1':'Plug &amp; Play AI box','hero.t2':'Instant PPE detection (helmets, gloves…)','hero.t3':'100% anonymous alerts',
  'st.1':'WORKING PROTOTYPE',
  'fact.1':'workplace accidents in Belgium in 2024<small>Source: FEDRIS</small>','fact.2':'average cost of a single serious accident','fact.3':'field meetings with plants and construction sites',
  'tp.1':'OUR MISSION: ERADICATE THESE NUMBERS','tp.2':'ZERO ACCIDENTS','tp.3':'PREVENTION, NOT PUNISHMENT',
  'tp.1b':'OUR MISSION: ERADICATE THESE NUMBERS','tp.2b':'ZERO ACCIDENTS','tp.3b':'PREVENTION, NOT PUNISHMENT',
  'man.k':'Our idea in one sentence','man.t':'The camera was already there. We simply add the AI.','man.s':'No spying. No image storage. No punishment. Just prevention, at the exact moment it matters.',
  'constat.k':'The problem','constat.h':'Safety can\'t be everywhere at once.','constat.p':'We spoke with dozens of prevention advisors and plant managers. The finding is unanimous.',
  'c1.t':'workplace accidents in Belgium in 2024','c1.p':'Private and public sectors combined. Source: FEDRIS, 2024 annual report.',
  'c2.t':'the average cost of a single serious accident','c2.p':'Up to €400,000 depending on the site, not counting the impact on insurance premiums.',
  'c3.t':'to watch over by sampling','c3.p':'On a 45-hectare site, a safety advisor simply can\'t see everything. And habit breeds danger: PPE is forgotten through inattention, during finishing phases or routine work.',
  'cost.h':'The cost of an accident','cost.1':'Financial','cost.1a':'Soaring insurance premiums','cost.1b':'High medical costs','cost.1c':'Heavy legal fees',
  'cost.2':'Operational','cost.2a':'Immediate production stoppages','cost.2b':'Disrupted logistics flows','cost.3':'Human &amp; social','cost.3a':'Trauma','cost.3b':'Damage to brand image',
  'ter.k':'In the field','ter.h':'We asked questions first. More than twenty times.','ter.p':'More than 20 field meetings (YARA, INEOS, BPC…) drove three pivots. Here is what we heard, and what we changed.',
  'pv1.k':'Hardware','pv1.a':'Refusal of new cameras','pv1.b':'Plug &amp; Play: the box plugs into the existing cameras.',
  'pv2.k':'Management tool','pv2.a':'An alert alone isn\'t enough','pv2.b':'A statistics dashboard for HSE teams.',
  'pv3.k':'Legal pivot','pv3.a':'Union pushback: GDPR, CBA 68 and the European AI Act.','pv3.b':'Local AI: no image is stored or sent anywhere.',
  'ter.n':'Met in the field:','ter.a':'Of the first six companies we called, one flatly refused, opposed to any monitoring of workers. That is why anonymity is at the core of the product.',
  'sol.k':'How it works','sol.h':'Prevention, not punishment.',
  's1.t':'Plug &amp; Play connection','s1.p':'Our box connects directly to your existing cameras. No heavy new installation is required.',
  's2.t':'Real-time AI detection','s2.p':'The AI analyses the video stream locally (Edge Computing). It instantly detects missing PPE: helmet, glasses, gloves, vest, harness…',
  's3.t':'Local, caring alert','s3.p':'A neutral sound or light signal alerts the worker concerned directly. The goal is to correct behaviour immediately, on the spot.',
  's4.t':'Anonymous statistical reports','s4.p':'The system generates statistics (e.g. "Zone B, 10:15, missing PPE"). This data lets HSE teams target their training, without pointing fingers.',
  'rp.t':'Dashboard · daily overview','rp.ex':'prototype screenshot','rp.f':'No identity · no image · statistics only',
  'hw.k':'The device','hw.h':'Designed in SolidWorks, 3D printed, ready for the field.','hw.p':'Rotate it, explode it: this is our actual CAD model.',
  'hw.ex':'Exploded view','hw.as':'Assemble','hw.reset':'Reset','hw.drag':'← DRAG TO ROTATE →',
  'fig.1':'Wall mounting · SolidWorks render','fig.2':'Under the hood · SolidWorks cut-away',
  'sp.h':'Hardware','sp.1k':'Compute','sp.1v':'Raspberry Pi 5 + added cooling module','sp.2k':'Vision','sp.2v':'Infrared camera',
  'sp.3k':'Power','sp.3v':'PoE splitter: a single network cable is enough','sp.4k':'Housing','sp.4v':'3D printed (PLA), wall mount, modular components',
  'sp.5k':'Alert','sp.5v':'Sound and light signal, local and neutral',
  'sw.h':'Software','sw.1k':'Local server','sw.1v':'Everything runs inside the box','sw.2k':'YOLO AI','sw.2v':'Video processing, PPE item by PPE item','sw.3k':'Web interface','sw.3v':'Display and storage of statistical data',
  'pr.k':'Proof','pr.h':'It sees the equipment. Never the face.','pr.p':'3D simulation of what the box perceives: objects and situations, not identities. Watch what happens when a worker takes off their helmet.',
  'pr.real.h':'And here is the real output of our prototype.','pr.real.p':'Two captures from our prototype, untouched except the face, blurred for this page.',
  'seg.on':'WITH AEGIS','seg.off':'WITHOUT AEGIS','seg.note':'Without AEGIS: the omission goes unnoticed.',
  'demo.local':'100% LOCAL PROCESSING','demo.sim':'ILLUSTRATIVE 3D SIMULATION','demo.alert':'LOCAL SIGNAL TRIGGERED',
  'demo.s1':'People analysed','demo.s2':'PPE compliant','demo.s3':'Local alerts','demo.s4':'Images stored',
  'pr.b1':'WITH PPE','pr.b2':'WITHOUT PPE','pr.1t':'Helmet and gloves recognised.','pr.1p':'Each box is a detected object, with its confidence level.',
  'pr.2t':'No helmet, no gloves.','pr.2p':'That gap triggers the sound or light signal, right on site.',
  'pr.a':'In the product, the goal is to detect only objects (PPE) and situations, never to identify a person.',
  'cas.k':'Where AEGIS excels','cas.h':'Where human rounds are no longer enough.',
  'cas1.tag':'SEVESO · CHEMICALS · STEELWORKS','cas1.t':'Industrial sites &amp; plants','cas1.p':'Secure your high-risk areas and multi-contractor operations with continuous vigilance.',
  'cas2.tag':'CRITICAL PHASES','cas2.t':'Construction sites','cas2.p':'Keep your teams and subcontractors alert, even during finishing phases or work at height, where a feeling of safety lowers the guard.',
  'vs.h':'Existing solutions','vs.c1':'Human rounds','vs.c2':'Conventional cameras','vs.c3':'Drones / robots',
  'vs.r1':'Approach','vs.a1':'Passive','vs.a2':'Limited','vs.a3':'Intrusive','vs.a4':'Preventive',
  'vs.r2':'Real time','vs.r3':'Respects privacy','vs.r4':'Reuses what exists','vs.n':'The verdict: no real-time prevention in the field. AEGIS team assessment.',
  'roi.k':'Return on investment','roi.h':'Safety is not a cost, it\'s an investment.','roi.p':'Reduce the direct and indirect costs of workplace accidents and optimise your insurance premiums.',
  'cmp.1':'Cost of inaction · yearly estimate','cmp.1a':'Direct costs (accidents &amp; care)','cmp.1b':'Production stoppages and extended sick leave','cmp.1c':'Higher insurance premiums',
  'cmp.2':'AEGIS investment · industrial pack of 10 boxes','cmp.2a':'€20,000 installation','cmp.2b':'€1,500 / month subscription','cmp.2c':'24/7 maintenance &amp; support',
  'cmp.note':'AEGIS team estimate, first year. The yearly subscription is largely covered by avoiding a single lost-time accident.',
  'b1.t':'Fewer accidents','b1.p':'By preventing risky behaviour in real time, you drastically reduce minor accidents and sick leave.',
  'b2.t':'Impact on insurance','b2.p':'Your premiums are based on your past claims record. Fewer accidents = lower premiums.',
  'b3.t':'HSE time savings','b3.p':'Free your prevention advisors from repetitive checks so they can focus on analysis and education.',
  'b4.t':'"Radar effect"','b4.p':'The mere presence of the system improves behaviour naturally, even before the first alert.',
  'eth.k':'Ethics &amp; acceptability','eth.h':'Zero personal data. Privacy by Design.','eth.p':'AEGIS was designed to be accepted by operators and to fit smoothly into social dialogue (works councils, unions): GDPR, CBA 68 and the European AI Act shaped its design.',
  'pipe.1':'Existing camera','pipe.2':'AEGIS box: local analysis','pipe.3':'Anonymous statistics',
  'p1.t':'No image storage','p1.p':'The video stream is analysed live by the box; no image is ever sent to the cloud.',
  'p2.t':'No facial recognition','p2.p':'The AI detects objects (PPE) and situations, not identities.',
  'p3.t':'A statistical tool, not a disciplinary one','p3.p':'Reports sent to management are 100% anonymised: "at 10:15, zone B, a worker had no helmet". AEGIS cannot identify or sanction an individual.',
  'eco.k':'Eco-responsible','eco.h':'A high-performance solution, and a frugal one.',
  'eco1.t':'Upcycling','eco1.p':'We build on what exists: the box plugs into your cameras. No superfluous hardware, less electronic waste.',
  'eco2.t':'Digital sobriety','eco2.p':'The AI runs locally: zero video streams in the cloud, and massive energy savings on the server side.',
  'eco3.t':'Eco-design','eco3.p':'Built to last: modular interchangeable components, repairability, extended life cycle and easy maintenance.',
  'road.k':'What\'s next','road.h':'Winning the market, one pilot at a time.',
  'r1.k':'STEP 1 · "ZERO RISK" PILOT','r1.t':'A test box, free for a month','r1.p':'Installed on a critical area. No financial risk for the customer, plus a report on the "near-misses" avoided.','r1.g':'Goal: 6 committed customers (LOI)',
  'r2.k':'STEP 2 · PROOF BY DATA','r2.t':'From pilot to contract','r2.p':'We turn pilot tests into contracts, backed by figures.','r2.g':'Goal: prove profitability',
  'r3.k':'STEP 3 · ROLLOUT','r3.t':'Backed by the federations','r3.p':'Essenscia, Embuild: the sector federations help us roll out across industrial sites.','r3.g':'Goal: the Belgian market',
  'v1.k':'IN 6 MONTHS','v1.t':'The launch','v1.p':'In real conditions: dust, rain, night. Key sites: YARA Tertre, Thy-Marcinelle.',
  'v2.k':'BY 2035','v2.t':'The expansion','v2.p':'Become a safety label and equip 20% of Belgian Seveso sites (80 sites).',
  'v3.k':'LONG TERM','v3.t':'Predictive AI','v3.p':'Trajectory analysis, collision prevention, detection of falls and dangerous behaviour.',
  'road.a':'What slows us down: training the AI takes time, data and computing power.',
  'team.k':'The team','team.h':'Nine engineering students, one obsession: zero accidents.','team.p':'Faculty of Engineering of Mons (UMONS), class of 2026. United by the will to save lives and make tomorrow\'s workplaces safer.',
  'team.p1':'Business &amp; strategy','team.p2':'R&amp;D &amp; engineering','path.h':'Right now',
  'path.p':'Start-Tech grand final (IGNITY) · Mind &amp; Market (CLICK) · Start U Cup (UMONS) · Start Cup (EUNICE) · student-entrepreneur status · fundraising.','team.sup':'Supported by',
  'faq.k':'Questions','faq.h':'What we get asked.',
  'q1':'Do we need to change our cameras?','a1':'No. The box taps the feed of your conventional cameras already installed. It\'s Plug &amp; Play.',
  'q2':'Are images stored?','a2':'No. The stream is analysed live inside the box. No image is stored or sent to the cloud.',
  'q3':'Can a worker be identified or sanctioned?','a3':'No. There is no facial recognition and reports are 100% anonymous. AEGIS is a statistical tool, not a disciplinary one.',
  'q4':'Which equipment is detected?','a4':'Helmet, glasses, gloves, vest, harness… depending on your risk areas and the on-site calibration.',
  'q5':'How do we get started?','a5':'Fill in the contact form: we\'ll organise a demo or a free one-month pilot on a critical area of your site.',
  'ct.h':'<span class="ln"><span>Ready to aim for</span></span><span class="ln"><span class="or">zero accidents?</span></span>','ct.p':'Let\'s talk about your safety challenges. Fill in the form and we\'ll get back to you to organise a demo or a pilot test on your site.',
  'f.name':'NAME *','f.co':'COMPANY','f.send':'Send request','f.fine':'By submitting this form, your email client will open with the details pre-filled.',
  'foot':'© 2026 AEGIS PRO TECH — Faculty of Engineering of Mons (UMONS). All rights reserved.'
};
const HUD = {
  fr:['FLUX CAMÉRA → BOÎTIER','INFÉRENCE IA · 100 % LOCALE','SIGNAL LOCAL · SUR LE TERRAIN','RAPPORTS ANONYMES'],
  en:['CAMERA FEED → BOX','AI INFERENCE · 100% LOCAL','LOCAL SIGNAL · ON SITE','ANONYMOUS REPORTS']
};
const MSG = {
  fr:{ok:'Votre messagerie s\'ouvre avec le message pré-rempli. Merci !',err:'Merci de renseigner votre nom et un email valide.'},
  en:{ok:'Your email client is opening with the message pre-filled. Thank you!',err:'Please enter your name and a valid email.'}
};
let lang = 'fr';
const subs = [];
export const getLang = () => lang;
export const hud = i => HUD[lang][i];
export const msg = k => MSG[lang][k];
export const onLang = fn => subs.push(fn);

export function initI18n(){
  const els = [...document.querySelectorAll('[data-i18n]')];
  els.forEach(el => { el.dataset.fr = el.innerHTML; });
  const btn = document.getElementById('lang');
  function apply(l){
    lang = l;
    document.documentElement.lang = l;
    els.forEach(el => {
      const v = l === 'fr' ? el.dataset.fr : EN[el.dataset.i18n];
      if (v !== undefined) el.innerHTML = v;
    });
    btn.querySelectorAll('span').forEach((s, i) => s.classList.toggle('on', (i === 0) === (l === 'fr')));
    document.title = l === 'fr' ? 'AEGIS Pro Tech — L\'IA qui protège sans surveiller' : 'AEGIS Pro Tech — AI that protects without watching';
    try { localStorage.setItem('aegis-lang', l); } catch(e){}
    subs.forEach(f => f(l));
  }
  btn.addEventListener('click', () => apply(lang === 'fr' ? 'en' : 'fr'));
  let saved = null; try { saved = localStorage.getItem('aegis-lang'); } catch(e){}
  if (saved === 'en') apply('en');
}
