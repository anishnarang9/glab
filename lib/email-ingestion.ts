import { execFile as execFileCallback } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { unzipSync } from 'fflate'
import { createArtifact, listResearchers, type ArtifactType, type ResearcherRecord, type Tier } from '@/lib/artifacts'

const execFile = promisify(execFileCallback)
const COMPOSIO_CLI_VERSION = '0.2.31-beta.253'

type GmailPayloadPart = {
  filename?: string
  mimeType?: string
  body?: {
    data?: string
    attachmentId?: string
  }
  parts?: GmailPayloadPart[]
}

type GmailAttachment = {
  filename?: string
  name?: string
  attachmentId?: string
  attachment_id?: string
  mimeType?: string
  mimetype?: string
  data?: string
  content?: string
  text?: string
  s3url?: string
  file?: {
    s3url?: string
    name?: string
    mimetype?: string
  }
}

type GmailMessage = {
  messageId?: string
  message_id?: string
  id?: string
  threadId?: string
  thread_id?: string
  subject?: string
  sender?: string
  from?: string
  to?: string
  messageText?: string
  message_text?: string
  labelIds?: string[]
  label_ids?: string[]
  attachmentList?: GmailAttachment[]
  attachment_list?: GmailAttachment[]
  payload?: GmailPayloadPart
}

type EmailArtifactCandidate = {
  messageId: string
  title: string
  content: string
  owner: ResearcherRecord
  type: ArtifactType
  tier: Tier
}

export type EmailIngestionSummary = {
  enabled: boolean
  fetched: number
  ingested: number
  skipped: number
  markedRead: number
  errors: string[]
}

export async function runEmailIngestion(): Promise<EmailIngestionSummary> {
  if (!emailIngestionEnabled()) {
    return { enabled: false, fetched: 0, ingested: 0, skipped: 0, markedRead: 0, errors: [] }
  }

  const researchers = await listResearchers()
  const messages = await fetchCandidateEmails(researchers)
  const summary: EmailIngestionSummary = {
    enabled: true,
    fetched: messages.length,
    ingested: 0,
    skipped: 0,
    markedRead: 0,
    errors: [],
  }

  for (const message of messages) {
    try {
      const candidate = await candidateFromMessage(message, researchers)
      if (!candidate) {
        summary.skipped += 1
        continue
      }

      await createArtifact({
        ownerId: candidate.owner.id,
        type: candidate.type,
        tier: candidate.tier,
        title: candidate.title,
        content: withEmailProvenance(candidate.content, message),
      })

      summary.ingested += 1
      if (shouldMarkRead()) {
        await markMessageRead(candidate.messageId)
        summary.markedRead += 1
      }
    } catch (error) {
      summary.errors.push(error instanceof Error ? error.message : String(error))
    }
  }

  return summary
}

function emailIngestionEnabled(): boolean {
  return process.env.EMAIL_INGEST_ENABLED === 'true' || Boolean(process.env.COMPOSIO_USER_API_KEY)
}

async function fetchCandidateEmails(researchers: ResearcherRecord[]): Promise<GmailMessage[]> {
  const query = process.env.EMAIL_INGEST_QUERY?.trim() || defaultGmailQuery(researchers)
  const maxResults = readIntEnv('EMAIL_INGEST_MAX_MESSAGES', 25, 1, 100)
  const result = await composioExecute('GMAIL_FETCH_EMAILS', {
    query,
    max_results: maxResults,
    include_payload: true,
    include_spam_trash: false,
    verbose: true,
  })

  return normalizeMessages(result)
}

function defaultGmailQuery(researchers: ResearcherRecord[]): string {
  const address = process.env.EMAIL_INGEST_MONITORED_ADDRESS?.trim() || process.env.GMAIL_MONITORED_ADDRESS?.trim() || 'drewmanley16@gmail.com'
  const tags = researcherTags(researchers)
  const tagQuery = tags.length > 0 ? ` (${tags.map((tag) => `"[${tag}]"`).join(' OR ')})` : ''
  return `to:${address} is:unread newer_than:30d${tagQuery}`
}

