-- =============================================================================
-- Guild Quest — installation complète de la base de données.
--
-- Fichier GÉNÉRÉ : ne le modifie pas à la main.
-- Il concatène les migrations de supabase/migrations/ pour permettre une
-- installation en un seul copier-coller dans le SQL Editor de Supabase.
-- Régénère-le avec : node scripts/build-dashboard-files.mjs
--
-- Mode d'emploi : copie TOUT ce fichier, colle-le dans le SQL Editor de
-- Supabase, clique sur Run. Une seule fois suffit.
-- =============================================================================

-- ===========================================================================
-- Extrait de : supabase/migrations/0001_init.sql
-- ===========================================================================

-- =============================================================================
-- Guild Quest — schéma initial
--
-- Principe directeur : `daily_activity` est la seule source de vérité.
-- Le niveau des personnages, les PV restants du boss et l'avancée sur la carte
-- sont TOUS dérivés de cette table par agrégation. Une resynchronisation qui
-- corrige une vieille journée remet donc tout le jeu d'aplomb automatiquement,
-- sans compteur qui dérive.
--
-- Seule exception : la vitalité du compagnon, qui dépend du chemin parcouru
-- (bornée à [0,100] chaque jour). Elle est avancée jour par jour par le tick
-- quotidien, avec une garde d'idempotence sur `companion_last_tick_date`.
-- =============================================================================

-- Les tokens OAuth sont chiffrés au repos par Supabase ; on s'appuie en plus
-- sur des règles RLS qui n'exposent JAMAIS la table des tokens au client.

-- -----------------------------------------------------------------------------
-- Profils
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Aventurier',
  -- Objectifs personnels : c'est ce qui rend le jeu équitable entre potes
  -- qui n'ont pas le même niveau de forme.
  steps_goal integer not null default 8000 check (steps_goal between 1000 and 50000),
  active_minutes_goal integer not null default 30 check (active_minutes_goal between 5 and 300),
  -- Fréquence cardiaque maximale, pour découper les zones (50/70/85 %).
  -- Fitbit renvoie déjà des minutes par zone ; Google Fit ne donne que la FC
  -- brute, qu'il faut classer nous-mêmes — d'où ce réglage.
  -- Défaut : ~220 - 30 ans. À ajuster dans les réglages.
  max_heart_rate integer not null default 190 check (max_heart_rate between 120 and 220),
  timezone text not null default 'Europe/Paris',
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Guildes
-- -----------------------------------------------------------------------------
create table if not exists public.guilds (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 40),
  invite_code text not null unique,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Compagnon partagé : son état reflète la régularité du groupe.
  companion_name text not null default 'Pyra',
  companion_species text not null default 'fox_spirit',
  companion_vitality integer not null default 70 check (companion_vitality between 0 and 100),
  companion_last_tick_date date
);

create table if not exists public.guild_members (
  guild_id uuid not null references public.guilds (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (guild_id, user_id)
);

create index if not exists guild_members_user_idx on public.guild_members (user_id);

-- -----------------------------------------------------------------------------
-- Personnages
-- -----------------------------------------------------------------------------
create table if not exists public.characters (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null default 'Sans-nom',
  class text not null default 'ranger' check (class in ('ranger', 'berserker', 'paladin')),
  created_at timestamptz not null default now()
  -- Pas de colonne level/xp : dérivées de la somme de daily_activity.xp_awarded.
);

-- -----------------------------------------------------------------------------
-- Connexions santé
--
-- Deux tables volontairement séparées :
--   * `health_connections`  → métadonnées, lisibles par leur propriétaire ;
--   * `health_tokens`       → secrets OAuth, AUCUNE policy = service role seul.
-- -----------------------------------------------------------------------------
create table if not exists public.health_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('google_fit', 'fitbit')),
  provider_user_id text,
  scopes text,
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  last_sync_error text,
  unique (user_id, provider)
);

