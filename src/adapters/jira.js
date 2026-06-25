// Jira adapter — maps Jira issues to CU items via REST API

function base64(str) {
  return Buffer.from(str).toString('base64')
}

async function jiraFetch(config, path) {
  const { host, email, apiToken } = config
  const url = `https://${host}/rest/api/3${path}`
  const auth = base64(`${email}:${apiToken}`)
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Jira API ${res.status}: ${await res.text()}`)
  return res.json()
}

async function fetchAllIssues(config) {
  const { projectKey, jql: customJql } = config
  const jql = customJql ?? `project = "${projectKey}" ORDER BY updated DESC`
  const issues = []
  let startAt = 0
  const maxResults = 100

  do {
    const data = await jiraFetch(
      config,
      `/search?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=${maxResults}&fields=summary,description,status,priority,assignee,labels,comment,created,updated,customfield_10016`
    )
    issues.push(...data.issues)
    startAt += data.issues.length
    if (startAt >= data.total) break
  } while (true)

  return issues
}

const DEFAULT_MAP = {
  validation_status: {
    field: 'fields.status.statusCategory.key',
    map: {
      done:       'validated',
      'in-progress': 'assumed',
      new:        'unvalidated',
    },
    default: 'unvalidated',
  },
  workflow_status: {
    field: 'fields.status.statusCategory.key',
    map: {
      done:          'done',
      'in-progress': 'in_progress',
      new:           'todo',
    },
    default: 'todo',
  },
  cu_tier: {
    field: 'fields.priority.name',
    map: {
      Highest: 'advanced',
      High:    'advanced',
      Medium:  'intermediate',
      Low:     'basic',
      Lowest:  'basic',
    },
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
      field:   def.field ?? merged[field]?.field,
      map:     { ...merged[field]?.map, ...def.map },
      default: def.default ?? merged[field]?.default ?? null,
    }
  }
  return merged
}

export async function fetchItems(config) {
  const { host, email, apiToken, projectKey } = config
  if (!host)       throw new Error('jira.host is required (e.g. yourteam.atlassian.net)')
  if (!email)      throw new Error('jira.email is required')
  if (!apiToken)   throw new Error('jira.apiToken is required')
  if (!projectKey) throw new Error('jira.projectKey is required')

  const issues = await fetchAllIssues(config)
  const fieldMap = mergeFieldMap(config.fieldMap)

  return issues.map(issue => {
    const f = issue.fields
    // customfield_10016 is story points in most Jira configs
    const storyPoints = f.customfield_10016

    const descText = f.description?.content
      ?.flatMap(b => b.content ?? [])
      ?.filter(n => n.type === 'text')
      ?.map(n => n.text)
      ?.join(' ') ?? ''

    return {
      id:                  issue.id,
      external_id:         issue.key,
      title:               f.summary,
      description:         descText,
      url:                 `https://${host}/browse/${issue.key}`,
      validation_status:   applyMap(issue, fieldMap.validation_status),
      workflow_status:     applyMap(issue, fieldMap.workflow_status),
      cu_tier:             applyMap(issue, fieldMap.cu_tier),
      cu_value:            storyPoints ?? 1,
      evidence:            descText,
      acceptance_criteria: null,
      novelty_rating:      null,
      complexity_rating:   null,
      dependency_rating:   null,
      citation_count:      f.comment?.total ?? 0,
      assignee:            f.assignee?.displayName ?? null,
      labels:              f.labels ?? [],
      created_at:          f.created,
      updated_at:          f.updated,
      source:              'jira',
    }
  })
}
