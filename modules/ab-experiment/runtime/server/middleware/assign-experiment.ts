import { defineEventHandler, getCookie, setCookie, setResponseHeader } from 'h3'
import type { H3Event } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { getExperimentHeaderName, isValidExperimentProbability } from '../../../utils'
import type { ExperimentCookieOptions, ExperimentVariant, RuntimeCookieOptions, RuntimeExperimentOptions } from '../../../types'

const DEFAULT_COOKIE_OPTIONS = {
  path: '/',
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24 * 30, // 30 дней
  secure: !import.meta.dev,
}

function pickVariant(probabilityB: number, bucket: number): ExperimentVariant {
  if (!isValidExperimentProbability(probabilityB)) {
    throw new RangeError('probabilityB должна быть от 0 до 1')
  }

  if (bucket < probabilityB) {
    return 'b'
  }

  return 'a'
}

function resolveCookieOptions(options: RuntimeCookieOptions): ExperimentCookieOptions {
  const { expires, ...cookieAttributes } = options
  const cookieOptions: ExperimentCookieOptions = {
    ...DEFAULT_COOKIE_OPTIONS,
    ...cookieAttributes,
  }

  if (expires === undefined) {
    return cookieOptions
  }

  cookieOptions.expires = new Date(expires)

  return cookieOptions
}

function getOrAssignBucket(
  event: H3Event,
  bucketCookieName: string,
  cookieOptions: ExperimentCookieOptions,
): number {
  const storedBucket = getCookie(event, bucketCookieName)?.trim() ?? ''
  const bucket = storedBucket ? Number(storedBucket) : NaN
  const isValidBucket = Number.isFinite(bucket) && bucket >= 0 && bucket < 1

  if (isValidBucket) {
    return bucket
  }

  const assignedBucket = Math.random()
  setCookie(event, bucketCookieName, String(assignedBucket), cookieOptions)

  return assignedBucket
}

function assignExperimentVariant(
  event: H3Event,
  experiment: RuntimeExperimentOptions,
): ExperimentVariant {
  const { cookieName, probabilityB } = experiment
  const cookieOptions = resolveCookieOptions(experiment.cookieOptions)
  const bucketCookieName = `${cookieName}-bucket`
  const bucket = getOrAssignBucket(event, bucketCookieName, cookieOptions)
  const variant = pickVariant(probabilityB, bucket)

  if (getCookie(event, cookieName) !== variant) {
    setCookie(event, cookieName, variant, cookieOptions)
  }

  // Записываем в запрос хэдер с присвоенным вариантом перед тем как Nitro начнет искать закешированный ответ.
  const headerName = getExperimentHeaderName(cookieName)
  event.node.req.headers[headerName] = variant

  setResponseHeader(event, headerName, variant)

  return variant
}

export default defineEventHandler((event) => {
  if (event.method !== 'GET' && event.method !== 'HEAD') {
    return
  }

  const config = useRuntimeConfig(event)

  for (const experiment of Object.values(config.abExperiment.experiments)) {
    assignExperimentVariant(event, experiment)
  }
})
