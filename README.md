# AEGIS Pro Tech — site web

Site statique (HTML / CSS / JS), sans build, sans dépendance en ligne
(Three.js et Lenis sont embarqués dans assets/vendor/).

## Lancer en local
    python3 serve.py 8000       # puis http://localhost:8000  (serveur sans cache)
Un serveur est nécessaire : le modèle 3D est chargé par fetch (file:// ne marche pas).

## Mettre en ligne
Déposer le dossier tel quel sur Netlify Drop / Cloudflare Pages / GitHub Pages.

## Où modifier quoi
- index.html            contenu FR (chaque texte traduisible a un data-i18n="clé")
- assets/js/i18n.js     traductions EN
- assets/css/style.css  design (variables couleurs en haut : --or = orange AEGIS)
- assets/js/main.js     scène 3D, animations, curseur, formulaire
                        TEAM_EMAIL = destinataire du formulaire ; HIDE_PARTS = pièces du CAD masquées
- assets/img/           captures de l'IA (visages floutés), rendus SolidWorks, dashboard
- assets/boitier.glb    boîtier SolidWorks converti (.3MF)

## Rendu « studio hardware » (#solution, hero, #boitier)
Le boîtier flotte dans un fond noir (#050608) avec un halo radial ; palette fidèle au rendu SolidWorks (constante MAT dans main.js),
l'orange AEGIS n'est utilisé que pour la LED (body67406) et le faisceau optique. Éclairage 3 points + ACES (exposition 1.15).
Chorégraphie de #solution : clés KEYS (px, py, rx, ry, s + lf = coque soulevée, fw = cadrage sur la LED, bm = faisceau).
Typographie monumentale : #mega ; cartes glassmorphism : #gYolo (étape 03) et #gBento (étape 04) ; textes FR/EN dans i18n.js.
Debug pose : ?snap&at=solution:.7&rig=px,py,rx,ry,s,lf,fw,bm,al

Mesure du coût de rendu : ajouter ?perf à l'URL (expose window.__perf et window.__aegis : renderer.info, caméra, pièces).

## #preuve : comparateur AVEC / SANS AEGIS
assets/js/proof.js : overlay 2D animé (balayage, bounding boxes EPI, floutage visage, alerte, compteurs) sur les vraies captures yolo-avec.jpg / yolo-sans.jpg. Zones de détection = coordonnées image dans SCN. Textes FR/EN : TXT (proof.js) et i18n.js.
Les captures contiennent déjà les boîtes du prototype : le mode SANS AEGIS les rend illisibles par un flou CSS (.cmp-img).
