import { getExperimentHeaderName } from './modules/ab-experiment/utils'
import type { ExperimentOptions } from './modules/ab-experiment/types'

const experiments = {
  catalog: {
    cookieName: 'catalog-variant',
    probabilityB: 0.2,
  },
  checkout: {
    cookieName: 'checkout-variant',
    probabilityB: 0.5,
    cookieOptions: {
      maxAge: 60 * 60 * 24 * 7,
    },
  },
} satisfies Record<string, ExperimentOptions>

const catalogHeader = getExperimentHeaderName(experiments.catalog.cookieName)
const checkoutHeader = getExperimentHeaderName(experiments.checkout.cookieName)

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',

  devtools: { enabled: true },

  modules: ['./modules/ab-experiment/module'],

  abExperiment: {
    experiments,
    cookieOptions: {
      sameSite: 'lax',
    },
  },

  routeRules: {
    '/': {
      swr: 600,
      cache: { staleMaxAge: 3600, varies: [catalogHeader] },
      headers: { Vary: catalogHeader },
    },
    '/checkout': {
      swr: 600,
      cache: { staleMaxAge: 3600, varies: [checkoutHeader] },
      headers: { Vary: checkoutHeader },
    },
  }
})
