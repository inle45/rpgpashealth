# OAuth expliqué (et configuré) sans jargon

Ce document couvre la partie qui bloque tout le monde : donner à Guild Quest le
droit de lire les données santé de chaque joueur.

---

## 1. C'est quoi OAuth, concrètement

Le problème à résoudre : Guild Quest a besoin de lire tes pas dans Google Fit.
La mauvaise solution serait que tu donnes ton mot de passe Google à l'app — elle
pourrait alors lire tes mails, supprimer tes photos, tout.

OAuth, c'est **la clé de voiturier**. Tu donnes au voiturier une clé qui démarre
la voiture et ouvre les portes, mais pas le coffre, et qui expire. Le voiturier
n'a jamais ta vraie clé.

Traduit en pratique :

- Tu ne donnes jamais ton mot de passe à Guild Quest.
- Tu es envoyé **chez Google**, qui te demande : « Guild Quest veut lire ton
  activité physique et ta fréquence cardiaque. OK ? »
- Si tu acceptes, Google renvoie à Guild Quest un **jeton** limité à ces deux
  choses, révocable à tout moment depuis ton compte Google.

## 2. Les trois pièces du puzzle

Pour que Google accepte de parler à ton app, tu dois d'abord **déclarer ton app**
chez lui. En échange il te donne trois choses :

| Pièce | C'est quoi | Secret ? |
| --- | --- | --- |
| **Client ID** | Le nom de ton app. Il apparaît dans l'URL quand le joueur atterrit chez Google. | ❌ Public, tout le monde peut le voir |
| **Client Secret** | Le mot de passe de ton app. Prouve à Google que c'est bien ton serveur qui parle. | ✅ **Ultra secret** |
| **Redirect URI** | L'adresse exacte où Google renvoie le joueur après son accord. | ❌ Public |

### Pourquoi le secret ne doit JAMAIS être dans le front

Tout ce qui part dans le navigateur est lisible. Clic droit → code source, et
n'importe qui a ton Client Secret. Il pourrait alors fabriquer une fausse app
qui se fait passer pour la tienne et récolter les données de tes potes.

C'est exactement pour ça que ce projet a des **Edge Functions**. Le découpage :

```
   NAVIGATEUR                  EDGE FUNCTION              GOOGLE
   (public)                    (privé)                    

   1. "Connecte-moi"
      ─── Client ID ────────────────────────────────────►  
                                                    Écran d'accord
   2. ◄──────────────── code d'autorisation ──────────────

   3. envoie le code ────────►
                              4. code + CLIENT SECRET ──►
                              5. ◄──────── jetons ────────
                              6. range les jetons en base
                                 (le navigateur ne les
                                  voit JAMAIS)
```

Le navigateur ne manipule qu'un **code d'autorisation** : un ticket à usage
unique, valable ~60 secondes, inutilisable sans le Client Secret. Même
intercepté, il ne vaut rien.

En bonus l'app utilise **PKCE** : le navigateur tire un nombre aléatoire au
début et doit le représenter à la fin. Ça empêche une autre app installée sur le
téléphone d'intercepter le code au passage.

## 3. Google Fit — pas à pas

> À faire une seule fois, par toi. Tes potes n'ont rien à configurer : ils
> cliqueront juste sur « Connecter » dans l'app.

### 3.1 Créer le projet

