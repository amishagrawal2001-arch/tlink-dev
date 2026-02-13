import type { MenuItemOptions } from 'tlink-core'
import { BaseTerminalTabComponent } from './baseTerminalTab.component'

/**
 * Extend to add more terminal context menu items
 * @deprecated
 */
export abstract class TerminalContextMenuItemProvider {
    weight: number

    abstract getItems (tab: BaseTerminalTabComponent<any>): Promise<MenuItemOptions[]>
}
