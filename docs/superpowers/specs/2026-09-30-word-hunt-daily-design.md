# Word Hunt Daily — Design

**Date:** 2026-09-30
**Statut:** Approuvé par l'utilisateur (design), en attente de plan d'implémentation

## Problème

Le plan original ("1 appli/jour publiée et vendue" sur les stores, via `game-factory`
en Expo natif) est bloqué : Apple Developer (99$/an), Google Play Console (25$),
et un compte Expo/EAS sont tous requis pour publier quoi que ce soit, et aucun
n'existe. Cette version contourne entièrement le blocage : une appli web (PWA)
quotidienne, hébergée gratuitement, sans aucun compte store.

## Portée

- Nouveau projet `~/Projects/word-hunt-daily`, repo GitHub public séparé de
  `game-factory` (architectures trop différentes : Expo natif vs page statique).
- Réutilise tel quel `templates/word-search/lib/wordsearch.js` de `game-factory`
  (génération de grille + détection de sélection, seedée par date, déjà testé —
  15 tests dans `templates/word-search/lib/wordsearch.test.js`) : copié dans ce
  nouveau repo, pas de lien de dépendance entre les deux repos.
- Hors scope v1 : monétisation (AdSense nécessite un site avec du trafic avant
  approbation — prématuré), autres familles de jeu (match-3 etc., prévues dans
  `game-factory` mais pas ici), compte utilisateur/scores sauvegardés.

## Architecture

**Génération** : un script Node (`scripts/generate-daily-puzzle.js`) réutilisant
`lib/wordsearch.js`, génère la grille du jour (seed = date du jour), écrit
`docs/data/puzzle.json`.

**Page jouable** : `docs/index.html` + `docs/app.js` (JS vanilla, sans framework —
même approche que `access-guide-app/web/` et `nearby-link-share`) : affiche la
grille, gère la sélection tactile/souris (glisser d'une lettre à l'autre),
liste des mots à trouver avec état trouvé/à trouver, message de victoire.
`docs/manifest.webmanifest` + `docs/sw.js` pour l'installabilité PWA (mêmes
fichiers que les 2 projets existants, adaptés).

**Déclenchement quotidien** : GitHub Actions (`.github/workflows/daily-puzzle.yml`),
`schedule: cron` quotidien. Le job : génère le puzzle du jour → commit
`docs/data/puzzle.json` → push sur `main`. GitHub Pages (configuré pour servir
`/docs` sur `main`) redéploie automatiquement à chaque push — aucune dépendance
au Mac local, tourne même éteint. Gratuit et illimité sur un repo public.

**Hébergement** : GitHub Pages, `https://timarsicoper01210-arch.github.io/word-hunt-daily/`.

## Flux de données

```
GitHub Actions (cron quotidien, ex: 06:00 UTC)
  → node scripts/generate-daily-puzzle.js
      → lib/wordsearch.js: generateGrid({ words, size, seed: <date>, directions })
      → écrit docs/data/puzzle.json { date, grid, solutionPlacements, words }
  → git commit + push (le workflow a besoin de la permission contents:write)
  → GitHub Pages redéploie automatiquement depuis /docs
```

Le navigateur du joueur charge `docs/app.js`, qui lit `docs/data/puzzle.json`
au chargement de la page et rend la grille + la liste de mots — logique de
sélection identique à celle déjà conçue pour `game-factory` (`checkSelection`
par comparaison des points de départ/arrivée, robuste à un tracé tactile
imprécis — décision déjà validée dans la review finale de `game-factory`).

## Gestion des erreurs

- **Le générateur échoue** (ex : banque de mots insuffisante pour la grille,
  même garde-fou que `game-factory` : moins de la moitié des mots placés →
  erreur explicite) : le workflow GitHub Actions échoue visiblement (email de
  notification GitHub par défaut), **ne commite rien** — la page continue de
  servir le puzzle de la veille plutôt qu'une page cassée ou vide.
- **Le commit/push échoue** (conflit rare avec un commit manuel entre-temps) :
  le job échoue, notification GitHub, même comportement — la veille reste en
  ligne.
- **JS désactivé ou navigateur très ancien côté joueur** : `docs/index.html`
  contient un message de repli statique ("Active JavaScript pour jouer").

## Tests

- La logique de génération/sélection est déjà testée (15 tests portés tels
  quels depuis `game-factory`) — aucun nouveau test à écrire pour cette partie.
- `generate-daily-puzzle.js` (le script d'intégration qui écrit le fichier) :
  test simple vérifiant qu'il écrit un `puzzle.json` valide et déterministe
  pour une date donnée (même esprit que les tests `generate-daily-game.test.js`
  de `game-factory`).
- Pas de test automatisé sur le rendu DOM/l'interaction tactile réelle
  (nécessite un navigateur réel) — vérification manuelle avant le premier
  déploiement, comme pour les parties natives caméra/GPS des autres projets.
- Le workflow GitHub Actions lui-même : vérifié par un déclenchement manuel
  (`workflow_dispatch`) avant de compter sur le cron, pour confirmer qu'il
  génère, commite et déploie correctement de bout en bout.
