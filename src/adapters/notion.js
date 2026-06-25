// Notion adapter — maps a Notion database to CU items via Notion API

const NOTION_API = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

async function notionFetch(apiKey, path, body = null) {
  const res = await fetch(`${NOTION_API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`Notion API ${res.status}: ${await res.text()}`)
  return res.json()
}

async function fetchAllPages(apiKey, databaseId) {
  const pages = []
  let cursor = null

  do {
    const body = { page_size: 100 }
    if (cursor) body.start_cursor = cursor
    const data = await notionFetch(apiKey, `/databases/${databaseId}/query`, body)
    pages.push(...data.results)
    cursor = data.has_more ? data.next_cursor : null
  } while (cursor)

  return pages
}

// Extract plain text from a Notion rich_text array
function richText(arr) {
  return arr?.map(r => r.plain_text).join('') ?? ''
}

// Extract value from a Notion property by type
function extractProp(prop) {
  if (!prop) return null
  switch (prop.type) {
    case 'title':        return richText(prop.title)
    case 'rich_text':   return richText(prop.rich_text)
    case 'select':      return prop.select?.name ?? null
    case 'status':      return prop.status?.name ?? null
    case 'multi_select': return prop.multi_select?.map(s => s.name) ?? []
    case 'number':      return prop.number
    case 'checkbox':    return prop.checkbox
    case 'date':        return prop.date?.start ?? null
    case 'people':      return prop.people?.map(p => p.name).join(', ') ?? null
    case 'url':         return prop.url
    default:            return null
  }
}

// Default field map — teams override column names via config
const DEFAULT_MAP = {
  validation_status: {
    field: 'Status',  // Notion column name
    map: {
      Done:        'validated',
      'In Progress': 'assumed',
      'To Do':     'unvalidated',
      Backlog:     'unvalidated',
    },
    default: 'unvalidated',
  },
  workflow_status: {
    field: 'Status',
    map: {
      Done:          'done',
      'In Progress': 'in_progress',
      'To Do':       'todo',
      Backlog:       'todo',
    },
    default: 'todo',
  },
  cu_tier: {
    field: 'Priority',
    map: {
      High:   'advanced',
      Medium: 'intermediate',
      Low:    'basic',
    },
    default: null,
  },
  title_field:    { field: 'Name' },
  assignee_field: { field: 'Assignee' },
  estimate_field: { field: 'Estimate' },
}

function mergeFieldMap(userMap = {}) {
  const merged = structuredClone(DEFAULT_MAP)
  for (const [field, def] of Object.entries(userMap)) {
    if (typeof def === 'object' && def.map) {
      merged[field] = {
        field:   def.field ?? merged[field]?.field,
        map:     { ...merged[field]?.map, ...def.map },
        default: def.default ?? merged[field]?.default ?? null,
      }
    } else {
      merged[field] = def
    }
  }
  return merged
}

export async function fetchItems(config) {
  const { apiKey, databaseId } = config
  if (!apiKey)     throw new Error('notion.apiKey is required')
  if (!databaseId) throw new Error('notion.databaseId is required')

  const pages = await fetchAllPages(apiKey, databaseId)
  const fm = mergeFieldMap(config.fieldMap)

  return pages.map(page => {
    const props = page.properties
    const statusRaw = extractProp(props[fm.validation_status.field])

    return {
      id:                  page.id,
      external_id:         page.id.slice(0, 8),
      title:               extractProp(props[fm.title_field.field]) ?? 'Untitled',
      description:         '',
      url:                 page.url,
      validation_status:   fm.validation_status.map[statusRaw] ?? fm.validation_status.default,
      workflow_status:     fm.workflow_status.map[statusRaw] ?? fm.workflow_status.default,
      cu_tier:             (() => {
        const raw = extractProp(props[fm.cu_tier.field])
        return fm.cu_tier.map[raw] ?? fm.cu_tier.default
      })(),
      cu_value:            extractProp(props[fm.estimate_field?.field]) ?? 1,
      evidence:            '',
      acceptance_criteria: null,
      novelty_rating:      null,
      complexity_rating:   null,
      dependency_rating:   null,
      citation_count:      0,
      assignee:            extractProp(props[fm.assignee_field?.field]),
      labels:              [],
      created_at:          page.created_time,
      updated_at:          page.last_edited_time,
      source:              'notion',
    }
  })
}
