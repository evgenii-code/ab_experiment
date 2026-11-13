<script setup lang="ts">
const { variant } = useExperimentVariant('checkout')
</script>

<template>
  <div>
    Checkout A/B variant: {{ variant }}
  </div>
</template>
