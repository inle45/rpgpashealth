/**
 * Prépare des fichiers prêts à copier-coller dans le dashboard Supabase,
 * pour ceux qui ne veulent pas installer le CLI.
 *
 *   node scripts/build-dashboard-files.mjs
 *
 * Produit dans `supabase/dashboard/` :
 *   - `setup.sql`        les deux migrations concaténées, en un seul copier-coller
 *   - `<fonction>.ts`    chaque Edge Function repliée en un fichier autonome
 *
 * Les Edge Functions importent normalement des modules partagés
 * (`shared/game/`, `_shared/`). Le dashboard n'accepte qu'un seul fichier par
 * fonction : esbuild inline donc ces imports. Seuls les imports distants
 * (`https://esm.sh/...`) restent tels quels — Deno les résout à l'exécution.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'supabase', 'dashboard')

mkdirSync(OUT, { recursive: true })

// --- 1. Les migrations, en un seul fichier ---------------------------------

const MIGRATIONS = ['0001_init.sql', '0002_views.sql']

const header = `-- =============================================================================
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

`

const combined =
  header +
  MIGRATIONS.map((name) => {
    const body = readFileSync(join(ROOT, 'supabase', 'migrations', name), 'utf8')
    return `-- ${'='.repeat(75)}\n-- Extrait de : supabase/migrations/${name}\n-- ${'='.repeat(75)}\n\n${body}`
  }).join('\n\n')

writeFileSync(join(OUT, 'setup.sql'), combined)
console.log(`✓ supabase/dashboard/setup.sql (${MIGRATIONS.length} migrations réunies)`)

// --- 2. Les Edge Functions, repliées ---------------------------------------

const FUNCTIONS = ['oauth-exchange', 'sync-health', 'daily-tick']

for (const name of FUNCTIONS) {
  const entry = join(ROOT, 'supabase', 'functions', name, 'index.ts')
  const target = join(OUT, `${name}.ts`)

  execFileSync(
    'npx',
    [
      'esbuild',
      entry,
      '--bundle',
      '--format=esm',
      '--platform=neutral',
      // Deno résout lui-même les URL distantes : on les laisse intactes.
      '--external:https://*',
      `--outfile=${target}`,
    ],
    { cwd: ROOT, stdio: 'pipe' },
  )

  const banner = `// =============================================================================
// Guild Quest — Edge Function « ${name} »
//
// Fichier GÉNÉRÉ à partir de supabase/functions/${name}/ : ne le modifie pas
// à la main, tes changements seraient écrasés. Modifie la source, puis relance
// node scripts/build-dashboard-files.mjs
//
// Mode d'emploi : dans le dashboard Supabase, Edge Functions → Deploy a new
// function → nomme-la exactement « ${name} » → colle tout ce fichier.
// =============================================================================

`

  writeFileSync(target, banner + readFileSync(target, 'utf8'))
  const lines = readFileSync(target, 'utf8').split('\n').length
  console.log(`✓ supabase/dashboard/${name}.ts (${lines} lignes, autonome)`)
}

console.log('\nCes fichiers se collent directement dans le dashboard Supabase.')
