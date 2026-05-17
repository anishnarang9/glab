import postgres, { type Sql } from 'postgres'
import { formatPgVectorLiteral } from '@/lib/embedding-storage'

type QueryError = {
  message: string
  details?: string
  hint?: string
  code?: string
}

type QueryResult<T = unknown> = {
  data: T | null
  error: QueryError | null
  count?: number | null
}

type SelectOptions = {
  count?: 'exact'
  head?: boolean
}

type OrderOptions = {
  ascending?: boolean
}

type UpsertOptions = {
  onConflict?: string
}

type Filter = {
  column: string
  operator: 'eq' | 'is' | 'in'
  value: unknown
}

type OrderBy = {
  column: string
  ascending: boolean
}

type Action = 'select' | 'insert' | 'update' | 'upsert'
type ResultMode = 'many' | 'single' | 'maybeSingle'

const jsonColumns = new Set([
  'access_scope',
  'after_json',
  'before_json',
  'config',
  'payload',
])

let sqlClient: Sql | null = null

export function hasPostgresDatabaseUrl(): boolean {
  return Boolean(databaseUrl())
}

export function postgresRestAdmin(): PostgresRestClient {
  if (!sqlClient) {
    sqlClient = postgres(databaseUrlOrThrow(), {
      connect_timeout: 10,
      idle_timeout: 1,
      max: 5,
    })
  }

  return new PostgresRestClient(sqlClient)
}

class PostgresRestClient {
  constructor(private readonly sql: Sql) {}

  from(table: string): PostgresQuery {
    return new PostgresQuery(this.sql, sanitizeIdentifier(table))
  }
}

class PostgresQuery implements PromiseLike<QueryResult<unknown[]>> {
  private action: Action | null = null
  private selectedColumns = '*'
  private selectOptions: SelectOptions = {}
  private filters: Filter[] = []
  private orderBy: OrderBy | null = null
  private limitCount: number | null = null
  private values: Record<string, unknown>[] = []
  private conflictColumns: string[] = []
  private shouldReturnRows = false
  private exactCount: number | null = null

  constructor(
    private readonly sql: Sql,
    private readonly table: string,
  ) {}

  select(columns = '*', options: SelectOptions = {}): this {
    if (!this.action) this.action = 'select'
    this.selectedColumns = columns
    this.selectOptions = options
    this.shouldReturnRows = true
    return this
  }

  insert(values: Record<string, unknown> | Array<Record<string, unknown>>): this {
    this.action = 'insert'
    this.values = normalizeRows(values)
    return this
  }

  update(values: Record<string, unknown>): this {
    this.action = 'update'
    this.values = normalizeRows(values)
    return this
  }

