// Linear adapter — maps Linear issues to CU items via GraphQL

const LINEAR_API = 'https://api.linear.app/graphql'

const ISSUES_QUERY = `
  query Issues($teamId: String!, $after: String) {
    issues(
      filter: { team: { id: { eq: $teamId } } }
      first: 100
      after: $after
    ) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        identifier
        title
        description
        priority
        estimate
        state { name type }
        assignee { name }
        labels { nodes { name } }
        comments { totalCount }
        createdAt
        updatedAt
        url
      }
    }
  }
`

async function graphql(apiKey, query, variables = {}) {
  const res = await fetch(LINEAR_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error(`Linear API ${res.status}: ${await res.text()}`)
  const json = await res.json()
  if (json.errors) throw new Error(`Linear GraphQL: ${json.errors.map(e => e.message).join(', ')}`)
  return json.data
}

async function fetchAllIssues(apiKey, teamId) {
  const issues = []
  let after = null
  do {
    const data = await graphql(apiKey, ISSUES_QUERY, { teamId, after })
    issues.push(...data.issues.nodes)
    after = data.issues.pageInfo.hasNextPage ? data.issues.pageInfo.endCursor : null
  } while (after)
  return issues
}

// Default field mapping — overridable via certainty.config.yaml fieldMap
const DEFAULT_MAP = {
  validation_status: {
    field: 'state.type',
    map: {
      completed: 'validated',
      started:   'assumed',
      triage:    'needs_clarification',
      backlog:   'unvalidated',
      cancelled: 'unvalidated',
    },
    default: 'unvalidated',
  },
  workflow_status: {
    field: 'state.type',
    map: {
      completed: 'done',
      started:   'in_progress',
      triage:    'todo',
      backlog:   'todo',
      cancelled: 'todo',
    },
    default: 'todo',
  },
  cu_tier: {
    field: 'priority',
    map: { 1: 'advanced', 2: 'intermediate', 3: 'basic', 4: 'basic' },
    default: null,
  },
}

function getField(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj)
}

function applyMap(issue, fieldDef) {
  const raw = getField(issue, fieldDef.field)
  return fieldDef.map[raw] ?? fieldDef.default
}

function mergeFieldMap(userMap = {}) {
  const merged = structuredClone(DEFAULT_MAP)
  for (const [field, def] of Object.entries(userMap)) {
    merged[field] = {
      field: def.field ?? merged[field]?.field,
      map:   { ...merged[field]?.map, ...def.map },
      default: def.default ?? merged[field]?.default ?? null,
    }
  }
  return merged
}

export async function fetchItems(config) {
  const { apiKey, teamId, fieldMap: userFieldMap } = config
  if (!apiKey) throw new Error('linear.apiKey is required')
  if (!teamId) throw new Error('linear.teamId is required')

  const issues = await fetchAllIssues(apiKey, teamId)
  const fieldMap = mergeFieldMap(userFieldMap)

  return issues.map(issue => ({
    id:                 issue.id,
    external_id:        issue.identifier,
    title:              issue.title,
    description:        issue.description || '',
    url:                issue.url,
    validation_status:  applyMap(issue, fieldMap.validation_status),
    workflow_status:    applyMap(issue, fieldMap.workflow_status),
    cu_tier:            applyMap(issue, fieldMap.cu_tier),
    cu_value:           issue.estimate ?? 1,
    evidence:           issue.description || '',
    acceptance_criteria: null,
    novelty_rating:     null,
    complexity_rating:  null,
    dependency_rating:  null,
    citation_count:     issue.comments?.totalCount ?? 0,
    assignee:           issue.assignee?.name ?? null,
    labels:             issue.labels?.nodes?.map(l => l.name) ?? [],
    created_at:         issue.createdAt,
    updated_at:         issue.updatedAt,
    source:             'linear',
  }))
}
