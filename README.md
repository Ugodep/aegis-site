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
