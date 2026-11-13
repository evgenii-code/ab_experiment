# A/B-эксперименты с SSR-кешем в Nuxt

Локальный модуль назначает независимые варианты `a`/`b` до обращения к кешу Nitro. Приложение читает их через `useExperimentVariant()`.

## Проблема

HTML зависит от варианта эксперимента, поэтому общий кеш страницы может вернуть посетителю чужой вариант. Разделение по всему заголовку `Cookie` тоже не подходит: персональные cookies создают множество отдельных записей.

Есть и проблема гидратации: внутри кешируемого обработчика Nitro оставляет только заголовки запроса из `cache.varies` и использует отдельные заголовки ответа. Поэтому SSR не видит ни исходный `Cookie`, ни `Set-Cookie`, выставленный middleware. Серверный `useCookie()` может получить пустое значение, хотя в браузере cookie уже есть.

## Решение

1. Nitro middleware определяет вариант, добавляет `Set-Cookie` в ответ и записывает вариант в заголовок запроса **до выбора кеша**.
2. Nitro разделяет кеш по этому заголовку.
3. Серверный Nuxt-плагин восстанавливает cookie из заголовка **до SSR**.
4. `useExperimentVariant()` читает одинаковый вариант при SSR и гидратации через `useCookie()`.

| Страница | Эксперимент | Cookie | Заголовок кеша |
| --- | --- | --- | --- |
| `/` | `catalog` | `catalog-variant` | `x-catalog-variant` |
| `/checkout` | `checkout` | `checkout-variant` | `x-checkout-variant` |

У каждой страницы два варианта кеша. Назначение checkout не влияет на кеш каталога, и наоборот.

## Флоу запроса

1. Браузер отправляет запрос страницы.
2. Nitro middleware обрабатывает `GET` и `HEAD`. Для каждого эксперимента:
   - Читает или создаёт собственный bucket.
   - Вычисляет вариант `a` или `b`.
   - При необходимости добавляет `Set-Cookie` в ответ.
   - Записывает вариант в заголовок запроса `x-<cookieName>`.
3. Nitro выбирает запись кеша по URL и заголовкам из `cache.varies`:
   - Если кеш свежий, возвращает готовый HTML.
   - Если кеш устарел, но ещё допустим, возвращает HTML и запускает обновление в фоне.
   - Если подходящего кеша нет, запускает генерацию HTML и ожидает результат.
4. При генерации HTML, в том числе при фоновом обновлении:
   - Nuxt-плагин восстанавливает cookies из доступных заголовков экспериментов.
   - SSR читает вариант через `useExperimentVariant()`.
   - Сгенерированный HTML сохраняется в кеше.
5. Браузер получает HTML и применяет `Set-Cookie` из ответа.
6. При гидратации `useExperimentVariant()` читает cookie браузера через `useCookie()`.

Middleware выполняется и при попадании в кеш.

Плагин и SSR выполняются только при генерации ответа.

У каждого эксперимента две cookies:

- `<cookieName>-bucket` — случайное число в `[0, 1)`, создаваемое при отсутствии или некорректном значении;
- `<cookieName>` — `b`, если `bucket < probabilityB`, иначе `a`.

При сохранённом bucket и неизменной вероятности вариант стабилен. Изменение `probabilityB` пересчитывает только соответствующий эксперимент.

## Основные компоненты

Все пути ниже относятся к `modules/ab-experiment/`.

| Файл | Ответственность |
| --- | --- |
| [`module.ts`](modules/ab-experiment/module.ts) | Регистрирует middleware, серверный плагин и автоимпорт composable; заполняет `runtimeConfig`. |
| [`config.ts`](modules/ab-experiment/config.ts) | Проверяет настройки и конфликты имён, объединяет cookie-опции, сериализует `expires`. |
| [`types.ts`](modules/ab-experiment/types.ts) | Типы экспериментов, вариантов и cookie-опций. |
| [`utils.ts`](modules/ab-experiment/utils.ts) | Формирует имя заголовка через `getExperimentHeaderName()`, проверяет вероятность. |
| [`runtime/server/middleware/assign-experiment.ts`](modules/ab-experiment/runtime/server/middleware/assign-experiment.ts) | Назначает bucket и вариант, выставляет cookies и заголовки до кеша. |
| [`runtime/app/plugins/restore-experiment-cookie.server.ts`](modules/ab-experiment/runtime/app/plugins/restore-experiment-cookie.server.ts) | Восстанавливает cookies только из доступных заголовков экспериментов перед SSR. |
| [`runtime/app/composables/useExperimentVariant.ts`](modules/ab-experiment/runtime/app/composables/useExperimentVariant.ts) | Публичный API для компонентов и composables приложения. |

