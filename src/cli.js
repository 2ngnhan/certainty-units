#!/usr/bin/env node
import { program } from 'commander'
import { writeFileSync } from 'fs'
import chalk from 'chalk'
import { loadConfig, CONFIG_TEMPLATE } from './config.js'
import { computeCertaintyScore } from './certainty.js'
import { generateHTML, generateMarkdown } from './report.js'

// Lazy-load adapters by source name
async function loadAdapter(source) {
  const adapters = { linear: './adapters/linear.js', jira: './adapters/jira.js', notion: './adapters/notion.js' }
  const path = adapters[source]
  if (!path) throw new Error(`Unknown source: "${source}". Supported: ${Object.keys(adapters).join(', ')}`)
  return import(path)
}

program
  .name('certainty-units')
  .description('Certainty scoring for project work items')
  .version('0.1.0')

program
  .command('init')
  .description('Create a certainty.config.yaml template in the current directory')
  .action(() => {
    writeFileSync('certainty.config.yaml', CONFIG_TEMPLATE)
    console.log(chalk.green('✓') + ' Created certainty.config.yaml')
    console.log('  Edit it with your API keys, then run: certainty-units sync')
  })

program
  .command('sync')
  .description('Fetch items from your tool and compute certainty scores')
  .option('-c, --config <path>', 'path to config file', 'certainty.config.yaml')
  .option('--source <name>', 'override source from config')
  .option('--json', 'also write cu-data.json')
  .action(async (opts) => {
    let config
    try {
      config = loadConfig(opts.config)
    } catch (e) {
      console.error(chalk.red('Error: ') + e.message)
      process.exit(1)
    }

    const source = opts.source ?? config.source
    console.log(chalk.dim(`Fetching from ${source}…`))

    let adapter
    try {
      adapter = await loadAdapter(source)
    } catch (e) {
      console.error(chalk.red('Error: ') + e.message)
      process.exit(1)
    }

    let items
    try {
      items = await adapter.fetchItems(config[source] ?? config)
    } catch (e) {
      console.error(chalk.red(`Failed to fetch from ${source}: `) + e.message)
      process.exit(1)
    }

    console.log(chalk.dim(`  ${items.length} items fetched. Computing certainty scores…`))

    for (const item of items) {
      item.certainty_score = computeCertaintyScore(item, item.citation_count ?? 0)
    }

    const projectName = config.project ?? 'Project'
    const out = config.output ?? {}

    const htmlPath = out.html ?? 'cu-report.html'
    writeFileSync(htmlPath, generateHTML(items, projectName))
    console.log(chalk.green('✓') + ` ${htmlPath}`)

    if (out.markdown) {
      writeFileSync(out.markdown, generateMarkdown(items, projectName))
      console.log(chalk.green('✓') + ` ${out.markdown}`)
    }

    if (opts.json) {
      writeFileSync('cu-data.json', JSON.stringify(items, null, 2))
      console.log(chalk.green('✓') + ' cu-data.json')
    }

    // Print quick summary to terminal
    const scores = items.map(i => i.certainty_score)
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
    const high   = scores.filter(s => s >= 80).length
    const medium = scores.filter(s => s >= 50 && s < 80).length
    const low    = scores.filter(s => s >= 20 && s < 50).length
    const unc    = scores.filter(s => s < 20).length

    console.log()
    console.log(chalk.bold(`${items.length} items  ·  avg certainty ${avg}%`))
    console.log(
      chalk.green(`  high ${high}`) + '  ' +
      chalk.blue(`medium ${medium}`) + '  ' +
      chalk.yellow(`low ${low}`) + '  ' +
      chalk.red(`uncertain ${unc}`)
    )
  })

program
  .command('validate')
  .description('Check config file for required fields without making API calls')
  .option('-c, --config <path>', 'path to config file', 'certainty.config.yaml')
  .action((opts) => {
    try {
      const config = loadConfig(opts.config)
      console.log(chalk.green('✓') + ` Config is valid (source: ${config.source})`)
    } catch (e) {
      console.error(chalk.red('Invalid config: ') + e.message)
      process.exit(1)
    }
  })

program.parse()
