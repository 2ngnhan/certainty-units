// Certainty Score engine — ported from Propozel (MIT)
// Items must conform to the CU shape: { validation_status, workflow_status,
// cu_tier, cu_value, evidence, acceptance_criteria, novelty_rating,
// complexity_rating, dependency_rating, certainty_score }

export const DEFAULT_CU_CONFIG = {
  signal_weight: 0.6,
  signals: {
    validation: 40,
    citations: 20,
    workflow: 20,
    evidence: 10,
    acceptance: 10,
  },
  dimension_weight: 0.4,
  dimensions: {
    novelty: 0.45,
    complexity: 0.35,
    dependencies: 0.20,
  },
}

const VALIDATION_SCORE = {
  validated: 40,
  assumed: 10,
  needs_clarification: 5,
  unvalidated: 0,
}

const WORKFLOW_SCORE = {
  done: 20,
  in_progress: 10,
  review: 15,
  todo: 0,
  blocked: 0,
}

export function computeSignalScore(item, citationCount = 0) {
  let score = 0
  score += VALIDATION_SCORE[item.validation_status] || 0
  score += Math.min(citationCount * 5, 15)
  if (item.evidence?.trim()) score += 5
  score += WORKFLOW_SCORE[item.workflow_status] || 0
  if (item.acceptance_criteria?.trim()) score += 10
  if (item.cu_tier) score += 10
  return Math.min(score, 100)
}

export function computeDimensionScore(item, config = DEFAULT_CU_CONFIG) {
  const n = item.novelty_rating || 3
  const c = item.complexity_rating || 3
  const d = item.dependency_rating || 3
  const w = config.dimensions
  const weighted = n * w.novelty + c * w.complexity + d * w.dependencies
  return Math.round(weighted * 20)
}

export function computeCertaintyScore(item, citationCount = 0, config = DEFAULT_CU_CONFIG) {
  const signalScore = computeSignalScore(item, citationCount)
  const dimensionScore = computeDimensionScore(item, config)
  const hasDimensions = item.novelty_rating || item.complexity_rating || item.dependency_rating
  if (!hasDimensions) return signalScore
  return Math.min(
    Math.round(signalScore * config.signal_weight + dimensionScore * config.dimension_weight),
    100
  )
}

export function certaintyLevel(score) {
  if (score >= 80) return 'high'
  if (score >= 50) return 'medium'
  if (score >= 20) return 'low'
  return 'uncertain'
}

export const CU_TIERS = [
  { value: 'basic',        label: 'Basic',        multiplier: 1 },
  { value: 'intermediate', label: 'Intermediate',  multiplier: 3 },
  { value: 'advanced',     label: 'Advanced',      multiplier: 6 },
]

export function computeCUMetrics(items) {
  const total = items.length
  const withCU = items.filter(i => i.cu_tier)
  const completed = withCU.filter(i => i.workflow_status === 'done')
  const accepted = completed.filter(i => i.validation_status === 'validated')
  const totalCUValue = withCU.reduce((sum, i) => sum + (i.cu_value || 1), 0)
  const completedCUValue = completed.reduce((sum, i) => sum + (i.cu_value || 1), 0)
  const scores = items.map(i => i.certainty_score || 0)
  const avgCertainty = total ? Math.round(scores.reduce((a, b) => a + b, 0) / total) : 0
  return {
    totalItems: total,
    cuItems: withCU.length,
    totalCUValue,
    completedCUValue,
    completionRate: withCU.length ? Math.round((completed.length / withCU.length) * 100) : 0,
    integrityScore: completed.length ? Math.round((accepted.length / completed.length) * 100) : 0,
    avgCertaintyScore: avgCertainty,
    velocity: completedCUValue,
    uphill: items.filter(i => (i.certainty_score || 0) < 50).length,
    downhill: items.filter(i => (i.certainty_score || 0) >= 50).length,
  }
}
