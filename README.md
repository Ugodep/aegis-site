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
- assets/js/world.js    monde 3D partagé (chantier, ouvriers, boîtier au mur, bureau QSE) + scénario de l'ouvrier
- assets/js/screens.js  écrans dessinés en Canvas 2D (traitement interne du boîtier, dashboard QSE anonyme), bilingues
- assets/js/ppe3d.js    démo interactive de #preuve (utilise world.js)

## Récit 3D de #solution (3 actes, piloté par le scroll)
Les keyframes sont dans main.js (KEYS : KW = caméra dans le monde, KL = caméra dans le repère du boîtier GLB).
Progression u = avancement dans #solution : acte 1 (0 → .35) le terrain, acte 2 (.35 → .70) dans le boîtier, acte 3 (.70 → 1) bureau QSE.
Debug caméra : ?snap&at=solution:.5&l=x,y,z,tx,ty,tz,fov,coque,écran,u   (repère boîtier)   ou   &w=…   (repère monde)
- assets/img/           captures de l'IA (visages floutés), rendus SolidWorks, dashboard
- assets/boitier.glb    boîtier SolidWorks converti (.3MF)
