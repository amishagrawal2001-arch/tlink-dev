import { ConnectableProfile } from 'tlink-core'

export interface RDPProfile extends ConnectableProfile {
    options: RDPProfileOptions
}

export interface RDPProfileOptions {
    host: string
    port?: number
    user: string
    password?: string
    domain?: string
    // Display settings
    width?: number
    height?: number
    colorDepth?: 8 | 16 | 24 | 32
    // Features
    enableAudio?: boolean
    enableClipboard?: boolean
    enablePrinting?: boolean
    enableDrives?: boolean
    enableWallpaper?: boolean
    enableThemes?: boolean
    enableFontSmoothing?: boolean
    enableDesktopComposition?: boolean
    // Security
    enableNLA?: boolean
    enableTLS?: boolean
    ignoreCertificate?: boolean
    // Performance
    compression?: boolean
    bitmapCaching?: boolean
    // Advanced
    customParams?: string
}

