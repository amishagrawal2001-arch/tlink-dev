import { Dashboard, DashboardTile, DASHBOARD_GRID_COLS } from '../api'

/**
 * Return a shallow-cloned dashboard where every tile has an explicit
 * `col`/`row`/`w`/`h`. Tiles without a position get sequential cells
 * in a 3-column flow (col = i % COLS, row = floor(i / COLS)). Tiles
 * with a partial layout keep their explicit fields and gain defaults
 * for the missing ones.
 *
 * Non-destructive by contract — callers get a normalized copy for
 * rendering. Config on disk is only rewritten when the user explicitly
 * saves (editor Save or drag-drop commit), so a load-only legacy
 * dashboard never auto-migrates the YAML.
 */
export function normalizeDashboard (d: Dashboard): Dashboard {
    const tiles = d.tiles.map((tile, i) => normalizeTile(tile, i))
    return { ...d, tiles }
}

function normalizeTile (tile: DashboardTile, index: number): DashboardTile {
    const col = tile.col ?? index % DASHBOARD_GRID_COLS
    const row = tile.row ?? Math.floor(index / DASHBOARD_GRID_COLS)
    const w = tile.w ?? 1
    const h = tile.h ?? 1
    return { ...tile, col, row, w, h }
}

/**
 * Order tiles for render. Rows then columns — matches reading order
 * so change-detection track-by stays stable as layouts shift.
 */
export function orderTiles (tiles: DashboardTile[]): DashboardTile[] {
    return [...tiles].sort((a, b) => {
        const ra = a.row ?? 0
        const rb = b.row ?? 0
        if (ra !== rb) { return ra - rb }
        return (a.col ?? 0) - (b.col ?? 0)
    })
}

/**
 * Find the first empty cell in a grid, scanning row-by-row left-to-
 * right. Used by the editor when appending a tile and by drag-drop
 * when the chosen target cell was already taken (we bump the moved
 * tile to the next free slot).
 */
export function findFreeCell (tiles: DashboardTile[]): { col: number; row: number } {
    const occupied = new Set<string>()
    for (const t of tiles) {
        const c = t.col ?? 0
        const r = t.row ?? 0
        occupied.add(`${c},${r}`)
    }
    for (let row = 0; row < 1000; row++) {
        for (let col = 0; col < DASHBOARD_GRID_COLS; col++) {
            if (!occupied.has(`${col},${row}`)) {
                return { col, row }
            }
        }
    }
    return { col: 0, row: 0 }
}

/**
 * Swap the (col, row) of two tiles. Mutates the array in place.
 * Used on drag-drop when the target cell is occupied — simpler than
 * cascading shifts, which can produce surprising moves for the user.
 */
export function swapTilePositions (tiles: DashboardTile[], aId: string, bId: string): void {
    const a = tiles.find(t => t.id === aId)
    const b = tiles.find(t => t.id === bId)
    if (!a || !b) { return }
    const ac = a.col, ar = a.row
    a.col = b.col
    a.row = b.row
    b.col = ac
    b.row = ar
}
