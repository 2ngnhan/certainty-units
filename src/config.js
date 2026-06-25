import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import yaml from 'js-yaml'

const CONFIG_FILE = 'certainty.config.yaml'

export function loadConfig(filePath) {
  const path = resolve(filePath ?? CONFIG_FILE)
  if (!existsSync(path)) {
    throw new Error(`Config file not found: ${path}\nRun: certainty-units init`)
  }
  const raw = readFileSync(path, 'utf8')
  const config = yaml.load(raw)

  // Expand env vars like ${MY_VAR}
  const json = JSON.stringify(config)
  const expanded = json.replace(/\$\{([^}]+)\}/g, (_, key) => {
    const val = process.env[key]
    if (!val) throw new Error(`Missing env var: ${key}`)
    return val
  })
  return JSON.parse(expanded)
}

export const CONFIG_TEMPLATE = `# certainty-units configuration
# Docs: https://github.com/propozel/certainty-units

project: My Project

# Choose one source: linear | jira | notion | monday | clickup
source: linear

linear:
  apiKey: \${LINEAR_API_KEY}
  teamId: your-team-id   # from Linear team URL

  # Optional: override field mappings
  # fieldMap:
  #   validation_status:
  #     field: state.type
  #     map:
  #       completed: validated
  #       started: assumed
  #   cu_tier:
  #     field: estimate
  #     map:
  #       1: basic
  #       3: intermediate
  #       8: advanced

# jira:
#   host: yourteam.atlassian.net
#   email: you@example.com
#   apiToken: \${JIRA_API_TOKEN}
#   projectKey: MYPROJECT

# notion:
#   apiKey: \${NOTION_API_KEY}
#   databaseId: your-database-id
#   fieldMap:
#     title_field: { field: Name }
#     validation_status:
#       field: Status
#       map:
#         Done: validated
#         "In Progress": assumed

output:
  html: cu-report.html
  markdown: cu-report.md   # optional — remove to skip
`
