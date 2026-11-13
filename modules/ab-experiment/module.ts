import { addImports, addPlugin, addServerHandler, createResolver, defineNuxtModule } from '@nuxt/kit'
import { createExperimentConfigs } from './config'
import type { ModuleOptions } from './types'

export type { ExperimentCookieOptions, ExperimentOptions, ModuleOptions } from './types'

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'ab-experiment',
    configKey: 'abExperiment',
    compatibility: { nuxt: '^4.0.0' },
  },

  defaults: {
    experiments: {},
    cookieOptions: {},
  },

  setup (options, nuxt) {
    const { serverExperiments, publicExperiments } = createExperimentConfigs(options)

    nuxt.options.runtimeConfig.abExperiment = { experiments: serverExperiments }
    
    Object.assign(nuxt.options.runtimeConfig.public, {
      abExperiment: {
        experiments: publicExperiments,
      },
    })

    const resolver = createResolver(import.meta.url)

    addImports({
      name: 'useExperimentVariant',
      from: resolver.resolve('./runtime/app/composables/useExperimentVariant'),
    })

    addServerHandler({
      middleware: true,
      handler: resolver.resolve('./runtime/server/middleware/assign-experiment'),
    })

    addPlugin({
      src: resolver.resolve('./runtime/app/plugins/restore-experiment-cookie.server'),
      mode: 'server',
    })
  },
})
