<script setup lang="ts">
import { COOKIE_NAME_CATALOG_VARIANT } from '#shared/utils/constants'

const variant = useCookie(COOKIE_NAME_CATALOG_VARIANT)
</script>

<template>
  <div>
    A/B variant: {{ variant }}
  </div>
</template>
