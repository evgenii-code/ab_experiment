export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',

  devtools: { enabled: true },

  routeRules: {
    '/': {
      swr: 600,
      cache: { staleMaxAge: 3600, varies: ['x-catalog-variant'] },
      headers: { Vary: 'x-catalog-variant' },
    },
  }
})
