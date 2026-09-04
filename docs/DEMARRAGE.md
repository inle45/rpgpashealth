# Démarrage — la version simple

Tout se fait **depuis le navigateur**, sur téléphone ou sur ordi. Rien à
installer.

Il y a deux temps :

- **Partie A** (~15 min) → le jeu est en ligne et tu peux créer ta guilde
- **Partie B** (~20 min) → tes vraies données de montre arrivent dans le jeu

Fais la partie A. Souffle. Fais la partie B plus tard si tu veux.

---

# PARTIE A — Mettre le jeu en ligne

## A1. Créer la base de données

1. Va sur **supabase.com**, clique **Start your project**
2. Connecte-toi **avec GitHub**
3. Clique **New project**, puis remplis :
   - **Name** : `guild-quest`
   - **Database Password** : clique *Generate a password*, puis **copie-le
     dans tes notes**. Tu ne t'en serviras pas pour le jeu, mais si tu le perds
     il est perdu pour de bon.
   - **Region** : `West EU (Ireland)`
4. **Create new project**

☕ Attends 2 minutes que ça se prépare.

## A2. Créer les tables

1. Dans le menu de gauche, clique **SQL Editor**
2. Clique **New query**
3. Ouvre ce lien dans un autre onglet :

   **`github.com/inle45/rpgpashealth/blob/claude/health-game-google-fit-lrbgtz/supabase/dashboard/setup.sql`**