  upsert(values: Record<string, unknown> | Array<Record<string, unknown>>, options: UpsertOptions = {}): this {
    this.action = 'upsert'
    this.values = normalizeRows(values)
    this.conflictColumns = (options.onConflict ?? '')
      .split(',')
      .map((column) => column.trim())
      .filter(Boolean)
      .map(sanitizeIdentifier)
    return this
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ column: sanitizeIdentifier(column), operator: 'eq', value })
    return this
  }

  is(column: string, value: boolean | null): this {
    this.filters.push({ column: sanitizeIdentifier(column), operator: 'is', value })
    return this
  }

  in(column: string, values: unknown[]): this {
    this.filters.push({ column: sanitizeIdentifier(column), operator: 'in', value: values })
    return this
  }

  order(column: string, options: OrderOptions = {}): this {
    this.orderBy = {
      column: sanitizeIdentifier(column),
      ascending: options.ascending ?? true,
    }
    return this
  }

  limit(count: number): this {
    this.limitCount = count
    return this
  }

  async single(): Promise<QueryResult<unknown>> {
    return this.execute('single')
  }

  async maybeSingle(): Promise<QueryResult<unknown>> {
    return this.execute('maybeSingle')
  }

  then<TResult1 = QueryResult<unknown[]>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<unknown[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return (this.execute('many') as Promise<QueryResult<unknown[]>>).then(onfulfilled, onrejected)
  }

  private async execute(mode: ResultMode): Promise<QueryResult<unknown | unknown[]>> {
    try {
      const action = this.action ?? 'select'
      const rows = await this.executeRows(action)
      if (mode === 'single') return singleResult(rows)
      if (mode === 'maybeSingle') return maybeSingleResult(rows)
      return {
        data: rows,
        error: null,
        count: action === 'select' && this.selectOptions.count === 'exact' ? this.exactCount ?? rows.length : null,
      }
    } catch (error) {
      return { data: null, error: normalizeError(error), count: null }
    }
  }

  private async executeRows(action: Action): Promise<unknown[]> {
    if (action === 'select') return this.executeSelect()
    if (action === 'insert') return this.executeInsert()
    if (action === 'update') return this.executeUpdate()
    return this.executeUpsert()
  }

  private async executeSelect(): Promise<unknown[]> {
    const whereClause = this.whereClause()

    if (this.selectOptions.head && this.selectOptions.count === 'exact') {
      const result = await this.sql.unsafe(`select count(*)::int as count from "${this.table}"${whereClause.text}`, whereClause.values as never[])
      this.exactCount = Number(result[0]?.count ?? 0)
      return []
    }

    const clauses = [
      `select ${columnsSql(this.selectedColumns)} from "${this.table}"`,
      whereClause.text,
      this.orderClause(),
      this.limitClause(),
    ].filter(Boolean).join(' ')

    const rows = await this.sql.unsafe(clauses, whereClause.values as never[])
    return rows.map(normalizeOutput)
  }

  private async executeInsert(): Promise<unknown[]> {
    if (this.values.length === 0) return []
    const columns = rowColumns(this.values)
    const returning = this.shouldReturnRows ? ` returning ${columnsSql(this.selectedColumns)}` : ''
    const query = `insert into "${this.table}" (${identifierList(columns)}) values ${valuesPlaceholders(this.values, columns)}${returning}`
    const rows = await this.sql.unsafe(query, rowValues(this.values, columns) as never[])
    return rows.map(normalizeOutput)
  }

  private async executeUpdate(): Promise<unknown[]> {
    if (this.values.length !== 1) throw new Error('Postgres adapter update expects one row')
    const row = this.values[0]
    const columns = Object.keys(row).map(sanitizeIdentifier)
    if (columns.length === 0) return []
    const whereClause = this.whereClause(columns.length + 1)
    const returning = this.shouldReturnRows ? ` returning ${columnsSql(this.selectedColumns)}` : ''
    const assignments = columns.map((column, index) => `"${column}" = $${index + 1}`).join(', ')
    const query = `update "${this.table}" set ${assignments}${whereClause.text}${returning}`
    const rows = await this.sql.unsafe(query, [...columns.map((column) => dbValue(column, row[column])), ...whereClause.values] as never[])
    return rows.map(normalizeOutput)
  }

  private async executeUpsert(): Promise<unknown[]> {
    if (this.values.length === 0) return []
    if (this.conflictColumns.length === 0) throw new Error('Postgres adapter upsert requires onConflict')

    const columns = rowColumns(this.values)
    const updateColumns = columns.filter((column) => !this.conflictColumns.includes(column))
    const conflict = `(${identifierList(this.conflictColumns)})`
    const updateClause = updateColumns.length > 0
      ? `do update set ${updateColumns.map((column) => `"${column}" = excluded."${column}"`).join(', ')}`
      : 'do nothing'
    const returning = this.shouldReturnRows ? ` returning ${columnsSql(this.selectedColumns)}` : ''
    const query = `insert into "${this.table}" (${identifierList(columns)}) values ${valuesPlaceholders(this.values, columns)} on conflict ${conflict} ${updateClause}${returning}`
    const rows = await this.sql.unsafe(query, rowValues(this.values, columns) as never[])
    return rows.map(normalizeOutput)
  }

  private whereClause(parameterOffset = 1): { text: string; values: unknown[] } {
    if (this.filters.length === 0) return { text: '', values: [] }

    const clauses: string[] = []
    const values: unknown[] = []
    let nextParameter = parameterOffset

    for (const filter of this.filters) {
      if (filter.operator === 'eq') {
        clauses.push(`"${filter.column}" = $${nextParameter++}`)
        values.push(dbValue(filter.column, filter.value))
        continue
      }

      if (filter.operator === 'is') {
        if (filter.value === null) clauses.push(`"${filter.column}" is null`)
        else if (filter.value === true) clauses.push(`"${filter.column}" is true`)
        else if (filter.value === false) clauses.push(`"${filter.column}" is false`)
        else throw new Error('Postgres adapter .is() only supports null and booleans')
        continue
      }

      const list = Array.isArray(filter.value) ? filter.value : []
      if (list.length === 0) {
        clauses.push('false')
        continue
      }

      const placeholders = list.map(() => `$${nextParameter++}`).join(', ')
      clauses.push(`"${filter.column}" in (${placeholders})`)
      values.push(...list.map((value) => dbValue(filter.column, value)))
    }

    return {
      text: ` where ${clauses.join(' and ')}`,
      values,
    }
  }

  private orderClause(): string {
    if (!this.orderBy) return ''
    return `order by "${this.orderBy.column}" ${this.orderBy.ascending ? 'asc' : 'desc'}`
  }

  private limitClause(): string {
    if (this.limitCount == null) return ''
    return `limit ${Math.max(0, Math.floor(this.limitCount))}`
  }
}