create table if not exists public.health_tokens (
  connection_id uuid primary key references public.health_connections (id) on delete cascade,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Activité quotidienne — la source de vérité
-- -----------------------------------------------------------------------------
create table if not exists public.daily_activity (
  user_id uuid not null references auth.users (id) on delete cascade,
  activity_date date not null,

  -- Données brutes normalisées entre Google Fit et Fitbit
  steps integer not null default 0 check (steps >= 0),
  active_minutes integer not null default 0 check (active_minutes >= 0),
  fat_burn_minutes integer not null default 0 check (fat_burn_minutes >= 0),
  cardio_minutes integer not null default 0 check (cardio_minutes >= 0),
  peak_minutes integer not null default 0 check (peak_minutes >= 0),
  calories integer not null default 0 check (calories >= 0),
  sleep_minutes integer not null default 0 check (sleep_minutes >= 0),
  resting_heart_rate integer not null default 0 check (resting_heart_rate >= 0),

  -- Contribution de jeu calculée au moment de la synchro. On la fige pour
  -- garder une trace de ce qui a réellement été attribué ce jour-là.
  xp_awarded integer not null default 0 check (xp_awarded >= 0),
  damage_dealt integer not null default 0 check (damage_dealt >= 0),
  march_points integer not null default 0 check (march_points >= 0),
  participated boolean not null default false,
  special_attack boolean not null default false,

  source_provider text check (source_provider in ('google_fit', 'fitbit')),
  synced_at timestamptz not null default now(),

  primary key (user_id, activity_date)
);

create index if not exists daily_activity_date_idx on public.daily_activity (activity_date);

-- -----------------------------------------------------------------------------
-- Boss hebdomadaires
-- -----------------------------------------------------------------------------
create table if not exists public.boss_battles (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds (id) on delete cascade,
  -- Lundi de la semaine concernée.
  week_start date not null,
  boss_key text not null,
  boss_name text not null,
  sprite text not null default '',
  max_hp integer not null check (max_hp > 0),
  status text not null default 'active' check (status in ('active', 'defeated', 'failed')),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (guild_id, week_start)
);

-- -----------------------------------------------------------------------------
-- Fonctions d'aide pour les policies
--
-- SECURITY DEFINER : ces fonctions contournent la RLS, ce qui évite la
-- récursion infinie d'une policy sur guild_members qui interrogerait
-- guild_members.
-- -----------------------------------------------------------------------------
create or replace function public.user_guild_ids(uid uuid)
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select guild_id from public.guild_members where user_id = uid;
$$;

create or replace function public.shares_guild_with(target uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.guild_members me
    join public.guild_members them on them.guild_id = me.guild_id
    where me.user_id = auth.uid() and them.user_id = target
  );
$$;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.guilds enable row level security;
alter table public.guild_members enable row level security;
alter table public.characters enable row level security;
alter table public.health_connections enable row level security;
alter table public.health_tokens enable row level security;
alter table public.daily_activity enable row level security;
alter table public.boss_battles enable row level security;

-- Profils : soi-même + ses coéquipiers (pour afficher le classement).
drop policy if exists "profiles readable by self and guildmates" on public.profiles;
create policy "profiles readable by self and guildmates" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.shares_guild_with(id));

drop policy if exists "profiles insertable by self" on public.profiles;
create policy "profiles insertable by self" on public.profiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists "profiles updatable by self" on public.profiles;
create policy "profiles updatable by self" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Guildes : lisibles par leurs membres, modifiables par le fondateur.
drop policy if exists "guilds readable by members" on public.guilds;
create policy "guilds readable by members" on public.guilds
  for select to authenticated
  using (id in (select public.user_guild_ids(auth.uid())));

drop policy if exists "guilds updatable by owner" on public.guilds;
create policy "guilds updatable by owner" on public.guilds
  for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());

-- Membres : on voit les membres des guildes dont on fait partie.
drop policy if exists "guild members readable by guildmates" on public.guild_members;
create policy "guild members readable by guildmates" on public.guild_members
  for select to authenticated
  using (guild_id in (select public.user_guild_ids(auth.uid())));

drop policy if exists "guild members can leave" on public.guild_members;
create policy "guild members can leave" on public.guild_members
  for delete to authenticated using (user_id = auth.uid());

-- L'adhésion passe par la RPC join_guild (qui valide le code d'invitation),
-- donc pas de policy INSERT ouverte ici.

-- Personnages : lecture entre coéquipiers, écriture sur le sien.
drop policy if exists "characters readable by guildmates" on public.characters;
create policy "characters readable by guildmates" on public.characters
  for select to authenticated
  using (user_id = auth.uid() or public.shares_guild_with(user_id));

drop policy if exists "characters writable by self" on public.characters;
create policy "characters writable by self" on public.characters
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "characters updatable by self" on public.characters;
create policy "characters updatable by self" on public.characters
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Connexions santé : chacun voit l'état des siennes (jamais celles des autres).
drop policy if exists "health connections readable by owner" on public.health_connections;
create policy "health connections readable by owner" on public.health_connections
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "health connections deletable by owner" on public.health_connections;
create policy "health connections deletable by owner" on public.health_connections
  for delete to authenticated using (user_id = auth.uid());

-- health_tokens : AUCUNE policy. RLS activée sans policy = table totalement
-- inaccessible au client. Seules les Edge Functions (service role) y touchent.

-- Activité : lecture soi + coéquipiers. Écriture réservée aux Edge Functions.
drop policy if exists "activity readable by self and guildmates" on public.daily_activity;
create policy "activity readable by self and guildmates" on public.daily_activity
  for select to authenticated
  using (user_id = auth.uid() or public.shares_guild_with(user_id));

-- Boss : lisibles par les membres de la guilde concernée.
drop policy if exists "boss battles readable by members" on public.boss_battles;
create policy "boss battles readable by members" on public.boss_battles
  for select to authenticated
  using (guild_id in (select public.user_guild_ids(auth.uid())));

