# Déployer sur Vercel

L'ordre compte. Il y a une dépendance circulaire à casser : **Google et Fitbit
veulent l'URL de ton app, mais tu ne la connais qu'après le premier
déploiement.** On déploie donc une fois « à vide », puis on complète.

Compte 30 minutes.

---

## Étape 0 — Supabase d'abord

Rien ne sert de déployer avant : sans base, l'app affiche une erreur au
chargement. Fais l'étape 2 de [SETUP.md](SETUP.md) (créer le projet, lancer les
deux migrations, désactiver « Confirm email ») et garde sous la main :

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Étape 1 — Premier déploiement

```bash
npm install -g vercel
vercel login          # ouvre ton navigateur
vercel                # depuis la racine du projet
```

Réponds aux questions :

| Question | Réponse |
| --- | --- |
| Set up and deploy? | **Y** |
| Which scope? | ton compte perso |
| Link to existing project? | **N** |
| Project name? | `guild-quest` (ou ce que tu veux) |
| In which directory is your code? | `./` |
| Modify settings? | **N** — `vercel.json` s'en charge |

À la fin, Vercel affiche ton URL :
`https://guild-quest-xxxx.vercel.app`

**Note-la.** L'app affichera encore une erreur : normal, il manque les
variables.

## Étape 2 — Les variables d'environnement

```bash
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
```

Chaque commande demande la valeur puis l'enregistre. Répète pour
`preview` et `development` si tu veux que les branches de test marchent aussi.

Tu peux aussi les coller dans l'interface :
**Project → Settings → Environment Variables**. C'est plus confortable pour
plusieurs valeurs.

> ⚠️ **Les variables `VITE_*` sont intégrées au bundle au moment du build.**
> Les ajouter ne suffit pas — il faut redéployer pour qu'elles prennent effet.
> C'est la cause n°1 de « j'ai mis la variable et ça ne marche toujours pas ».

## Étape 3 — OAuth, maintenant que l'URL existe

Suis [OAUTH.md](OAUTH.md) de bout en bout, en utilisant ton URL Vercel réelle
partout où le guide écrit `TON-APP.vercel.app`.

À la fin tu auras ajouté deux variables de plus :

```bash
vercel env add VITE_GOOGLE_CLIENT_ID production
vercel env add VITE_FITBIT_CLIENT_ID production
```

## Étape 4 — Les Edge Functions

Les secrets OAuth vivent chez Supabase, pas chez Vercel :

```bash
npm install -g supabase
supabase login
supabase link --project-ref TON-REF-PROJET

supabase secrets set \
  GOOGLE_CLIENT_ID="...apps.googleusercontent.com" \
  GOOGLE_CLIENT_SECRET="GOCSPX-..." \
  FITBIT_CLIENT_ID="23XXXX" \
  FITBIT_CLIENT_SECRET="..." \
  ALLOWED_ORIGIN="https://guild-quest-xxxx.vercel.app" \
  CRON_SECRET="$(openssl rand -hex 32)"

supabase functions deploy oauth-exchange
supabase functions deploy sync-health
supabase functions deploy daily-tick --no-verify-jwt
```

`ALLOWED_ORIGIN` doit être **exactement** ton URL Vercel, sans slash final.
C'est le CORS : si ça ne correspond pas, le navigateur bloquera les appels aux
fonctions avec une erreur cryptique.

Note la valeur de `CRON_SECRET`, elle sert à l'étape 6.

## Étape 5 — Redéployer pour de bon

```bash
vercel --prod
```

Maintenant les variables sont dans le bundle. Ouvre l'URL : tu dois voir
l'écran de connexion.

## Étape 6 — Le passage quotidien

Voir l'étape 7 de [SETUP.md](SETUP.md) : un `pg_cron` qui appelle `daily-tick`
chaque nuit. Sans lui, le jeu ne bouge que quand quelqu'un ouvre l'app.

## Étape 7 — Vérifier que tout marche

1. Ouvre l'URL, crée ton compte
2. Fonde ta guilde → note le code à 6 caractères
3. **Réglages** → **Connecter** Google Fit
   - Tu dois atterrir sur l'écran d'accord Google
   - Après acceptation, retour sur l'app avec « Google Fit est connecté »
4. **Resynchroniser 30 jours** → ton historique remonte
5. Retour sur **Guilde** : tes pas et ton XP doivent apparaître

Si ça coince, la section 6 d'[OAUTH.md](OAUTH.md) liste les erreurs classiques.

## Étape 8 — Les potes

Envoie-leur :
- l'URL de l'app
- le code d'invitation à 6 caractères

Ils créent leur compte, saisissent le code, connectent leur montre. **Si l'un
d'eux utilise Google Fit, son adresse Gmail doit être dans les Test users** de
ta console Google Cloud (étape 3.4 d'OAUTH.md) — sinon Google le refusera.

Dis-leur d'**installer la PWA** : sur Android, Chrome propose « Ajouter à
l'écran d'accueil » ; sur iPhone, Safari → Partager → « Sur l'écran d'accueil ».
Ça ouvre le jeu en plein écran, comme une vraie app.

---

## Déploiements suivants

```bash
git push          # si le repo est lié à Vercel : déploiement automatique
vercel --prod     # sinon, manuel
```

Lier le repo GitHub depuis **Project → Settings → Git** est plus confortable :
chaque push sur la branche principale redéploie tout seul.

## Alternatives à Vercel

Le projet est un site statique — n'importe quel hébergeur convient. Il faut
juste la réécriture SPA (toutes les routes → `index.html`) :

- **Netlify** / **Cloudflare Pages** : `public/_redirects` est déjà dans le
  repo, rien à faire.
- **GitHub Pages** : possible mais pénible (pas de réécriture native).
