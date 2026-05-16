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
  preview?: {
    body?: string
    subject?: string
  }
}

type EmailArtifactCandidate = {
  messageId: string
  title: string
  content: string
  owner: ResearcherRecord
  type: ArtifactType
  tier: Tier
}

type ComposioApiContext = {
  baseUrl: string
  userApiKey: string
  orgId: string
  projectId: string
  consumerUserId: string
}

type ComposioApiSessionInfo = {
  project?: {
    org?: {
      id?: string
    }
  }
}

type ComposioConsumerProject = {
  org_id?: string
  project_nano_id?: string
  consumer_user_id?: string
}

type ComposioConnectedAccount = {
  id?: string
  is_disabled?: boolean
  status?: string
  toolkit?: {
    slug?: string
  }
}

type ComposioConnectedAccountsResponse = {
  items?: ComposioConnectedAccount[]
}

type ComposioToolRouterSession = {
  session_id?: string
}

type ComposioToolRouterExecution = {
  data?: Record<string, unknown>
  error?: string | null
  log_id?: string
}

let composioApiContextPromise: Promise<ComposioApiContext> | null = null
const composioApiSessionPromises = new Map<string, Promise<string>>()

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
  return process.env.EMAIL_INGEST_ENABLED === 'true'
}

async function fetchCandidateEmails(researchers: ResearcherRecord[]): Promise<GmailMessage[]> {
  const query = process.env.EMAIL_INGEST_QUERY?.trim() || defaultGmailQuery(researchers)
  const maxResults = readIntEnv('EMAIL_INGEST_MAX_MESSAGES', 100, 1, 500)
  const result = await composioExecute('GMAIL_FETCH_EMAILS', {
    query,
    max_results: maxResults,
    include_payload: false,
    include_spam_trash: false,
    verbose: false,
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

  const fullMessage = await hydrateMessage(message)
  const contents = await markdownContents(fullMessage)
  const content = contents.length > 0
    ? contents.join('\n\n---\n\n')
    : cleanText(readString(fullMessage.messageText ?? fullMessage.message_text ?? fullMessage.preview?.body))
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

async function hydrateMessage(message: GmailMessage): Promise<GmailMessage> {
  if (hasFullMessageContent(message)) return message

  const messageId = readString(message.messageId ?? message.message_id ?? message.id)
  if (!messageId) return message

  const result = await composioExecute('GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID', {
    message_id: messageId,
    format: 'full',
    user_id: 'me',
  })
  const data = asObject(result.data ?? result)
  return { ...message, ...data }
}

function hasFullMessageContent(message: GmailMessage): boolean {
  const attachments = message.attachmentList ?? message.attachment_list ?? []
  return Boolean(message.payload || message.messageText || message.message_text || attachments.length > 0)
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
  if (shouldUseComposioApi()) {
    return composioExecuteApi(slug, data)
  }

  const composio = await ensureComposioCli()
  await ensureComposioLogin(composio)

  const argsPath = await writeComposioArgs(slug, data)
  const result = await execFile(composio, ['execute', slug, '-d', `@${argsPath}`], {
    env: composioEnv(),
    maxBuffer: 64 * 1024 * 1024,
  })
  return parseComposioOutput(result.stdout)
}

function shouldUseComposioApi(): boolean {
  return Boolean(process.env.COMPOSIO_USER_API_KEY?.trim()) && process.env.COMPOSIO_USE_CLI !== 'true'
}

async function composioExecuteApi(slug: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const toolkit = toolkitFromSlug(slug)
  const [context, sessionId] = await Promise.all([
    resolveComposioApiContext(),
    resolveComposioApiSession(toolkit),
  ])

  const result = await composioApiFetch<ComposioToolRouterExecution>(
    context,
    `/api/v3.1/tool_router/session/${encodeURIComponent(sessionId)}/execute`,
    {
      method: 'POST',
      body: JSON.stringify({
        tool_slug: slug,
        arguments: data,
      }),
    },
  )

  if (result.error) throw new Error(`Composio ${slug} failed: ${result.error}`)
  return {
    successful: true,
    data: result.data ?? {},
    error: null,
    logId: result.log_id ?? '',
  }
}

async function resolveComposioApiContext(): Promise<ComposioApiContext> {
  composioApiContextPromise ??= resolveComposioApiContextInner()
  return composioApiContextPromise
}

async function resolveComposioApiContextInner(): Promise<ComposioApiContext> {
  const userApiKey = process.env.COMPOSIO_USER_API_KEY?.trim()
  if (!userApiKey) throw new Error('COMPOSIO_USER_API_KEY is required for Composio API execution')

  const baseUrl = process.env.COMPOSIO_BASE_URL?.trim() || 'https://backend.composio.dev'
  const sessionInfo = await composioUserApiFetch<ComposioApiSessionInfo>(baseUrl, userApiKey, '/api/v3/auth/session/info')
  const orgId = process.env.COMPOSIO_ORG_ID?.trim() || sessionInfo.project?.org?.id
  if (!orgId) throw new Error('Could not resolve Composio org id from COMPOSIO_USER_API_KEY')

  const consumerProject = await composioUserApiFetch<ComposioConsumerProject>(
    baseUrl,
    userApiKey,
    '/api/v3/org/consumer/project/resolve',
    {
      method: 'POST',
      headers: { 'x-org-id': orgId },
      body: '{}',
    },
  )

  const projectId = process.env.COMPOSIO_PROJECT_ID?.trim() || consumerProject.project_nano_id
  const consumerUserId = process.env.COMPOSIO_CONSUMER_USER_ID?.trim() || consumerProject.consumer_user_id
  if (!projectId || !consumerUserId) {
    throw new Error('Could not resolve Composio consumer project/user for Gmail ingestion')
  }

  return {
    baseUrl,
    userApiKey,
    orgId: consumerProject.org_id || orgId,
    projectId,
    consumerUserId,
  }
}

async function resolveComposioApiSession(toolkit: string): Promise<string> {
  const existing = composioApiSessionPromises.get(toolkit)
  if (existing) return existing

  const promise = resolveComposioApiSessionInner(toolkit)
  composioApiSessionPromises.set(toolkit, promise)
  return promise
}

async function resolveComposioApiSessionInner(toolkit: string): Promise<string> {
  const context = await resolveComposioApiContext()
  const connectedAccountId = await resolveConnectedAccountId(context, toolkit)
  const connectedAccounts = connectedAccountId ? { [toolkit]: connectedAccountId } : undefined

  const session = await composioApiFetch<ComposioToolRouterSession>(context, '/api/v3.1/tool_router/session', {
    method: 'POST',
    body: JSON.stringify({
      user_id: context.consumerUserId,
      connected_accounts: connectedAccounts,
      manage_connections: { enable: true },
      toolkits: { enable: [toolkit] },
    }),
  })

  if (!session.session_id) throw new Error(`Composio did not return a Tool Router session for ${toolkit}`)
  return session.session_id
}

async function resolveConnectedAccountId(context: ComposioApiContext, toolkit: string): Promise<string | null> {
  const query = new URLSearchParams({
    user_ids: context.consumerUserId,
    statuses: 'ACTIVE',
    toolkit_slugs: toolkit,
    limit: '100',
  })
  const accounts = await composioApiFetch<ComposioConnectedAccountsResponse>(
    context,
    `/api/v3.1/connected_accounts?${query.toString()}`,
    { method: 'GET' },
  )

  const account = (accounts.items ?? []).find((item) => {
    return item.id && item.status === 'ACTIVE' && !item.is_disabled && item.toolkit?.slug?.toLowerCase() === toolkit
  })
  return account?.id ?? null
}

async function composioUserApiFetch<T>(
  baseUrl: string,
  userApiKey: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  return composioFetch<T>(baseUrl, path, {
    ...init,
    headers: {
      'x-user-api-key': userApiKey,
      ...(init.headers ?? {}),
    },
  })
}

async function composioApiFetch<T>(
  context: ComposioApiContext,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  return composioFetch<T>(context.baseUrl, path, {
    ...init,
    headers: {
      'x-user-api-key': context.userApiKey,
      'x-org-id': context.orgId,
      'x-project-id': context.projectId,
      ...(init.headers ?? {}),
    },
  })
}

async function composioFetch<T>(baseUrl: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    redirect: 'error',
    headers: {
      'User-Agent': '@composio/cli',
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })

  const text = await response.text()
  const body = text ? safeJsonParse(text) : {}
  if (!response.ok) {
    throw new Error(`Composio API ${response.status} ${response.statusText}: ${composioErrorMessage(body)}`)
  }

  return body as T
}

function toolkitFromSlug(slug: string): string {
  return slug.split('_')[0]?.toLowerCase() || 'gmail'
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

function composioErrorMessage(body: unknown): string {
  if (isObject(body)) {
    const error = asObject(body.error)
    return readString(error.message) || readString(body.message) || JSON.stringify(redactComposioError(body)).slice(0, 500)
  }
  return String(body).slice(0, 500)
}

function redactComposioError(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactComposioError)
  if (!isObject(value)) return value

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      const normalized = key.toLowerCase()
      if (normalized.includes('token') || normalized.includes('key') || normalized.includes('secret')) {
        return [key, '[redacted]']
      }
      return [key, redactComposioError(entry)]
    }),
  )
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
