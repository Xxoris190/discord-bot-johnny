# Johnny — Bot Discord

Johnny inclut un service **Anime News** qui publie dans un salon Discord uniquement les annonces importantes :

- trailers, teasers et PV ;
- nouvelles saisons et suites ;
- nouveaux anime et adaptations ;
- films anime ;
- dates de sortie ou de diffusion ;
- key visuals et visuels principaux.

Les critiques, récaps, simples previews d'épisodes, jeux vidéo, produits dérivés, classements, rumeurs, openings/endings et clips courts sont filtrés.

## Fonctionnement Anime News

- 9 flux actifs : LiveChart, Toei, PONY CANYON et six chaînes YouTube officielles japonaises. Crunchyroll News FR, MyAnimeList et Anime News Network restent configurés comme secours désactivés, car les activer ensemble crée plusieurs traductions de la même annonce.
- Vérification toutes les 90 secondes par défaut avec timeout et cache HTTP.
- Déduplication par identifiant, URL et similarité du titre sur plusieurs sources.
- État local borné, avec récupération depuis les 100 derniers embeds Discord après un redéploiement Render.
- File de publication avec nouvelle tentative progressive si Discord est temporairement indisponible.
- Le premier lancement mémorise les anciennes entrées sans les publier.
- Toutes les mentions Discord sont désactivées pour le contenu provenant du Web.

Le salon créé est `#anime-news`, placé sous une catégorie contenant `INFORMATION`, `ANNONCES` ou `NEWS` lorsqu'elle existe. Il reprend toutes les règles de visibilité de cette catégorie, devient non bavard pour `@everyone`, et Johnny peut y publier des embeds. Un salon déjà existant est réutilisé sans modifier ses permissions.

## Configuration sûre sur AdoGyaru

Active le **Mode développeur** dans Discord, fais un clic droit sur le serveur **AdoGyaru**, puis copie son identifiant. Ajoute ensuite ces variables dans Render :

```dotenv
ANIME_NEWS_ENABLED=true
ANIME_NEWS_GUILD_ID=IDENTIFIANT_NUMERIQUE_D_ADOGYARU
ANIME_NEWS_EXPECTED_GUILD_NAME=AdoGyaru
ANIME_NEWS_POLL_INTERVAL_MS=90000
ANIME_NEWS_MAX_ITEM_AGE_HOURS=36
```

`ANIME_NEWS_GUILD_ID` est obligatoire. Johnny vérifie aussi que le nom du serveur correspond à `AdoGyaru` avant toute création. Il refuse d'agir si l'ID ou le nom ne correspond pas, afin de ne jamais créer le salon sur le mauvais serveur.

Permissions nécessaires au bot :

- Voir les salons ;
- Gérer les salons, uniquement pour la première création ;
- Envoyer des messages ;
- Intégrer des liens ;
- Voir l'historique des messages.

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
