import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Mismo alias `@/` que define `tsconfig.json`, para que los tests importen
  // con las mismas rutas que la aplicación.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // Entorno Node: en este bloque solo se prueban funciones puras.
    // No hay tests de componentes ni de navegador (no se usa jsdom).
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Sin globals: cada test importa `describe`/`it`/`expect` de forma
    // explícita, así `tsc --noEmit` no necesita tipos globales extra.
    globals: false,
  },
})
