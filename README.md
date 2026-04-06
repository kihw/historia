# Historia

Historia est un jeu de grande stratégie historique **déterministe** avec une couche narrative pilotée par LLM.
Le dépôt est un monorepo TypeScript (Turborepo) avec :

- une app web Next.js (`apps/web`),
- une API Fastify + WebSocket (`apps/server`),
- un moteur de simulation (`packages/engine`),
- des types/contrats partagés (`packages/shared`),
- une couche LLM (OpenRouter/Ollama) (`packages/llm`).

---

## Sommaire

- [1) Vision du projet](#1-vision-du-projet)
- [2) Architecture du monorepo](#2-architecture-du-monorepo)
- [3) Stack technique](#3-stack-technique)
- [4) Démarrage rapide](#4-démarrage-rapide)
- [5) Configuration](#5-configuration)
- [6) Commandes utiles](#6-commandes-utiles)
- [7) Fonctionnalités gameplay](#7-fonctionnalités-gameplay)
- [8) API HTTP (référence)](#8-api-http-référence)
- [9) Événements WebSocket (multijoueur)](#9-événements-websocket-multijoueur)
- [10) Persistance des données](#10-persistance-des-données)
- [11) Modélisation du domaine](#11-modélisation-du-domaine)
- [12) Internationalisation](#12-internationalisation)
- [13) Outils de génération de cartes/scénarios](#13-outils-de-génération-de-cartesscénarios)
- [14) Qualité, tests et déterminisme](#14-qualité-tests-et-déterminisme)
- [15) Limites actuelles et roadmap suggérée](#15-limites-actuelles-et-roadmap-suggérée)
- [16) Dépannage](#16-dépannage)
- [17) Guide de contribution](#17-guide-de-contribution)

---

## 1) Vision du projet

Historia combine deux couches :

1. **Simulation déterministe** (économie, diplomatie, militaire, etc.) pour garantir la cohérence mécanique.
2. **Narration IA** pour transformer des faits mécaniques en chroniques lisibles et immersives.

Le serveur résout les tours, conserve l’état, et expose une API consommée par l’interface web. Le multijoueur temps-réel passe par Socket.IO.

---

## 2) Architecture du monorepo

```text
.
├─ apps/
│  ├─ web/                 # Frontend Next.js
│  └─ server/              # API Fastify + Socket.IO
├─ packages/
│  ├─ engine/              # Moteur de simulation
│  ├─ shared/              # Types, schémas, utilitaires
│  └─ llm/                 # Providers LLM + pipelines de prompts
├─ scenarios/templates/    # Scénarios JSON jouables
├─ data/geo/               # Données géographiques (GeoJSON/TopoJSON)
├─ saves/                  # Sauvegardes de parties
└─ tools/                  # Scripts utilitaires
```

### Responsabilités par package

- **`@historia/shared`** : contrats de types du jeu, validation de scénarios, constantes communes.
- **`@historia/engine`** : logique de tour et systèmes (économie, militaire, diplomatie, etc.).
- **`@historia/llm`** : parse commandes texte → actions + génération narrative.
- **`@historia/server`** : orchestration API, persistance, fog-of-war, sessions multijoueur.
- **`@historia/web`** : expérience joueur (lobby, carte, écran de jeu, éditeur, réglages).

---

## 3) Stack technique

- **Runtime** : Node.js ≥ 20
- **Langage** : TypeScript
- **Orchestration monorepo** : Turborepo
- **Frontend** : Next.js 15, React 19, Zustand, Pixi.js
- **Backend** : Fastify 5, Socket.IO
- **Validation** : Zod
- **LLM** : OpenRouter (cloud) ou Ollama (local)

---

## 4) Démarrage rapide

### Prérequis

- Node.js 20+
- npm (workspace activé)

### Installation

```bash
npm install
```

### Lancer en développement (tous les packages)

```bash
npm run dev
```

Par défaut :

- Frontend: `http://localhost:3000`
- API serveur: `http://localhost:4000`

### Vérifier la santé serveur

```bash
curl http://localhost:4000/health
```

---

## 5) Configuration

### Variables côté serveur

- `PORT` (défaut `4000`)
- `HOST` (défaut `0.0.0.0`)
- `CORS_ORIGIN` (défaut `*`)

### Configuration LLM par variables d’environnement

Le serveur choisit automatiquement un provider au démarrage :

1. `OPENROUTER_API_KEY` (prioritaire)
   - optionnel: `OPENROUTER_MODEL`
2. sinon `OLLAMA_HOST`
   - optionnel: `OLLAMA_MODEL`

Exemple OpenRouter :

```bash
export OPENROUTER_API_KEY="..."
export OPENROUTER_MODEL="openai/gpt-4o-mini"
```

Exemple Ollama :

```bash
export OLLAMA_HOST="http://localhost:11434"
export OLLAMA_MODEL="llama3.1"
```

> Astuce : l’UI `/settings` permet aussi de configurer dynamiquement le provider (BYOK) via l’API.

### Variables côté frontend

- `NEXT_PUBLIC_API_URL` (défaut `http://localhost:4000/api`)

---

## 6) Commandes utiles

Au niveau racine :

```bash
npm run dev
npm run build
npm run test
npm run lint
npm run type-check
npm run clean
```

Scripts ciblés possibles, ex. :

```bash
npm run -w @historia/server dev
npm run -w @historia/web dev
npm run -w @historia/engine test
```

---

## 7) Fonctionnalités gameplay

- Création de partie depuis un scénario.
- Tours avec accumulation d’actions par nation.
- Résolution déterministe via le moteur.
- Brouillard de guerre côté API (`nationId` → état filtré).
- Historique de tours + narration.
- Conseil stratégique IA (`/advice`).
- Chat diplomatique IA entre dirigeants.
- Mode multijoueur via sockets (lobby, choix nation, ready/start, timer de tour).

---

## 8) API HTTP (référence)

Base URL: `http://localhost:4000/api`

### Santé

- `GET /health`

### LLM

- `GET /llm/status`
- `POST /llm/configure`
- `POST /llm/test`

### Scénarios

- `GET /scenarios`
- `GET /scenarios/:id`
- `POST /scenarios`
- `POST /scenarios/:id/duplicate`
- `DELETE /scenarios/:id`

### Pays

- `GET /countries`

### Parties

- `GET /games`
- `GET /games/:id?nationId=...`
- `POST /games`
- `PATCH /games/:id/settings`
- `DELETE /games/:id`

### Commandes et tours

- `POST /games/:id/command`
- `POST /games/:id/turn`
- `GET /games/:id/history`

### Assistance et diplomatie

- `POST /games/:id/advice`
- `GET /games/:id/diplomacy/chat?nationA=...&nationB=...`
- `POST /games/:id/diplomacy/chat`

### Exemple: créer une partie

```bash
curl -X POST http://localhost:4000/api/games \
  -H "Content-Type: application/json" \
  -d '{"scenarioId":"ww2-1939","nationId":"FRA"}'
```

---

## 9) Événements WebSocket (multijoueur)

Connexion Socket.IO sur le serveur API (`http://localhost:4000`).

Principaux événements client → serveur :

- `game:join`
- `game:leave`
- `game:pick_nation`
- `game:ready` / `game:unready`
- `game:start`
- `turn:submit`
- `turn:timer_config`
- `chat:message`

Principaux événements serveur → client :

- `player:joined` / `player:left`
- `game:room_update`
- `player:picked_nation`
- `game:started`
- `turn:player_ready`
- `turn:resolving`
- `turn:resolved`
- `turn:timer_tick` / `turn:timer_expired`
- `chat:message`
- `game:error`

---

## 10) Persistance des données

- Les parties sont persistées dans le dossier `saves/`.
- Les scénarios personnalisés sont stockés dans `scenarios/templates/`.
- Les rooms multijoueur sont en mémoire (perdues après redémarrage serveur).

Le backend recharge les sauvegardes au lancement pour restaurer la liste des parties.

---

## 11) Modélisation du domaine

Les types principaux sont centralisés dans `packages/shared/src/types/` :

- `game-state.ts` : état global de partie
- `nation.ts` : nations, économie, militaire, diplomatie
- `actions.ts` : actions joueur/IA
- `events.ts` : événements moteur + narratifs
- `scenario.ts` : structure de scénario
- `multiplayer.ts` : contrats socket/room

La validation de scénario est gérée via Zod (`validation/scenario-schema.ts`).

---

## 12) Internationalisation

Le frontend est bilingue (au minimum FR/EN) via le module local `src/i18n`.

Fichiers de traductions :

- `apps/web/src/i18n/locales/fr.json`
- `apps/web/src/i18n/locales/en.json`

---

## 13) Outils de génération de cartes/scénarios

Scripts disponibles dans `tools/` et `tools/geo/` pour préparer des données historiques.
Exemples :

- `tools/fill-scenarios.ts`
- `tools/geo/download-historical-maps.ts`
- `tools/geo/generate-scenario.ts`

Ces scripts aident à enrichir les datasets, mais ne sont pas nécessaires pour jouer en local avec les scénarios existants.

---

## 14) Qualité, tests et déterminisme

- Les packages ont des tests Vitest (`packages/engine/__tests__`, `packages/shared/src/utils/determinism.test.ts`).
- Le moteur vise des résolutions reproductibles à seed égal.
- Les tâches `type-check` et `test` sont orchestrées par Turborepo.

Recommandation CI minimale :

```bash
npm run type-check
npm run test
npm run build
```

---

## 15) Limites actuelles et roadmap suggérée

### Limites observables

- Persistance multijoueur (lobby/rooms) uniquement mémoire.
- Présence de `docker-compose.yml` PostgreSQL/Redis sans intégration backend active visible à ce stade.
- Validation/normalisation API non homogène sur tous les endpoints.

### Roadmap suggérée

1. Brancher stockage persistant (Postgres) pour parties/rooms/chat.
2. Ajouter authentification joueur et reprise de session fiable.
3. Ajouter OpenAPI/Swagger généré automatiquement.
4. Stabiliser un protocole d’événements versionné côté Socket.
5. Renforcer couverture de tests d’intégration backend.

---

## 16) Dépannage

### Le frontend ne parle pas au backend

- Vérifier `NEXT_PUBLIC_API_URL`.
- Vérifier CORS (`CORS_ORIGIN`).
- Vérifier que `apps/server` tourne bien sur le port attendu.

### Le LLM ne répond pas

- Vérifier `/api/llm/status`.
- Tester `/api/llm/test`.
- OpenRouter : clé API valide.
- Ollama : service local démarré (`ollama serve`) et modèle téléchargé.

### Les tours semblent “vides”

Sans provider LLM, le jeu continue à fonctionner mais la narration se limite aux événements mécaniques.

---

## 17) Guide de contribution

1. Créer une branche feature.
2. Ajouter tests/unités si vous touchez le moteur ou les contrats.
3. Vérifier `npm run type-check && npm run test`.
4. Ouvrir une PR avec :
   - contexte,
   - choix techniques,
   - impacts gameplay/API,
   - captures écran si UI.

---

## Licence

Aucune licence explicite n’est définie actuellement dans le dépôt.
Ajoutez un fichier `LICENSE` si vous souhaitez clarifier les droits d’utilisation.
