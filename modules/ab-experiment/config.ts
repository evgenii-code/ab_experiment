import { getExperimentHeaderName, isValidExperimentProbability } from './utils'
import type {
  ExperimentCookieOptions,
  ExperimentOptions,
  ModuleOptions,
  PublicExperimentOptions,
  RuntimeCookieOptions,
  RuntimeExperimentOptions,
} from './types'

function serializeCookieOptions(options: ExperimentCookieOptions = {}): RuntimeCookieOptions {
  const { expires, ...cookieAttributes } = options
  const hasFunctionOption = Object.values(cookieAttributes).some(optionValue => typeof optionValue === 'function')

  if (hasFunctionOption) {
    throw new TypeError('abExperiment.cookieOptions не поддерживает функции')
  }

  const definedAttributes = Object.entries(cookieAttributes).filter(([, optionValue]) => optionValue !== undefined)
  const serializedOptions = Object.fromEntries(definedAttributes) as RuntimeCookieOptions

  if (expires === undefined) {
    return serializedOptions
  }

  const isValidExpiry = expires instanceof Date && Number.isFinite(expires.getTime())

  if (!isValidExpiry) {
    throw new TypeError('abExperiment.cookieOptions.expires должна быть корректной датой')
  }

  serializedOptions.expires = expires.toISOString()

  return serializedOptions
}

function validateExperimentOptions(experimentId: string, experiment: ExperimentOptions): void {
  const { cookieName, probabilityB } = experiment
  const isValidCookieName = typeof cookieName === 'string' && /^[!#$%&'*+\-.^_`|~0-9a-zA-Z]+$/.test(cookieName)

  if (!isValidCookieName) {
    throw new TypeError(`abExperiment.experiments.${experimentId}.cookieName должно быть допустимым непустым именем cookie`)
  }

  if (!isValidExperimentProbability(probabilityB)) {
    throw new RangeError(`abExperiment.experiments.${experimentId}.probabilityB должна быть от 0 до 1`)
  }
}

export function createExperimentConfigs(options: ModuleOptions) {
  const usedCookieNames = new Set<string>()
  const usedHeaderNames = new Set<string>()

  const serverExperiments = new Map<string, RuntimeExperimentOptions>()
  const publicExperiments = new Map<string, PublicExperimentOptions>()
  
  const commonCookieOptions = serializeCookieOptions(options.cookieOptions)

  for (const [experimentId, experiment] of Object.entries(options.experiments)) {
    validateExperimentOptions(experimentId, experiment)

    const { cookieName, probabilityB } = experiment
    const bucketCookieName = `${cookieName}-bucket`
    const headerName = getExperimentHeaderName(cookieName)
    
    const hasCookieConflict = usedCookieNames.has(cookieName) || usedCookieNames.has(bucketCookieName)
    const hasHeaderConflict = usedHeaderNames.has(headerName)

    if (hasCookieConflict || hasHeaderConflict) {
      throw new Error(`abExperiment.experiments.${experimentId}: конфликт имён cookies или заголовка с другим экспериментом`)
    }

    usedCookieNames.add(cookieName)
    usedCookieNames.add(bucketCookieName)
    usedHeaderNames.add(headerName)

    const experimentCookieOptions = serializeCookieOptions(experiment.cookieOptions)
    const cookieOptions = { ...commonCookieOptions, ...experimentCookieOptions }

    serverExperiments.set(experimentId, { cookieName, probabilityB, cookieOptions })
    publicExperiments.set(experimentId, { cookieName })
  }

  return {
    serverExperiments: Object.fromEntries(serverExperiments),
    publicExperiments: Object.fromEntries(publicExperiments),
  }
}
