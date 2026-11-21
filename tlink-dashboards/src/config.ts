import { Injectable } from '@angular/core'
import { ConfigProvider } from 'tlink-core'

/**
 * Defaults injected into the app-wide config tree. Dashboards live as
 * a top-level `dashboards` array so one dashboard can mix tiles from
 * gNMI and collector profiles without being nested inside either
 * plugin's config namespace. Users hand-edit the config file to add
 * dashboards in M4.1; the editor UI is M4.3.
 */
@Injectable()
export class DashboardsConfigProvider extends ConfigProvider {
    defaults = {
        dashboards: [] as unknown[],
    }

    platformDefaults = {}
}
