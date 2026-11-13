export function getExperimentHeaderName (cookieName: string): string {
  return `x-${cookieName}`.toLowerCase()
}

export function isValidExperimentProbability (probabilityB: number): boolean {
  return Number.isFinite(probabilityB) && probabilityB >= 0 && probabilityB <= 1
}