async function candidateFromMessage(
  message: GmailMessage,
  researchers: ResearcherRecord[],
): Promise<EmailArtifactCandidate | null> {
  const subject = readString(message.subject)
  const messageId = readString(message.messageId ?? message.message_id ?? message.id)
  if (!messageId || !subject) return null

  const owner = ownerForMessage(subject, message, researchers)
  if (!owner) return null

  const contents = await markdownContents(message)
  const content = contents.length > 0 ? contents.join('\n\n---\n\n') : cleanText(readString(message.messageText ?? message.message_text))
  if (!content || content.length < 20) return null

  return {
    messageId,
    title: titleFromSubject(subject),
    content,
    owner,
    type: typeFromSubject(subject),
    tier: tierFromSubject(subject),
  }
}

async function markdownContents(message: GmailMessage): Promise<string[]> {
  const directAttachments = message.attachmentList ?? message.attachment_list ?? []
  const contents = directAttachments
    .filter((attachment) => isMarkdownFilename(attachmentName(attachment)))
    .map((attachment) => attachmentText(attachment))
    .filter((content): content is string => Boolean(content))

  const payloadAttachments = flattenPayload(message.payload)
    .filter((part) => isMarkdownFilename(part.filename))

  for (const part of payloadAttachments) {
    const inline = decodeBase64Url(part.body?.data)
    if (inline) {
      contents.push(inline)
      continue
    }

    const attachmentId = part.body?.attachmentId
    const messageId = readString(message.messageId ?? message.message_id ?? message.id)
    if (!attachmentId || !messageId || !part.filename) continue
    const attachment = await fetchAttachment(messageId, attachmentId, part.filename)
    const content = attachmentText(attachment)
    if (content) contents.push(content)
  }

  return contents.map(cleanText).filter(Boolean)
}

async function fetchAttachment(messageId: string, attachmentId: string, fileName: string): Promise<GmailAttachment> {
  const result = await composioExecute('GMAIL_GET_ATTACHMENT', {
    message_id: messageId,
    attachment_id: attachmentId,
    file_name: fileName,
  })
  const data = asObject(result.data ?? result)
  const file = asObject(data.file)
  const s3url = readString(file.s3url ?? data.s3url)
  if (s3url) {
    const response = await fetch(s3url)
    if (response.ok) return { filename: fileName, content: await response.text() }
  }

  return {
    filename: fileName,
    content: readString(data.content ?? data.text ?? data.data) ?? undefined,
    data: readString(data.data) ?? undefined,
    file: {
      s3url: readString(file.s3url) ?? undefined,
      name: readString(file.name) ?? undefined,
      mimetype: readString(file.mimetype) ?? undefined,
    },
  }
}

async function markMessageRead(messageId: string): Promise<void> {
  await composioExecute('GMAIL_ADD_LABEL_TO_EMAIL', {
    message_id: messageId,
    remove_label_ids: ['UNREAD'],
  })
}

function shouldMarkRead(): boolean {
  return process.env.EMAIL_INGEST_MARK_READ !== 'false'
}

async function composioExecute(slug: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const composio = await ensureComposioCli()
  await ensureComposioLogin(composio)

  const argsPath = await writeComposioArgs(slug, data)
  const result = await execFile(composio, ['execute', slug, '-d', `@${argsPath}`], {
    env: composioEnv(),
    maxBuffer: 64 * 1024 * 1024,
  })
  return parseComposioOutput(result.stdout)
}

async function ensureComposioCli(): Promise<string> {
  const existing = localComposioCandidates().find((path) => existsSync(path))
  if (existing) return existing

  const found = await commandPath('composio')
  if (found) return found

  if (process.env.COMPOSIO_AUTO_INSTALL === 'false') {
    throw new Error('Composio CLI is not installed and COMPOSIO_AUTO_INSTALL=false')
  }

  const installed = await installComposioCli()
  if (installed) return installed

  const installedOnPath = await commandPath('composio')
  if (installedOnPath) return installedOnPath

  throw new Error(`Composio CLI install completed but executable was not found in ${localComposioCandidates().join(', ')}`)
}

