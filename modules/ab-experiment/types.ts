import type { setCookie } from 'h3'

export type ExperimentVariant = 'a' | 'b'

export type ExperimentCookieOptions = Omit<NonNullable<Parameters<typeof setCookie>[3]>, 'encode'>

export interface ExperimentOptions {
  cookieName: string
  probabilityB: number
  cookieOptions?: ExperimentCookieOptions
}

export type PublicExperimentOptions = Pick<ExperimentOptions, 'cookieName'>

export interface ModuleOptions {
  experiments: Record<string, ExperimentOptions>
  cookieOptions?: ExperimentCookieOptions
}

export type RuntimeCookieOptions = Omit<ExperimentCookieOptions, 'expires'> & { expires?: string }

export interface RuntimeExperimentOptions {
  cookieName: string
  probabilityB: number
  cookieOptions: RuntimeCookieOptions
}

declare module '@nuxt/schema' {
  interface RuntimeConfig {
    abExperiment: { experiments: Record<string, RuntimeExperimentOptions> }
  }
}
