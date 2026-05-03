import {
    APIClientOptions, APICollection, APIEnvironment, APIFolder, AuthConfig,
    HttpMethod, ImportResult, RequestHeader, SavedRequest, FormDataField,
} from '../api/interfaces'

/**
 * Postman v2.1 + OpenAPI 3.x importers.
 *
 * Postman's collection schema covers a long tail of features we don't
 * implement (auth helpers, scripts, test events, variable scopes,
 * folders-of-folders). We do a best-effort mapping that captures the
 * 80% case — endpoint, method, headers, body, simple bearer/basic
 * auth, and folder structure. Stuff we drop gets collected as
 * `import.warnings[]` so the UI can surface a "imported with N
 * caveats" toast without lying about success.
 *
 * OpenAPI we treat as "give me one example request per (path, method)"
 * — pulling default values from `parameters`, `requestBody.examples`,
 * and `security` schemes. Servers are folded into a base URL.
 */

export interface ImportWarning {
    path: string
    message: string
}

export interface FullImportResult extends ImportResult {
    warnings: ImportWarning[]
}

// ---- Helpers (declared first to satisfy no-use-before-define) -------

function grabPostmanParam (block: unknown, k: string): string {
    if (!Array.isArray(block)) {return ''}
    const found = block.find((x: any) => x.key === k)
    return (found?.value as string | undefined) ?? ''
}

function mapPostmanAuth (auth: any): AuthConfig {
    if (!auth?.type) {return { type: 'none' }}
    switch (auth.type) {
        case 'bearer':
            return { type: 'bearer', token: grabPostmanParam(auth.bearer, 'token') }
        case 'basic':
            return {
                type: 'basic',
                username: grabPostmanParam(auth.basic, 'username'),
                password: grabPostmanParam(auth.basic, 'password'),
            }
        case 'apikey':
            return {
                type: 'apikey',
                apiKeyName: grabPostmanParam(auth.apikey, 'key'),
                apiKeyValue: grabPostmanParam(auth.apikey, 'value'),
                apiKeyLocation: grabPostmanParam(auth.apikey, 'in') === 'query' ? 'query' : 'header',
            }
        case 'oauth2':
            return {
                type: 'oauth2',
                oauth2: {
                    grantType: 'authorization_code',
                    authUrl: grabPostmanParam(auth.oauth2, 'authUrl'),
                    tokenUrl: grabPostmanParam(auth.oauth2, 'accessTokenUrl'),
                    clientId: grabPostmanParam(auth.oauth2, 'clientId'),
                    clientSecret: grabPostmanParam(auth.oauth2, 'clientSecret'),
                    redirectUri: grabPostmanParam(auth.oauth2, 'redirect_uri'),
                    scope: grabPostmanParam(auth.oauth2, 'scope'),
                    usePkce: true,
                },
            }
        default:
            return { type: 'none' }
    }
}

interface PostmanItemContext {
    folderId: string | null
    breadcrumb: string
    warnings: ImportWarning[]
}

function mapPostmanItem (it: any, ctx: PostmanItemContext): SavedRequest | null {
    if (!it.request) {return null}
    const r = typeof it.request === 'string' ? { url: it.request, method: 'GET' } : it.request
    const url = typeof r.url === 'string' ? r.url : (r.url?.raw ?? '')
    if (!url) {
        ctx.warnings.push({ path: ctx.breadcrumb + '/' + (it.name ?? '?'), message: 'no URL — skipped' })
        return null
    }
    const method = (r.method ?? 'GET').toUpperCase() as HttpMethod
    const headers: RequestHeader[] = (r.header ?? []).map((h: any) => ({
        key: h.key ?? '',
        value: h.value ?? '',
        enabled: h.disabled !== true,
    }))

    const auth: AuthConfig = mapPostmanAuth(r.auth)

    let body = ''
    let bodyType: APIClientOptions['bodyType'] = 'none'
    let formData: FormDataField[] | undefined = undefined
    if (r.body) {
        switch (r.body.mode) {
            case 'raw': {
                body = r.body.raw ?? ''
                const lang = r.body.options?.raw?.language
                bodyType = lang === 'json' ? 'json' : 'text'
                break
            }
            case 'urlencoded':
                bodyType = 'urlencoded'
                body = (r.body.urlencoded ?? [])
                    .filter((p: any) => !p.disabled)
                    .map((p: any) => `${p.key}=${p.value ?? ''}`)
                    .join('\n')
                break
            case 'formdata':
                bodyType = 'form-data'
                formData = (r.body.formdata ?? []).map((p: any) => ({
                    key: p.key ?? '',
                    value: p.type === 'file' ? '' : (p.value ?? ''),
                    filePath: p.type === 'file' ? p.src : undefined,
                    kind: p.type === 'file' ? 'file' : 'text',
                    enabled: p.disabled !== true,
                }))
                break
            case 'graphql':
                bodyType = 'graphql'
                body = ''
                break
            default:
                ctx.warnings.push({ path: ctx.breadcrumb + '/' + (it.name ?? '?'), message: `unsupported body mode: ${r.body.mode}` })
        }
    }

    const options: APIClientOptions = {
        url,
        method,
        headers,
        body,
        bodyType,
        timeout: 30000,
        auth,
        formData,
        graphql: r.body?.mode === 'graphql' ? {
            query: r.body.graphql?.query ?? '',
            variables: typeof r.body.graphql?.variables === 'string'
                ? r.body.graphql.variables
                : JSON.stringify(r.body.graphql?.variables ?? {}, null, 2),
        } : undefined,
    }

    return {
        id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: it.name ?? 'Untitled',
        options,
        folderId: ctx.folderId,
    }
}