function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL
}

function databaseUrlOrThrow(): string {
  const url = databaseUrl()
  if (!url) throw new Error('DATABASE_URL is not set')
  return url
}

function normalizeRows(values: Record<string, unknown> | Array<Record<string, unknown>>): Record<string, unknown>[] {
  return (Array.isArray(values) ? values : [values]).map((row) => {
    const normalized: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(row)) {
      if (value !== undefined) normalized[sanitizeIdentifier(key)] = value
    }
    return normalized
  })
}

function rowColumns(rows: Array<Record<string, unknown>>): string[] {
  return [...new Set(rows.flatMap((row) => Object.keys(row).map(sanitizeIdentifier)))]
}

function identifierList(columns: string[]): string {
  return columns.map((column) => `"${sanitizeIdentifier(column)}"`).join(', ')
}

function columnsSql(columns: string): string {
  const trimmed = columns.trim()
  if (!trimmed || trimmed === '*') return '*'
  return trimmed.split(',').map((column) => `"${sanitizeIdentifier(column.trim())}"`).join(', ')
}

function valuesPlaceholders(rows: Array<Record<string, unknown>>, columns: string[]): string {
  let index = 1
  return rows.map(() => `(${columns.map(() => `$${index++}`).join(', ')})`).join(', ')
}

function rowValues(rows: Array<Record<string, unknown>>, columns: string[]): unknown[] {
  return rows.flatMap((row) => columns.map((column) => dbValue(column, row[column] ?? null)))
}

function dbValue(column: string, value: unknown): unknown {
  if (value == null) return null
  if (jsonColumns.has(column)) return JSON.stringify(value)
  if (column === 'embedding' && Array.isArray(value)) return formatPgVectorLiteral(value as number[])
  return value
}

function singleResult(rows: unknown[]): QueryResult<unknown> {
  if (rows.length !== 1) {
    return {
      data: null,
      error: {
        message: `Expected exactly one row, received ${rows.length}`,
        code: 'PGRST116',
      },
    }
  }

  return { data: rows[0], error: null }
}

function maybeSingleResult(rows: unknown[]): QueryResult<unknown> {
  if (rows.length > 1) {
    return {
      data: null,
      error: {
        message: `Expected zero or one row, received ${rows.length}`,
        code: 'PGRST116',
      },
    }
  }

  return { data: rows[0] ?? null, error: null }
}

function normalizeOutput(row: unknown): unknown {
  if (!row || typeof row !== 'object') return row
  if (row instanceof Date) return row.toISOString()
  if (Array.isArray(row)) return row.map(normalizeOutput)

  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, normalizeOutput(value)]),
  )
}

function normalizeError(error: unknown): QueryError {
  if (error instanceof Error) return { message: error.message }
  if (error && typeof error === 'object') {
    const value = error as { message?: unknown; detail?: unknown; details?: unknown; hint?: unknown; code?: unknown }
    return {
      message: typeof value.message === 'string' ? value.message : JSON.stringify(error),
      details: typeof value.details === 'string' ? value.details : typeof value.detail === 'string' ? value.detail : undefined,
      hint: typeof value.hint === 'string' ? value.hint : undefined,
      code: typeof value.code === 'string' ? value.code : undefined,
    }
  }

  return { message: String(error) }
}

function sanitizeIdentifier(value: string): string {
  const identifier = value.trim()
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${value}`)
  }
  return identifier
}
