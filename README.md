# Guild Quest

RPG coopératif entre potes, alimenté par vos vraies données d'activité —
**Google Fit** et **Fitbit**, pour que chacun joue avec le matériel qu'il a
déjà (montre connectée, bracelet, ou simplement son téléphone).

Application web installable (PWA) : ça s'ajoute à l'écran d'accueil comme une
appli, et ça marche hors ligne pour la consultation.

```bash
npm install
npm run demo     # voir le jeu immédiatement, avec des données factices
```

## Documentation

**👉 Commence par [DEMARRAGE.md](docs/DEMARRAGE.md)** — tout se fait depuis le
navigateur, rien à installer, et le jeu est en ligne après la première moitié.

Les autres guides, si tu veux creuser :

| Guide | Quand le lire |
| --- | --- |
| **[DEMARRAGE.md](docs/DEMARRAGE.md)** | La voie simple : navigateur uniquement, en deux temps |
| **[OAUTH.md](docs/OAUTH.md)** | Comprendre OAuth, et le détail de chaque champ des consoles Google et Fitbit |
| **[DEPLOY.md](docs/DEPLOY.md)** | Le déploiement Vercel en ligne de commande |
| **[SETUP.md](docs/SETUP.md)** | L'installation complète avec les CLI (Supabase, Vercel) |

---

## Le principe

Une guilde, c'est votre groupe. Quatre boucles s'y superposent :

| Ce que vous faites | Ce que ça alimente |
| --- | --- |
| Marcher | **XP** de votre personnage + **avancée sur la carte** de la guilde |
| Monter en zone cardiaque | **Dégâts** contre le boss de la semaine |
| Être régulier | **Série** personnelle (bonus d'XP) + **vitalité du compagnon** partagé |
| Tenir la semaine | Boss vaincu → butin et compagnon requinqué |

### L'équité d'abord

Le piège d'un jeu de pas entre potes, c'est que celui qui court des marathons
écrase tout le monde et que les autres décrochent. Deux garde-fous :

- **Tout est relatif à l'objectif personnel.** Chacun règle le sien. Atteindre
  8 000 pas quand c'est votre objectif rapporte exactement autant qu'en
  atteindre 15 000 quand c'est le vôtre.
- **La contribution est plafonnée à 2× l'objectif.** Une journée exceptionnelle
  compte double, pas vingt fois.

### Un boss qui s'adapte

Les PV du boss valent 85 % des dégâts que la guilde a infligés en moyenne les
4 semaines précédentes. Il suit votre forme réelle : jamais infaisable quand
vous êtes cramés, jamais trivial quand vous êtes à fond. Une guilde qui
débute affronte un plancher proportionnel à sa taille.

### Trois classes

| Classe | Effet | Pour qui |
| --- | --- | --- |
| **Rôdeur** | +20 % de points de marche | les gros marcheurs |
| **Berserker** | +25 % de dégâts | ceux qui vont chercher le cardio |
| **Paladin** | +15 % d'XP | la régularité au long cours |

### Le compagnon

Un familier partagé par la guilde. Sa vitalité monte quand la majorité du
groupe bouge, descend quand tout le monde décroche. Il ne juge personne — il
rend juste visible, d'un coup d'œil, l'état de forme collectif. Il change
d'apparence selon son moral (rayonnant → endormi).

---

## Architecture

```
shared/game/       Moteur de jeu (TypeScript pur, sans dépendances)
  types.ts           Types du domaine
  rules.ts           Constantes d'équilibrage — tout se règle ici
  engine.ts          XP, dégâts, marche, compagnon, dates

src/               PWA React + Vite
  lib/               Supabase, auth, OAuth PKCE, état de jeu
  pages/             Guilde · Boss · Carte · Perso · Réglages
  components/        Panneaux, barres, sprites

supabase/
  migrations/        Schéma SQL + RLS + vues d'agrégation
  functions/
    oauth-exchange/  Échange le code OAuth (détient les client secrets)
    sync-health/     Synchro à la demande d'un joueur
    daily-tick/      Passage quotidien (cron) : synchro + compagnon
    _shared/         Clients Google Fit et Fitbit, logique de synchro

public/sprites/    Pixel art généré avec PixelLab
scripts/           Génération des icônes, contrôles du moteur
demo/              Faux client Supabase pour `npm run demo`
```

### Le principe qui tient tout

**`daily_activity` est la seule source de vérité.** Le niveau des personnages,
les PV restants du boss et l'avancée sur la carte sont *dérivés* par
agrégation, jamais stockés comme compteurs. Une resynchronisation qui corrige
une vieille journée remet donc tout le jeu d'aplomb automatiquement — rien ne
peut dériver.

Seule exception assumée : la vitalité du compagnon, qui dépend du chemin
parcouru (bornée à [0, 100] chaque jour). Elle avance jour par jour, avec une
garde d'idempotence pour qu'un tick rejoué ne compte pas deux fois.

### Sécurité

- Les **client secrets** OAuth ne vivent que dans les Edge Functions. Le
  navigateur reçoit un code d'autorisation, jamais un jeton.
- Les **jetons** sont dans `health_tokens`, une table avec RLS activée et
  **aucune policy** — donc totalement inaccessible au client. Seul le service
  role y touche.
- Les **règles RLS** limitent chacun à ses propres données et à celles de ses
  coéquipiers. Les vues d'agrégation utilisent `security_invoker` pour rester
  soumises à ces règles.
- Le flux OAuth utilise **PKCE**.

---

## Ce que fournit chaque provider

|  | Google Fit | Fitbit |
| --- | --- | --- |
| Pas | ✅ | ✅ |
| Minutes actives | ✅ | ✅ (`fairly` + `very active`) |
| Zones cardiaques | ⚠️ calculées depuis la FC brute | ✅ fournies directement |
| Calories | ✅ | ✅ |
| Sommeil | ❌ non récupéré | ✅ |

Google Fit n'expose pas de minutes par zone. L'app récupère la FC agrégée par
tranches de 5 minutes et classe chaque tranche selon la FC max réglée par le
joueur (seuils 50 / 70 / 85 %, convention Fitbit). C'est une approximation
volontaire : plus fidèle que d'ignorer la charge cardiaque, plus léger que de
télécharger 1 440 points par jour.

Si quelqu'un connecte **les deux**, les données sont fusionnées en gardant la
plus haute valeur de chaque métrique — pas de double comptage entre la montre
et le téléphone.

---

## Développement

```bash
npm run dev        # serveur de développement (nécessite un .env configuré)
npm run demo       # app complète avec des données factices, sans backend
npm run check      # typecheck + contrôles du moteur de jeu
npm run build      # build de production + service worker
npm run icons      # régénère les icônes PWA et le favicon
```

`npm run test` vérifie les invariants qui feraient le plus mal s'ils
cassaient : équité entre joueurs, dérivation du niveau, calibrage du boss,
bornes du compagnon, découpage des semaines.

### Régler l'équilibrage

Tout est dans `shared/game/rules.ts` — poids des zones cardiaques, seuil de
l'attaque spéciale, coût des régions, deltas du compagnon. Après un
changement, `npm run test` confirme que les invariants tiennent toujours.

Les contributions déjà calculées ne bougent pas rétroactivement : un
changement de règles ne s'applique qu'aux journées resynchronisées ensuite.

### Ajouter un boss ou une région

Ajoutez une entrée dans `BOSSES` ou `CAMPAIGN` (`shared/game/rules.ts`). Les
boss tournent automatiquement, semaine après semaine. Pour le sprite, PixelLab
en génère un en deux minutes ; déposez le PNG dans `public/sprites/`.