-- -----------------------------------------------------------------------------
-- Création automatique du profil et du personnage à l'inscription
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, 'aventurier'), '@', 1)
    )
  )
  on conflict (id) do nothing;

  insert into public.characters (user_id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', 'Sans-nom'))
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- RPC : créer une guilde
-- -----------------------------------------------------------------------------
create or replace function public.create_guild(guild_name text)
returns public.guilds
language plpgsql
security definer
set search_path = public
as $$
declare
  new_guild public.guilds;
  code text;
begin
  if auth.uid() is null then
    raise exception 'authentification requise';
  end if;

  -- Code court, lisible à l'oral pour l'envoyer à ses potes.
  loop
    code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.guilds where invite_code = code);
  end loop;

  insert into public.guilds (name, invite_code, created_by)
  values (guild_name, code, auth.uid())
  returning * into new_guild;

  insert into public.guild_members (guild_id, user_id, role)
  values (new_guild.id, auth.uid(), 'owner');

  return new_guild;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC : rejoindre une guilde via son code d'invitation
-- -----------------------------------------------------------------------------
create or replace function public.join_guild(code text)
returns public.guilds
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.guilds;
begin
  if auth.uid() is null then
    raise exception 'authentification requise';
  end if;

  select * into target from public.guilds where invite_code = upper(trim(code));

  if target.id is null then
    raise exception 'code d''invitation inconnu';
  end if;

  insert into public.guild_members (guild_id, user_id, role)
  values (target.id, auth.uid(), 'member')
  on conflict (guild_id, user_id) do nothing;

  return target;
end;
$$;

grant execute on function public.create_guild(text) to authenticated;
grant execute on function public.join_guild(text) to authenticated;


-- ===========================================================================
-- Extrait de : supabase/migrations/0002_views.sql
-- ===========================================================================

-- =============================================================================
-- Vues d'agrégation.
--
-- `security_invoker = true` est essentiel : sans ça une vue s'exécute avec les
-- droits de son propriétaire et court-circuite la RLS des tables sous-jacentes.
-- Avec, chaque vue reste soumise aux policies de l'appelant.
-- =============================================================================

-- Statistiques cumulées par membre de guilde.
create or replace view public.guild_member_stats
with (security_invoker = true) as
select
  gm.guild_id,
  gm.user_id,
  p.display_name,
  p.steps_goal,
  p.active_minutes_goal,
  c.name        as character_name,
  c.class       as character_class,
  coalesce(sum(da.xp_awarded), 0)::bigint    as total_xp,
  coalesce(sum(da.damage_dealt), 0)::bigint  as total_damage,
  coalesce(sum(da.march_points), 0)::bigint  as total_march,
  coalesce(sum(da.steps), 0)::bigint         as total_steps,
  count(da.activity_date) filter (where da.participated) as active_days,
  max(da.activity_date)                       as last_active_date
from public.guild_members gm
join public.profiles p on p.id = gm.user_id
left join public.characters c on c.user_id = gm.user_id
left join public.daily_activity da on da.user_id = gm.user_id
group by gm.guild_id, gm.user_id, p.display_name, p.steps_goal, p.active_minutes_goal, c.name, c.class;

-- Totaux par guilde : sert à la progression sur la carte de campagne.
create or replace view public.guild_totals
with (security_invoker = true) as
select
  gm.guild_id,
  count(distinct gm.user_id)                  as member_count,
  coalesce(sum(da.march_points), 0)::bigint   as total_march,
  coalesce(sum(da.damage_dealt), 0)::bigint   as total_damage,
  coalesce(sum(da.steps), 0)::bigint          as total_steps
from public.guild_members gm
left join public.daily_activity da on da.user_id = gm.user_id
group by gm.guild_id;

-- État des combats de boss : PV restants dérivés des dégâts de la semaine.
create or replace view public.boss_battle_state
with (security_invoker = true) as
select
  bb.id,
  bb.guild_id,
  bb.week_start,
  bb.boss_key,
  bb.boss_name,
  bb.sprite,
  bb.max_hp,
  bb.status,
  bb.resolved_at,
  coalesce(dmg.total, 0)::bigint                              as damage_dealt,
  greatest(0, bb.max_hp - coalesce(dmg.total, 0))::bigint     as hp_remaining
from public.boss_battles bb
left join lateral (
  select sum(da.damage_dealt) as total
  from public.daily_activity da
  join public.guild_members gm
    on gm.user_id = da.user_id and gm.guild_id = bb.guild_id
  where da.activity_date >= bb.week_start
    and da.activity_date < bb.week_start + 7
) dmg on true;

-- Contribution de chaque membre au boss de la semaine (pour le classement).
create or replace view public.boss_contributions
with (security_invoker = true) as
select
  bb.id                                        as battle_id,
  bb.guild_id,
  gm.user_id,
  p.display_name,
  coalesce(sum(da.damage_dealt), 0)::bigint    as damage,
  bool_or(da.special_attack)                   as landed_special
from public.boss_battles bb
join public.guild_members gm on gm.guild_id = bb.guild_id
join public.profiles p on p.id = gm.user_id
left join public.daily_activity da
  on da.user_id = gm.user_id
 and da.activity_date >= bb.week_start
 and da.activity_date < bb.week_start + 7
group by bb.id, bb.guild_id, gm.user_id, p.display_name;

grant select on public.guild_member_stats to authenticated;
grant select on public.guild_totals to authenticated;
grant select on public.boss_battle_state to authenticated;
grant select on public.boss_contributions to authenticated;
