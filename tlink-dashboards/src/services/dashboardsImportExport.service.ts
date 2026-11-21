import { Injectable } from '@angular/core'
import { ConfigService, NotificationsService, PartialProfile, Profile, ProfilesService, TranslateService } from 'tlink-core'
import { Dashboard, DashboardTile } from '../api'
import { buildExport, slugifyDashboardName, validateDashboardExport, formatValidationError, migrate } from '../import'

/**
 * Per-tile source resolution result. The preview modal shows one row
 * per tile with the matched/unmatched flag; unmatched tiles still
 * import, they just render as error-state at runtime (M4.2a path).
 */
export interface SourceResolution {
    tileId: string
    tilePath: string
    tileType: DashboardTile['type']
    kind: 'gnmi' | 'collector'
    profileId: string
    matched: boolean
    /** Local profile's display name when matched — purely for the preview. */
    localProfileName?: string
}

export interface ImportPreview {
    dashboard: Dashboard
    /** New id written on import when the source id collided locally. */
    rewrittenId?: string
    resolutions: SourceResolution[]
}

/**
 * File I/O + orchestration for dashboard export / import. Dialog calls
 * go through `@electron/remote` (same pattern tlink-api-client uses);
 * validation / migration live in `../import`.
 */
@Injectable({ providedIn: 'root' })
export class DashboardsImportExportService {
    constructor (
        private readonly config: ConfigService,
        private readonly profiles: ProfilesService,
        private readonly notifications: NotificationsService,
        private readonly translate: TranslateService,
    ) { }

    /**
     * Prompt the user for a save path, write the dashboard JSON envelope.
     * Returns true on write, false on user cancel, logs an error toast
     * on write failure.
     */
    async exportToFile (dashboard: Dashboard): Promise<boolean> {
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const remote = require('@electron/remote')
            const result = await remote.dialog.showSaveDialog({
                title: this.translate.instant('Export dashboard'),
                defaultPath: `${slugifyDashboardName(dashboard.name)}.tlink-dashboard.json`,
                filters: [
                    { name: this.translate.instant('Tlink Dashboard'), extensions: ['tlink-dashboard.json', 'json'] },
                    { name: this.translate.instant('All Files'), extensions: ['*'] },
                ],
            })
            if (!result || result.canceled || !result.filePath) {
                return false
            }
            const envelope = buildExport(dashboard)
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const fs = require('fs')
            await fs.promises.writeFile(result.filePath, JSON.stringify(envelope, null, 2), 'utf8')
            this.notifications.info(this.translate.instant('Exported to {path}', { path: result.filePath }))
            return true
        } catch (e: any) {
            this.notifications.error(e?.message ?? this.translate.instant('Export failed'))
            return false
        }
    }

    /**
     * Prompt the user for a file, read + parse + migrate + validate.
     * Returns a preview (never writes to config here — caller shows a
     * modal and decides) or null if the user cancels / the file fails.
     * Any failure surfaces a targeted error toast before returning null.
     */
    async readImportFile (): Promise<ImportPreview | null> {
        let filePath: string | null = null
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const remote = require('@electron/remote')
            const result = await remote.dialog.showOpenDialog({
                title: this.translate.instant('Import dashboard'),
                properties: ['openFile'],
                filters: [
                    { name: this.translate.instant('Tlink Dashboard'), extensions: ['tlink-dashboard.json', 'json'] },
                    { name: this.translate.instant('All Files'), extensions: ['*'] },
                ],
            })
            if (!result || result.canceled || !result.filePaths?.length) {
                return null
            }
            filePath = result.filePaths[0] as string
        } catch (e: any) {
            this.notifications.error(e?.message ?? this.translate.instant('File picker failed'))
            return null
        }

        let raw: string
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const fs = require('fs')
            raw = await fs.promises.readFile(filePath, 'utf8')
        } catch (e: any) {
            this.notifications.error(e?.message ?? this.translate.instant('Could not read file'))
            return null
        }

        let parsed: unknown
        try {
            parsed = JSON.parse(raw)
        } catch {
            this.notifications.error(this.translate.instant('File is not valid JSON'))
            return null
        }

        const validated = validateDashboardExport(parsed)
        if (!validated.ok) {
            this.notifications.error(this.translate.instant('Invalid dashboard file: {detail}', { detail: formatValidationError(validated) }))
            return null
        }

        const migrated = migrate(validated.value)
        if (!migrated.ok) {
            this.notifications.error(migrated.error)
            return null
        }

        return this.buildPreview(migrated.value.dashboard)
    }

    /**
     * Persist a previewed dashboard. Collision on id is rewritten to a
     * fresh unique id (never overwrites an existing dashboard). Returns
     * the final dashboard as written.
     */
    async commitImport (preview: ImportPreview): Promise<Dashboard> {
        const store = this.config.store as { dashboards?: Dashboard[] }
        const list = store.dashboards ?? []
        const existingIds = new Set(list.map(d => d.id))
        let dashboard = preview.dashboard
        if (existingIds.has(dashboard.id)) {
            const rewritten = this.uniqueId(dashboard.id, existingIds)
            dashboard = { ...dashboard, id: rewritten }
        }
        store.dashboards = [...list, dashboard]
        await this.config.save()
        this.notifications.info(this.translate.instant('Imported dashboard "{name}"', { name: dashboard.name }))
        return dashboard
    }

    private async buildPreview (dashboard: Dashboard): Promise<ImportPreview> {
        const profiles = await this.profiles.getProfiles({ includeBuiltin: false }) as PartialProfile<Profile>[]
        const byKind = new Map<string, Map<string, string>>()
        for (const p of profiles) {
            if (!p.id || !p.name || !p.type) { continue }
            let kindMap = byKind.get(p.type)
            if (!kindMap) {
                kindMap = new Map()
                byKind.set(p.type, kindMap)
            }
            kindMap.set(p.id, p.name)
        }

        const resolutions: SourceResolution[] = dashboard.tiles.map(t => {
            const kindMap = byKind.get(t.source.kind)
            const localName = kindMap?.get(t.source.profileId)
            return {
                tileId: t.id,
                tilePath: t.path,
                tileType: t.type,
                kind: t.source.kind,
                profileId: t.source.profileId,
                matched: !!localName,
                localProfileName: localName,
            }
        })

        const store = this.config.store as { dashboards?: Dashboard[] }
        const existingIds = new Set((store.dashboards ?? []).map(d => d.id))
        const rewrittenId = existingIds.has(dashboard.id)
            ? this.uniqueId(dashboard.id, existingIds)
            : undefined

        return { dashboard, rewrittenId, resolutions }
    }

    private uniqueId (base: string, taken: Set<string>): string {
        for (let attempt = 0; attempt < 32; attempt++) {
            const suffix = Math.random().toString(36).slice(2, 7)
            const candidate = `${base}-imported-${suffix}`
            if (!taken.has(candidate)) { return candidate }
        }
        // Falls through only on a pathological RNG stream.
        return `${base}-imported-${Date.now().toString(36)}`
    }
}
