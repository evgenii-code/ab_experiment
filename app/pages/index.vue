<script setup lang="ts">
const { variant } = useExperimentVariant('catalog')
</script>

<template>
  <div>
    Catalog A/B variant: {{ variant }}
  </div>
</template>
