import { Profile } from 'tlink-core'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'
export type BodyType = 'none' | 'json' | 'text' | 'form-data'
export type AuthType = 'none' | 'bearer' | 'basic'

export interface RequestHeader {
    key: string
    value: string
    enabled: boolean
}

export interface AuthConfig {
    type: AuthType
    token?: string
    username?: string
    password?: string
}

export interface APIClientOptions {
    url: string
    method: HttpMethod
    headers: RequestHeader[]
    body: string
    bodyType: BodyType
    timeout: number
    auth: AuthConfig
}

export interface APIClientProfile extends Profile {
    options: APIClientOptions
}

export interface APIResponse {
    status: number
    statusText: string
    headers: Record<string, string>
    body: string
    size: number
    time: number
    error?: string
}

export interface SavedRequest {
    id: string
    name: string
    options: APIClientOptions
}

export interface APICollection {
    id: string
    name: string
    requests: SavedRequest[]
}
