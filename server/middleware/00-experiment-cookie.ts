import { COOKIE_NAME_CATALOG_VARIANT } from '#shared/utils/constants'

import type { H3Event } from 'h3'

type Variant = 'a' | 'b'

const COOKIE_OPTIONS = {
  path: '/',
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24 * 30, // 30 days
  secure: !import.meta.dev,
}

function pickVariant (probabilityB: number, bucket: number): Variant {
  const isValid = Number.isFinite(probabilityB) && probabilityB >= 0 && probabilityB <= 1

  if (!isValid) {
    throw new RangeError('probabilityB должна быть от 0 до 1')
  }

  const isB = bucket < probabilityB

  if (isB) {
    return 'b'
  }

  return 'a'
}

function assignExperimentVariant (
  event: H3Event,
  cookieName: string,
  probabilityB: number,
): Variant {
  const bucketCookieName = `${cookieName}-bucket`
  const bucketCookie = getCookie(event, bucketCookieName)

  let bucket = bucketCookie?.trim() ? Number(bucketCookie) : NaN

  const needsBucketAssignment = !Number.isFinite(bucket) || bucket < 0 || bucket >= 1

  if (needsBucketAssignment) {
    bucket = Math.random()
    setCookie(event, bucketCookieName, String(bucket), COOKIE_OPTIONS)
  }

  const variant = pickVariant(probabilityB, bucket)

  if (getCookie(event, cookieName) !== variant) {
    setCookie(event, cookieName, variant, COOKIE_OPTIONS)
  }

  // Normalize the request header before Nitro looks up the cached response.
  const headerName = `x-${cookieName}`
  event.node.req.headers[headerName] = variant

  setResponseHeader(event, headerName, variant)

  return variant
}


export default defineEventHandler((event) => {
  if (event.method !== 'GET' && event.method !== 'HEAD') {
    return
  }

  assignExperimentVariant(event, COOKIE_NAME_CATALOG_VARIANT, 0.2)
})