function resolveRef (ref: string, doc: any): any {
    if (!ref.startsWith('#/')) {return undefined}
    const parts = ref.slice(2).split('/')
    let cur = doc
    for (const p of parts) {
        cur = cur?.[p]
        if (cur == null) {return undefined}
    }
    return cur
}

function exampleFromSchema (schema: any, doc: any): any {
    if (!schema) {return undefined}
    if (schema.example !== undefined) {return schema.example}
    if (schema.default !== undefined) {return schema.default}
    if (schema.$ref) {
        const resolved = resolveRef(schema.$ref, doc)
        if (resolved) {return exampleFromSchema(resolved, doc)}
    }
    if (schema.type === 'object' && schema.properties) {
        const out: any = {}
        for (const [k, v] of Object.entries<any>(schema.properties)) {
            out[k] = exampleFromSchema(v, doc) ?? null
        }
        return out
    }
    if (schema.type === 'array' && schema.items) {
        return [exampleFromSchema(schema.items, doc)]
    }
    if (schema.type === 'string') {return schema.format === 'date-time' ? new Date().toISOString() : ''}
    if (schema.type === 'integer' || schema.type === 'number') {return 0}
    if (schema.type === 'boolean') {return false}
    return undefined
}

function mapOpenAPISecurity (security: any[] | undefined, doc: any): AuthConfig {
    if (!Array.isArray(security) || !security.length) {return { type: 'none' }}
    const [first] = security
    const [schemeName] = Object.keys(first ?? {})
    if (!schemeName) {return { type: 'none' }}
    const scheme = doc.components?.securitySchemes?.[schemeName]
    if (!scheme) {return { type: 'none' }}
    if (scheme.type === 'http' && scheme.scheme === 'bearer') {
        return { type: 'bearer', token: '' }
    }
    if (scheme.type === 'http' && scheme.scheme === 'basic') {
        return { type: 'basic', username: '', password: '' }
    }
    if (scheme.type === 'apiKey') {
        return {
            type: 'apikey',
            apiKeyName: scheme.name,
            apiKeyValue: '',
            apiKeyLocation: scheme.in === 'query' ? 'query' : 'header',
        }
    }
    if (scheme.type === 'oauth2') {
        const flow = scheme.flows?.authorizationCode ?? scheme.flows?.clientCredentials ?? scheme.flows?.password
        if (flow) {
            return {
                type: 'oauth2',
                oauth2: {
                    grantType: scheme.flows.authorizationCode ? 'authorization_code'
                        : scheme.flows.clientCredentials ? 'client_credentials'
                            : 'password',
                    authUrl: flow.authorizationUrl ?? '',
                    tokenUrl: flow.tokenUrl ?? '',
                    clientId: '',
                    redirectUri: '',
                    scope: Object.keys(flow.scopes ?? {}).join(' '),
                    usePkce: true,
                },
            }
        }
    }
    return { type: 'none' }
}

interface OpenAPIOpContext {
    method: HttpMethod
    baseUrl: string
    pathRaw: string
    op: any
    doc: any
}

