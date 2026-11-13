import { useCookie, useRuntimeConfig } from '#imports'
import type { ExperimentVariant, PublicExperimentOptions } from '../../../types'

export function useExperimentVariant (experimentId: string) {
  const config = useRuntimeConfig()
  const experiments: Record<string, PublicExperimentOptions> | undefined =
    config.public.abExperiment?.experiments

  if (!experiments) {
    throw new Error('Конфигурация модуля ab-experiment недоступна')
  }

  const experiment = experiments[experimentId]

  if (!experiment) {
    throw new Error(`Эксперимент "${experimentId}" не настроен`)
  }

  const variant = useCookie<ExperimentVariant | undefined>(experiment.cookieName)

  const isA = computed(() => variant.value === 'a')
  const isB = computed(() => variant.value === 'b')

  return {
    variant: readonly(variant),
    isA,
    isB
  }
}
