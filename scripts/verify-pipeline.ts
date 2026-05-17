import { readFile } from 'node:fs/promises'

const requiredFiles = [
  'deploy/railway-web.json',
  'deploy/railway-openclaw-worker.json',
  'deploy/railway-morning-cron.json',
  'app/api/health/route.ts',
  'app/api/brain/openclaw/route.ts',
  'app/api/brain/research-question/route.ts',
  'lib/postgres-rest.ts',
  'lib/brain-state.ts',
  'lib/daily-source-refresh.ts',
  'lib/embedding-storage.ts',
  'lib/research-question.ts',
  'lib/openclaw.ts',
  'lib/truth.ts',
  'lib/shared-artifact-ingestion.ts',
  'lib/email-ingestion.ts',
  'scripts/verify-openclaw-truth.ts',
  'scripts/verify-curated-sources.ts',
  'scripts/verify-brain-state.ts',
  'scripts/verify-auto-embedding.ts',
  'scripts/verify-openclaw-scheduler.ts',
  'scripts/verify-research-question.ts',
  'scripts/verify-e2e-prod.ts',
  'scripts/verify-shared-artifact-ingestion.ts',
  'scripts/ingest-email.ts',
  'scripts/openclaw-head-gbrain.ts',
  'scripts/openclaw-loop.ts',
]

const requiredEnv = [
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'VOYAGE_API_KEY',
  'LABBRAIN_DEFAULT_BRAIN_NAME',
  'LABBRAIN_ARXIV_QUERIES',
  'LABBRAIN_WEB_SOURCES',
  'LABBRAIN_USE_CURATED_WEB_SOURCES',
  'OPENCLAW_OPERATOR_NAME',
  'OPENCLAW_REMOTE_REQUIRED',
  'OPENCLAW_DAILY_SOURCE_REFRESH_ENABLED',
  'LABBRAIN_WORKER_TOKEN',
  'SUPABASE_SHARED_INGEST_ENABLED',
  'SHARED_ARTIFACT_INGEST_LIMIT',
  'GBRAIN_AUTO_EMBED_ENABLED',
  'EMAIL_INGEST_ENABLED',
  'EMAIL_INGEST_MONITORED_ADDRESS',
  'COMPOSIO_USER_API_KEY',
]

const schemaTokens = [
  'create table openclaw_instances',
  'create table openclaw_decisions',
  'openclaw_worker',
  'openclaw_decision',
  'hog_news',
]

const packageScripts = [
  'build',
  'typecheck',
  'verify:shared-artifacts',
  'verify:openclaw-truth',
  'verify:curated-sources',
  'verify:brain-state',
  'verify:auto-embedding',
  'verify:openclaw-scheduler',
  'verify:research-question',
  'verify:e2e:prod',
  'verify:pipeline',
  'ci',
  'ci:live',
  'brain:morning',
  'brain:daily',
  'brain:nightly',
  'brain:worker',
  'openclaw:worker',
  'openclaw:loop',
  'email:ingest',
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
    if (file.endsWith('railway-morning-cron.json')) {
      const deploy = config.deploy as Record<string, unknown>
      assert(deploy.startCommand === 'bun run brain:daily', `${file} should run brain:daily`)
      assert(deploy.cronSchedule === '0 1 * * *', `${file} should run at 01:00 UTC / 6:00 PM Pacific during PDT`)
    }
    if (file.endsWith('railway-openclaw-worker.json')) {
      const deploy = config.deploy as Record<string, unknown>
      assert(deploy.startCommand === 'bun run brain:worker', `${file} should run brain:worker`)
    }
  }
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