Полные настройки находятся в `runtimeConfig.abExperiment.experiments`. В `runtimeConfig.public.abExperiment.experiments` передаются только идентификаторы экспериментов и имена cookies.

## Настройка

Пример из [`nuxt.config.ts`](nuxt.config.ts):

```ts
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
    cookieOptions: { maxAge: 60 * 60 * 24 * 7 },
  },
} satisfies Record<string, ExperimentOptions>

const catalogHeader = getExperimentHeaderName(experiments.catalog.cookieName)
const checkoutHeader = getExperimentHeaderName(experiments.checkout.cookieName)

export default defineNuxtConfig({
  modules: ['./modules/ab-experiment/module'],
  abExperiment: {
    experiments,
    cookieOptions: { sameSite: 'lax' },
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
  },
})
```

`experiments` по умолчанию пуст. Для каждого эксперимента обязательны `cookieName` и `probabilityB` от `0` до `1`.

Имена cookies, bucket-cookies и заголовков не должны конфликтовать.

### Cookie-опции

Приоритет: **дефолты → общие `abExperiment.cookieOptions` → `experiments[id].cookieOptions`**. Итоговые опции применяются к варианту и bucket.

```ts
// Дефолты в assign-experiment.ts
{
  path: '/',
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 30,
  secure: !import.meta.dev,
}
```

Поддерживаются опции `setCookie()` из H3, кроме функции `encode`. `false` и `0` сохраняются, `undefined` не переопределяет предыдущий уровень. `expires` задаётся как `Date`; при наличии `maxAge` браузер отдаёт ему приоритет.

Cookie варианта должна быть доступна через `document.cookie`: `httpOnly: true` несовместим с текущей гидратацией, а `path`/`domain` должны соответствовать странице. Для `secure: true` нужен HTTPS; вне dev этот флаг включён по умолчанию.

Опции хранения передаются через `Set-Cookie` из middleware. Плагин меняет только локальный заголовок `Cookie` SSR-запроса: он не записывает cookies браузера и не меняет уже выбранный ключ кеша.

## Использование в приложении

`useExperimentVariant()` автоимпортируется Nuxt. Аргумент — ключ из `abExperiment.experiments`, а не имя cookie.

```vue
<script setup lang="ts">
const { variant, isA, isB } = useExperimentVariant('catalog')
</script>

<template>
  <div>
    <p>Вариант: {{ variant }}</p>
    <p v-if="isA">Каталог A</p>
    <p v-else-if="isB">Каталог B</p>
  </div>
</template>
```

Возвращаемые значения:

- `variant` — readonly ref со значением `'a' | 'b' | undefined`;
- `isA`, `isB` — computed refs; при отсутствии cookie оба равны `false`.

Пример в другом composable:

```ts
export function useCheckoutExperiment () {
  const { variant, isB } = useExperimentVariant('checkout')
  const checkoutTitle = computed(() => isB.value ? 'Checkout B' : 'Checkout A')

  return { variant, checkoutTitle }
}
```

Вызывать в `setup` или composable в контексте Nuxt. В script значения refs читаются через `.value`, в template разворачиваются автоматически. Отсутствующая конфигурация модуля или неизвестный идентификатор приводят к ошибке с пояснением.

## Правила кеширования

- В `cache.varies` нужны заголовки **всех экспериментов, влияющих на HTML маршрута**. Для двух экспериментов на одной странице — до четырёх комбинаций кеша; `Vary` перечисляет заголовки через запятую.
- `swr: 600` задаёт 600 секунд свежести; `staleMaxAge: 3600` — дополнительный период выдачи устаревшего ответа с обновлением в фоне.
- `cache.varies` управляет кешем Nitro, `Vary` — внешними HTTP-кешами. CDN должен получать вариант до собственного выбора кеша: заголовок, добавленный внутри Nitro, этого не обеспечивает.
- После изменений SSR или конфигурации старые SWR-ответы могут сохраняться. Перезапуск dev-сервера очищает кеш в памяти; постоянное хранилище очищается отдельно. После изменения модуля нужна полная перезагрузка страницы, чтобы клиент получил актуальный runtime config.

## Команды

```bash
bun install
bun run dev      # http://localhost:3000
bun run build   # production-сборка
bun run preview # просмотр сборки
bun run test    # сборка + HTTP-тесты
```

Тесты проверяют обе страницы, четыре сочетания вариантов, независимость кешей, первый и повторный визиты, cookie-опции и исправление некорректного bucket.