async function installComposioCli(): Promise<string> {
  const installDir = process.env.COMPOSIO_INSTALL_DIR?.trim() || join(tmpdir(), 'composio-cli')
  await mkdir(installDir, { recursive: true })

  const target = join(installDir, 'composio')
  const asset = composioAssetName()
  const zipPath = join(installDir, asset)
  const url = `https://github.com/ComposioHQ/composio/releases/download/${encodeURIComponent(`@composio/cli@${COMPOSIO_CLI_VERSION}`)}/${asset}`
  const response = await fetch(url, { headers: { 'User-Agent': 'labbrain-railway-worker' } })
  if (!response.ok) throw new Error(`Composio CLI download failed: ${response.status} ${response.statusText}`)

  const archive = new Uint8Array(await response.arrayBuffer())
  await writeFile(zipPath, Buffer.from(archive))
  const entries = unzipSync(archive)
  const binary = Object.entries(entries).find(([path]) => path.split('/').at(-1) === 'composio')
  if (!binary) throw new Error(`Composio CLI archive did not contain a composio binary`)

  await writeFile(target, Buffer.from(binary[1]))
  await chmod(target, 0o755)
  return target
}

function composioAssetName(): string {
  const platform = process.platform
  const arch = process.arch

  if (platform === 'darwin' && arch === 'arm64') return 'composio-darwin-aarch64.zip'
  if (platform === 'darwin' && arch === 'x64') return 'composio-darwin-x64.zip'
  if (platform === 'linux' && arch === 'arm64') return 'composio-linux-aarch64.zip'
  if (platform === 'linux' && arch === 'x64') return 'composio-linux-x64.zip'

  throw new Error(`Unsupported Composio CLI platform: ${platform}-${arch}`)
}

async function ensureComposioLogin(composio: string): Promise<void> {
  const key = process.env.COMPOSIO_USER_API_KEY?.trim()
  if (!key) return

  const org = process.env.COMPOSIO_ORG?.trim() || 'drewmanley16_workspace'
  await execFile(composio, ['login', '--user-api-key', key, '--org', org], {
    env: composioEnv(),
    maxBuffer: 8 * 1024 * 1024,
  })
}

async function commandPath(command: string): Promise<string | null> {
  try {
    const result = await execFile('bash', ['-lc', `command -v ${command}`], { maxBuffer: 1024 * 1024 })
    const path = result.stdout.trim()
    return path || null
  } catch {
    return null
  }
}

function composioEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: `${localComposioDirs().join(':')}:${process.env.PATH ?? ''}`,
  }
}

function localComposioCandidates(extraInstallDir?: string): string[] {
  return [
    process.env.COMPOSIO_CLI_PATH?.trim() || null,
    ...localComposioDirs(extraInstallDir).map((dir) => join(dir, 'composio')),
  ].filter((path): path is string => Boolean(path))
}

function localComposioDirs(extraInstallDir?: string): string[] {
  return [
    process.env.COMPOSIO_CLI_PATH ? dirnameOfExecutable(process.env.COMPOSIO_CLI_PATH) : null,
    process.env.COMPOSIO_INSTALL_DIR?.trim() || null,
    extraInstallDir ?? null,
    join(tmpdir(), 'composio-cli'),
    join(homedir(), '.composio'),
    join(process.cwd(), '.composio'),
    '/root/.composio',
    '/app/.composio',
  ].filter((path): path is string => Boolean(path))
}

function dirnameOfExecutable(path: string): string {
  const index = path.lastIndexOf('/')
  return index === -1 ? '.' : path.slice(0, index)
}

async function writeComposioArgs(slug: string, data: Record<string, unknown>): Promise<string> {
  const dir = join(tmpdir(), 'labbrain-composio')
  await mkdir(dir, { recursive: true })
  const path = join(dir, `${slug.toLowerCase()}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`)
  await writeFile(path, JSON.stringify(data), 'utf8')
  return path
}

