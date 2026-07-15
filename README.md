# Johnny — Bot Discord

Johnny inclut un service **Anime News** qui publie dans un salon Discord uniquement les annonces importantes :

- trailers, teasers et PV ;
- nouvelles saisons, suites et saisons finales ;
- nouveaux anime et adaptations ;
- films anime ;
- OVA et épisodes spéciaux ;
- dates de sortie ou de diffusion ;
- reports et changements de date ;
- key visuals et visuels principaux.

Les critiques, récaps, simples previews d'épisodes, jeux vidéo, produits dérivés, classements, rumeurs, openings/endings et clips courts sont filtrés.

## Commandes Slash

### 📰 Anime News

| Commande | Description |
|----------|-------------|
| `/animenews latest [nombre]` | Les dernières annonces publiées (jusqu'à 10) |
| `/animenews search <titre>` | Recherche dans les annonces récentes |
| `/animenews status` | État du service : sources, dernier cycle, file d'attente |
| `/animenews sources` | Liste des sources surveillées et leur santé |
| `/animenews check` | Force une vérification immédiate (staff) |
| `/animenews notify` | Active/retire le rôle ping `📰 Anime News` |

Chaque annonce publiée inclut désormais des boutons **▶ Regarder la vidéo** / **📰 Lire l'annonce**, et mentionne le rôle `📰 Anime News` si au moins un membre s'y est inscrit via `/animenews notify`.

### 📺 Anime & Manga (MyAnimeList + AniList)

| Commande | Description |
|----------|-------------|
| `/anime search <titre>` | Fiche complète d'un anime (score, studio, genres, trailer) |
| `/anime season [saison] [annee]` | Les anime d'une saison (défaut : en cours) |
| `/anime top [categorie]` | Top MyAnimeList (airing, upcoming, popularité, favoris) |
| `/anime schedule [jour]` | Planning de diffusion du jour |
| `/anime random` | Un anime au hasard |
| `/anime character <nom>` | Recherche un personnage |
| `/anime next <titre>` | Compte à rebours du prochain épisode (AniList) |
| `/manga search <titre>` | Fiche complète d'un manga |
| `/manga top [categorie]` | Top manga MyAnimeList |

Si l'API Jikan (MyAnimeList) est en panne — ce qui arrive régulièrement — la recherche bascule automatiquement sur AniList.

### 🔧 Utilitaires

`/help` (liste complète), `/ping`, `/serverinfo`, `/userinfo [user]`, `/avatar [user]`.

Les commandes existantes (`/rank`, `/leaderboard`, `/giveaway`, `/reroll`, modération) sont inchangées.

## Fonctionnement Anime News

- 10 flux actifs : LiveChart, Toei, PONY CANYON et sept chaînes YouTube officielles japonaises (dont MAPPA CHANNEL). Crunchyroll News FR/EN, MyAnimeList, Anime News Network et AnimeAnime.jp restent configurés comme secours désactivés, car les activer ensemble crée plusieurs traductions de la même annonce.
- Vérification toutes les 90 secondes par défaut avec timeout et cache HTTP.
- Déduplication par identifiant, URL et similarité du titre sur plusieurs sources.
- État local borné, avec récupération depuis les 100 derniers embeds Discord après un redéploiement Render.
- File de publication avec nouvelle tentative progressive si Discord est temporairement indisponible.
- Le premier lancement mémorise les anciennes entrées sans les publier.
- Toutes les mentions Discord sont désactivées pour le contenu provenant du Web (sauf le rôle ping opt-in).
- Journal des annonces publiées (300 max) pour `/animenews latest` et `/animenews search`.
- Les descriptions YouTube sont nettoyées (liens, hashtags et séparateurs retirés) avant publication.

Le salon créé est `#anime-news`, placé sous une catégorie contenant `INFORMATION`, `ANNONCES` ou `NEWS` lorsqu'elle existe. Il reprend toutes les règles de visibilité de cette catégorie, devient non bavard pour `@everyone`, et Johnny peut y publier des embeds. Un salon déjà existant est réutilisé sans modifier ses permissions.

## Configuration sûre sur AdoGyaru

Le serveur AdoGyaru est ciblé explicitement dans `anime-news-sources.json` avec l'identifiant confirmé `1507001707622563890`. Les variables Render suivantes peuvent toujours remplacer cette configuration :

```dotenv
ANIME_NEWS_ENABLED=true
ANIME_NEWS_GUILD_ID=1507001707622563890
ANIME_NEWS_EXPECTED_GUILD_NAME=AdoGyaru
ANIME_NEWS_POLL_INTERVAL_MS=90000
ANIME_NEWS_MAX_ITEM_AGE_HOURS=36
```

Un identifiant est obligatoire, soit dans le fichier de configuration, soit dans `ANIME_NEWS_GUILD_ID`. Johnny vérifie aussi que le nom du serveur correspond à `AdoGyaru` avant toute création. Il refuse d'agir si l'ID ou le nom ne correspond pas, afin de ne jamais créer le salon sur le mauvais serveur.

Permissions nécessaires au bot :

- Voir les salons ;
- Gérer les salons, uniquement pour la première création ;
- Envoyer des messages ;
- Intégrer des liens ;
- Voir l'historique des messages ;
- Gérer les rôles, pour créer le rôle ping via `/animenews notify` ;
- Mentionner tous les rôles (dans `#anime-news`), pour que le ping notifie réellement — sinon Johnny publie sans mention.

La permission Administrateur n'est pas nécessaire. Après le premier démarrage, l'identifiant du salon affiché dans les logs peut être ajouté pour renforcer encore le ciblage :

```dotenv
ANIME_NEWS_CHANNEL_ID=IDENTIFIANT_DU_SALON_CREE
```

Un redémarrage ou un nouveau déploiement suffit ensuite. Johnny crée ou réutilise le salon de façon idempotente, publie un message d'accueil, initialise son historique, puis commence la surveillance.

## Installation locale

Prérequis : Node.js `>=20.18.1`.

```powershell
Copy-Item .env.example .env
npm ci
npm test
npm run check:anime-news
npm start
```

Renseigne `DISCORD_TOKEN` uniquement dans `.env` ou dans les variables secrètes Render. Ne colle jamais le token dans Discord, GitHub, un ticket ou un message.

`npm run check:anime-news` teste les flux et le filtre sans se connecter à Discord. Le fichier [anime-news-sources.json](./anime-news-sources.json) permet d'activer ou désactiver une source et d'ajuster les mots personnalisés.

## Variables facultatives

```dotenv
ANIME_NEWS_CHANNEL_NAME=anime-news
ANIME_NEWS_CHANNEL_ID=
ANIME_NEWS_CATEGORY_ID=
ANIME_NEWS_CONFIG_PATH=./anime-news-sources.json
ANIME_NEWS_STATE_PATH=./.data/anime-news-state.json
```

Pour couper la fonctionnalité sans modifier le code :

```dotenv
ANIME_NEWS_ENABLED=false
```

Le bot ne télécharge ni ne republie les vidéos ou les articles : il envoie un résumé court, une image lorsqu'elle est fournie par le flux et le lien vers la source.
