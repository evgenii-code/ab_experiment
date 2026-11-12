import { parse, serialize } from 'cookie-es'
import type { H3Event } from 'h3'
import { COOKIE_NAME_CATALOG_VARIANT } from '#shared/utils/constants'

function restoreExperimentCookie (event: H3Event, cookieName: string) {
  const variant = useRequestHeader(`x-${cookieName}`)
  
  if (!event || !variant) {
    return
  }
  
  const cookies = parse(event.node.req.headers.cookie ?? '')
  
  cookies[cookieName] = variant
  
  // Nitro уже выбрал ключ кеша и отфильтровал заголовки.
  // Восстанавливаем cookie для серверного useCookie().
  event.node.req.headers.cookie = Object.entries(cookies)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([name, value]) => serialize(name, value))
    .join('; ')
}

export default defineNuxtPlugin({
  name: 'restore-experiment-cookies',

  enforce: 'pre',

  setup() {
    const event = useRequestEvent()

    if (!event) {
      return
    }

    restoreExperimentCookie(event, COOKIE_NAME_CATALOG_VARIANT)
  },
})