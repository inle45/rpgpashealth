/**
 * Configuration de démonstration : lance l'app réelle avec un faux client
 * Supabase, pour revoir l'interface sans base de données.
 *
 *   npx vite build --config vite.demo.config.ts --outDir dist-demo
 *   npx vite preview --config vite.demo.config.ts --outDir dist-demo
 *
 * Le plugin substitue le module `src/lib/supabase.ts` à la résolution, ce qui
 * garde le reste du code (pages, contextes, api.ts) strictement identique à la
 * production.
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { resolve } from 'node:path'

const REAL_MODULE = fileURLToPath(new URL('./src/lib/supabase.ts', import.meta.url))
const MOCK_MODULE = fileURLToPath(new URL('./demo/supabase-mock.ts', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@game': fileURLToPath(new URL('./shared/game', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    react(),
    {
      name: 'demo-supabase-mock',
      enforce: 'pre',
      resolveId(source, importer) {
        if (!importer || !source.startsWith('.')) return null
        const resolved = resolve(importer, '..', source)
        // Les imports omettent l'extension : on compare les deux formes.
        if (resolved === REAL_MODULE || `${resolved}.ts` === REAL_MODULE) {
          return MOCK_MODULE
        }
        return null
      },
    },
  ],
})
