import { ConnectableProfile } from 'tlink-core';
export interface RDPProfile extends ConnectableProfile {
    options: RDPProfileOptions;
}
export interface RDPSessionLogSettings {
    enabled: boolean;
    directory?: string;
    logInputEvents?: boolean;
}
export interface RDPProfileOptions {
    host: string;
    port?: number;
    user: string;
    password?: string;
    domain?: string;
    clientType?: 'node-rdpjs' | 'xfreerdp';
    width?: number;
    height?: number;
    colorDepth?: 8 | 16 | 24 | 32;
    enableAudio?: boolean;
    enableClipboard?: boolean;
    enablePrinting?: boolean;
    enableDrives?: boolean;
    enableWallpaper?: boolean;
    enableThemes?: boolean;
    enableFontSmoothing?: boolean;
    enableDesktopComposition?: boolean;
    enableNLA?: boolean;
    enableTLS?: boolean;
    ignoreCertificate?: boolean;
    compression?: boolean;
    bitmapCaching?: boolean;
    customParams?: string;
    sessionLog?: RDPSessionLogSettings;
}
