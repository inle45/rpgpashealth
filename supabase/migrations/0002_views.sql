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