function mapOpenAPIOperation (ctx: OpenAPIOpContext): SavedRequest {
    const { method, baseUrl, pathRaw, op, doc } = ctx
    const headers: RequestHeader[] = []
    let urlPath = pathRaw
    const queryParts: string[] = []
    for (const p of (op.parameters ?? []) as any[]) {
        const example = p.example ?? p.schema?.example ?? p.schema?.default ?? ''
        if (p.in === 'path') {
            urlPath = urlPath.replace(`{${p.name}}`, String(example) || `{${p.name}}`)
        } else if (p.in === 'query') {
            queryParts.push(`${encodeURIComponent(p.name)}=${encodeURIComponent(String(example))}`)
        } else if (p.in === 'header') {
            headers.push({ key: p.name, value: String(example), enabled: !!p.required })
        }
    }
    const url = baseUrl + urlPath + (queryParts.length ? '?' + queryParts.join('&') : '')

    let body = ''
    let bodyType: APIClientOptions['bodyType'] = 'none'
    if (op.requestBody?.content) {
        const json = op.requestBody.content['application/json']
        const form = op.requestBody.content['application/x-www-form-urlencoded']
        const multi = op.requestBody.content['multipart/form-data']
        if (json) {
            bodyType = 'json'
            const example = json.example ?? exampleFromSchema(json.schema, doc)
            body = example !== undefined ? JSON.stringify(example, null, 2) : ''
        } else if (form) {
            bodyType = 'urlencoded'
            const example = form.example ?? exampleFromSchema(form.schema, doc)
            if (example && typeof example === 'object') {
                body = Object.entries(example).map(([k, v]) => `${k}=${v}`).join('\n')
            }
        } else if (multi) {
            bodyType = 'form-data'
        }
    }

    const auth = mapOpenAPISecurity(op.security ?? doc.security, doc)

    const options: APIClientOptions = {
        url,
        method,
        headers,
        body,
        bodyType,
        timeout: 30000,
        auth,
    }
    return {
        id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: `${method} ${pathRaw}`.trim(),
        options,
        folderId: null,
    }
}

// ---- Public importers ----------------------------------------------

export function importPostman (json: unknown): FullImportResult {
    const j = json as any
    const warnings: ImportWarning[] = []
    if (!j?.info || !Array.isArray(j.item)) {
        throw new Error('Not a Postman v2.1 collection (missing info / item)')
    }
    const collection: APICollection = {
        id: `col-${Date.now()}`,
        name: j.info.name ?? 'Imported',
        requests: [],
        folders: [],
        source: 'postman',
    }
    const colVars = j.variable ?? []

    const walk = (items: any[], folderId: string | null, breadcrumb: string): void => {
        for (const it of items) {
            if (Array.isArray(it.item)) {
                const folder: APIFolder = {
                    id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    name: it.name ?? 'Folder',
                }
                collection.folders!.push(folder)
                walk(it.item, folder.id, `${breadcrumb}/${it.name}`)
                continue
            }
            try {
                const req = mapPostmanItem(it, { folderId, breadcrumb, warnings })
                if (req) {collection.requests.push(req)}
            } catch (e: any) {
                warnings.push({ path: breadcrumb + '/' + (it.name ?? '?'), message: e?.message ?? String(e) })
            }
        }
    }
    walk(j.item, null, '')

    let environment: APIEnvironment | undefined = undefined
    if (Array.isArray(colVars) && colVars.length) {
        environment = {
            id: `env-${Date.now()}`,
            name: `${collection.name} (imported)`,
            variables: colVars.map((v: any) => ({
                key: v.key ?? '',
                value: String(v.value ?? ''),
                enabled: v.disabled !== true,
                secret: v.type === 'secret',
            })),
        }
    }

    return { collection, environment, warnings }
}

export function importOpenAPI (doc: unknown): FullImportResult {
    const d = doc as any
    const warnings: ImportWarning[] = []
    if (!d?.paths) {
        throw new Error('Not an OpenAPI 3.x document (missing paths)')
    }
    const baseUrl = (Array.isArray(d.servers) && d.servers[0]?.url) ? String(d.servers[0].url).replace(/\/$/, '') : ''
    const collection: APICollection = {
        id: `col-${Date.now()}`,
        name: d.info?.title ?? 'OpenAPI import',
        requests: [],
        folders: [],
        source: 'openapi',
    }

    for (const [pathRaw, pathItem] of Object.entries<any>(d.paths)) {
        for (const method of ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'] as const) {
            const op = pathItem[method]
            if (!op) {continue}
            try {
                const req = mapOpenAPIOperation({
                    method: method.toUpperCase() as HttpMethod,
                    baseUrl,
                    pathRaw,
                    op,
                    doc: d,
                })
                collection.requests.push(req)
            } catch (e: any) {
                warnings.push({ path: `${method.toUpperCase()} ${pathRaw}`, message: e?.message ?? String(e) })
            }
        }
    }
    return { collection, warnings }
}
