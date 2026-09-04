# Installation pas à pas

Compte environ **45 minutes** la première fois. Les étapes 3 et 4 (Google et
Fitbit) sont les plus fastidieuses : ce sont des formulaires à remplir sur les
consoles développeur, rien de technique.

> **Voir le jeu tout de suite, sans rien configurer :**
> `npm install && npm run demo` lance l'app avec des données de démonstration.
> Aucun compte requis. Pratique pour montrer le principe à tes potes avant de
> te lancer dans la configuration.

---

## 1. Le projet en local

```bash
git clone <ton-repo>
cd rpgpashealth
npm install
cp .env.example .env      # on le remplira au fur et à mesure
```

## 2. Supabase

1. Crée un compte sur [supabase.com](https://supabase.com) et un nouveau projet
   (le plan gratuit suffit largement pour un groupe de potes).
2. Dans **SQL Editor**, exécute les deux migrations, dans l'ordre :
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_views.sql`

   Copie-colle simplement le contenu de chaque fichier et clique sur *Run*.
3. Dans **Project Settings → API**, relève :
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon public` → `VITE_SUPABASE_ANON_KEY`
   - `service_role` → garde-la sous le coude pour l'étape 5. **Cette clé
     contourne toutes les règles de sécurité : elle ne doit jamais finir dans
     le front ni dans un commit.**
4. Dans **Authentication → Providers → Email**, désactive
   **"Confirm email"**. Sans ça, chaque pote devra valider un lien reçu par
   mail, et le service d'envoi gratuit de Supabase est très limité.

Remplis maintenant les deux premières lignes de ton `.env`.

## 3. Google Fit

> 📖 **Version détaillée : [OAUTH.md](OAUTH.md)** — avec l'explication du
> fonctionnement, les captures de chaque champ à remplir et les erreurs
> classiques. Ce qui suit en est le résumé.

À faire si toi ou tes potes utilisez une montre Wear OS, un téléphone Android
ou toute app qui remonte dans Google Fit.

1. Va sur [console.cloud.google.com](https://console.cloud.google.com/) et crée
   un projet.
2. **APIs & Services → Library** : cherche **"Fitness API"** et active-la.
3. **APIs & Services → OAuth consent screen** :
   - Type : **External**
   - Remplis le nom de l'app, ton email de contact
   - Statut : laisse en **Testing**
   - **Test users** : ajoute l'adresse Google de chaque pote qui utilisera
     Google Fit (jusqu'à 100). En mode *Testing*, seules ces adresses peuvent
     se connecter — mais tu évites la procédure de validation de Google, qui
     prend des semaines.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID** :
   - Type : **Web application**
   - **Authorized redirect URIs** — ajoute les deux :
     - `http://localhost:5173/auth/health-callback`
     - `https://TON-DOMAINE/auth/health-callback`
   - Valide : tu obtiens un **Client ID** et un **Client Secret**.
5. Mets le Client ID dans `.env` (`VITE_GOOGLE_CLIENT_ID`).
   **Le Client Secret ne va PAS dans `.env`** — il part à l'étape 5.

> Google Fit ne fournit pas de minutes par zone cardiaque. L'app récupère la
> fréquence cardiaque brute par tranches de 5 minutes et les classe elle-même,
> à partir de la FC max réglée dans le profil de chaque joueur.

## 4. Fitbit

> 📖 **Version détaillée : [OAUTH.md](OAUTH.md), section 4** — notamment les
> deux pièges Fitbit (une seule URL de callback par app, quota horaire).

À faire si l'un de vous porte un bracelet ou une montre Fitbit.

1. Va sur [dev.fitbit.com](https://dev.fitbit.com/) → **Manage → Register an App**.
2. Remplis le formulaire :
   - **OAuth 2.0 Application Type** : **Personal** (limite de 150 requêtes par
     heure et par utilisateur — très largement suffisant ici)
   - **Callback URL** : `https://TON-DOMAINE/auth/health-callback`
     (Fitbit n'accepte qu'une seule URL ; pour développer en local, enregistre
     une seconde app avec `http://localhost:5173/auth/health-callback`)
   - **Default Access Type** : **Read Only**
3. Tu obtiens un **OAuth 2.0 Client ID** et un **Client Secret**.
4. Mets le Client ID dans `.env` (`VITE_FITBIT_CLIENT_ID`).

> Chaque pote doit avoir son propre compte Fitbit connecté — l'app lit les
> données de la personne qui autorise, pas celles de tout le monde.

## 5. Les Edge Functions

C'est ici que vivent les secrets. Le navigateur ne les voit jamais.

Installe le CLI Supabase ([doc](https://supabase.com/docs/guides/cli)) :

```bash
npm install -g supabase
supabase login
supabase link --project-ref TON-REF-PROJET   # visible dans l'URL du dashboard
```

Enregistre les secrets :

```bash
supabase secrets set \
  GOOGLE_CLIENT_ID="...apps.googleusercontent.com" \
  GOOGLE_CLIENT_SECRET="GOCSPX-..." \
  FITBIT_CLIENT_ID="23XXXX" \
  FITBIT_CLIENT_SECRET="..." \
  ALLOWED_ORIGIN="https://TON-DOMAINE" \
  CRON_SECRET="$(openssl rand -hex 32)"
```

Note bien la valeur de `CRON_SECRET` : elle sert à l'étape 7.

`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont injectées automatiquement
par la plateforme, tu n'as pas à les déclarer.

Déploie les trois fonctions :

```bash
supabase functions deploy oauth-exchange
supabase functions deploy sync-health
supabase functions deploy daily-tick --no-verify-jwt
```

> `--no-verify-jwt` sur `daily-tick` uniquement : cette fonction est appelée par
> un cron, pas par un utilisateur connecté. Elle se protège elle-même avec
> `CRON_SECRET`.

## 6. Déployer le front

> 📖 **Guide dédié : [DEPLOY.md](DEPLOY.md)** — les étapes dans l'ordre exact,
> avec la dépendance circulaire à casser (Google veut l'URL de l'app, que tu ne
> connais qu'après le premier déploiement).

En résumé, avec Vercel :

```bash
npm install -g vercel
vercel login
vercel          # premier déploiement : donne l'URL
# ... déclarer les variables VITE_* ...
vercel --prod   # redéploiement pour les intégrer au bundle
```

`vercel.json` est déjà dans le repo : réécriture SPA et cache du service worker
sont configurés, tu n'as rien à régler.

Une fois le domaine connu, reviens ajouter l'URL de callback réelle dans les
consoles Google et Fitbit (étapes 3.4 et 4.2), et mets `ALLOWED_ORIGIN` à jour.

## 7. Le passage quotidien

`daily-tick` resynchronise tout le monde et fait évoluer le compagnon. Sans
lui, le jeu ne bouge que quand quelqu'un ouvre l'app.

Dans **SQL Editor** de Supabase :

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Tous les jours à 4h05 UTC.
select cron.schedule(
  'guild-quest-daily-tick',
  '5 4 * * *',
  $$
  select net.http_post(
    url := 'https://TON-REF-PROJET.supabase.co/functions/v1/daily-tick',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "TON-CRON-SECRET"}'::jsonb
  );
  $$
);
```

Remplace `TON-REF-PROJET` et `TON-CRON-SECRET` par tes valeurs.

Pour vérifier que ça tourne : `select * from cron.job_run_details order by
start_time desc limit 5;`

## 8. Première partie

1. Ouvre l'app, crée ton compte.
2. Fonde ta guilde → tu reçois un **code à 6 caractères**.
3. **Réglages** → connecte Google Fit et/ou Fitbit, puis ajuste ton objectif de
   pas et ta FC max.
4. **Resynchroniser 30 jours** : ton historique remonte, ton personnage prend
   ses niveaux d'un coup.
5. Envoie le code d'invitation à tes potes. Ils créent leur compte, saisissent
   le code, connectent leur montre, et vous êtes partis.

Le premier boss apparaît à la première synchronisation de la semaine.

---

## Dépannage

**« Client ID manquant » dans les réglages**
La variable `VITE_GOOGLE_CLIENT_ID` ou `VITE_FITBIT_CLIENT_ID` est absente du
build. Vérifie ton `.env`, puis relance le build (les variables `VITE_*` sont
figées à la compilation).

**« Google n'a pas fourni de refresh token »**
Google ne délivre un refresh token qu'à la première autorisation. Va sur
[myaccount.google.com/permissions](https://myaccount.google.com/permissions),
révoque l'accès de l'app, puis reconnecte-toi.

**« redirect_uri_mismatch »**
L'URL déclarée dans la console Google/Fitbit ne correspond pas exactement à
celle de l'app — au caractère près, `http` vs `https` et slash final compris.

**Fitbit : « quota horaire dépassé »**
150 requêtes par heure et par utilisateur en mode Personal. Une synchro de 30
jours en consomme 6. Attends une heure.

**Aucune donnée après une synchro réussie**
Vérifie que la montre s'est bien synchronisée avec l'app du fabricant : Guild
Quest lit ce que Google Fit ou Fitbit ont reçu, pas la montre directement. Les
données de la journée en cours peuvent avoir plusieurs heures de retard.

**Zones cardiaques toujours à zéro sur Google Fit**
Google Fit n'a pas de données de FC pour ces journées (montre non portée, ou
capteur non autorisé). Vérifie que le scope `heart_rate.read` a bien été
accordé, et que ta FC max est réglée dans les Réglages.

**Un pote ne voit pas la guilde après avoir saisi le code**
Le code est sensible à la casse côté saisie mais l'app le passe en majuscules.
S'il persiste, vérifie dans **Table Editor → guild_members** qu'une ligne a
bien été créée pour lui.