1. [console.cloud.google.com](https://console.cloud.google.com/)
2. En haut à gauche, le sélecteur de projet → **New Project**
3. Nom : `guild-quest` → **Create**
4. **Vérifie que le projet est bien sélectionné** en haut avant de continuer.
   C'est l'erreur classique : on configure tout dans le mauvais projet.

### 3.2 Activer l'API

1. Menu ☰ → **APIs & Services** → **Library**
2. Cherche **"Fitness API"** → clique dessus → **Enable**

Sans cette étape, tout le reste marchera *sauf* la lecture des données, avec une
erreur 403 obscure.

### 3.3 L'écran de consentement

Menu ☰ → **APIs & Services** → **OAuth consent screen**

1. **User Type : External** → Create

   *(« Internal » n'existe que pour les comptes Google Workspace
   d'entreprise. Pour des potes avec des Gmail perso, c'est External.)*

2. **App information** :
   - App name : `Guild Quest`
   - User support email : ton adresse
   - Developer contact : ton adresse
   - → **Save and Continue**

3. **Scopes** : clique **Add or Remove Scopes**, cherche et coche :
   - `.../auth/fitness.activity.read`
   - `.../auth/fitness.heart_rate.read`

   → **Update** → **Save and Continue**

4. **Test users** — ⚠️ **l'étape la plus importante** :

   Clique **Add Users** et ajoute **l'adresse Gmail de chaque pote** qui
   utilisera Google Fit. La tienne aussi.

   Pourquoi : ton app reste en statut **Testing**, ce qui évite la procédure
   de validation de Google (des semaines de délai, capture vidéo de l'app,
   politique de confidentialité...). En contrepartie, **seules les adresses
   listées ici peuvent se connecter**. Limite : 100 personnes — large.

   Si un pote a l'erreur *« Guild Quest has not completed the Google
   verification process »*, c'est qu'il manque dans cette liste.

### 3.4 Créer les identifiants

Menu ☰ → **APIs & Services** → **Credentials** → **Create Credentials** →
**OAuth client ID**

1. **Application type : Web application**
2. Name : `Guild Quest Web`
3. **Authorized redirect URIs** → **Add URI**, et ajoute **les deux** :

   ```
   http://localhost:5173/auth/health-callback
   https://TON-APP.vercel.app/auth/health-callback
   ```

   ⚠️ **Au caractère près.** Pas de slash final. `https` en prod, `http` en
   local. Si ça ne correspond pas exactement, Google refuse avec
   `redirect_uri_mismatch`.

   *(Tu ne connaîtras l'URL Vercel qu'après le premier déploiement — reviens
   l'ajouter à ce moment-là, ça se modifie à tout moment.)*

4. **Create** → une fenêtre affiche ton **Client ID** et ton **Client Secret**.

   Le Client ID ressemble à `847362...apps.googleusercontent.com`
   Le Client Secret ressemble à `GOCSPX-aBcD...`

   **Copie les deux maintenant.** Le secret est réaffichable plus tard, mais
   autant éviter l'aller-retour.

### 3.5 Où mettre quoi

```bash
# .env (local) ET variables Vercel — le Client ID est public
VITE_GOOGLE_CLIENT_ID=847362....apps.googleusercontent.com
```

```bash
# Secrets Supabase — le Client Secret ne va QUE là
supabase secrets set GOOGLE_CLIENT_SECRET="GOCSPX-aBcD..."
```

## 4. Fitbit — pas à pas

### 4.1 Enregistrer l'app

1. [dev.fitbit.com](https://dev.fitbit.com/) → connecte-toi avec ton compte
   Fitbit habituel → **Manage** → **Register an App**

2. Remplis :

   | Champ | Valeur |
   | --- | --- |
   | Application Name | `Guild Quest` |
   | Description | `RPG coopératif basé sur l'activité physique` |
   | Application Website URL | `https://TON-APP.vercel.app` |
   | Organization | ton nom |
   | Organization Website URL | `https://TON-APP.vercel.app` |
   | Terms of Service URL | `https://TON-APP.vercel.app` |
   | Privacy Policy URL | `https://TON-APP.vercel.app` |
   | **OAuth 2.0 Application Type** | **Personal** |
   | **Redirect URL** | `https://TON-APP.vercel.app/auth/health-callback` |
   | **Default Access Type** | **Read Only** |

   Les champs URL doivent être remplis mais Fitbit ne les vérifie pas pour une
   app Personal — mets l'URL de ton app partout.

3. Coche l'accord → **Register**

### 4.2 Les deux particularités Fitbit

**Une seule Redirect URL par app.** Contrairement à Google, tu ne peux pas
mettre localhost *et* la prod. Deux options :
- développe uniquement contre la prod (le plus simple), ou
- enregistre une **deuxième app** `Guild Quest Dev` avec
  `http://localhost:5173/auth/health-callback`, et utilise ses identifiants en
  local.

**Type « Personal » = 150 requêtes/heure et par joueur.** Largement suffisant :
une synchro de 30 jours en consomme 6. Le type « Server » permet plus mais exige
une validation Fitbit.

### 4.3 Où mettre quoi

```bash
# .env + Vercel
VITE_FITBIT_CLIENT_ID=23XXXX
```

```bash
# Secrets Supabase uniquement
supabase secrets set FITBIT_CLIENT_SECRET="a1b2c3..."
```

## 5. Récapitulatif : quelle valeur va où

| Valeur | `.env` local | Variables Vercel | Secrets Supabase |
| --- | :---: | :---: | :---: |
| `VITE_SUPABASE_URL` | ✅ | ✅ | — |
| `VITE_SUPABASE_ANON_KEY` | ✅ | ✅ | — |
| `VITE_GOOGLE_CLIENT_ID` | ✅ | ✅ | — |
| `VITE_FITBIT_CLIENT_ID` | ✅ | ✅ | — |
| `GOOGLE_CLIENT_SECRET` | ❌ | ❌ | ✅ |
| `FITBIT_CLIENT_SECRET` | ❌ | ❌ | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | ❌ | ❌ | auto |
| `CRON_SECRET` | ❌ | ❌ | ✅ |

**Règle simple : tout ce qui commence par `VITE_` finit dans le navigateur.**
Si une valeur ne doit pas être publique, elle ne doit jamais porter ce préfixe.

La clé `anon` de Supabase *est* faite pour être publique — elle ne donne accès
qu'à ce que les règles RLS autorisent. La clé `service_role`, elle, contourne
tout : elle ne sort jamais des Edge Functions.

---

## 6. Les erreurs que tu vas rencontrer

**`redirect_uri_mismatch` (Google)**
L'URL déclarée ≠ l'URL réelle. Compare caractère par caractère : `http`/`https`,
slash final, sous-domaine `www`. Vercel donne plusieurs URLs (preview + prod) —
déclare celle que tu utilises vraiment.

**`Guild Quest has not completed the Google verification process`**
L'adresse Gmail du joueur n'est pas dans les **Test users** (étape 3.4).

**`accès bloqué : Guild Quest n'a pas terminé la procédure de validation`**
Même cause, message français.

**« Google n'a pas fourni de refresh token »**
Google ne délivre le refresh token qu'à la **toute première** autorisation d'un
compte. Si tu as déjà autorisé puis délié, va sur
[myaccount.google.com/permissions](https://myaccount.google.com/permissions),
révoque Guild Quest, et reconnecte-toi. Sans refresh token, la synchro
s'arrête au bout d'une heure.

**`invalid_client` (Fitbit)**
Le Client Secret dans les secrets Supabase ne correspond pas à l'app dont le
Client ID est dans le `.env`. Typiquement : tu as créé une app Dev et une app
Prod, et tu as mélangé les paires.

**Erreur 403 sur les données alors que la connexion a marché**
La **Fitness API** n'est pas activée dans le projet Google Cloud (étape 3.2), ou
le joueur n'a pas accordé le scope `heart_rate`.

**Ça marchait, ça ne marche plus après un déploiement**
Les variables `VITE_*` sont figées **au moment du build**. Changer une variable
dans Vercel ne suffit pas : il faut redéployer.
