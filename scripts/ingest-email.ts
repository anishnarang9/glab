import { runEmailIngestion } from '@/lib/email-ingestion'

async function main(): Promise<void> {
  const summary = await runEmailIngestion()
  console.log(JSON.stringify(summary, null, 2))
  if (summary.errors.length > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
