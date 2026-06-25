# certainty-units

Free, open-source certainty scoring for project work items.  
Connects to **Linear, Jira, Notion** (Monday + ClickUp coming).  
Outputs a static HTML dashboard + Markdown report — zero server required.

```
npx certainty-units sync
```

---

## Quick start

```bash
# 1. Create a config file
npx certainty-units init

# 2. Edit certainty.config.yaml with your API key and team/project ID

# 3. Fetch + score
LINEAR_API_KEY=lin_api_xxx npx certainty-units sync

# Output: cu-report.html  (open in any browser)
```

## What it scores

Each work item gets a **Certainty Score (0–100)** based on:

| Signal | Weight | How it maps |
|--------|--------|-------------|
| Validation status | 40 pts | `validated` → 40, `assumed` → 10 |
| Workflow progress | 20 pts | `done` → 20, `in_progress` → 10 |
| Has evidence/description | 5 pts | non-empty description |
| Has acceptance criteria | 10 pts | CU field on item |
| Has CU tier set | 10 pts | basic / intermediate / advanced |
| Comments / citations | up to 15 pts | proxy for discussed = less risky |

Scores map to levels: **high** (≥80) · **medium** (≥50) · **low** (≥20) · **uncertain** (<20)

## Supported sources

| Tool | Status |
|------|--------|
| Linear | ✅ |
| Jira | ✅ |
| Notion | ✅ |
| Monday.com | 🚧 coming |
| ClickUp | 🚧 coming |

## Config reference

```yaml
project: My Project
source: linear          # linear | jira | notion

linear:
  apiKey: ${LINEAR_API_KEY}    # env var expansion supported
  teamId: your-team-id

jira:
  host: yourteam.atlassian.net
  email: you@example.com
  apiToken: ${JIRA_API_TOKEN}
  projectKey: MYPROJECT

notion:
  apiKey: ${NOTION_API_KEY}
  databaseId: your-database-id

output:
  html: cu-report.html
  markdown: cu-report.md   # optional
```

### Field mapping

Every tool uses different status names. Override the defaults:

```yaml
linear:
  apiKey: ${LINEAR_API_KEY}
  teamId: abc123
  fieldMap:
    validation_status:
      field: state.type       # dot-path into the Linear issue object
      map:
        completed: validated
        started: assumed
    cu_tier:
      field: estimate
      map:
        1: basic
        3: intermediate
        8: advanced
```

## Automate with GitHub Actions

1. Add your API key as a repo secret (`LINEAR_API_KEY`)
2. Copy `.github/workflows/cu-report.yml` into your repo
3. Enable GitHub Pages → the report publishes every Monday

## License

MIT — free to use, modify, and embed.

---

Built on the [Certainty Units](https://propozel.com) methodology.