async function parseComposioOutput(stdout: string): Promise<Record<string, unknown>> {
  const json = stdout.trim()
  if (!json) return {}
  const parsed = JSON.parse(json) as Record<string, unknown>
  const outputFilePath = readString(parsed.outputFilePath)
  if (parsed.storedInFile === true && outputFilePath) {
    return JSON.parse(await readFile(outputFilePath, 'utf8')) as Record<string, unknown>
  }
  return parsed
}

function normalizeMessages(result: Record<string, unknown>): GmailMessage[] {
  const data = asObject(result.data)
  const messages = Array.isArray(data.messages)
    ? data.messages
    : Array.isArray(result.messages)
      ? result.messages
      : []
  return messages.filter(isObject).map((message) => message as GmailMessage)
}

function ownerForMessage(subject: string, message: GmailMessage, researchers: ResearcherRecord[]): ResearcherRecord | null {
  const tag = subject.match(/\[([a-zA-Z0-9._-]+)\]/)?.[1]?.toLowerCase()
  if (tag) {
    const byTag = researchers.find((researcher) => researcherTags([researcher]).includes(tag))
    if (byTag) return byTag
  }

  const sender = readString(message.sender ?? message.from)?.toLowerCase() ?? ''
  return researchers.find((researcher) => sender.includes(researcher.email.toLowerCase())) ?? null
}

function researcherTags(researchers: ResearcherRecord[]): string[] {
  const tags = new Set<string>()
  for (const researcher of researchers) {
    const firstName = researcher.name.split(/\s+/)[0]?.toLowerCase()
    const emailLocal = researcher.email.split('@')[0]?.toLowerCase()
    if (firstName) tags.add(firstName)
    if (emailLocal) tags.add(emailLocal)
  }
  return [...tags].filter(Boolean)
}

function titleFromSubject(subject: string): string {
  return subject
    .replace(/\[(shared|private|note|finding|hypothesis|paper|paper_ref)\]/gi, '')
    .replace(/\[[a-zA-Z0-9._-]+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180) || 'Emailed research artifact'
}

function typeFromSubject(subject: string): ArtifactType {
  const lower = subject.toLowerCase()
  if (lower.includes('[finding]')) return 'finding'
  if (lower.includes('[hypothesis]')) return 'hypothesis'
  if (lower.includes('[paper]') || lower.includes('[paper_ref]')) return 'paper_ref'
  return 'note'
}

function tierFromSubject(subject: string): Tier {
  const lower = subject.toLowerCase()
  if (lower.includes('[private]')) return 'private'
  if (lower.includes('[shared]')) return 'shared'
  return process.env.EMAIL_INGEST_DEFAULT_TIER === 'private' ? 'private' : 'shared'
}

function withEmailProvenance(content: string, message: GmailMessage): string {
  const subject = readString(message.subject) ?? 'No subject'
  const sender = readString(message.sender ?? message.from) ?? 'unknown sender'
  const messageId = readString(message.messageId ?? message.message_id ?? message.id) ?? 'unknown'
  return [
    content.trim(),
    '',
    '---',
    `Email source: ${subject}`,
    `From: ${sender}`,
    `Gmail message ID: ${messageId}`,
  ].join('\n')
}

function flattenPayload(part: GmailPayloadPart | undefined): GmailPayloadPart[] {
  if (!part) return []
  return [part, ...(part.parts ?? []).flatMap(flattenPayload)]
}

function attachmentName(attachment: GmailAttachment): string | undefined {
  return attachment.filename ?? attachment.name ?? attachment.file?.name
}

function attachmentText(attachment: GmailAttachment): string | null {
  return readString(attachment.content ?? attachment.text) ?? decodeBase64Url(readString(attachment.data))
}

function isMarkdownFilename(value: string | undefined): boolean {
  return Boolean(value && value.toLowerCase().endsWith('.md'))
}

function decodeBase64Url(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
    const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
    return Buffer.from(normalized + padding, 'base64').toString('utf8')
  } catch {
    return null
  }
}

function cleanText(value: string | null | undefined): string {
  return (value ?? '').replace(/\r\n/g, '\n').trim()
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readIntEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name])
  if (!Number.isInteger(raw)) return fallback
  return Math.max(min, Math.min(max, raw))
}

function asObject(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {}
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value)
}
