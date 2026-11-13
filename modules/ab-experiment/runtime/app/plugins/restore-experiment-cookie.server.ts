import { defineNuxtPlugin, useRequestEvent, useRequestHeader, useRuntimeConfig } from '#imports'
import { parse, serialize } from 'cookie-es'
import { getExperimentHeaderName } from '../../../utils'

export default defineNuxtPlugin({
  name: 'restore-experiment-cookies',

  enforce: 'pre',

  setup() {
    const event = useRequestEvent()

    if (!event) {
      return
    }

    const config = useRuntimeConfig()
    const experiments = config.public.abExperiment.experiments
    const requestCookies = parse(event.node.req.headers.cookie ?? '')

    for (const { cookieName } of Object.values(experiments)) {
      const headerName = getExperimentHeaderName(cookieName)
      const variant = useRequestHeader(headerName)
      const isValidVariant = variant === 'a' || variant === 'b'

      // На кешируемом маршруте доступны только заголовки из его cache.varies.
      if (!isValidVariant) {
        continue
      }

      requestCookies[cookieName] = variant
    }

    // Nitro уже выбрал ключ кеша, отправил Set-Cookie для браузера. 
    // Но для серверного useCookie() восстанавливаем куки вручную, они не перезаписывают браузерные куки.
    const serializedCookies = Object.entries(requestCookies)
      .filter((entry): entry is [string, string] => entry[1] !== undefined)
      .map(([name, value]) => serialize(name, value))

    event.node.req.headers.cookie = serializedCookies.join('; ')
  },
})
