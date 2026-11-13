import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { after, before, test } from 'node:test'
import { parseSetCookie } from 'cookie-es'

let server
let serverExit
let baseURL

function waitForServerAddress (serverProcess) {
  return new Promise((resolve, reject) => {
    let startupLogs = ''
    const startupTimeout = setTimeout(() => reject(new Error(`Server startup timed out: ${startupLogs}`)), 15000)

    function handleServerOutput (chunk) {
      startupLogs += chunk
      const serverAddress = startupLogs.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0]

      if (!serverAddress) {
        return
      }

      clearTimeout(startupTimeout)
      resolve(serverAddress)
    }

    serverProcess.stdout.on('data', handleServerOutput)
    serverProcess.stderr.on('data', handleServerOutput)
    serverProcess.once('exit', (code) => {
      clearTimeout(startupTimeout)
      reject(new Error(`Server exited with ${code}: ${startupLogs}`))
    })
    serverProcess.once('error', (error) => {
      clearTimeout(startupTimeout)
      reject(error)
    })
  })
}

before(async () => {
  server = spawn(process.execPath, ['.output/server/index.mjs'], {
    env: { ...process.env, NITRO_HOST: '127.0.0.1', NITRO_PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  serverExit = once(server, 'exit')
  baseURL = await waitForServerAddress(server)
})

after(async () => {
  server?.kill('SIGTERM')
  await serverExit
})

function createVisitorCookieHeader (catalogVariant, checkoutVariant, additionalCookie = '') {
  const catalogBucket = catalogVariant === 'a' ? '0.8' : '0.1'
  const checkoutBucket = checkoutVariant === 'a' ? '0.9' : '0.3'

  return [
    `catalog-variant=${catalogVariant}`,
    `catalog-variant-bucket=${catalogBucket}`,
    `checkout-variant=${checkoutVariant}`,
    `checkout-variant-bucket=${checkoutBucket}`,
    additionalCookie,
  ].filter(Boolean).join('; ')
}

async function requestPage (path, cookieHeader = '', headers = {}) {
  const response = await fetch(`${baseURL}${path}`, { headers: { cookie: cookieHeader, ...headers } })
  assert.equal(response.status, 200)

  const html = await response.text()
  const cookies = response.headers.getSetCookie().map(cookieHeader => parseSetCookie(cookieHeader))

  return {
    response,
    html,
    cookies,
  }
}

function getResponseCookie (page, cookieName) {
  const responseCookie = page.cookies.find(cookie => cookie.name === cookieName)
  assert.ok(responseCookie, `Expected Set-Cookie for ${cookieName}`)

  return responseCookie
}

function assertPageVariant (page, path, variant) {
  const experimentId = path === '/' ? 'catalog' : 'checkout'
  const title = path === '/' ? 'Catalog' : 'Checkout'
  const variantHeader = `x-${experimentId}-variant`

  assert.ok(page.html.includes(`${title} A/B variant: ${variant}`))
  assert.equal(page.response.headers.get('vary'), variantHeader)
  assert.equal(page.response.headers.get(variantHeader), variant)
  assert.ok(page.response.headers.get('cache-control').includes('s-maxage=600'))
  assert.ok(!page.html.includes('probabilityB'))
  assert.ok(!page.html.includes('-bucket'))
}

test('first visit assigns both experiments with default and per-experiment cookie options', async () => {
  const firstVisit = await requestPage('/')
  assert.equal(firstVisit.cookies.length, 4)

  const expectedExperiments = [
    { cookieName: 'catalog-variant', probabilityB: 0.2, maxAge: 2592000 },
    { cookieName: 'checkout-variant', probabilityB: 0.5, maxAge: 604800 },
  ]

  for (const { cookieName, probabilityB, maxAge } of expectedExperiments) {
    const variantCookie = getResponseCookie(firstVisit, cookieName)
    const bucketCookie = getResponseCookie(firstVisit, `${cookieName}-bucket`)
    const bucket = Number(bucketCookie.value)
    const expectedVariant = bucket < probabilityB ? 'b' : 'a'

    assert.ok(bucket >= 0 && bucket < 1)
    assert.equal(variantCookie.value, expectedVariant)

    for (const cookie of [variantCookie, bucketCookie]) {
      assert.equal(cookie.maxAge, maxAge)
      assert.equal(cookie.path, '/')
      assert.equal(cookie.sameSite, 'lax')
      assert.equal(cookie.secure, true)
      assert.ok(!cookie.httpOnly)
    }
  }

  const catalogVariant = getResponseCookie(firstVisit, 'catalog-variant').value
  const checkoutVariant = getResponseCookie(firstVisit, 'checkout-variant').value
  assertPageVariant(firstVisit, '/', catalogVariant)

  const returningCookieHeader = firstVisit.cookies.map(({ name, value }) => `${name}=${value}`).join('; ')
  const returningVisit = await requestPage('/checkout', returningCookieHeader)
  assertPageVariant(returningVisit, '/checkout', checkoutVariant)
  assert.equal(returningVisit.cookies.length, 0)
})

test('all four assignments share only the relevant page cache', async () => {
  const cachedPages = new Map()

  for (const catalogVariant of ['a', 'b']) {
    for (const checkoutVariant of ['a', 'b']) {
      const unrelatedCookie = `unrelated=${catalogVariant}${checkoutVariant}`
      const cookieHeader = createVisitorCookieHeader(catalogVariant, checkoutVariant, unrelatedCookie)
      const expectedPages = [
        { path: '/', variant: catalogVariant },
        { path: '/checkout', variant: checkoutVariant },
      ]

      for (const { path, variant } of expectedPages) {
        const page = await requestPage(path, cookieHeader)
        assertPageVariant(page, path, variant)
        assert.equal(page.cookies.length, 0)

        const cacheKey = `${path}:${variant}`
        const cachedPage = cachedPages.get(cacheKey)

        if (!cachedPage) {
          cachedPages.set(cacheKey, page)

          continue
        }

        assert.equal(page.html, cachedPage.html)
        assert.equal(page.response.headers.get('etag'), cachedPage.response.headers.get('etag'))
      }
    }
  }

  assert.equal(cachedPages.size, 4)
  for (const path of ['/', '/checkout']) {
    assert.notEqual(cachedPages.get(`${path}:a`).html, cachedPages.get(`${path}:b`).html)
  }
})

test('middleware corrects one stale variant before the cache without changing the other experiment', async () => {
  const staleCookieHeader = 'catalog-variant=a; catalog-variant-bucket=0.8; checkout-variant=a; checkout-variant-bucket=0.3'
  const page = await requestPage('/checkout',
    staleCookieHeader,
    { 'x-catalog-variant': 'b', 'x-checkout-variant': 'a' },
  )
  assertPageVariant(page, '/checkout', 'b')
  assert.equal(page.response.headers.get('x-catalog-variant'), 'a')
  assert.equal(page.cookies.length, 1)

  const correctedCookie = getResponseCookie(page, 'checkout-variant')
  assert.equal(correctedCookie.value, 'b')
  assert.equal(correctedCookie.maxAge, 604800)
})

test('cache hits still assign visitor-specific buckets and repair only invalid buckets', async () => {
  const newVisitor = await requestPage('/checkout')
  assert.equal(newVisitor.cookies.length, 4)
  const checkoutVariant = getResponseCookie(newVisitor, 'checkout-variant').value
  assertPageVariant(newVisitor, '/checkout', checkoutVariant)

  for (const invalidBucket of ['invalid', '-0.1', '1']) {
    const cookieHeader = `catalog-variant-bucket=${invalidBucket}; checkout-variant=b; checkout-variant-bucket=0.3`
    const page = await requestPage('/', cookieHeader)

    getResponseCookie(page, 'catalog-variant-bucket')
    assert.ok(page.cookies.every(cookie => cookie.name.startsWith('catalog-variant')))
    assert.equal(page.response.headers.get('x-checkout-variant'), 'b')
  }
})