4. Clique le bouton **Copy raw file** (l'icône de copie en haut à droite du code)
5. Reviens sur Supabase, colle dans le grand cadre, clique **Run**

Tu dois voir **Success. No rows returned** en vert. C'est bon.

> Si tu vois une erreur rouge : tu n'as probablement pas copié tout le fichier.
> Recommence en utilisant bien le bouton *Copy raw file*.

## A3. Enlever la confirmation par email

Sinon chaque pote devra valider un email, et Supabase gratuit n'en envoie que
2 par heure. Vous seriez bloqués.

1. Menu de gauche → **Authentication**
2. Onglet **Sign In / Providers**
3. Clique sur **Email**
4. **Décoche** *Confirm email*
5. **Save**

## A4. Récupérer tes 2 clés

1. Tout en bas du menu de gauche → **⚙️ Project Settings**
2. Clique **API**
3. Copie ces deux valeurs (garde-les dans tes notes) :

| Ce que tu vois sur la page | Comment ça s'appelle après |
| --- | --- |
| **Project URL**<br>`https://xxxxx.supabase.co` | `VITE_SUPABASE_URL` |
| **Project API keys** → ligne **`anon` `public`**<br>un long texte qui commence par `eyJ...` | `VITE_SUPABASE_ANON_KEY` |

⚠️ Juste en dessous il y a **`service_role`**. **Ne la copie pas, ne la mets
nulle part.** Celle-là donne tous les droits sur ta base.

*(Si ta page affiche « Publishable key » qui commence par `sb_publishable_` au
lieu de `anon` : prends celle-là, c'est le nouveau nom, ça marche pareil.)*

## A5. Donner les clés à Vercel

1. Va sur **vercel.com**, ouvre ton projet `rpgpashealth`
2. Onglet **Settings** → menu de gauche **Environment Variables**
3. Ajoute la première :
   - **Key** : `VITE_SUPABASE_URL`
   - **Value** : ton `https://xxxxx.supabase.co`
   - Coche les 3 environnements (Production, Preview, Development)
   - **Save**
4. Pareil pour la deuxième :
   - **Key** : `VITE_SUPABASE_ANON_KEY`
   - **Value** : le long texte `eyJ...`
   - **Save**

## A6. Redéployer

⚠️ **Obligatoire.** Ajouter les variables ne suffit pas, il faut reconstruire
l'app pour qu'elle les contienne.

1. Onglet **Deployments**
2. Sur la ligne du haut, le bouton **⋯** → **Redeploy**
3. Confirme, attends ~1 minute

## 🎉 A7. Teste

Ouvre l'URL de ton app. Tu dois voir **l'écran de connexion Guild Quest**.

1. Crée ton compte (email + mot de passe)
2. Fonde ta guilde → tu reçois un **code à 6 caractères**
3. Balade-toi dans les onglets

**Le jeu tourne.** Les chiffres sont à zéro parce qu'aucune montre n'est encore
branchée — c'est la partie B.

Tu peux déjà envoyer l'URL et le code à tes potes pour qu'ils créent leur
compte.

---

# PARTIE B — Brancher Google Fit

> Fais ça quand t'as de l'énergie. Le jeu marche déjà sans.
>
> Cette partie est plus longue parce que Google veut savoir qui tu es avant de
> te laisser lire des données de santé. C'est normal, c'est de la vie privée.

## B1. Créer le projet Google

1. Va sur **console.cloud.google.com**
2. En haut à gauche, le sélecteur de projet → **New Project**
3. Name : `guild-quest` → **Create**
4. **Attends, puis vérifie en haut que `guild-quest` est bien sélectionné.**
   C'est l'erreur classique : configurer dans le mauvais projet.

## B2. Activer l'API

1. Menu **☰** → **APIs & Services** → **Library**
2. Cherche **Fitness API**
3. Clique dessus → **Enable**

## B3. L'écran d'autorisation

Menu **☰** → **APIs & Services** → **OAuth consent screen**

1. **User Type : External** → **Create**
2. Remplis :
   - App name : `Guild Quest`
   - User support email : ton email
   - Developer contact : ton email
   - → **Save and Continue**
3. Page **Scopes** → **Add or Remove Scopes** → coche :
   - `fitness.activity.read`
   - `fitness.heart_rate.read`
   - → **Update** → **Save and Continue**
4. Page **Test users** → **⚠️ L'ÉTAPE À NE PAS RATER**

   Clique **Add Users** et ajoute **l'adresse Gmail de chacun** : la tienne et
   celle de chaque pote qui utilisera Google Fit.

   Pourquoi : ton app reste en mode test, ce qui t'évite une validation Google
   qui prend des semaines. En échange, **seules les adresses que tu listes ici
   pourront se connecter.** Un pote absent de la liste sera refusé.

## B4. Créer les clés

Menu **☰** → **APIs & Services** → **Credentials** → **Create Credentials** →
**OAuth client ID**

1. **Application type : Web application**
2. Name : `Guild Quest Web`
3. **Authorized redirect URIs** → **Add URI** :

   ```
   https://TON-APP.vercel.app/auth/health-callback
   ```

   Remplace `TON-APP` par ton vrai nom Vercel. **Copie-colle depuis la barre
   d'adresse pour ne pas te tromper.** Pas de `/` à la fin.

4. **Create**

Une fenêtre s'ouvre avec **deux valeurs**. Copie les deux dans tes notes :

| | À quoi ça ressemble | Où ça va |
| --- | --- | --- |
| **Client ID** | `847362-abc....apps.googleusercontent.com` | Vercel (étape B5) |
| **Client Secret** | `GOCSPX-aBcDeF...` | Supabase (étape B6) |

⚠️ **Le Client Secret ne va JAMAIS dans Vercel.** C'est le mot de passe de ton
app : tout ce qui est dans Vercel finit visible dans le navigateur de tes potes.

## B5. Le Client ID dans Vercel

Comme à l'étape A5 :

- **Key** : `VITE_GOOGLE_CLIENT_ID`
- **Value** : ton `...apps.googleusercontent.com`
- **Save**, puis **Redeploy** (onglet Deployments → ⋯ → Redeploy)

## B6. Le Client Secret dans Supabase

1. Sur Supabase : **⚙️ Project Settings** → **Edge Functions**
2. Section **Secrets** → **Add new secret**, et ajoute-les un par un :

| Name | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | ton `...apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | ton `GOCSPX-...` |
| `ALLOWED_ORIGIN` | `https://TON-APP.vercel.app` (sans `/` à la fin) |

## B7. Installer les 2 fonctions

Ce sont les petits programmes qui vont chercher tes pas chez Google. Ils
tournent chez Supabase, à l'abri, parce qu'ils manipulent ton Client Secret.

1. Sur Supabase, menu de gauche → **Edge Functions**
2. **Deploy a new function** → **Via Editor**
3. **Nom : `oauth-exchange`** — exactement ça, ça compte
4. Ouvre ce lien, **Copy raw file** :

   **`github.com/inle45/rpgpashealth/blob/claude/health-game-google-fit-lrbgtz/supabase/dashboard/oauth-exchange.ts`**

5. Efface ce qu'il y a dans l'éditeur, colle, clique **Deploy**

Recommence pour la deuxième :

- **Nom : `sync-health`**
- Fichier : **`.../supabase/dashboard/sync-health.ts`**

## 🎉 B8. Teste

1. Ouvre ton app → **Réglages**
2. À côté de **Google Fit**, clique **Connecter**
3. Google te demande ton accord → **Autoriser**
4. Retour sur l'app : « Google Fit est connecté »
5. Clique **Resynchroniser 30 jours**
6. Va sur l'onglet **Guilde** : tes pas sont là 🎉

---

# Plus tard, si tu veux

Ces trois choses sont **optionnelles**, le jeu tourne très bien sans.

**Fitbit** — seulement si un pote a un bracelet Fitbit. Même principe que
Google, c'est expliqué dans [OAUTH.md](OAUTH.md) section 4.

**La mise à jour automatique** — pour l'instant le jeu se met à jour quand
quelqu'un ouvre l'app. Pour qu'il se mette à jour tout seul chaque nuit, il
faut installer la fonction `daily-tick` et brancher une minuterie : voir
l'étape 7 de [SETUP.md](SETUP.md).

**Installer le jeu comme une appli** — sur ton téléphone, ouvre l'app dans
Chrome (Android) ou Safari (iPhone) et choisis **Ajouter à l'écran d'accueil**.
Ça enlève la barre du navigateur, on dirait une vraie appli.

---

# Si ça coince

**L'app affiche une erreur au lieu de l'écran de connexion**
Les variables ne sont pas dans le build. Vérifie qu'elles sont bien dans Vercel,
puis **Redeploy** — c'est presque toujours l'étape oubliée.

**« redirect_uri_mismatch » quand je clique Connecter**
L'adresse déclarée chez Google n'est pas exactement celle de ton app. Compare
lettre par lettre : `https`, pas de `/` à la fin.

**Un pote : « Guild Quest has not completed the Google verification process »**
Son Gmail n'est pas dans les **Test users** (étape B3.4). Ajoute-le.

**« Google n'a pas fourni de refresh token »**
Va sur **myaccount.google.com/permissions**, retire l'accès de Guild Quest,
puis reconnecte-toi dans l'app.

**Mes pas n'apparaissent pas alors que la connexion a marché**
Vérifie que ta montre s'est bien synchronisée avec l'app Google Fit sur ton
téléphone. Le jeu lit ce que Google Fit a reçu, pas la montre directement.

**Autre chose**
Décris-moi ce que tu vois à l'écran, on débogue ensemble.
