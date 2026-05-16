import { readFile } from 'node:fs/promises'

const requiredFiles = [
  'deploy/railway-web.json',
  'deploy/railway-openclaw-worker.json',
  'deploy/railway-morning-cron.json',
  'app/api/health/route.ts',
  'app/api/brain/openclaw/route.ts',
  'lib/openclaw.ts',
  'scripts/openclaw-head-gbrain.ts',
  'scripts/openclaw-loop.ts',
]

const requiredEnv = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'LABBRAIN_DEFAULT_BRAIN_NAME',
  'OPENCLAW_OPERATOR_NAME',
  'LABBRAIN_WORKER_TOKEN',
]

const schemaTokens = [
  'create table openclaw_instances',
  'create table openclaw_decisions',
  'openclaw_worker',
  'openclaw_decision',
]

const packageScripts = [
  'build',
  'typecheck',
  'verify:pipeline',
  'ci',
  'brain:morning',
  'openclaw:worker',
  'openclaw:loop',
]

async function main(): Promise<void> {
  await assertFilesExist(requiredFiles)
  await assertEnvExample()
  await assertSchema()
  await assertPackageScripts()
  await assertRailwayConfigs()
  console.log('Pipeline verification passed')
}

async function assertFilesExist(files: string[]): Promise<void> {
  for (const file of files) {
    await readFile(file, 'utf8')
  }
}

async function assertEnvExample(): Promise<void> {
  const env = await readFile('.env.example', 'utf8')
  for (const key of requiredEnv) {
    assert(env.includes(`${key}=`), `.env.example missing ${key}`)
  }
}

async function assertSchema(): Promise<void> {
  const schema = await readFile('db/schema.sql', 'utf8')
  for (const token of schemaTokens) {
    assert(schema.includes(token), `db/schema.sql missing ${token}`)
  }
}

async function assertPackageScripts(): Promise<void> {
  const pkg = JSON.parse(await readFile('package.json', 'utf8')) as { scripts?: Record<string, string> }
  for (const script of packageScripts) {
    assert(Boolean(pkg.scripts?.[script]), `package.json missing script ${script}`)
  }
}

async function assertRailwayConfigs(): Promise<void> {
  for (const file of requiredFiles.filter((path) => path.startsWith('deploy/railway-'))) {
    const config = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>
    assert(config.$schema === 'https://railway.com/railway.schema.json', `${file} missing Railway schema`)
    assert(typeof config.build === 'object' && config.build != null, `${file} missing build block`)
    assert(typeof config.deploy === 'object' && config.deploy != null, `${file} missing deploy block`)
  }
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
