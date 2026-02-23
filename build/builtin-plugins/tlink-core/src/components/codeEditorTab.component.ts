import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, HostBinding, HostListener, Injector, ViewChild, Optional } from '@angular/core'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'
import * as os from 'os'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'

import { BaseTabComponent, DirectoryUpload, FileUpload, GetRecoveryTokenOptions, PlatformService, RecoveryToken, SelectorOption } from '../api'
import { AppService } from '../services/app.service'
import { TabsService } from '../services/tabs.service'
import { ProfilesService } from '../services/profiles.service'
import { SplitTabComponent } from './splitTab.component'
type TerminalServiceType = any
type BaseTerminalTabComponentType = any
import { PromptModalComponent } from './promptModal.component'

type Monaco = any

interface EditorDocumentSnapshot {
    name: string
    path: string|null
    tempPath?: string|null
    folderPath?: string|null
    content: string
    languageId: string
    eol: 'LF'|'CRLF'
    tabSize: number
    insertSpaces: boolean
    isDirty?: boolean
    lastSavedValue?: string
}

interface EditorDocument extends EditorDocumentSnapshot {
    id: string
    model: any
    tempPath?: string|null
    folderPath?: string|null
    isDirty: boolean
    lastSavedValue: string
    ansiDecorationIds: string[]
    diskMtimeMs?: number|null
    diskSize?: number|null
    externalConflict?: ExternalConflictState|null
}

type ViewMode = 'editor'|'diff'
type EditorThemeMode = 'auto'|'light'|'dark'|'hc'|'solarized-light'|'solarized-dark'|'dracula'|'monokai'|'nord'
type FolderTreeMode = 'full'|'opened'
interface TreeNode {
    name: string
    path: string
    isFolder: boolean
    children: TreeNode[]
    docId?: string|null
    folderPath?: string|null
}
interface CodeFolder {
    name: string
    path: string
}

interface TreeBuildResult {
    roots: TreeNode[]
    truncated: boolean
}

interface QuickOpenSelection {
    kind: 'doc'|'file'
    docId?: string
    filePath?: string
}

interface ExternalConflictState {
    diskContent: string
    diskMtimeMs: number
    diskSize: number
}

@Component({
    selector: 'code-editor-tab',
    templateUrl: './codeEditorTab.component.pug',
    styleUrls: ['./codeEditorTab.component.scss'],
})
export class CodeEditorTabComponent extends BaseTabComponent implements AfterViewInit {
    @HostBinding('class.code-editor-tab') hostClass = true
    @HostBinding('class.platform-darwin') platformClassMacOS = process.platform === 'darwin'
    @HostBinding('style.--tlink-editor-selection-rgb')
    get editorSelectionRgb (): string {
        const rgb = this.hexToRgb(this.editorThemeColor)
        if (!rgb) {
            return '79, 156, 255'
        }
        return `${rgb.r}, ${rgb.g}, ${rgb.b}`
    }
    @ViewChild('primaryHost', { static: true }) primaryHost?: ElementRef<HTMLDivElement>
    @ViewChild('splitHost', { static: true }) splitHost?: ElementRef<HTMLDivElement>
    @ViewChild('diffHost', { static: true }) diffHost?: ElementRef<HTMLDivElement>

    loading = true
    loadError: string|null = null
    documents: EditorDocument[] = []
    activeDocId: string|null = null
    splitDocId: string|null = null
    recentFiles: string[] = []
    closedDocuments: EditorDocumentSnapshot[] = []
    editingDocId: string|null = null
    editingDocName = ''
    wordWrapEnabled = false
    minimapEnabled = false
    themeMode: EditorThemeMode = 'auto'
    editorThemeColor = '#4f9cff'
    private readonly supportedThemeModes: EditorThemeMode[] = [
        'auto',
        'light',
        'dark',
        'hc',
        'solarized-light',
        'solarized-dark',
        'dracula',
        'monokai',
        'nord',
    ]
    readonly editorThemePresets: Array<{ name: string, color: string }> = [
        { name: 'Blue', color: '#4f9cff' },
        { name: 'Sky', color: '#38bdf8' },
        { name: 'Cyan', color: '#06b6d4' },
        { name: 'Teal', color: '#14b8a6' },
        { name: 'Emerald', color: '#22c55e' },
        { name: 'Lime', color: '#84cc16' },
        { name: 'Amber', color: '#f59e0b' },
        { name: 'Gold', color: '#eab308' },
        { name: 'Rose', color: '#f43f5e' },
        { name: 'Red', color: '#ef4444' },
        { name: 'Pink', color: '#ec4899' },
        { name: 'Fuchsia', color: '#d946ef' },
        { name: 'Violet', color: '#8b5cf6' },
        { name: 'Indigo', color: '#6366f1' },
        { name: 'Purple', color: '#a855f7' },
        { name: 'Orange', color: '#f97316' },
        { name: 'Slate', color: '#64748b' },
    ]
    fontSize = 14
    lineHeight = 22
    autosaveEnabled = true
    autosaveIntervalMs = 15000
    viewMode: ViewMode = 'editor'
    breadcrumbs: string[] = []
    statusMessage = ''
    sidebarWidth = 240
    private runTerminalTab: BaseTerminalTabComponentType | null = null
    pendingDiffDocId: string|null = null
    fileMenuOpen = false
    editMenuOpen = false
    docContextMenuOpen = false
    docContextMenuDocId: string|null = null
    docContextMenuX = 0
    docContextMenuY = 0
    folders: CodeFolder[] = []
    selectedFolderPath: string|null = null
    folderContextMenuOpen = false
    folderContextMenuPath: string|null = null
    folderContextMenuPaths: string[] = []
    folderContextScopeRoot: string|null = null
    folderContextScopeMode: FolderTreeMode = 'full'
    folderContextMenuX = 0
    folderContextMenuY = 0
    fileContextMenuOpen = false
    fileContextMenuPath: string|null = null
    fileContextMenuPaths: string[] = []
    fileContextMenuX = 0
    fileContextMenuY = 0
    selectedFilePathKeys = new Set<string>()
    selectedFolderPathKeys = new Set<string>()
    private fileSelectionAnchorKey: string|null = null
    private folderSelectionAnchorKey: string|null = null
    private draggingDocId: string|null = null
    private draggingPath: string|null = null
    private draggingIsFolder = false
    expandedFolders = new Set<string>()
    private hiddenTreePathKeys = new Set<string>()
    private externalFileScopedRoots = new Map<string, Set<string>>()
    private folderTreeModes = new Map<string, FolderTreeMode>()
    private _treeItems: Array<{ node: TreeNode, depth: number }> = []
    private treeKeyboardActive = false

    get hasRunTerminal (): boolean {
        return !!this.runTerminalTab
    }

    private formatSelectionActionLabel (single: string, plural: string, fileCount: number, folderCount: number): string {
        const total = fileCount + folderCount
        if (total <= 1) {
            return single
        }
        const parts: string[] = []
        if (fileCount) {
            parts.push(`${fileCount} file${fileCount === 1 ? '' : 's'}`)
        }
        if (folderCount) {
            parts.push(`${folderCount} folder${folderCount === 1 ? '' : 's'}`)
        }
        return `${plural} ${parts.join(', ')}`
    }

    get selectionContextDeleteLabel (): string {
        return this.formatSelectionActionLabel('Delete (disk)', 'Delete', this.fileContextMenuPaths.length, this.folderContextMenuPaths.length) + (this.fileContextMenuPaths.length + this.folderContextMenuPaths.length > 1 ? ' (disk)' : '')
    }

    get selectionContextDuplicateLabel (): string {
        return this.formatSelectionActionLabel('Duplicate', 'Duplicate', this.fileContextMenuPaths.length, this.folderContextMenuPaths.length)
    }

    get selectionContextMoveLabel (): string {
        return this.formatSelectionActionLabel('Move…', 'Move', this.fileContextMenuPaths.length, this.folderContextMenuPaths.length)
    }

    get folderScopeToggleLabel (): string {
        if (!this.folderContextScopeRoot) {
            return 'Opened files only'
        }
        return this.folderContextScopeMode === 'opened' ? 'Show full folder' : 'Opened files only'
    }

    get canDeleteOnDisk (): boolean {
        if (this.getSelectedFilePathsFromTree().length > 0) {
            return true
        }
        if (this.getSelectedFolderPathsFromTree().length > 0) {
            return true
        }
        return !!this.getActiveDoc()?.path
    }

    get canDuplicateOnDisk (): boolean {
        if (this.getSelectedFilePathsFromTree().length > 0 || this.getSelectedFolderPathsFromTree().length > 0) {
            return true
        }
        return !!this.getActiveDoc()?.path
    }

    get canMoveOnDisk (): boolean {
        if (this.getSelectedFilePathsFromTree().length > 0 || this.getSelectedFolderPathsFromTree().length > 0) {
            return true
        }
        return !!this.getActiveDoc()?.path
    }

    get activeExternalConflictDoc (): EditorDocument|null {
        const active = this.getActiveDoc()
        if (!active?.externalConflict) {
            return null
        }
        return active
    }

    statusLineCol = ''
    statusLanguage = ''
    statusEOL = ''
    statusIndent = ''
    statusEncoding = 'UTF-8'
    statusWrap = ''

    private monaco?: Monaco
    private monacoPromise?: Promise<Monaco>
    private monacoAmdRequire?: any
    private monacoBase = this.resolveMonacoBase()
    private folderRoot = this.getFolderRoot()
    private primaryEditor: any
    splitEditor: any
    private diffEditor: any
    private diffOriginalModel: any
    private autosaveTimer?: number
    private externalOpenHandler?: (e: Event) => void
    private tempSaveTimers = new Map<string, number>()
    private persistStateTimer?: number
    private treeRefreshTimer?: number
    private externalWatchTimer?: number
    private externalWatchBusy = false
    private fileMenuHoverCloseTimer?: number
    private editMenuHoverCloseTimer?: number
    private readonly menuHoverCloseDelayMs = 140
    private treeBuildNonce = 0
    private deletingPathKeys = new Set<string>()
    private focusedEditor: 'primary'|'split' = 'primary'
    private pendingSplitDocId: string|null = null
    private resizingSidebar = false
    private resizeStartX = 0
    private resizeStartWidth = 0
    private readonly treeNodeBudget = 4000
    private readonly quickOpenBudget = 3000
    private readonly externalWatchIntervalMs = 1800
    private readonly skippedFolders = new Set(['.git', 'node_modules', '.svn', '.hg', '.idea', '.vscode', 'dist', 'build'])
    private readonly studioTitle = 'Tlink Studio'

    private resolveStudioDir (preferredName: string, legacyName?: string): string {
        const home = process.env.TLINK_CONFIG_DIR || process.env.HOME || os.homedir()
        const baseDir = path.join(home || os.tmpdir(), '.tlink')
        const preferredDir = path.join(baseDir, preferredName)
        const legacyDir = legacyName ? path.join(baseDir, legacyName) : null
        if (fsSync.existsSync(preferredDir)) {
            return preferredDir
        }
        try {
            if (legacyDir && fsSync.existsSync(legacyDir)) {
                fsSync.renameSync(legacyDir, preferredDir)
                return preferredDir
            }
            fsSync.mkdirSync(preferredDir, { recursive: true })
            return preferredDir
        } catch {
            if (legacyDir && fsSync.existsSync(legacyDir)) {
                return legacyDir
            }
            return os.tmpdir()
        }
    }

    private getFolderRoot (): string {
        return this.resolveStudioDir('tlink-studio', 'code-editor')
    }

    private getFolderDisplayName (folderPath: string): string {
        if (this.isSameFsPath(folderPath, this.folderRoot)) {
            return this.studioTitle
        }
        return path.basename(folderPath) || folderPath || 'Folder'
    }

    private loadFoldersFromState (): void {
        let paths: string[] = []
        if (typeof localStorage !== 'undefined') {
            const stored = localStorage.getItem('codeEditor.folders')
            if (stored) {
                try {
                    paths = JSON.parse(stored) ?? []
                } catch {
                    paths = []
                }
            }
        }
        if (!paths.includes(this.folderRoot)) {
            paths.unshift(this.folderRoot)
        }
        const existing = paths.filter(p => p && fsSync.existsSync(p) && fsSync.statSync(p).isDirectory())
        const unique: string[] = []
        for (const p of existing) {
            if (!unique.includes(p)) {
                unique.push(p)
            }
        }
        this.folders = unique.map(p => ({ path: p, name: this.getFolderDisplayName(p) }))
        this.loadScopedExternalFilesFromState(unique)
        this.loadFolderTreeModesFromState(unique)
        const savedSelected = typeof localStorage !== 'undefined' ? localStorage.getItem('codeEditor.selectedFolder') : null
        this.selectedFolderPath = savedSelected && unique.includes(savedSelected) ? savedSelected : null
        if (typeof localStorage !== 'undefined') {
            const storedExpanded = localStorage.getItem('codeEditor.expandedFolders')
            if (storedExpanded) {
                try {
                    this.expandedFolders = new Set(JSON.parse(storedExpanded) ?? [])
                } catch {
                    this.expandedFolders = new Set()
                }
            }
            const storedHidden = localStorage.getItem('codeEditor.hiddenTreePaths')
            if (storedHidden) {
                try {
                    const parsed = JSON.parse(storedHidden)
                    this.hiddenTreePathKeys = new Set((Array.isArray(parsed) ? parsed : []).filter(x => typeof x === 'string'))
                } catch {
                    this.hiddenTreePathKeys = new Set()
                }
            }
        }
        if (!this.expandedFolders.size) {
            for (const f of this.folders) {
                this.expandedFolders.add(f.path)
            }
        }
        // Don't call updateTreeItems here - it will be called in ngAfterViewInit
        // to avoid ExpressionChangedAfterItHasBeenCheckedError
    }

    private persistFolders (): void {
        if (typeof localStorage === 'undefined') {
            return
        }
        localStorage.setItem('codeEditor.folders', JSON.stringify(this.folders.map(f => f.path)))
        localStorage.setItem('codeEditor.selectedFolder', this.selectedFolderPath ?? '')
        localStorage.setItem('codeEditor.expandedFolders', JSON.stringify(Array.from(this.expandedFolders)))
        localStorage.setItem('codeEditor.hiddenTreePaths', JSON.stringify(Array.from(this.hiddenTreePathKeys)))
        this.persistFolderTreeModes()
        this.persistScopedExternalFiles()
    }

    selectFolder (folderPath: string|null, syncTreeSelection = true): void {
        this.selectedFolderPath = folderPath
        if (syncTreeSelection) {
            this.setFolderSelection(folderPath ? [folderPath] : [])
            this.setFileSelection([])
        }
        this.persistFolders()
    }

    private resolveDocFolder (doc: EditorDocument): string|null {
        return doc.folderPath ?? this.getFolderForPath(doc.path)
    }

    getDocById (docId: string): EditorDocument|null {
        return this.documents.find(d => d.id === docId) ?? null
    }

    private isWorkspaceRootFolder (folderPath: string|null|undefined): boolean {
        if (!folderPath) {
            return false
        }
        return this.folders.some(folder => this.isSameFsPath(folder.path, folderPath))
    }

    isTreeNodeClosable (node: TreeNode): boolean {
        if (node.isFolder) {
            return !!node.path
        }
        return !!node.docId || !!node.path
    }

    getTreeCloseTitle (node: TreeNode): string {
        if (node.isFolder) {
            return this.isWorkspaceRootFolder(node.path) ? 'Remove folder from list' : 'Close folder'
        }
        return 'Close file'
    }

    async closeTreeNode (node: TreeNode): Promise<void> {
        if (node.isFolder) {
            const folderPath = node.path
            if (!folderPath) {
                return
            }
            if (this.isWorkspaceRootFolder(folderPath)) {
                this.removeFolder(folderPath)
                this.statusMessage = `Closed folder: ${node.name}`
                this.updateStatus()
                return
            }
            this.hideTreePath(folderPath, true)
            for (const expandedPath of Array.from(this.expandedFolders)) {
                if (this.isTreePathEqualOrDescendant(expandedPath, folderPath)) {
                    this.expandedFolders.delete(expandedPath)
                }
            }
            this.expandedFolders = new Set(this.expandedFolders)
            if (this.selectedFolderPath && this.isTreePathEqualOrDescendant(this.selectedFolderPath, folderPath)) {
                this.selectedFolderPath = this.getFolderForPath(folderPath)
            }
            this.persistFolders()
            this.updateTreeItems()
            this.statusMessage = `Closed folder: ${node.name}`
            this.updateStatus()
            window.setTimeout(() => this.cdr.markForCheck(), 0)
            return
        }

        if (node.docId) {
            await this.closeDocument(node.docId)
            if (this.getDocById(node.docId)) {
                return
            }
        }
        if (node.path) {
            try {
                if (fsSync.existsSync(node.path) && fsSync.statSync(node.path).isFile()) {
                    this.hideTreePath(node.path)
                }
            } catch {
                // Keep close non-blocking for transient paths.
            }
            this.updateTreeItems()
            this.statusMessage = `Closed file: ${node.name}`
            this.updateStatus()
            window.setTimeout(() => this.cdr.markForCheck(), 0)
        }
    }

    private getFolderForPath (filePath: string|null): string|null {
        if (!filePath) {
            return null
        }
        const normalized = path.resolve(filePath)
        let bestMatch: string|null = null
        let bestLength = -1
        for (const folder of this.folders) {
            const folderResolved = path.resolve(folder.path)
            if (normalized === folderResolved || normalized.startsWith(folderResolved + path.sep)) {
                if (folderResolved.length > bestLength) {
                    bestMatch = folder.path
                    bestLength = folderResolved.length
                }
            }
        }
        return bestMatch
    }

    private getWorkspaceRootForPath (targetPath: string|null|undefined): string|null {
        if (!targetPath) {
            return null
        }
        return this.getFolderForPath(targetPath)
    }

    private getFolderTreeMode (rootPath: string|null|undefined): FolderTreeMode {
        const rootKey = this.getFsPathKey(rootPath)
        if (!rootKey) {
            return 'full'
        }
        return this.folderTreeModes.get(rootKey) === 'opened' ? 'opened' : 'full'
    }

    private setFolderTreeMode (rootPath: string|null|undefined, mode: FolderTreeMode): void {
        const rootKey = this.getFsPathKey(rootPath)
        if (!rootKey) {
            return
        }
        if (mode === 'opened') {
            this.folderTreeModes.set(rootKey, 'opened')
        } else {
            this.folderTreeModes.delete(rootKey)
        }
    }

    private isSameStringSet (left: Set<string>, right: Set<string>): boolean {
        if (left.size !== right.size) {
            return false
        }
        for (const value of left) {
            if (!right.has(value)) {
                return false
            }
        }
        return true
    }

    private getOpenFileKeysForRoot (rootPath: string): Set<string> {
        const rootKey = this.getFsPathKey(rootPath)
        const keys = new Set<string>()
        if (!rootKey) {
            return keys
        }
        for (const doc of this.documents) {
            const docPath = doc.path ?? doc.tempPath ?? null
            const docKey = this.getFsPathKey(docPath)
            if (!docKey) {
                continue
            }
            if (docKey === rootKey || docKey.startsWith(rootKey + path.sep)) {
                keys.add(docKey)
            }
        }
        return keys
    }

    private syncOpenedFileScopeForRoot (rootPath: string): boolean {
        const rootKey = this.getFsPathKey(rootPath)
        if (!rootKey) {
            return false
        }
        if (this.getFolderTreeMode(rootPath) !== 'opened') {
            if (this.externalFileScopedRoots.has(rootKey)) {
                this.externalFileScopedRoots.delete(rootKey)
                return true
            }
            return false
        }

        const next = this.getOpenFileKeysForRoot(rootPath)
        const previous = this.externalFileScopedRoots.get(rootKey) ?? new Set<string>()
        if (this.isSameStringSet(previous, next)) {
            return false
        }
        this.externalFileScopedRoots.set(rootKey, next)
        for (const fileKey of next) {
            this.expandPathWithinRoot(rootPath, fileKey)
        }
        return true
    }

    private syncOpenedFileScopes (): boolean {
        let changed = false
        const openedRootKeys = new Set<string>()
        for (const folder of this.folders) {
            const rootKey = this.getFsPathKey(folder.path)
            if (!rootKey) {
                continue
            }
            if (this.getFolderTreeMode(folder.path) === 'opened') {
                openedRootKeys.add(rootKey)
            }
            if (this.syncOpenedFileScopeForRoot(folder.path)) {
                changed = true
            }
        }
        for (const rootKey of Array.from(this.externalFileScopedRoots.keys())) {
            if (!openedRootKeys.has(rootKey)) {
                this.externalFileScopedRoots.delete(rootKey)
                changed = true
            }
        }
        return changed
    }

    private setRootModeToOpenedFiles (rootPath: string, includePath?: string|null): void {
        const rootKey = this.getFsPathKey(rootPath)
        if (!rootKey) {
            return
        }
        this.setFolderTreeMode(rootPath, 'opened')
        const scoped = this.getOpenFileKeysForRoot(rootPath)
        const activePath = this.getActiveDoc()?.path ?? null
        const activeKey = this.getFsPathKey(activePath)
        if (activeKey && (activeKey === rootKey || activeKey.startsWith(rootKey + path.sep))) {
            scoped.add(activeKey)
        }
        for (const filePath of this.getSelectedFilePathsFromTree()) {
            const selectedKey = this.getFsPathKey(filePath)
            if (selectedKey && (selectedKey === rootKey || selectedKey.startsWith(rootKey + path.sep))) {
                scoped.add(selectedKey)
            }
        }
        if (includePath) {
            const fileKey = this.getFsPathKey(includePath)
            if (fileKey && (fileKey === rootKey || fileKey.startsWith(rootKey + path.sep))) {
                scoped.add(fileKey)
                this.expandPathWithinRoot(rootPath, includePath)
            }
        }
        this.externalFileScopedRoots.set(rootKey, scoped)
    }

    private setRootModeToFullFolder (rootPath: string): void {
        this.setFolderTreeMode(rootPath, 'full')
        this.clearScopedExternalFiles(rootPath)
    }

    private clearScopedExternalFiles (rootPath: string): void {
        const rootKey = this.getFsPathKey(rootPath)
        if (!rootKey) {
            return
        }
        this.externalFileScopedRoots.delete(rootKey)
    }

    private getScopedExternalFiles (rootPath: string): Set<string>|null {
        const rootKey = this.getFsPathKey(rootPath)
        if (!rootKey) {
            return null
        }
        return this.externalFileScopedRoots.get(rootKey) ?? null
    }

    private loadFolderTreeModesFromState (existingFolderPaths: string[]): void {
        this.folderTreeModes = new Map<string, FolderTreeMode>()
        const existingRootKeys = new Set<string>()
        for (const folderPath of existingFolderPaths) {
            const rootKey = this.getFsPathKey(folderPath)
            if (rootKey) {
                existingRootKeys.add(rootKey)
            }
        }
        if (typeof localStorage !== 'undefined') {
            const stored = localStorage.getItem('codeEditor.folderTreeModes')
            if (stored) {
                try {
                    const parsed = JSON.parse(stored) as Record<string, unknown>
                    for (const [rawRoot, rawMode] of Object.entries(parsed ?? {})) {
                        if (rawMode !== 'opened') {
                            continue
                        }
                        const rootKey = this.getFsPathKey(rawRoot) ?? rawRoot
                        if (!rootKey || !existingRootKeys.has(rootKey)) {
                            continue
                        }
                        this.folderTreeModes.set(rootKey, 'opened')
                    }
                } catch {
                    this.folderTreeModes = new Map<string, FolderTreeMode>()
                }
            }
        }
        // Migration for older builds that persisted scoped roots without an explicit mode map.
        for (const rootKey of this.externalFileScopedRoots.keys()) {
            if (!existingRootKeys.has(rootKey)) {
                continue
            }
            this.folderTreeModes.set(rootKey, 'opened')
        }
    }

    private persistFolderTreeModes (): void {
        if (typeof localStorage === 'undefined') {
            return
        }
        const existingRootKeys = new Set<string>()
        for (const folder of this.folders) {
            const rootKey = this.getFsPathKey(folder.path)
            if (rootKey) {
                existingRootKeys.add(rootKey)
            }
        }
        const payload: Record<string, FolderTreeMode> = {}
        for (const [rootKey, mode] of this.folderTreeModes) {
            if (mode !== 'opened' || !existingRootKeys.has(rootKey)) {
                continue
            }
            payload[rootKey] = mode
        }
        localStorage.setItem('codeEditor.folderTreeModes', JSON.stringify(payload))
    }

    private loadScopedExternalFilesFromState (existingFolderPaths: string[]): void {
        this.externalFileScopedRoots = new Map<string, Set<string>>()
        if (typeof localStorage === 'undefined') {
            return
        }
        const stored = localStorage.getItem('codeEditor.externalScopedFiles')
        if (!stored) {
            return
        }
        let parsed: unknown
        try {
            parsed = JSON.parse(stored)
        } catch {
            return
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return
        }
        const existingRootKeys = new Set<string>()
        for (const folderPath of existingFolderPaths) {
            const key = this.getFsPathKey(folderPath)
            if (key) {
                existingRootKeys.add(key)
            }
        }
        for (const [rawRoot, rawFiles] of Object.entries(parsed as Record<string, unknown>)) {
            const rootKey = this.getFsPathKey(rawRoot) ?? rawRoot
            if (!rootKey || !existingRootKeys.has(rootKey)) {
                continue
            }
            const scopedFiles = new Set<string>()
            const fileList = Array.isArray(rawFiles) ? rawFiles : []
            for (const rawFile of fileList) {
                if (typeof rawFile !== 'string') {
                    continue
                }
                const fileKey = this.getFsPathKey(rawFile) ?? rawFile
                if (!fileKey) {
                    continue
                }
                if (fileKey === rootKey || fileKey.startsWith(rootKey + path.sep)) {
                    scopedFiles.add(fileKey)
                }
            }
            if (scopedFiles.size) {
                this.externalFileScopedRoots.set(rootKey, scopedFiles)
            }
        }
    }

    private persistScopedExternalFiles (): void {
        if (typeof localStorage === 'undefined') {
            return
        }
        const payload: Record<string, string[]> = {}
        const existingRootKeys = new Set<string>()
        for (const folder of this.folders) {
            const key = this.getFsPathKey(folder.path)
            if (key) {
                existingRootKeys.add(key)
            }
        }
        for (const [rootKey, scopedFiles] of this.externalFileScopedRoots) {
            if (!rootKey || !existingRootKeys.has(rootKey)) {
                continue
            }
            const sanitized = Array.from(scopedFiles).filter(fileKey => !!fileKey && (fileKey === rootKey || fileKey.startsWith(rootKey + path.sep)))
            if (!sanitized.length) {
                continue
            }
            payload[rootKey] = Array.from(new Set(sanitized))
        }
        localStorage.setItem('codeEditor.externalScopedFiles', JSON.stringify(payload))
    }

    private hydrateScopedRootsFromOpenDocuments (): boolean {
        let changed = false
        for (const folder of this.folders) {
            const rootKey = this.getFsPathKey(folder.path)
            if (!rootKey) {
                continue
            }
            if (this.getFolderTreeMode(folder.path) !== 'opened') {
                continue
            }
            const scopedByKey = new Set<string>()
            for (const doc of this.documents) {
                const docPath = doc.path ?? doc.tempPath ?? null
                const docKey = this.getFsPathKey(docPath)
                if (!docKey) {
                    continue
                }
                if (docKey === rootKey || docKey.startsWith(rootKey + path.sep)) {
                    scopedByKey.add(docKey)
                }
            }
            const previous = this.externalFileScopedRoots.get(rootKey) ?? new Set<string>()
            if (this.isSameStringSet(previous, scopedByKey)) {
                continue
            }
            this.externalFileScopedRoots.set(rootKey, scopedByKey)
            for (const resolvedPath of scopedByKey) {
                this.expandPathWithinRoot(folder.path, resolvedPath)
            }
            changed = true
        }
        return changed
    }

    private shouldIncludeScopedTreeEntry (scopedFiles: Set<string>|null, mode: FolderTreeMode, entryPath: string, isDirectory: boolean): boolean {
        if (mode !== 'opened') {
            return true
        }
        if (!scopedFiles || !scopedFiles.size) {
            return false
        }
        const entryKey = this.getFsPathKey(entryPath)
        if (!entryKey) {
            return false
        }
        if (!isDirectory) {
            return scopedFiles.has(entryKey)
        }
        for (const scopedFileKey of scopedFiles) {
            if (scopedFileKey === entryKey || scopedFileKey.startsWith(entryKey + path.sep)) {
                return true
            }
        }
        return false
    }

    private expandPathWithinRoot (rootPath: string, targetPath: string): void {
        const root = path.resolve(rootPath)
        let cursor = path.resolve(path.dirname(targetPath))
        while (this.isTreePathEqualOrDescendant(cursor, root)) {
            this.expandedFolders.add(cursor)
            if (this.isSameFsPath(cursor, root)) {
                break
            }
            const parent = path.dirname(cursor)
            if (parent === cursor) {
                break
            }
            cursor = parent
        }
        this.expandedFolders.add(root)
    }

    private ensurePathVisibleInTree (targetPath: string, selectFolder = false, scopeToOpenedFileOnly = false): void {
        const resolved = path.resolve(targetPath)
        const existingRoot = this.getFolderForPath(resolved)
        if (existingRoot) {
            if (scopeToOpenedFileOnly) {
                const alreadyOpenedOnly = this.getFolderTreeMode(existingRoot) === 'opened'
                const canAutoScope = alreadyOpenedOnly || !this.isSameFsPath(existingRoot, this.folderRoot)
                if (canAutoScope) {
                    this.setRootModeToOpenedFiles(existingRoot, resolved)
                    this.expandPathWithinRoot(existingRoot, resolved)
                }
            }
            if (selectFolder) {
                this.selectFolder(existingRoot)
            }
            return
        }
        const parentDir = path.dirname(resolved)
        if (!parentDir || parentDir === resolved) {
            return
        }
        this.attachFolderToTree(parentDir, selectFolder, scopeToOpenedFileOnly ? resolved : null)
    }

    private normalizeFsPath (filePath: string|null): string|null {
        if (!filePath) {
            return null
        }
        let normalized = path.resolve(filePath)
        try {
            if ((fsSync.realpathSync as any).native) {
                normalized = (fsSync.realpathSync as any).native(normalized)
            } else {
                normalized = fsSync.realpathSync(normalized)
            }
        } catch {
            // Use the resolved path when realpath is unavailable.
        }
        if (process.platform === 'win32') {
            normalized = normalized.toLowerCase()
        }
        return normalized
    }

    private isSameFsPath (a: string|null|undefined, b: string|null|undefined): boolean {
        const left = this.normalizeFsPath(a ?? null)
        const right = this.normalizeFsPath(b ?? null)
        return !!left && !!right && left === right
    }

    private getFsPathKey (filePath: string|null|undefined): string|null {
        const normalized = this.normalizeFsPath(filePath ?? null)
        if (normalized) {
            return normalized
        }
        if (!filePath) {
            return null
        }
        let fallback = path.resolve(filePath)
        if (process.platform === 'win32') {
            fallback = fallback.toLowerCase()
        }
        return fallback
    }

    private toTreePathKey (filePath: string|null|undefined): string|null {
        if (!filePath) {
            return null
        }
        let resolved = path.resolve(filePath)
        if (process.platform === 'win32') {
            resolved = resolved.toLowerCase()
        }
        return resolved
    }

    private isTreePathEqualOrDescendant (candidatePath: string|null|undefined, ancestorPath: string|null|undefined): boolean {
        const candidate = this.toTreePathKey(candidatePath)
        const ancestor = this.toTreePathKey(ancestorPath)
        return !!candidate && !!ancestor && (candidate === ancestor || candidate.startsWith(ancestor + path.sep))
    }

    private hideTreePath (targetPath: string, includeDescendants = false): void {
        const targetKey = this.toTreePathKey(targetPath)
        if (!targetKey) {
            return
        }
        const next = new Set(this.hiddenTreePathKeys)
        next.add(targetKey)
        if (includeDescendants) {
            for (const key of Array.from(next)) {
                if (key !== targetKey && key.startsWith(targetKey + path.sep)) {
                    next.delete(key)
                }
            }
        }
        this.hiddenTreePathKeys = next
        this.persistFolders()
    }

    private revealTreePath (targetPath: string, includeDescendants = false): void {
        const targetKey = this.toTreePathKey(targetPath)
        if (!targetKey || !this.hiddenTreePathKeys.size) {
            return
        }
        let changed = false
        const next = new Set<string>()
        for (const hiddenKey of this.hiddenTreePathKeys) {
            const isSelf = hiddenKey === targetKey
            const isAncestor = targetKey.startsWith(hiddenKey + path.sep)
            const isDescendant = hiddenKey.startsWith(targetKey + path.sep)
            if (isSelf || isAncestor || (includeDescendants && isDescendant)) {
                changed = true
                continue
            }
            next.add(hiddenKey)
        }
        if (!changed) {
            return
        }
        this.hiddenTreePathKeys = next
        this.persistFolders()
    }

    isTreeFileSelected (filePath: string|null|undefined): boolean {
        const key = this.getFsPathKey(filePath)
        return !!key && this.selectedFilePathKeys.has(key)
    }

    isTreeFolderSelected (folderPath: string|null|undefined): boolean {
        const key = this.getFsPathKey(folderPath)
        return !!key && this.selectedFolderPathKeys.has(key)
    }

    private getVisibleTreeFilePaths (): string[] {
        const result: string[] = []
        for (const item of this._treeItems) {
            if (item.node.isFolder || !item.node.path) {
                continue
            }
            result.push(item.node.path)
        }
        return result
    }

    private getVisibleTreeFolderPaths (): string[] {
        const result: string[] = []
        for (const item of this._treeItems) {
            if (!item.node.isFolder || !item.node.path) {
                continue
            }
            result.push(item.node.path)
        }
        return result
    }

    private getSelectedFilePathsFromTree (): string[] {
        const result: string[] = []
        for (const filePath of this.getVisibleTreeFilePaths()) {
            if (this.isTreeFileSelected(filePath)) {
                result.push(filePath)
            }
        }
        return result
    }

    private getSelectedFolderPathsFromTree (): string[] {
        const result: string[] = []
        for (const folderPath of this.getVisibleTreeFolderPaths()) {
            if (this.isTreeFolderSelected(folderPath)) {
                result.push(folderPath)
            }
        }
        return result
    }

    private setFileSelection (filePaths: string[]): void {
        const next = new Set<string>()
        let lastKey: string|null = null
        for (const filePath of filePaths) {
            const key = this.getFsPathKey(filePath)
            if (!key) {
                continue
            }
            next.add(key)
            lastKey = key
        }
        this.selectedFilePathKeys = next
        this.fileSelectionAnchorKey = lastKey
        this.cdr.markForCheck()
    }

    private setFolderSelection (folderPaths: string[]): void {
        const next = new Set<string>()
        let lastKey: string|null = null
        for (const folderPath of folderPaths) {
            const key = this.getFsPathKey(folderPath)
            if (!key) {
                continue
            }
            next.add(key)
            lastKey = key
        }
        this.selectedFolderPathKeys = next
        this.folderSelectionAnchorKey = lastKey
        this.cdr.markForCheck()
    }

    private toggleFileSelection (filePath: string): void {
        const key = this.getFsPathKey(filePath)
        if (!key) {
            return
        }
        const next = new Set(this.selectedFilePathKeys)
        if (next.has(key)) {
            next.delete(key)
        } else {
            next.add(key)
        }
        this.selectedFilePathKeys = next
        this.fileSelectionAnchorKey = key
        this.cdr.markForCheck()
    }

    private toggleFolderSelection (folderPath: string): void {
        const key = this.getFsPathKey(folderPath)
        if (!key) {
            return
        }
        const next = new Set(this.selectedFolderPathKeys)
        if (next.has(key)) {
            next.delete(key)
        } else {
            next.add(key)
        }
        this.selectedFolderPathKeys = next
        this.folderSelectionAnchorKey = key
        this.cdr.markForCheck()
    }

    private remapFileSelectionPath (
        oldPath: string|null|undefined,
        newPath: string|null|undefined,
        oldKeyOverride: string|null = null,
    ): void {
        const oldKey = oldKeyOverride || this.getFsPathKey(oldPath)
        const newKey = this.getFsPathKey(newPath)
        if (!oldKey || !newKey || oldKey === newKey) {
            return
        }
        let changed = false
        if (this.selectedFilePathKeys.has(oldKey)) {
            const next = new Set(this.selectedFilePathKeys)
            next.delete(oldKey)
            next.add(newKey)
            this.selectedFilePathKeys = next
            changed = true
        }
        if (this.fileSelectionAnchorKey === oldKey) {
            this.fileSelectionAnchorKey = newKey
            changed = true
        }
        if (changed) {
            this.cdr.markForCheck()
        }
    }

    private extendFileSelection (filePath: string): void {
        const targetKey = this.getFsPathKey(filePath)
        if (!targetKey) {
            return
        }
        const visible = this.getVisibleTreeFilePaths()
        if (!visible.length) {
            return
        }
        const targetIndex = visible.findIndex(p => this.isSameFsPath(p, filePath))
        if (targetIndex < 0) {
            this.setFileSelection([filePath])
            return
        }
        let anchorIndex = -1
        if (this.fileSelectionAnchorKey) {
            anchorIndex = visible.findIndex(p => this.getFsPathKey(p) === this.fileSelectionAnchorKey)
        }
        if (anchorIndex < 0) {
            anchorIndex = targetIndex
        }
        const start = Math.min(anchorIndex, targetIndex)
        const end = Math.max(anchorIndex, targetIndex)
        const next = new Set<string>()
        for (const p of visible.slice(start, end + 1)) {
            const key = this.getFsPathKey(p)
            if (key) {
                next.add(key)
            }
        }
        this.selectedFilePathKeys = next
        if (!this.fileSelectionAnchorKey) {
            this.fileSelectionAnchorKey = targetKey
        }
        this.cdr.markForCheck()
    }

    private pruneFileSelectionToVisibleTree (): void {
        const allowedKeys = new Set<string>()
        for (const filePath of this.getVisibleTreeFilePaths()) {
            const key = this.getFsPathKey(filePath)
            if (key) {
                allowedKeys.add(key)
            }
        }
        if (!allowedKeys.size) {
            this.selectedFilePathKeys = new Set()
            this.fileSelectionAnchorKey = null
            return
        }
        const next = new Set<string>()
        for (const key of this.selectedFilePathKeys) {
            if (allowedKeys.has(key)) {
                next.add(key)
            }
        }
        this.selectedFilePathKeys = next
        if (this.fileSelectionAnchorKey && !allowedKeys.has(this.fileSelectionAnchorKey)) {
            this.fileSelectionAnchorKey = null
        }

        const allowedFolderKeys = new Set<string>()
        for (const folderPath of this.getVisibleTreeFolderPaths()) {
            const key = this.getFsPathKey(folderPath)
            if (key) {
                allowedFolderKeys.add(key)
            }
        }
        if (!allowedFolderKeys.size) {
            this.selectedFolderPathKeys = new Set()
            this.folderSelectionAnchorKey = null
            return
        }
        const nextFolders = new Set<string>()
        for (const key of this.selectedFolderPathKeys) {
            if (allowedFolderKeys.has(key)) {
                nextFolders.add(key)
            }
        }
        this.selectedFolderPathKeys = nextFolders
        if (this.folderSelectionAnchorKey && !allowedFolderKeys.has(this.folderSelectionAnchorKey)) {
            this.folderSelectionAnchorKey = null
        }
    }

    private selectFilesForContextMenu (filePath: string): void {
        if (!this.isTreeFileSelected(filePath)) {
            this.setFileSelection([filePath])
            this.selectedFolderPathKeys = new Set()
            this.folderSelectionAnchorKey = null
        }
        const selectedPaths = this.getSelectedFilePathsFromTree()
        if (!selectedPaths.length) {
            this.fileContextMenuPaths = [filePath]
        } else {
            this.fileContextMenuPaths = selectedPaths
        }
        this.folderContextMenuPaths = this.getSelectedFolderPathsFromTree()
    }

    private selectFoldersForContextMenu (folderPath: string): void {
        if (!folderPath) {
            return
        }
        if (!this.isTreeFolderSelected(folderPath)) {
            this.setFolderSelection([folderPath])
            this.selectedFilePathKeys = new Set()
            this.fileSelectionAnchorKey = null
        }
        const selectedPaths = this.getSelectedFolderPathsFromTree()
        if (!selectedPaths.length) {
            this.folderContextMenuPaths = [folderPath]
        } else {
            this.folderContextMenuPaths = selectedPaths
        }
        this.fileContextMenuPaths = this.getSelectedFilePathsFromTree()
    }

    private getNormalizedFolderTargets (folderPaths: string[]): string[] {
        const uniqueByKey = new Map<string, string>()
        for (const folderPath of folderPaths) {
            const key = this.getFsPathKey(folderPath)
            if (!key || uniqueByKey.has(key)) {
                continue
            }
            uniqueByKey.set(key, folderPath)
        }
        const existing = Array.from(uniqueByKey.values()).filter(folderPath => {
            try {
                return fsSync.existsSync(folderPath) && fsSync.statSync(folderPath).isDirectory()
            } catch {
                return false
            }
        })
        const sorted = existing
            .map(folderPath => path.resolve(folderPath))
            .sort((a, b) => a.length - b.length)
        const pruned: string[] = []
        for (const folderPath of sorted) {
            const hasParent = pruned.some(parent => folderPath.startsWith(parent + path.sep))
            if (!hasParent) {
                pruned.push(folderPath)
            }
        }
        return pruned
    }

    private getNormalizedFileTargets (filePaths: string[], selectedFolders: string[]): string[] {
        const uniqueByKey = new Map<string, string>()
        for (const filePath of filePaths) {
            const key = this.getFsPathKey(filePath)
            if (!key || uniqueByKey.has(key)) {
                continue
            }
            uniqueByKey.set(key, filePath)
        }
        const folderRoots = selectedFolders.map(folderPath => path.resolve(folderPath))
        return Array.from(uniqueByKey.values())
            .map(filePath => path.resolve(filePath))
            .filter(filePath => {
                try {
                    if (!fsSync.existsSync(filePath) || !fsSync.statSync(filePath).isFile()) {
                        return false
                    }
                } catch {
                    return false
                }
                return !folderRoots.some(folderPath => filePath.startsWith(folderPath + path.sep))
            })
    }

    private getSelectedActionTargets (fallbackFiles: string[] = [], fallbackFolders: string[] = []): { fileTargets: string[], folderTargets: string[] } {
        const selectedFiles = this.getSelectedFilePathsFromTree()
        const selectedFolders = this.getSelectedFolderPathsFromTree()
        const files = selectedFiles.length ? selectedFiles : fallbackFiles
        const folders = selectedFolders.length ? selectedFolders : fallbackFolders
        const folderTargets = this.getNormalizedFolderTargets(folders)
        const fileTargets = this.getNormalizedFileTargets(files, folderTargets)
        return { fileTargets, folderTargets }
    }

    private async buildTree (buildNonce: number): Promise<TreeBuildResult> {
        const isStale = (): boolean => buildNonce !== this.treeBuildNonce
        const docsByPath = new Map<string, EditorDocument>()
        for (const doc of this.documents) {
            const candidatePaths = [doc.path, !doc.path ? (doc.tempPath ?? null) : null]
            for (const candidatePath of candidatePaths) {
                const docPathKey = this.normalizeFsPath(candidatePath)
                if (docPathKey) {
                    docsByPath.set(docPathKey, doc)
                }
            }
        }

        let remainingBudget = this.treeNodeBudget
        let truncated = false

        const readDir = async (dir: string, rootPath: string): Promise<TreeNode[]> => {
            if (isStale()) {
                return []
            }
            try {
                const entries = await fs.readdir(dir, { withFileTypes: true }) as any[]
                const nodes: TreeNode[] = []
                const scopedFiles = this.getScopedExternalFiles(rootPath)
                const treeMode = this.getFolderTreeMode(rootPath)
                for (const entry of entries) {
                    if (isStale()) {
                        return []
                    }
                    if (remainingBudget <= 0) {
                        truncated = true
                        break
                    }
                    const name = entry?.name
                    if (!name || name === '.' || name === '..') {
                        continue
                    }
                    const isDir = typeof entry.isDirectory === 'function' ? entry.isDirectory() : false
                    if (isDir && this.skippedFolders.has(name)) {
                        continue
                    }
                    remainingBudget--
                    const fullPath = path.join(dir, name)
                    if (this.hiddenTreePathKeys.has(this.toTreePathKey(fullPath) ?? '')) {
                        continue
                    }
                    if (!this.shouldIncludeScopedTreeEntry(scopedFiles, treeMode, fullPath, isDir)) {
                        continue
                    }
                    if (isDir) {
                        nodes.push({
                            name,
                            path: fullPath,
                            isFolder: true,
                            children: [],
                            folderPath: fullPath,
                        })
                    } else {
                        const docPathKey = this.normalizeFsPath(fullPath)
                        const doc = (docPathKey ? docsByPath.get(docPathKey) : null) ?? null
                        nodes.push({
                            name,
                            path: fullPath,
                            isFolder: false,
                            children: [],
                            docId: doc?.id ?? null,
                            folderPath: dir,
                        })
                    }
                }
                nodes.sort((a, b) => {
                    if (a.isFolder !== b.isFolder) {
                        return a.isFolder ? -1 : 1
                    }
                    return a.name.localeCompare(b.name)
                })
                return nodes
            } catch {
                return []
            }
        }

        const populate = async (node: TreeNode, rootPath: string): Promise<void> => {
            if (!node.isFolder || isStale() || truncated) {
                return
            }
            const key = node.path || ''
            if (!this.expandedFolders.has(key)) {
                node.children = []
                return
            }
            node.children = await readDir(node.path, rootPath)
            for (const child of node.children) {
                if (child.isFolder) {
                    await populate(child, rootPath)
                }
                if (isStale() || truncated) {
                    return
                }
            }
        }

        const roots: TreeNode[] = []
        for (const folder of this.folders) {
            if (isStale()) {
                return { roots: [], truncated: false }
            }
            const root: TreeNode = {
                name: folder.name,
                path: folder.path,
                isFolder: true,
                children: [],
                folderPath: folder.path,
            }
            await populate(root, root.path)
            roots.push(root)
            if (truncated) {
                break
            }
        }

        return { roots, truncated }
    }

    async addFolder (): Promise<void> {
        const name = (await this.promptForName('New folder name', 'Folder'))?.trim()
        if (!name) {
            return
        }
        if (/[\\/]/.test(name)) {
            this.setError('Folder name cannot contain slashes')
            return
        }
        const target = path.join(this.folderRoot, name)
        if (fsSync.existsSync(target) && !fsSync.statSync(target).isDirectory()) {
            this.setError('A file with that name already exists')
            return
        }
        if (!fsSync.existsSync(target)) {
            try {
                await fs.mkdir(target, { recursive: true })
            } catch (err: any) {
                this.setError(`Cannot create folder: ${err?.message ?? err}`)
                return
            }
        }
        if (!this.folders.find(f => f.path === target)) {
            this.folders.push({ name, path: target })
        }
        this.setRootModeToFullFolder(target)
        this.selectFolder(target)
        this.persistFolders()
        this.expandedFolders.add(target)
        this.updateTreeItems()
        window.setTimeout(() => this.cdr.markForCheck(), 0)
    }

    async openFolderFromDisk (): Promise<void> {
        const input = await this.promptForName('Enter folder path', this.folderRoot)
        const folderPath = (input ?? '').trim()
        if (!folderPath) {
            return
        }
        if (!fsSync.existsSync(folderPath) || !fsSync.statSync(folderPath).isDirectory()) {
            this.setError('Folder does not exist')
            return
        }
        this.attachFolderToTree(folderPath, true)
    }

    private attachFolderToTree (folderPath: string, selectFolder = true, scopeToFilePath: string|null = null): void {
        const resolved = path.resolve(folderPath)
        const existing = this.folders.find(f => this.isSameFsPath(f.path, resolved))
        if (existing) {
            existing.path = resolved
            existing.name = this.getFolderDisplayName(resolved)
        } else {
            this.folders.push({ name: this.getFolderDisplayName(resolved), path: resolved })
        }
        if (scopeToFilePath) {
            this.setRootModeToOpenedFiles(resolved, scopeToFilePath)
        } else if (this.getFolderTreeMode(resolved) === 'opened') {
            this.syncOpenedFileScopeForRoot(resolved)
        } else {
            this.setRootModeToFullFolder(resolved)
        }
        this.revealTreePath(resolved, true)
        if (selectFolder) {
            this.selectFolder(resolved)
        } else {
            this.persistFolders()
        }
        this.expandedFolders.add(resolved)
        this.updateTreeItems()
        window.setTimeout(() => this.cdr.markForCheck(), 0)
    }

    private pruneNestedWorkspaceFolders (rootPath: string): void {
        const root = path.resolve(rootPath)
        const next: CodeFolder[] = []
        let changed = false
        for (const folder of this.folders) {
            const resolved = path.resolve(folder.path)
            const isNestedLocal = this.isTreePathEqualOrDescendant(resolved, root) && !this.isSameFsPath(resolved, root)
            if (isNestedLocal) {
                changed = true
                continue
            }
            if (next.some(item => this.isSameFsPath(item.path, resolved))) {
                changed = true
                continue
            }
            next.push({ path: resolved, name: this.getFolderDisplayName(resolved) })
        }
        if (!changed) {
            return
        }
        this.folders = next
        this.persistFolders()
        this.updateTreeItems()
        window.setTimeout(() => this.cdr.markForCheck(), 0)
    }

    private revealLocalFolderPath (localRoot: string, folderPath: string): void {
        const root = path.resolve(localRoot)
        const target = path.resolve(folderPath)
        if (!this.isTreePathEqualOrDescendant(target, root)) {
            return
        }

        const chain: string[] = []
        let cursor = target
        while (true) {
            chain.push(cursor)
            if (this.isSameFsPath(cursor, root)) {
                break
            }
            const parent = path.dirname(cursor)
            if (parent === cursor) {
                break
            }
            cursor = parent
        }
        for (const dir of chain) {
            this.revealTreePath(dir, true)
            this.expandedFolders.add(dir)
        }
        this.selectFolder(target)
        this.persistFolders()
        this.updateTreeItems()
        window.setTimeout(() => this.cdr.markForCheck(), 0)
    }

    async renameFolder (folderPath: string): Promise<void> {
        const folder = this.folders.find(f => f.path === folderPath)
        if (!folder) {
            return
        }
        const nextName = (await this.promptForName('Rename folder', folder.name))?.trim()
        if (!nextName || nextName === folder.name) {
            return
        }
        if (/[\\/]/.test(nextName)) {
            this.setError('Folder name cannot contain slashes')
            return
        }
        const parent = path.dirname(folder.path)
        const newPath = path.join(parent, nextName)
        if (fsSync.existsSync(newPath)) {
            this.setError('A folder with that name already exists')
            return
        }
        try {
            await fs.rename(folder.path, newPath)
            this.updatePathsForFolderRename(folder.path, newPath)
            this.migrateRootTreeStateOnRename(folder.path, newPath)
            folder.path = newPath
            folder.name = nextName
            if (this.selectedFolderPath === folderPath) {
                this.selectedFolderPath = newPath
            }
            if (this.expandedFolders.has(folderPath)) {
                this.expandedFolders.delete(folderPath)
                this.expandedFolders.add(newPath)
            }
            this.persistFolders()
            this.persistState()
            this.updateTreeItems()
            window.setTimeout(() => this.cdr.markForCheck(), 0)
        } catch (err: any) {
            this.setError(`Failed to rename folder: ${err?.message ?? err}`)
        }
    }

    private async updatePathsForFolderRename (oldPath: string, newPath: string): Promise<void> {
        for (const doc of this.documents) {
            const folderPath = this.resolveDocFolder(doc)
            if (folderPath === oldPath) {
                doc.folderPath = newPath
            }
            if (doc.path && doc.path.startsWith(oldPath)) {
                const rel = path.relative(oldPath, doc.path)
                const dest = path.join(newPath, rel)
                try {
                    await fs.mkdir(path.dirname(dest), { recursive: true })
                    await fs.rename(doc.path, dest)
                    doc.path = dest
                    doc.name = path.basename(dest)
                } catch {
                    // leave as-is on failure
                }
            } else if (!doc.path && doc.tempPath && doc.tempPath.startsWith(oldPath)) {
                const rel = path.relative(oldPath, doc.tempPath)
                const dest = path.join(newPath, rel)
                try {
                    await fs.mkdir(path.dirname(dest), { recursive: true })
                    await fs.rename(doc.tempPath, dest)
                    doc.tempPath = dest
                } catch {
                    // ignore temp move errors
                }
            }
        }
    }

    private migrateRootTreeStateOnRename (oldPath: string, newPath: string): void {
        const oldKey = this.getFsPathKey(oldPath)
        const wasOpenedMode = this.getFolderTreeMode(oldPath) === 'opened'
        this.setFolderTreeMode(oldPath, 'full')
        if (oldKey) {
            this.externalFileScopedRoots.delete(oldKey)
        }
        if (!wasOpenedMode) {
            return
        }
        this.setFolderTreeMode(newPath, 'opened')
        this.syncOpenedFileScopeForRoot(newPath)
    }

    removeFolder (folderPath: string): void {
        this.folders = this.folders.filter(f => f.path !== folderPath)
        if (this.selectedFolderPath === folderPath) {
            this.selectedFolderPath = null
        }
        this.expandedFolders.delete(folderPath)
        this.setRootModeToFullFolder(folderPath)
        const folderKey = this.toTreePathKey(folderPath)
        if (folderKey && this.hiddenTreePathKeys.has(folderKey)) {
            this.hiddenTreePathKeys.delete(folderKey)
        }
        this.persistFolders()
        this.updateTreeItems()
        window.setTimeout(() => this.cdr.markForCheck(), 0)
    }

    openFolderContextMenu (event: MouseEvent, folderPath: string): void {
        if (!folderPath) {
            return
        }
        event.preventDefault()
        event.stopPropagation()
        this.folderContextMenuPaths = this.getSelectedFolderPathsFromTree()
        if (!this.folderContextMenuPaths.length) {
            this.folderContextMenuPaths = [folderPath]
        }
        this.fileContextMenuPaths = this.getSelectedFilePathsFromTree()
        this.folderContextMenuOpen = true
        this.folderContextMenuPath = folderPath
        this.folderContextScopeRoot = this.getWorkspaceRootForPath(folderPath)
        this.folderContextScopeMode = this.getFolderTreeMode(this.folderContextScopeRoot)
        const menuWidth = 220
        const menuHeight = 220
        const padding = 8
        const maxX = Math.max(padding, (window.innerWidth || 0) - menuWidth - padding)
        const maxY = Math.max(padding, (window.innerHeight || 0) - menuHeight - padding)
        this.folderContextMenuX = Math.max(padding, Math.min(event.clientX, maxX))
        this.folderContextMenuY = Math.max(padding, Math.min(event.clientY, maxY))
    }

    openFileContextMenu (event: MouseEvent, filePath: string): void {
        event.preventDefault()
        event.stopPropagation()
        this.fileContextMenuOpen = true
        this.fileContextMenuPath = filePath
        if (!this.fileContextMenuPaths.length) {
            this.fileContextMenuPaths = [filePath]
        }
        this.folderContextMenuPaths = this.getSelectedFolderPathsFromTree()
        const menuWidth = 220
        const menuHeight = 220
        const padding = 8
        const maxX = Math.max(padding, (window.innerWidth || 0) - menuWidth - padding)
        const maxY = Math.max(padding, (window.innerHeight || 0) - menuHeight - padding)
        this.fileContextMenuX = Math.max(padding, Math.min(event.clientX, maxX))
        this.fileContextMenuY = Math.max(padding, Math.min(event.clientY, maxY))
    }

    async handleFolderContextAction (action: string): Promise<void> {
        const selected = this.getSelectedActionTargets(this.fileContextMenuPaths, this.folderContextMenuPaths)
        const folderPath = this.folderContextMenuPath
        const scopeRoot = this.folderContextScopeRoot
        this.folderContextMenuOpen = false
        this.folderContextMenuPath = null
        this.folderContextMenuPaths = []
        this.folderContextScopeRoot = null
        this.folderContextScopeMode = 'full'
        if (!folderPath) {
            return
        }
        if (action === 'newFolder') {
            await this.createFolderInFolder(folderPath)
        } else if (action === 'newFile') {
            await this.createFileInFolder(folderPath)
        } else if (action === 'rename') {
            if (this.folders.find(f => f.path === folderPath)) {
                await this.renameFolder(folderPath)
            } else {
                await this.renameFolderOnDisk(folderPath)
            }
        } else if (action === 'remove') {
            if (this.folders.find(f => f.path === folderPath)) {
                this.removeFolder(folderPath)
            }
        } else if (action === 'open') {
            try {
                this.platform.showItemInFolder(folderPath)
            } catch {
                // ignore
            }
        } else if (action === 'scopeToggle') {
            if (scopeRoot) {
                this.toggleRootScopeMode(scopeRoot)
            }
        } else if (action === 'duplicate') {
            await this.duplicateSelectionOnDisk(selected.fileTargets, selected.folderTargets)
        } else if (action === 'move') {
            await this.moveSelectionToFolderPrompt(selected.fileTargets, selected.folderTargets)
        } else if (action === 'delete') {
            await this.deleteSelectionOnDisk(selected.fileTargets, selected.folderTargets)
        }
    }

    async handleFileContextAction (action: string): Promise<void> {
        const filePath = this.fileContextMenuPath
        const selected = this.getSelectedActionTargets(
            this.fileContextMenuPaths.length
            ? [...this.fileContextMenuPaths]
            : (filePath ? [filePath] : []),
            this.folderContextMenuPaths.length ? [...this.folderContextMenuPaths] : [],
        )
        this.fileContextMenuOpen = false
        this.fileContextMenuPath = null
        this.fileContextMenuPaths = []
        this.folderContextMenuPaths = []
        if (!filePath) {
            return
        }
        if (action === 'open') {
            await this.openFileFromDiskPath(filePath)
        } else if (action === 'rename') {
            await this.renameFileOnDisk(filePath)
        } else if (action === 'show') {
            try {
                this.platform.showItemInFolder(filePath)
            } catch {}
        } else if (action === 'duplicate') {
            await this.duplicateSelectionOnDisk(selected.fileTargets, selected.folderTargets)
        } else if (action === 'move') {
            await this.moveSelectionToFolderPrompt(selected.fileTargets, selected.folderTargets)
        } else if (action === 'delete') {
            await this.deleteSelectionOnDisk(selected.fileTargets, selected.folderTargets)
        }
    }

    private async openFileFromDiskPath (filePath: string): Promise<void> {
        try {
            const resolved = path.resolve(filePath)
            this.ensurePathVisibleInTree(resolved, false, true)
            this.revealTreePath(resolved)
            const content = await fs.readFile(resolved, 'utf8')
            this.openDocumentFromContent(path.basename(resolved), resolved, content)
        } catch (err: any) {
            this.setError(`Failed to open file: ${err?.message ?? err}`)
        }
    }

    private async createFolderInFolder (parentFolder: string): Promise<void> {
        const name = (await this.promptForName('New folder name', 'Folder'))?.trim()
        if (!name) {
            return
        }
        if (/[\\/]/.test(name)) {
            this.setError('Folder name cannot contain slashes')
            return
        }
        const target = path.join(parentFolder, name)
        try {
            await fs.mkdir(target, { recursive: false })
            this.expandedFolders.add(parentFolder)
            this.persistFolders()
            this.updateTreeItems()
            window.setTimeout(() => this.cdr.markForCheck(), 0)
        } catch (err: any) {
            this.setError(`Cannot create folder: ${err?.message ?? err}`)
        }
    }

    private async createFileInFolder (parentFolder: string): Promise<void> {
        const name = (await this.promptForName('New file name', 'file.txt'))?.trim()
        if (!name) {
            return
        }
        if (/[\\/]/.test(name)) {
            this.setError('File name cannot contain slashes')
            return
        }
        const target = path.join(parentFolder, name)
        if (fsSync.existsSync(target)) {
            this.setError('A file with that name already exists')
            return
        }
        try {
            await fs.writeFile(target, '', 'utf8')
            this.openDocumentFromContent(path.basename(target), target, '')
            this.expandedFolders.add(parentFolder)
            this.persistFolders()
            this.updateTreeItems()
            window.setTimeout(() => this.cdr.markForCheck(), 0)
        } catch (err: any) {
            this.setError(`Cannot create file: ${err?.message ?? err}`)
        }
    }

    private async renameFolderOnDisk (folderPath: string): Promise<void> {
        const nextName = (await this.promptForName('Rename folder', path.basename(folderPath) || folderPath))?.trim()
        if (!nextName) {
            return
        }
        if (/[\\/]/.test(nextName)) {
            this.setError('Folder name cannot contain slashes')
            return
        }
        const parent = path.dirname(folderPath)
        const newPath = path.join(parent, nextName)
        if (fsSync.existsSync(newPath)) {
            this.setError('A folder with that name already exists')
            return
        }
        try {
            await fs.rename(folderPath, newPath)
            if (this.selectedFolderPath === folderPath) {
                this.selectedFolderPath = newPath
            }
            if (this.expandedFolders.has(folderPath)) {
                this.expandedFolders.delete(folderPath)
                this.expandedFolders.add(newPath)
            }
            this.updatePathsForFolderRename(folderPath, newPath)
            this.syncOpenedFileScopes()
            this.persistFolders()
            this.updateTreeItems()
            window.setTimeout(() => this.cdr.markForCheck(), 0)
        } catch (err: any) {
            this.setError(`Failed to rename folder: ${err?.message ?? err}`)
        }
    }

    private async renameFileOnDisk (filePath: string): Promise<void> {
        const nextName = (await this.promptForName('Rename file', path.basename(filePath) || filePath))?.trim()
        if (!nextName) {
            return
        }
        if (/[\\/]/.test(nextName)) {
            this.setError('File name cannot contain slashes')
            return
        }
        const parent = path.dirname(filePath)
        const newPath = path.join(parent, nextName)
        if (fsSync.existsSync(newPath)) {
            this.setError('A file with that name already exists')
            return
        }
        const oldKeyBeforeRename = this.getFsPathKey(filePath)
        try {
            await fs.rename(filePath, newPath)
            this.updateOpenDocsForFsMove(filePath, newPath, false)
            this.remapFileSelectionPath(filePath, newPath, oldKeyBeforeRename)
            this.revealTreePath(newPath)
            this.updateTreeItems()
            window.setTimeout(() => this.cdr.markForCheck(), 0)
            this.persistState()
        } catch (err: any) {
            this.setError(`Failed to rename file: ${err?.message ?? err}`)
        }
    }

    private async deleteFilesOnDisk (filePaths: string[], skipConfirm = false): Promise<number> {
        const uniqueByKey = new Map<string, string>()
        for (const filePath of filePaths) {
            const key = this.getFsPathKey(filePath)
            if (!key) {
                continue
            }
            if (!uniqueByKey.has(key)) {
                uniqueByKey.set(key, filePath)
            }
        }
        const targets = Array.from(uniqueByKey.values()).filter(filePath => {
            try {
                return fsSync.existsSync(filePath) && fsSync.statSync(filePath).isFile()
            } catch {
                return false
            }
        })
        if (!targets.length) {
            return 0
        }
        if (!skipConfirm) {
            const detail = targets.length === 1
                ? 'This action cannot be undone.'
                : 'This action cannot be undone and will remove all selected files.'
            if (!(await this.confirmAction(
                `Delete ${targets.length} file${targets.length === 1 ? '' : 's'}?`,
                detail,
                'Delete',
            ))) {
                return 0
            }
        }
        let deletedCount = 0
        for (const filePath of targets) {
            const existedBefore = fsSync.existsSync(filePath)
            await this.deleteFileOnDisk(filePath, true)
            if (existedBefore && !fsSync.existsSync(filePath)) {
                deletedCount++
            }
        }
        if (deletedCount > 1) {
            this.statusMessage = `Deleted ${deletedCount} files`
            this.updateStatus()
        }
        return deletedCount
    }

    private async deleteFoldersOnDisk (folderPaths: string[], skipConfirm = false): Promise<number> {
        const targets = this.getNormalizedFolderTargets(folderPaths)
        if (!targets.length) {
            return 0
        }
        if (!skipConfirm) {
            const detail = targets.length === 1
                ? 'This action cannot be undone and will remove all files inside this folder.'
                : 'This action cannot be undone and will remove all selected folders and their contents.'
            if (!(await this.confirmAction(
                `Delete ${targets.length} folder${targets.length === 1 ? '' : 's'}?`,
                detail,
                'Delete',
            ))) {
                return 0
            }
        }
        let deletedCount = 0
        for (const folderPath of targets) {
            const existedBefore = fsSync.existsSync(folderPath)
            await this.deleteFolderOnDisk(folderPath, true)
            if (existedBefore && !fsSync.existsSync(folderPath)) {
                deletedCount++
            }
        }
        if (deletedCount > 1) {
            this.statusMessage = `Deleted ${deletedCount} folders`
            this.updateStatus()
        }
        return deletedCount
    }

    private async deleteSelectionOnDisk (filePaths: string[], folderPaths: string[]): Promise<void> {
        const folderTargets = this.getNormalizedFolderTargets(folderPaths)
        const fileTargets = this.getNormalizedFileTargets(filePaths, folderTargets)
        const total = fileTargets.length + folderTargets.length
        if (!total) {
            return
        }
        const detailParts: string[] = []
        if (fileTargets.length) {
            detailParts.push(`${fileTargets.length} file${fileTargets.length === 1 ? '' : 's'}`)
        }
        if (folderTargets.length) {
            detailParts.push(`${folderTargets.length} folder${folderTargets.length === 1 ? '' : 's'}`)
        }
        if (!(await this.confirmAction(
            `Delete ${total} item${total === 1 ? '' : 's'}?`,
            `This action cannot be undone and will remove ${detailParts.join(' and ')}.`,
            'Delete',
        ))) {
            return
        }

        const deletedFiles = await this.deleteFilesOnDisk(fileTargets, true)
        const deletedFolders = await this.deleteFoldersOnDisk(folderTargets, true)
        const deletedTotal = deletedFiles + deletedFolders
        if (deletedTotal > 1) {
            this.statusMessage = `Deleted ${deletedTotal} items`
            this.updateStatus()
        }
    }

    private async deleteFileOnDisk (filePath: string, skipConfirm = false): Promise<void> {
        const relatedDocs = this.documents.filter(doc =>
            this.isSameFsPath(doc.path, filePath) || this.isSameFsPath(doc.tempPath ?? null, filePath),
        )
        for (const doc of relatedDocs) {
            if (doc.isDirty && !(await this.confirmDiscard(doc))) {
                return
            }
        }
        if (!skipConfirm) {
            if (!(await this.confirmAction(
                `Delete ${path.basename(filePath)}?`,
                'This action cannot be undone.',
                'Delete',
            ))) {
                return
            }
        }
        const filePathKey = this.getFsPathKey(filePath)
        if (filePathKey) {
            this.deletingPathKeys.add(filePathKey)
        }
        for (const doc of relatedDocs) {
            // Prevent autosave from writing this file while delete is in progress.
            doc.isDirty = false
            doc.lastSavedValue = doc.model.getValue()
        }
        try {
            await fs.unlink(filePath)
            for (const doc of relatedDocs) {
                // Avoid a second discard prompt while closing after successful deletion.
                doc.isDirty = false
                doc.lastSavedValue = doc.model.getValue()
                await this.closeDocument(doc.id)
            }
            if (filePathKey) {
                this.selectedFilePathKeys.delete(filePathKey)
                if (this.fileSelectionAnchorKey === filePathKey) {
                    this.fileSelectionAnchorKey = null
                }
            }
            this.persistState()
            this.updateTreeItems()
            this.statusMessage = `Deleted: ${path.basename(filePath)}`
            this.updateStatus()
            // Detect fast re-creation from another process (or a missed save race).
            window.setTimeout(() => {
                if (fsSync.existsSync(filePath)) {
                    this.setError(`File was recreated after delete: ${filePath}`)
                    this.updateTreeItems()
                }
            }, 300)
            window.setTimeout(() => this.cdr.markForCheck(), 0)
        } catch (err: any) {
            this.setError(`Failed to delete file: ${err?.message ?? err}`)
        } finally {
            if (filePathKey) {
                this.deletingPathKeys.delete(filePathKey)
            }
        }
    }

    private async deleteActiveFileOnDisk (): Promise<void> {
        const doc = this.getActiveDoc()
        if (!doc?.path) {
            this.setError('Active document is not backed by a file on disk.')
            return
        }
        await this.deleteFileOnDisk(doc.path)
    }

    private async deleteFolderOnDisk (folderPath: string, skipConfirm = false): Promise<void> {
        // Close any open documents in this folder
        const docsInFolder = this.documents.filter(doc => {
            const docFolder = this.resolveDocFolder(doc)
            return docFolder === folderPath || (doc.path && doc.path.startsWith(folderPath + path.sep))
        })
        for (const doc of docsInFolder) {
            if (doc.isDirty && !(await this.confirmDiscard(doc))) {
                return
            }
            await this.closeDocument(doc.id)
        }

        if (!skipConfirm) {
            if (!(await this.confirmAction(
                `Delete folder ${path.basename(folderPath) || folderPath}?`,
                'All files and subfolders will be permanently removed.',
                'Delete folder',
            ))) {
                return
            }
        }
        try {
            // Node 20 supports fs.rm
            await fs.rm(folderPath, { recursive: true, force: false })
            // If it was tracked as a root, remove it from list too
            if (this.folders.find(f => f.path === folderPath)) {
                this.removeFolder(folderPath)
            }
            if (this.selectedFolderPath === folderPath) {
                this.selectedFolderPath = null
            }
            this.expandedFolders.delete(folderPath)
            this.persistFolders()
            this.updateTreeItems()
            window.setTimeout(() => this.cdr.markForCheck(), 0)
        } catch (err: any) {
            this.setError(`Failed to delete folder: ${err?.message ?? err}`)
        }
    }

    private async duplicateFileOnDisk (filePath: string): Promise<boolean> {
        try {
            if (!fsSync.existsSync(filePath) || !fsSync.statSync(filePath).isFile()) {
                return false
            }
        } catch {
            return false
        }
        const parent = path.dirname(filePath)
        const ext = path.extname(filePath)
        const base = path.basename(filePath, ext)
        const destination = await this.ensureUniquePath(parent, `${base}-copy${ext}`)
        try {
            await fs.copyFile(filePath, destination)
            return true
        } catch (err: any) {
            this.setError(`Failed to duplicate file: ${err?.message ?? err}`)
            return false
        }
    }

    private async duplicateFolderOnDisk (folderPath: string): Promise<boolean> {
        try {
            if (!fsSync.existsSync(folderPath) || !fsSync.statSync(folderPath).isDirectory()) {
                return false
            }
        } catch {
            return false
        }
        const parent = path.dirname(folderPath)
        const base = path.basename(folderPath)
        const destination = await this.ensureUniquePath(parent, `${base}-copy`)
        try {
            await fs.cp(folderPath, destination, { recursive: true, force: false })
            return true
        } catch (err: any) {
            this.setError(`Failed to duplicate folder: ${err?.message ?? err}`)
            return false
        }
    }

    private async duplicateSelectionOnDisk (filePaths: string[], folderPaths: string[]): Promise<void> {
        const folderTargets = this.getNormalizedFolderTargets(folderPaths)
        const fileTargets = this.getNormalizedFileTargets(filePaths, folderTargets)
        if (!folderTargets.length && !fileTargets.length) {
            return
        }
        let duplicatedCount = 0
        for (const folderPath of folderTargets) {
            if (await this.duplicateFolderOnDisk(folderPath)) {
                duplicatedCount++
            }
        }
        for (const filePath of fileTargets) {
            if (await this.duplicateFileOnDisk(filePath)) {
                duplicatedCount++
            }
        }
        if (duplicatedCount > 0) {
            this.updateTreeItems()
            window.setTimeout(() => this.cdr.markForCheck(), 0)
            this.statusMessage = duplicatedCount === 1 ? 'Duplicated 1 item' : `Duplicated ${duplicatedCount} items`
            this.updateStatus()
        }
    }

    private toggleRootScopeMode (rootPath: string): void {
        const currentMode = this.getFolderTreeMode(rootPath)
        if (currentMode === 'opened') {
            this.setRootModeToFullFolder(rootPath)
            this.statusMessage = `Explorer mode: Full folder (${this.getFolderDisplayName(rootPath)})`
        } else {
            this.setRootModeToOpenedFiles(rootPath)
            const scopedCount = this.getScopedExternalFiles(rootPath)?.size ?? 0
            this.statusMessage = scopedCount > 0
                ? `Explorer mode: Opened files only (${this.getFolderDisplayName(rootPath)})`
                : `Explorer mode: Opened files only (${this.getFolderDisplayName(rootPath)}) - no open files`
        }
        this.persistFolders()
        this.updateTreeItems()
        this.updateStatus()
        window.setTimeout(() => this.cdr.markForCheck(), 0)
    }

    private async moveSelectionOnDisk (filePaths: string[], folderPaths: string[], targetDir: string): Promise<number> {
        const folderTargets = this.getNormalizedFolderTargets(folderPaths)
        const fileTargets = this.getNormalizedFileTargets(filePaths, folderTargets)
        if (!folderTargets.length && !fileTargets.length) {
            return 0
        }
        const targetResolved = path.resolve(targetDir)
        let moved = 0
        for (const folderPath of folderTargets) {
            const source = path.resolve(folderPath)
            if (this.isSameFsPath(source, targetResolved)) {
                continue
            }
            if (targetResolved.startsWith(source + path.sep)) {
                this.setError(`Cannot move ${path.basename(source)} into itself`)
                continue
            }
            const destination = await this.ensureUniquePath(targetResolved, path.basename(source))
            await fs.rename(source, destination)
            this.updateOpenDocsForFsMove(source, destination, true)
            moved++
        }
        for (const filePath of fileTargets) {
            const source = path.resolve(filePath)
            if (this.isSameFsPath(path.dirname(source), targetResolved)) {
                continue
            }
            const destination = await this.ensureUniquePath(targetResolved, path.basename(source))
            await fs.rename(source, destination)
            this.updateOpenDocsForFsMove(source, destination, false)
            moved++
        }
        if (moved > 0) {
            this.syncOpenedFileScopes()
            this.persistState()
            this.updateTreeItems()
            window.setTimeout(() => this.cdr.markForCheck(), 0)
            this.statusMessage = moved === 1 ? 'Moved 1 item' : `Moved ${moved} items`
            this.updateStatus()
        }
        return moved
    }

    private async moveSelectionToFolderPrompt (filePaths: string[], folderPaths: string[]): Promise<void> {
        const folderTargets = this.getNormalizedFolderTargets(folderPaths)
        const fileTargets = this.getNormalizedFileTargets(filePaths, folderTargets)
        if (!folderTargets.length && !fileTargets.length) {
            return
        }
        const firstTarget = folderTargets[0] ?? fileTargets[0] ?? this.selectedFolderPath ?? this.folderRoot
        const defaultDir = fsSync.existsSync(firstTarget) && fsSync.statSync(firstTarget).isDirectory()
            ? firstTarget
            : path.dirname(firstTarget)
        const input = await this.promptForName('Move selected items to folder', defaultDir)
        const targetDir = (input ?? '').trim()
        if (!targetDir) {
            return
        }
        if (!fsSync.existsSync(targetDir) || !fsSync.statSync(targetDir).isDirectory()) {
            this.setError('Target folder does not exist')
            return
        }
        try {
            await this.moveSelectionOnDisk(fileTargets, folderTargets, targetDir)
        } catch (err: any) {
            this.setError(`Move failed: ${err?.message ?? err}`)
        }
    }

    private updateOpenDocsForFsMove (oldPath: string, newPath: string, isDir: boolean): void {
        const oldResolved = path.resolve(oldPath)
        const newResolved = path.resolve(newPath)
        for (const doc of this.documents) {
            if (doc.path) {
                const docResolved = path.resolve(doc.path)
                if (isDir) {
                    if (docResolved === oldResolved || docResolved.startsWith(oldResolved + path.sep)) {
                        const rel = path.relative(oldResolved, docResolved)
                        doc.path = path.join(newResolved, rel)
                        doc.name = path.basename(doc.path)
                        doc.folderPath = null
                        this.setModelLanguage(doc)
                        this.refreshDocDiskSnapshot(doc, doc.model.getValue())
                    }
                } else if (docResolved === oldResolved) {
                    doc.path = newResolved
                    doc.name = path.basename(doc.path)
                    doc.folderPath = null
                    this.setModelLanguage(doc)
                    this.refreshDocDiskSnapshot(doc, doc.model.getValue())
                }
            } else if (doc.tempPath) {
                const tempResolved = path.resolve(doc.tempPath)
                if (isDir) {
                    if (tempResolved === oldResolved || tempResolved.startsWith(oldResolved + path.sep)) {
                        const rel = path.relative(oldResolved, tempResolved)
                        doc.tempPath = path.join(newResolved, rel)
                        doc.name = path.basename(doc.tempPath)
                        doc.folderPath = path.dirname(doc.tempPath)
                        this.setModelLanguage(doc)
                    }
                } else if (tempResolved === oldResolved) {
                    doc.tempPath = newResolved
                    doc.name = path.basename(doc.tempPath)
                    doc.folderPath = path.dirname(doc.tempPath)
                    this.setModelLanguage(doc)
                }
            }
        }
        // Update recents list
        this.recentFiles = this.recentFiles.map(p => p === oldPath ? newPath : p).filter(Boolean)
        this.syncOpenedFileScopes()
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('codeEditor.recent', JSON.stringify(this.recentFiles.slice(0, 10)))
        }
    }

    onTreeDragStart (event: DragEvent, node: TreeNode): void {
        this.draggingDocId = node.docId ?? null
        this.draggingPath = node.path || null
        this.draggingIsFolder = !!node.isFolder
        try {
            if (this.draggingDocId) {
                event.dataTransfer?.setData('application/x-tlink-docid', this.draggingDocId)
            }
            if (this.draggingPath) {
                event.dataTransfer?.setData('application/x-tlink-path', this.draggingPath)
            }
            event.dataTransfer?.setData('text/plain', this.draggingPath || this.draggingDocId || '')
            event.dataTransfer?.setDragImage?.(event.target as any, 0, 0)
        } catch {
            // ignore
        }
    }

    onTreeDragEnd (): void {
        this.draggingDocId = null
        this.draggingPath = null
        this.draggingIsFolder = false
    }

    onTreeDragOver (event: DragEvent): void {
        if (this.draggingDocId || this.draggingPath) {
            event.preventDefault()
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = 'move'
            }
        }
    }

    async onTreeDrop (event: DragEvent, folderPath: string|null): Promise<void> {
        if (!this.draggingDocId && !this.draggingPath) {
            return
        }
        event.preventDefault()
        event.stopPropagation()

        const targetDir = folderPath || null
        if (!targetDir) {
            return
        }
        try {
            if (!fsSync.existsSync(targetDir) || !fsSync.statSync(targetDir).isDirectory()) {
                return
            }
        } catch {
            return
        }

        // If we're dragging an open document, move it via existing logic (keeps editor model + temp files aligned)
        if (this.draggingDocId) {
            await this.moveDocumentToFolder(this.draggingDocId, targetDir)
            this.draggingDocId = null
            this.draggingPath = null
            this.draggingIsFolder = false
            return
        }

        const sourcePath = this.draggingPath
        const isDir = this.draggingIsFolder
        this.draggingPath = null
        this.draggingIsFolder = false
        if (!sourcePath) {
            return
        }
        const sourceResolved = path.resolve(sourcePath)
        const targetResolved = path.resolve(targetDir)
        if (sourceResolved === targetResolved) {
            return
        }
        if (isDir && targetResolved.startsWith(sourceResolved + path.sep)) {
            this.setError('Cannot move a folder into itself')
            return
        }
        if (path.resolve(path.dirname(sourceResolved)) === targetResolved) {
            return
        }

        const moveSources = new Set<string>()
        if (!isDir) {
            const selectedPaths = this.getSelectedFilePathsFromTree()
            const draggingPathSelected = selectedPaths.some(p => this.isSameFsPath(p, sourceResolved))
            if (draggingPathSelected) {
                for (const selectedPath of selectedPaths) {
                    moveSources.add(path.resolve(selectedPath))
                }
            }
        }
        if (!moveSources.size) {
            moveSources.add(sourceResolved)
        }

        let moved = 0
        try {
            for (const source of moveSources) {
                if (!isDir && path.resolve(path.dirname(source)) === targetResolved) {
                    continue
                }
                const baseName = path.basename(source)
                const dest = await this.ensureUniquePath(targetDir, baseName)
                await fs.rename(source, dest)
                this.updateOpenDocsForFsMove(source, dest, isDir)
                moved++
            }
            if (!moved) {
                return
            }
            this.syncOpenedFileScopes()
            this.updateTreeItems()
            window.setTimeout(() => this.cdr.markForCheck(), 0)
            this.persistState()
        } catch (err: any) {
            this.setError(`Move failed: ${err?.message ?? err}`)
        }
    }

    toggleFolder (event: MouseEvent|null, node: TreeNode): void {
        if (event) {
            event.preventDefault()
            event.stopPropagation()
        }
        if (!node.isFolder) {
            return
        }
        const key = node.path || '__root__'
        const wasExpanded = this.expandedFolders.has(key)
        if (wasExpanded) {
            this.expandedFolders.delete(key)
        } else {
            this.expandedFolders.add(key)
        }
        // Create new Set reference to trigger change detection
        this.expandedFolders = new Set(this.expandedFolders)
        this.persistFolders()
        // Update tree items after state change
        this.updateTreeItems()
        // Use setTimeout to avoid ExpressionChangedAfterItHasBeenCheckedError
        window.setTimeout(() => {
            this.cdr.markForCheck()
        }, 0)
        // Helpful UX feedback (also acts as a sanity check that click handlers are firing)
        try {
            const nowExpanded = !wasExpanded
            this.statusMessage = `${nowExpanded ? 'Expanded' : 'Collapsed'}: ${node.name}`
            window.setTimeout(() => {
                if (this.statusMessage === `${nowExpanded ? 'Expanded' : 'Collapsed'}: ${node.name}`) {
                    this.statusMessage = ''
                }
            }, 1200)
        } catch {
            // ignore
        }
    }

    async onTreeClick (event: MouseEvent, node: TreeNode): Promise<void> {
        event.preventDefault()
        event.stopPropagation()
        this.treeKeyboardActive = true
        const isMultiSelect = event.metaKey || event.ctrlKey
        // Don't toggle if clicking on chevron (chevron has its own handler)
        if ((event?.target as any)?.classList?.contains('chevron')) {
            return
        }
        if (node.isFolder) {
            if (isMultiSelect) {
                if (node.path) {
                    this.toggleFolderSelection(node.path)
                }
                this.selectFolder(node.path || null, false)
                return
            }
            this.selectFolder(node.path || null)
            this.toggleFolder(event, node)
            return
        }

        if (node.docId) {
            if (node.path) {
                if (event.shiftKey) {
                    this.extendFileSelection(node.path)
                    return
                }
                if (isMultiSelect) {
                    this.toggleFileSelection(node.path)
                    return
                }
                this.setFileSelection([node.path])
                this.selectedFolderPathKeys = new Set()
                this.folderSelectionAnchorKey = null
            } else {
                this.selectedFilePathKeys = new Set()
                this.fileSelectionAnchorKey = null
                if (!isMultiSelect) {
                    this.selectedFolderPathKeys = new Set()
                    this.folderSelectionAnchorKey = null
                }
            }
            this.activateDoc(node.docId)
            return
        }

        const filePath = node.path
        if (!filePath) {
            this.selectedFilePathKeys = new Set()
            this.fileSelectionAnchorKey = null
            if (node.docId) {
                this.activateDoc(node.docId)
            }
            return
        }
        try {
            const stat = fsSync.statSync(filePath)
            if (!stat.isFile()) {
                return
            }
        } catch {
            return
        }

        if (event.shiftKey) {
            this.extendFileSelection(filePath)
            return
        }
        if (isMultiSelect) {
            this.toggleFileSelection(filePath)
            return
        }
        this.setFileSelection([filePath])
        this.selectedFolderPathKeys = new Set()
        this.folderSelectionAnchorKey = null
        await this.openFileFromDiskPath(filePath)
    }

    onTreeDblClick (event: MouseEvent, node: TreeNode): void {
        if (node.isFolder) {
            event.stopPropagation()
            this.toggleFolder(event, node)
            return
        }
        if (!node.isFolder && node.docId) {
            this.startInlineRename(event, node.docId)
        }
    }

    onTreeContextMenu (event: MouseEvent, node: TreeNode): void {
        event.preventDefault()
        event.stopPropagation()
        this.treeKeyboardActive = true
        if (node.isFolder) {
            this.selectFoldersForContextMenu(node.path)
            this.openFolderContextMenu(event, node.path)
        } else if (node.docId) {
            const doc = this.documents.find(d => d.id === node.docId)
            if (doc && !doc.path) {
                // Unsaved docs may have a temp backing file in the tree; use doc actions.
                this.openDocContextMenu(event, node.docId)
                return
            }
            if (node.path) {
                this.selectFilesForContextMenu(node.path)
                this.openFileContextMenu(event, node.path)
                return
            }
            this.openDocContextMenu(event, node.docId)
        } else if (node.path) {
            // File nodes with no linked open doc.
            this.selectFilesForContextMenu(node.path)
            this.openFileContextMenu(event, node.path)
        }
    }

    private async moveDocumentToFolder (docId: string, folderPath: string|null): Promise<void> {
        const doc = this.documents.find(d => d.id === docId)
        if (!doc) {
            return
        }
        const currentFolder = this.resolveDocFolder(doc)
        const targetFolder = folderPath || null
        const targetDir = targetFolder ?? this.folderRoot
        const currentLocation = doc.path
            ? path.dirname(path.resolve(doc.path))
            : (doc.tempPath ? path.dirname(path.resolve(doc.tempPath)) : (currentFolder ? path.resolve(currentFolder) : null))
        if (currentLocation && path.resolve(targetDir) === currentLocation) {
            return
        }
        if (!fsSync.existsSync(targetDir)) {
            try {
                fsSync.mkdirSync(targetDir, { recursive: true })
            } catch {
                this.setError('Cannot create target folder')
                return
            }
        }
        const targetName = doc.name || path.basename(doc.path ?? doc.tempPath ?? 'untitled')
        const targetPath = await this.ensureUniquePath(targetDir, targetName)

        if (doc.path) {
            // If the document is outside managed folders and the target is "all documents", just drop the association.
            if (!currentFolder && !targetFolder) {
                doc.folderPath = null
                this.updateTreeItems()
                window.setTimeout(() => this.cdr.markForCheck(), 0)
                this.persistState()
                return
            }
            try {
                await fs.mkdir(path.dirname(targetPath), { recursive: true })
                await fs.rename(doc.path, targetPath)
                doc.path = targetPath
                doc.name = path.basename(targetPath)
                doc.folderPath = targetFolder
                this.setModelLanguage(doc)
            } catch (err: any) {
                this.setError(`Move failed: ${err?.message ?? err}`)
                return
            }
        } else {
            const oldTemp = doc.tempPath
            doc.folderPath = targetFolder
            doc.tempPath = this.allocateTempPath(doc.name || 'untitled', targetFolder)
            if (oldTemp && fsSync.existsSync(oldTemp)) {
                try {
                    await fs.mkdir(path.dirname(doc.tempPath), { recursive: true })
                    await fs.rename(oldTemp, doc.tempPath)
                } catch {
                    // best effort
                }
            }
        }
        this.syncOpenedFileScopes()
        this.updateTreeItems()
        window.setTimeout(() => this.cdr.markForCheck(), 0)
        this.persistState()
    }

    private async ensureUniquePath (dir: string, name: string): Promise<string> {
        const ext = path.extname(name)
        const base = path.basename(name, ext)
        let candidate = path.join(dir, name)
        let i = 1
        while (fsSync.existsSync(candidate)) {
            candidate = path.join(dir, `${base}-${i}${ext}`)
            i++
        }
        return candidate
    }

    constructor (
        private injector: Injector,
        private platform: PlatformService,
        private app: AppService,
        private tabsService: TabsService,
        @Optional() private ngbModal: NgbModal,
        private cdr: ChangeDetectorRef,
    ) {
        super(injector)
        this.setTitle(this.studioTitle)
    }

    get visibleDocuments (): EditorDocument[] {
        if (!this.selectedFolderPath) {
            return this.documents
        }
        return this.documents.filter(doc => this.resolveDocFolder(doc) === this.selectedFolderPath)
    }

    get treeItems (): Array<{ node: TreeNode, depth: number }> {
        return this._treeItems
    }

    private getVisibleDiffCandidates (): EditorDocument[] {
        const result: EditorDocument[] = []
        const seen = new Set<string>()
        for (const item of this._treeItems) {
            if (item.node.isFolder) {
                continue
            }
            const docId = item.node.docId
            if (!docId || docId === this.activeDocId || seen.has(docId)) {
                continue
            }
            const doc = this.documents.find(d => d.id === docId)
            if (!doc) {
                continue
            }
            seen.add(docId)
            result.push(doc)
        }
        return result
    }

    private getFallbackDiffCandidates (): EditorDocument[] {
        const result: EditorDocument[] = []
        const seen = new Set<string>()
        for (const doc of this.documents) {
            if (doc.id === this.activeDocId) {
                continue
            }
            const fsKey = this.getFsPathKey(doc.path ?? doc.tempPath ?? null)
            const dedupeKey = fsKey ? `path:${fsKey}` : `doc:${doc.id}`
            if (seen.has(dedupeKey)) {
                continue
            }
            seen.add(dedupeKey)
            result.push(doc)
        }
        return result
    }

    get diffCandidates (): EditorDocument[] {
        const visible = this.getVisibleDiffCandidates()
        if (visible.length) {
            return visible
        }
        return this.getFallbackDiffCandidates()
    }

    get editorThemePresetValue (): string {
        return this.editorThemePresets.some(x => x.color === this.editorThemeColor) ? this.editorThemeColor : 'custom'
    }

    private getDiffDocContextLabel (doc: EditorDocument): string {
        const refPath = doc.path ?? doc.tempPath ?? null
        if (!refPath) {
            return doc.isDirty ? 'unsaved' : 'buffer'
        }
        const folder = this.getFolderForPath(refPath)
        if (folder) {
            const rel = path.relative(folder, refPath).replace(/\\/g, '/')
            const parent = path.dirname(rel)
            if (parent && parent !== '.') {
                return parent
            }
        }
        const parentName = path.basename(path.dirname(refPath))
        return parentName || 'disk'
    }

    getDiffOptionLabel (doc: EditorDocument): string {
        const candidates = this.diffCandidates
        const sameNameDocs = candidates.filter(d => d.name === doc.name)
        if (sameNameDocs.length <= 1) {
            if (!doc.path) {
                return `${doc.name} (${doc.isDirty ? 'unsaved' : 'buffer'})`
            }
            return doc.name
        }
        const context = this.getDiffDocContextLabel(doc)
        const sameContextDocs = sameNameDocs.filter(d => this.getDiffDocContextLabel(d) === context)
        if (sameContextDocs.length <= 1) {
            return `${doc.name} (${context})`
        }
        const index = sameContextDocs.findIndex(d => d.id === doc.id)
        const suffix = index >= 0 ? ` #${index + 1}` : ''
        return `${doc.name} (${context}${suffix})`
    }

    private updateTreeItems (): void {
        const buildNonce = ++this.treeBuildNonce
        if (this.treeRefreshTimer) {
            clearTimeout(this.treeRefreshTimer)
        }
        this.treeRefreshTimer = window.setTimeout(() => {
            this.treeRefreshTimer = undefined
            void this.rebuildTreeItems(buildNonce)
        }, 20)
    }

    private async rebuildTreeItems (buildNonce: number): Promise<void> {
        const { roots, truncated } = await this.buildTree(buildNonce)
        if (buildNonce !== this.treeBuildNonce) {
            return
        }
        const flat: Array<{ node: TreeNode, depth: number }> = []
        const visit = (node: TreeNode, depth: number) => {
            flat.push({ node, depth })
            if (node.isFolder) {
                const key = node.path || ''
                if (this.expandedFolders.has(key)) {
                    for (const child of node.children) {
                        visit(child, depth + 1)
                    }
                }
            }
        }
        for (const root of roots) {
            visit(root, 0)
        }
        this._treeItems = [...flat]
        this.pruneFileSelectionToVisibleTree()
        if (truncated) {
            this.statusMessage = `Explorer truncated to ${this.treeNodeBudget} entries`
            window.setTimeout(() => {
                if (this.statusMessage === `Explorer truncated to ${this.treeNodeBudget} entries`) {
                    this.statusMessage = ''
                }
            }, 2200)
        }
        this.cdr.markForCheck()
    }

    private resolveTerminalService (): TerminalServiceType|null {
        const nodeRequire =
            (globalThis as any)?.nodeRequire
            ?? (globalThis as any)?.require
            ?? (globalThis as any)?.window?.nodeRequire
            ?? (globalThis as any)?.window?.require

        if (!nodeRequire) {
            return null
        }

        try {
            const localModule = nodeRequire('tlink-local')
            const token = localModule?.TerminalService
            if (!token) {
                return null
            }
            // TerminalService is providedIn: 'root' in tlink-local, so injector lookup is enough.
            return this.injector.get(token, null)
        } catch {
            return null
        }
    }

    private async resolveRunProfile (): Promise<any|null> {
        const preferredId = this.config?.store?.codeEditor?.runProfile
        try {
            const profilesService = this.injector.get(ProfilesService)
            const profiles = await profilesService.getProfiles({ includeBuiltin: true })
            if (preferredId) {
                // Prefer exact ID match; fallback to name match if someone put a name in the field
                return (
                    profiles.find(p => p.id === preferredId) ??
                    profiles.find(p => (p.name ?? '') === preferredId) ??
                    null
                )
            }

            // No explicit run profile configured: prefer fish when available (POSIXShellsProvider reads /etc/shells)
            const fishProfile = profiles.find(p => {
                if (p?.type !== 'local') {
                    return false
                }
                const cmd = p?.options?.command ?? ''
                const base = path.basename(cmd)
                return base === 'fish' || cmd === 'fish'
            }) ?? null

            return fishProfile
        } catch {
            return null
        }
    }

    async ngAfterViewInit (): Promise<void> {
        await this.initializeEditor()
        // Update tree items after initialization to avoid ExpressionChangedAfterItHasBeenCheckedError
        // Use setTimeout to defer to next tick, after change detection completes
        window.setTimeout(() => {
            this.updateTreeItems()
            this.cdr.markForCheck()
        }, 0)
    }

    ngOnDestroy (): void {
        this.persistState()
        this.cancelFileMenuClose()
        this.cancelEditMenuClose()
        if (this.autosaveTimer) {
            clearInterval(this.autosaveTimer)
        }
        if (this.persistStateTimer) {
            clearTimeout(this.persistStateTimer)
        }
        if (this.treeRefreshTimer) {
            clearTimeout(this.treeRefreshTimer)
        }
        if (this.externalWatchTimer) {
            clearInterval(this.externalWatchTimer)
            this.externalWatchTimer = undefined
        }
        this.disposeEditors()
        this.disposeModels()
        if (this.externalOpenHandler) {
            window.removeEventListener('tlink-open-in-editor', this.externalOpenHandler)
        }
        super.ngOnDestroy()
    }

    async openFile (): Promise<void> {
        if (!(await this.ensureEditor())) {
            return
        }
        const uploads = await this.platform.startUpload({ multiple: false })
        if (!uploads.length) {
            return
        }
        const upload = uploads[0]
        try {
            const data = await upload.readAll()
            const content = new TextDecoder().decode(data)
            const target = await this.resolveUploadOpenTarget(upload)
            this.openDocumentFromContent(target.name, target.filePath, content)
            if (target.imported) {
                this.statusMessage = `Imported ${target.name}`
                this.updateStatus()
            }
        } catch (err: any) {
            this.setError(`Failed to open file: ${err?.message ?? err}`)
        } finally {
            (upload as any).close?.()
        }
    }

    async openLocalFile (): Promise<void> {
        if (!(await this.ensureEditor())) {
            return
        }

        const localRoot = path.resolve(this.folderRoot)
        if (!fsSync.existsSync(localRoot) || !fsSync.statSync(localRoot).isDirectory()) {
            this.setError(`Local folder does not exist: ${localRoot}`)
            return
        }

        // Remove stale nested roots that were accidentally added under Tlink Studio.
        this.pruneNestedWorkspaceFolders(localRoot)

        // Always re-attach local workspace root so Open local still works after closing it from the tree.
        this.attachFolderToTree(localRoot, true)

        type LocalOpenSelection = { kind: 'folder'|'file', targetPath: string }
        const options: SelectorOption<LocalOpenSelection>[] = []

        const localFolders = await this.collectFoldersFromRoots([localRoot], this.quickOpenBudget)
        options.push(...localFolders.map((folderPath): SelectorOption<LocalOpenSelection> => {
            const resolved = path.resolve(folderPath)
            const relative = path.relative(localRoot, resolved).replace(/\\/g, '/')
            const isRoot = !relative
            return {
                name: isRoot ? 'Tlink Studio folder' : `${relative}/`,
                description: resolved,
                group: 'Local folders',
                result: { kind: 'folder', targetPath: resolved },
                weight: isRoot ? -20 : -10,
            }
        }))

        const localFiles = await this.collectFilesFromRoots([this.folderRoot], this.quickOpenBudget)
        options.push(...localFiles.map((filePath): SelectorOption<LocalOpenSelection> => {
            const resolved = path.resolve(filePath)
            const relative = path.relative(localRoot, resolved)
            const displayName = relative && !relative.startsWith('..')
                ? relative.replace(/\\/g, '/')
                : path.basename(resolved)
            return {
                name: displayName,
                description: resolved,
                group: 'Local files',
                result: { kind: 'file', targetPath: resolved as string },
            }
        }))

        if (options.length <= 1) {
            this.statusMessage = `Opened local folder: ${this.getFolderDisplayName(localRoot)}`
            this.updateStatus()
            return
        }

        const picked = await this.app.showSelector<LocalOpenSelection>('Open local', options).catch(() => null)
        if (!picked?.targetPath) {
            return
        }
        const pickedPath = path.resolve(picked.targetPath)
        if (picked.kind === 'folder') {
            if (this.isTreePathEqualOrDescendant(pickedPath, localRoot)) {
                this.attachFolderToTree(localRoot, false)
                this.revealLocalFolderPath(localRoot, pickedPath)
            } else {
                this.attachFolderToTree(pickedPath, true)
            }
            return
        }

        if (this.isTreePathEqualOrDescendant(pickedPath, localRoot)) {
            this.attachFolderToTree(localRoot, false)
            this.revealLocalFolderPath(localRoot, path.dirname(pickedPath))
        } else {
            // Fallback for unexpected external paths.
            this.attachFolderToTree(path.dirname(pickedPath), false)
        }
        await this.openFileFromDiskPath(pickedPath)
    }

    async onExternalTransfer (root: DirectoryUpload): Promise<void> {
        if (!(await this.ensureEditor())) {
            return
        }
        const uploads = this.collectDroppedFileUploads(root)
        if (!uploads.length) {
            this.statusMessage = 'No files found in drop'
            this.updateStatus()
            return
        }

        let opened = 0
        let imported = 0
        for (const upload of uploads) {
            try {
                const data = await upload.readAll()
                const content = new TextDecoder().decode(data)
                const target = await this.resolveUploadOpenTarget(upload)
                this.openDocumentFromContent(target.name, target.filePath, content)
                opened++
                if (target.imported) {
                    imported++
                }
            } catch (err: any) {
                this.setError(`Failed to open dropped file: ${err?.message ?? err}`)
            } finally {
                ;(upload as any).close?.()
            }
        }

        if (opened) {
            if (imported) {
                if (opened === imported) {
                    this.statusMessage = opened === 1 ? 'Imported 1 dropped file' : `Imported ${opened} dropped files`
                } else {
                    this.statusMessage = `Opened ${opened} dropped files (${imported} imported)`
                }
            } else {
                this.statusMessage = opened === 1 ? 'Opened 1 dropped file' : `Opened ${opened} dropped files`
            }
            this.updateStatus()
            this.updateTreeItems()
            window.setTimeout(() => this.cdr.markForCheck(), 0)
        }
    }

    private collectDroppedFileUploads (root: DirectoryUpload): FileUpload[] {
        const uploads: FileUpload[] = []
        const walk = (dir: DirectoryUpload): void => {
            for (const child of dir.getChildrens()) {
                if (this.isDirectoryUploadNode(child)) {
                    walk(child)
                } else {
                    uploads.push(child as FileUpload)
                }
            }
        }
        walk(root)
        return uploads
    }

    private isDirectoryUploadNode (entry: DirectoryUpload|FileUpload): entry is DirectoryUpload {
        return typeof (entry as any)?.getChildrens === 'function'
    }

    private resolveUploadFilePath (upload: FileUpload): string|null {
        const anyUpload = upload as any
        const candidates = [
            anyUpload?.filePath,
            anyUpload?.path,
            anyUpload?.file?.path,
        ]
        for (const candidate of candidates) {
            if (typeof candidate !== 'string') {
                continue
            }
            const trimmed = candidate.trim()
            if (!trimmed) {
                continue
            }
            if (path.isAbsolute(trimmed)) {
                return path.resolve(trimmed)
            }
        }
        return null
    }

    private resolveUploadDisplayName (upload: FileUpload, filePath: string|null): string {
        const uploadName = (upload.getName?.() ?? '').trim()
        if (uploadName) {
            return uploadName
        }
        if (filePath) {
            return path.basename(filePath)
        }
        return 'untitled.txt'
    }

    private async resolveUploadOpenTarget (upload: FileUpload): Promise<{ name: string, filePath: string|null, imported: boolean }> {
        const sourcePath = this.resolveUploadFilePath(upload)
        const sourceName = this.resolveUploadDisplayName(upload, sourcePath)
        if (sourcePath) {
            this.ensurePathVisibleInTree(sourcePath, false, true)
            return { name: sourceName, filePath: sourcePath, imported: false }
        }
        return { name: sourceName, filePath: null, imported: false }
    }

    async openRecent (filePath: string): Promise<void> {
        if (!filePath) {
            return
        }
        await this.openFileFromDiskPath(filePath)
    }

    async handleRecentSelection (event: any): Promise<void> {
        const value = event?.target?.value ?? ''
        if (!value) {
            return
        }
        await this.openRecent(value)
        if (event?.target) {
            event.target.value = ''
        }
    }

    async openQuickOpen (): Promise<void> {
        if (!(await this.ensureEditor())) {
            return
        }

        const options: SelectorOption<QuickOpenSelection>[] = []
        const seenFiles = new Set<string>()
        options.push({
            name: 'Open file/folder by path',
            description: 'Type an absolute path, ~/ path, or path relative to current directory',
            group: 'Path',
            freeInputPattern: 'Open "%s"',
            callback: query => {
                void this.openFileByUserPath(query ?? '')
            },
            weight: -30,
        })

        const docs = [...this.documents].sort((a, b) => {
            if (a.id === this.activeDocId) return -1
            if (b.id === this.activeDocId) return 1
            return a.name.localeCompare(b.name)
        })
        for (const doc of docs) {
            if (doc.path) {
                seenFiles.add(path.resolve(doc.path))
            }
            options.push({
                name: doc.isDirty ? `${doc.name} •` : doc.name,
                description: doc.path ?? 'Unsaved buffer',
                group: 'Open documents',
                result: { kind: 'doc', docId: doc.id },
                weight: doc.id === this.activeDocId ? -20 : -10,
            })
        }

        for (const recent of this.recentFiles) {
            const filePath = (recent ?? '').trim()
            if (!filePath) {
                continue
            }
            const resolved = path.resolve(filePath)
            if (seenFiles.has(resolved) || !fsSync.existsSync(resolved)) {
                continue
            }
            seenFiles.add(resolved)
            options.push({
                name: this.quickOpenDisplayName(resolved),
                description: resolved,
                group: 'Recent files',
                result: { kind: 'file', filePath: resolved },
                weight: 0,
            })
        }

        const workspaceFiles = await this.collectWorkspaceFiles()
        for (const filePath of workspaceFiles) {
            const resolved = path.resolve(filePath)
            if (seenFiles.has(resolved)) {
                continue
            }
            seenFiles.add(resolved)
            options.push({
                name: this.quickOpenDisplayName(resolved),
                description: resolved,
                group: 'Workspace files',
                result: { kind: 'file', filePath: resolved },
                weight: 10,
            })
        }

        if (!options.length) {
            this.setError('No files available to open')
            return
        }

        const picked = await this.app.showSelector<QuickOpenSelection>('Quick Open', options).catch(() => null)
        if (!picked) {
            return
        }
        if (picked.kind === 'doc' && picked.docId) {
            this.activateDoc(picked.docId)
            return
        }
        if (picked.kind === 'file' && picked.filePath) {
            await this.openFileFromDiskPath(picked.filePath)
        }
    }

    async openFileByPathPrompt (): Promise<void> {
        const input = await this.promptForName('Open file/folder path', '')
        if (input == null) {
            return
        }
        await this.openFileByUserPath(input)
    }

    private resolveUserPathInput (input: string): string|null {
        let raw = (input ?? '').trim()
        if (!raw) {
            return null
        }
        if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith('\'') && raw.endsWith('\''))) {
            raw = raw.slice(1, -1).trim()
        }
        if (!raw) {
            return null
        }

        let expanded = raw
        if (expanded.startsWith('~')) {
            const home = process.env.HOME || os.homedir()
            expanded = path.join(home, expanded.slice(1).replace(/^[/\\]+/, ''))
        }

        if (!path.isAbsolute(expanded)) {
            const cwd = (typeof process !== 'undefined' && (process as any).cwd)
                ? (process as any).cwd()
                : this.folderRoot
            expanded = path.resolve(cwd, expanded)
        } else {
            expanded = path.resolve(expanded)
        }

        return expanded
    }

    private async openFileByUserPath (input: string): Promise<void> {
        const resolved = this.resolveUserPathInput(input)
        if (!resolved) {
            return
        }
        try {
            const stat = await fs.stat(resolved)
            if (stat.isDirectory()) {
                this.attachFolderToTree(resolved, true)
                this.statusMessage = `Opened folder: ${this.getFolderDisplayName(resolved)}`
                this.updateStatus()
                return
            }
            if (!stat.isFile()) {
                this.setError('Path is not a regular file or directory.')
                return
            }
        } catch (err: any) {
            this.setError(`Cannot open ${resolved}: ${err?.message ?? err}`)
            return
        }
        await this.openFileFromDiskPath(resolved)
    }

    private quickOpenDisplayName (filePath: string): string {
        const resolved = path.resolve(filePath)
        for (const folder of this.folders) {
            const root = path.resolve(folder.path)
            if (resolved === root || resolved.startsWith(root + path.sep)) {
                const rel = path.relative(root, resolved)
                return rel || path.basename(resolved)
            }
        }
        return path.basename(resolved)
    }

    private getExistingRootPaths (roots: Array<string|null|undefined>): string[] {
        const unique = new Set<string>()
        for (const root of roots) {
            if (!root) {
                continue
            }
            let resolved = ''
            try {
                resolved = path.resolve(root)
            } catch {
                continue
            }
            try {
                if (!fsSync.existsSync(resolved) || !fsSync.statSync(resolved).isDirectory()) {
                    continue
                }
            } catch {
                continue
            }
            unique.add(resolved)
        }
        return Array.from(unique)
    }

    private async collectFilesFromRoots (roots: Array<string|null|undefined>, limit = this.quickOpenBudget): Promise<string[]> {
        const files: string[] = []
        const queue = this.getExistingRootPaths(roots)
        const visited = new Set<string>()

        while (queue.length && files.length < limit) {
            const dir = queue.shift()!
            if (visited.has(dir)) {
                continue
            }
            visited.add(dir)
            let entries: any[] = []
            try {
                entries = await fs.readdir(dir, { withFileTypes: true }) as any[]
            } catch {
                continue
            }
            for (const entry of entries) {
                const name = entry?.name
                if (!name || name === '.' || name === '..') {
                    continue
                }
                const fullPath = path.join(dir, name)
                const isSymLink = typeof entry.isSymbolicLink === 'function' ? entry.isSymbolicLink() : false
                if (isSymLink) {
                    continue
                }
                const isDir = typeof entry.isDirectory === 'function' ? entry.isDirectory() : false
                if (isDir) {
                    if (!this.skippedFolders.has(name)) {
                        queue.push(fullPath)
                    }
                    continue
                }
                files.push(fullPath)
                if (files.length >= limit) {
                    break
                }
            }
        }

        return files
    }

    private async collectFoldersFromRoots (roots: Array<string|null|undefined>, limit = this.quickOpenBudget): Promise<string[]> {
        const folders: string[] = []
        const queue = this.getExistingRootPaths(roots)
        const visited = new Set<string>()

        while (queue.length && folders.length < limit) {
            const dir = queue.shift()!
            if (visited.has(dir)) {
                continue
            }
            visited.add(dir)
            folders.push(dir)

            let entries: any[] = []
            try {
                entries = await fs.readdir(dir, { withFileTypes: true }) as any[]
            } catch {
                continue
            }
            for (const entry of entries) {
                const name = entry?.name
                if (!name || name === '.' || name === '..') {
                    continue
                }
                const isSymLink = typeof entry.isSymbolicLink === 'function' ? entry.isSymbolicLink() : false
                if (isSymLink) {
                    continue
                }
                const isDir = typeof entry.isDirectory === 'function' ? entry.isDirectory() : false
                if (!isDir || this.skippedFolders.has(name)) {
                    continue
                }
                queue.push(path.join(dir, name))
            }
        }

        return folders
    }

    private async collectWorkspaceFiles (): Promise<string[]> {
        return this.collectFilesFromRoots(this.folders.map(f => f.path), this.quickOpenBudget)
    }

    async saveFile (): Promise<void> {
        if (!(await this.ensureEditor())) {
            return
        }
        const doc = this.getActiveDoc()
        if (!doc) {
            return
        }
        await this.saveDocument(doc)
    }

    async saveFileAs (): Promise<void> {
        if (!(await this.ensureEditor())) {
            return
        }
        const doc = this.getActiveDoc()
        if (!doc) {
            return
        }
        const content = doc.model.getValue()
        const data = new TextEncoder().encode(content)
        const download = await this.platform.startDownload(doc.name || 'untitled.txt', 0o644, data.length)
        if (!download) {
            return
        }
        try {
            await download.write(data)
            download.close()
            doc.isDirty = false
            doc.lastSavedValue = content
            const newPath = (download as any).filePath ?? null
            if (newPath) {
                doc.path = newPath
                doc.name = path.basename(newPath)
                doc.folderPath = this.getFolderForPath(newPath) ?? doc.folderPath
                this.rememberRecent(newPath)
                this.setModelLanguage(doc)
                this.refreshDocDiskSnapshot(doc, content)
            }
            if (doc.tempPath) {
                await this.deleteTemp(doc.tempPath)
                doc.tempPath = null
            }
            this.updateTitle(doc)
            this.syncOpenedFileScopes()
            this.updateTreeItems()
            this.persistState()
        } catch (err: any) {
            this.setError(`Failed to save file: ${err?.message ?? err}`)
        }
    }

    async reopenClosed (): Promise<void> {
        if (!(await this.ensureEditor())) {
            return
        }
        const snapshot = this.closedDocuments.pop()
        if (!snapshot) {
            return
        }
        const doc = this.createDocument(snapshot)
        doc.isDirty = !!snapshot.isDirty
        doc.lastSavedValue = snapshot.lastSavedValue ?? snapshot.content
        this.refreshDocDiskSnapshot(doc, snapshot.content)
        this.documents.push(doc)
        this.syncOpenedFileScopes()
        this.activateDoc(doc.id)
        if ((snapshot.content ?? '').includes('\u001b[')) {
            this.applyAnsiDecorations(doc, snapshot.content ?? '')
        }
        if (!doc.path) {
            if (!doc.tempPath) {
                const autosaveFolder = doc.folderPath ?? this.selectedFolderPath ?? this.folderRoot
                doc.folderPath = doc.folderPath ?? autosaveFolder
                doc.tempPath = this.allocateTempPath(doc.name || 'untitled', autosaveFolder)
            }
            this.queueSaveTemp(doc)
        }
        this.updateTreeItems()
        this.persistState()
    }

    async closeDocument (docId: string): Promise<void> {
        const doc = this.documents.find(d => d.id === docId)
        if (!doc) {
            return
        }
        if (!(await this.confirmDiscard(doc))) {
            return
        }
        const pendingTempSave = this.tempSaveTimers.get(doc.id)
        if (pendingTempSave) {
            clearTimeout(pendingTempSave)
            this.tempSaveTimers.delete(doc.id)
        }
        this.closedDocuments.push(this.snapshotDocument(doc))
        doc.model?.dispose?.()
        if (!doc.path && doc.tempPath) {
            void this.deleteTemp(doc.tempPath)
        }
        this.documents = this.documents.filter(d => d.id !== docId)
        this.syncOpenedFileScopes()
        this.updateTreeItems()
        window.setTimeout(() => this.cdr.markForCheck(), 0)
        if (this.activeDocId === docId) {
            const next = this.documents[0]
            this.activeDocId = next?.id ?? null
            this.primaryEditor?.setModel(next?.model ?? null)
        }
        if (this.splitDocId === docId) {
            this.splitDocId = null
            this.splitEditor?.setModel(this.getActiveDoc()?.model ?? null)
        }
        this.persistState()
        this.updateStatus()
    }

    openDocContextMenu (event: MouseEvent, docId: string): void {
        event.preventDefault()
        event.stopPropagation()
        this.fileMenuOpen = false
        this.editMenuOpen = false

        this.docContextMenuOpen = true
        this.docContextMenuDocId = docId

        const menuWidth = 220
        const menuHeight = 120
        const padding = 8
        const maxX = Math.max(padding, (window.innerWidth || 0) - menuWidth - padding)
        const maxY = Math.max(padding, (window.innerHeight || 0) - menuHeight - padding)

        this.docContextMenuX = Math.max(padding, Math.min(event.clientX, maxX))
        this.docContextMenuY = Math.max(padding, Math.min(event.clientY, maxY))
    }

    async renameDocument (docId: string): Promise<void> {
        const doc = this.documents.find(d => d.id === docId)
        if (!doc) {
            return
        }

        const suggested = doc.name || (doc.path ? path.basename(doc.path) : 'untitled')
        const input = await this.promptForName('Rename document', suggested)
        const nextName = (input ?? '').trim()
        await this.renameDocumentWithName(docId, nextName)
    }

    private async promptForName (title: string, value: string): Promise<string|null> {
        if (this.ngbModal) {
            try {
                const modal = this.ngbModal.open(PromptModalComponent)
                modal.componentInstance.prompt = title
                modal.componentInstance.value = value
                const res = await modal.result.catch(() => null)
                return res?.value ?? null
            } catch {
                // Fall back to native prompt below.
            }
        }
        if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
            try {
                const result = window.prompt(title, value)
                return result === null ? null : result
            } catch {
                // ignore prompt fallback errors
            }
        }
        return null
    }

    private async confirmAction (message: string, detail?: string, okLabel = 'OK'): Promise<boolean> {
        try {
            const result = await this.platform.showMessageBox({
                type: 'warning',
                message,
                detail,
                buttons: ['Cancel', okLabel],
                defaultId: 1,
                cancelId: 0,
            })
            return result.response === 1
        } catch {
            return false
        }
    }

    private async renameDocumentWithName (docId: string, nextNameRaw: string): Promise<void> {
        const doc = this.documents.find(d => d.id === docId)
        if (!doc) {
            return
        }
        const nextName = (nextNameRaw ?? '').trim()
        if (!nextName || nextName === doc.name) {
            return
        }
        if (/[\/\\]/.test(nextName)) {
            this.setError('Rename must be a file name (no path separators)')
            return
        }

        // Rename on disk when file exists, otherwise just rename the in-memory doc (+ temp file if present)
        if (doc.path) {
            const dir = path.dirname(doc.path)
            const oldPath = doc.path
            const oldKeyBeforeRename = this.getFsPathKey(oldPath)
            const newPath = path.join(dir, nextName)
            if (newPath === oldPath) {
                return
            }
            try {
                if (fsSync.existsSync(newPath)) {
                    this.setError('A file with that name already exists')
                    return
                }
                await fs.rename(oldPath, newPath)
                doc.path = newPath
                doc.name = path.basename(newPath)
                this.refreshDocDiskSnapshot(doc, doc.model.getValue())
                // update recent list (replace old path + ensure new is at top)
                this.recentFiles = this.recentFiles.map(p => p === oldPath ? newPath : p).filter(Boolean)
                this.rememberRecent(newPath)
                this.setModelLanguage(doc)
                this.updateTitle(doc)
                this.syncOpenedFileScopes()
                this.remapFileSelectionPath(oldPath, newPath, oldKeyBeforeRename)
                this.revealTreePath(newPath)
                this.updateTreeItems()
                window.setTimeout(() => this.cdr.markForCheck(), 0)
                this.persistState()
            } catch (err: any) {
                this.setError(`Failed to rename: ${err?.message ?? err}`)
            }
            return
        }

        const oldTemp = doc.tempPath
        const oldTempKeyBeforeRename = this.getFsPathKey(oldTemp)
        doc.name = nextName
        doc.tempPath = this.allocateTempPath(nextName, doc.folderPath ?? this.selectedFolderPath)
        // Best-effort: if temp file exists, rename it to match new extension/name
        if (oldTemp && doc.tempPath && fsSync.existsSync(oldTemp)) {
            try {
                await fs.mkdir(path.dirname(doc.tempPath), { recursive: true })
                await fs.rename(oldTemp, doc.tempPath)
            } catch {
                // ignore temp rename failures
            }
        }
        this.setModelLanguage(doc)
        this.updateTitle(doc)
        this.remapFileSelectionPath(oldTemp, doc.tempPath, oldTempKeyBeforeRename)
        this.updateTreeItems()
        window.setTimeout(() => this.cdr.markForCheck(), 0)
        this.persistState()
    }

    startInlineRename (event: MouseEvent, docId: string): void {
        event.stopPropagation()
        const doc = this.documents.find(d => d.id === docId)
        if (!doc) {
            return
        }
        this.editingDocId = docId
        this.editingDocName = doc.name || (doc.path ? path.basename(doc.path) : 'untitled')
        setTimeout(() => {
            const input = document.getElementById(`code-editor-rename-${docId}`) as HTMLInputElement|null
            input?.focus()
            input?.select?.()
        })
    }

    cancelInlineRename (): void {
        this.editingDocId = null
        this.editingDocName = ''
    }

    async commitInlineRename (docId: string): Promise<void> {
        const name = this.editingDocName
        this.cancelInlineRename()
        await this.renameDocumentWithName(docId, name)
    }

    async renameDocumentFromContextMenu (): Promise<void> {
        const docId = this.docContextMenuDocId
        this.docContextMenuOpen = false
        this.docContextMenuDocId = null
        if (docId) {
            await this.renameDocument(docId)
        }
    }

    async closeDocumentFromContextMenu (): Promise<void> {
        const docId = this.docContextMenuDocId
        this.docContextMenuOpen = false
        this.docContextMenuDocId = null
        if (docId) {
            await this.closeDocument(docId)
        }
    }

    async moveDocumentFromContextMenu (folderPath: string|null): Promise<void> {
        const docId = this.docContextMenuDocId
        this.docContextMenuOpen = false
        this.docContextMenuDocId = null
        if (docId) {
            await this.moveDocumentToFolder(docId, folderPath)
        }
    }

    async canClose (): Promise<boolean> {
        const dirtyDocs = this.documents.filter(d => d.isDirty)
        for (const doc of dirtyDocs) {
            const proceed = await this.confirmDiscard(doc)
            if (!proceed) {
                return false
            }
        }
        return true
    }

    async getRecoveryToken (_options?: GetRecoveryTokenOptions): Promise<RecoveryToken> {
        return { type: 'app:code-editor' }
    }

    get statusLabel (): string {
        if (this.loadError) {
            return this.loadError
        }
        if (this.statusMessage) {
            return this.statusMessage
        }
        if (this.loading) {
            return 'Loading Monaco editor…'
        }
        return ''
    }

    async copySelection (): Promise<void> {
        if (!(await this.ensureEditor())) {
            return
        }
        const editor = this.getActiveEditor()
        const model = this.getActiveDoc()?.model
        const selection = editor?.getSelection?.()
        if (!selection || !model) {
            return
        }
        const text = model.getValueInRange(selection)
        if (!text) {
            return
        }
        await this.writeTextToClipboard(text)
    }

    async pasteClipboard (): Promise<void> {
        if (!(await this.ensureEditor())) {
            return
        }
        const editor = this.getActiveEditor()
        const model = this.getActiveDoc()?.model
        if (!editor || !model) {
            return
        }
        const text = await this.readTextFromClipboard()
        if (!text) {
            return
        }
        const selection = editor.getSelection?.()
        let range = selection
        if (!range) {
            const pos = editor.getPosition?.()
            if (pos) {
                range = {
                    startLineNumber: pos.lineNumber,
                    startColumn: pos.column,
                    endLineNumber: pos.lineNumber,
                    endColumn: pos.column,
                }
            } else {
                const lastLine = Math.max(1, model.getLineCount?.() ?? 1)
                const lastCol = model.getLineMaxColumn?.(lastLine) ?? 1
                range = {
                    startLineNumber: lastLine,
                    startColumn: lastCol,
                    endLineNumber: lastLine,
                    endColumn: lastCol,
                }
            }
        }
        editor.executeEdits('paste', [{
            range,
            text,
            forceMoveMarkers: true,
        }])
        editor.focus?.()
        const doc = this.getActiveDoc()
        if (doc) {
            doc.isDirty = true
            this.updateTitle(doc)
        }
    }

    private async readTextFromClipboard (): Promise<string> {
        let text = ''
        try {
            text = this.platform.readClipboard() ?? ''
        } catch {
            text = ''
        }
        if (!text && typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
            try {
                text = await navigator.clipboard.readText()
            } catch {
                // ignore and return best-effort value
            }
        }
        return text ?? ''
    }

    private async writeTextToClipboard (text: string): Promise<void> {
        try {
            this.platform.setClipboard({ text })
            return
        } catch {
            // fall through to web clipboard fallback
        }
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(text)
            } catch {
                // ignore best-effort clipboard fallback
            }
        }
    }

    toggleWordWrap (): void {
        if (!this.monaco) {
            return
        }
        this.wordWrapEnabled = !this.wordWrapEnabled
        this.primaryEditor?.updateOptions({ wordWrap: this.wordWrapEnabled ? 'on' : 'off' })
        this.splitEditor?.updateOptions({ wordWrap: this.wordWrapEnabled ? 'on' : 'off' })
        this.updateStatus()
        this.persistState()
    }

    toggleMinimap (): void {
        this.minimapEnabled = !this.minimapEnabled
        this.primaryEditor?.updateOptions({ minimap: { enabled: this.minimapEnabled } })
        this.splitEditor?.updateOptions({ minimap: { enabled: this.minimapEnabled } })
        this.persistState()
    }

    toggleTheme (event?: MouseEvent): void {
        event?.preventDefault()
        event?.stopPropagation()

        // Determine the actually focused pane in the split layout (terminal vs editor).
        // This is more reliable than tracking "lastFocusedPane" because terminal focus can come from clicks inside xterm.
        const focusedTab = this.parent instanceof SplitTabComponent ? this.parent.getFocusedTab() : null
        const terminalTab = this.isTerminalLikeTab(focusedTab) ? focusedTab as any : null

        if (terminalTab) {
            this.toggleTerminalThemeForTab(terminalTab)
            // Keep terminal focused (the Theme button lives in the editor pane, so we'd otherwise steal focus)
            terminalTab?.parent?.focus?.(terminalTab)
            terminalTab?.focus?.()
            return
        }

        const order = this.supportedThemeModes
        const idx = order.indexOf(this.themeMode)
        this.themeMode = order[(idx + 1) % order.length]
        this.applyTheme()
        this.persistState()
    }

    setThemeMode (mode: string): void {
        const next = (mode ?? '').trim() as EditorThemeMode
        if (!this.supportedThemeModes.includes(next)) {
            return
        }
        if (this.themeMode === next) {
            return
        }
        this.themeMode = next
        this.applyTheme()
        this.persistState()
    }

    onEditorThemePresetChange (color: string): void {
        if (!color || color === 'custom') {
            return
        }
        this.setEditorThemeColor(color)
    }

    setEditorThemeColor (color: string): void {
        const normalized = this.normalizeHexColor(color, this.editorThemeColor)
        if (!normalized || normalized === this.editorThemeColor) {
            return
        }
        this.editorThemeColor = normalized
        this.applyTheme()
        this.persistState()
    }

    private normalizeHexColor (color: string, fallback: string): string {
        const value = (color ?? '').trim()
        if (!value) {
            return fallback
        }
        const noHash = value.startsWith('#') ? value.slice(1) : value
        if (/^[0-9a-fA-F]{3}$/.test(noHash)) {
            const expanded = noHash.split('').map(ch => ch + ch).join('')
            return `#${expanded.toLowerCase()}`
        }
        if (/^[0-9a-fA-F]{6}$/.test(noHash)) {
            return `#${noHash.toLowerCase()}`
        }
        return fallback
    }

    private hexToRgb (color: string): { r: number, g: number, b: number }|null {
        const normalized = this.normalizeHexColor(color, '')
        if (!normalized || normalized.length !== 7) {
            return null
        }
        const value = normalized.slice(1)
        const r = parseInt(value.slice(0, 2), 16)
        const g = parseInt(value.slice(2, 4), 16)
        const b = parseInt(value.slice(4, 6), 16)
        if ([r, g, b].some(x => Number.isNaN(x))) {
            return null
        }
        return { r, g, b }
    }

    private toRgba (color: string, alpha: number): string {
        const rgb = this.hexToRgb(color)
        if (!rgb) {
            return `rgba(79, 156, 255, ${alpha})`
        }
        const safeAlpha = Math.max(0, Math.min(1, alpha))
        return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${safeAlpha})`
    }

    private defineEditorThemes (): void {
        if (!this.monaco?.editor?.defineTheme) {
            return
        }
        const accent = this.normalizeHexColor(this.editorThemeColor, '#4f9cff')
        const selectionAccent = accent
        const highlightAccent = selectionAccent
        const editor = this.monaco.editor
        editor.defineTheme('tlink-vs', {
            base: 'vs',
            inherit: true,
            rules: [],
            colors: {
                'focusBorder': accent,
                'editorCursor.foreground': accent,
                'editorLineNumber.activeForeground': accent,
                'editor.selectionBackground': this.toRgba(selectionAccent, 0.28),
                'editor.inactiveSelectionBackground': this.toRgba(selectionAccent, 0.16),
                'editor.selectionHighlightBackground': this.toRgba(selectionAccent, 0.22),
                'editor.wordHighlightBackground': this.toRgba(highlightAccent, 0.14),
                'editor.wordHighlightStrongBackground': this.toRgba(highlightAccent, 0.24),
                'editor.findMatchBackground': this.toRgba(highlightAccent, 0.38),
                'editor.findMatchHighlightBackground': this.toRgba(highlightAccent, 0.25),
                'editorBracketMatch.border': this.toRgba(highlightAccent, 0.6),
                'editorWidget.border': this.toRgba(highlightAccent, 0.65),
                'editorSuggestWidget.highlightForeground': accent,
                'editorLink.activeForeground': accent,
            },
        })
        editor.defineTheme('tlink-vs-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [],
            colors: {
                'focusBorder': accent,
                'editorCursor.foreground': accent,
                'editorLineNumber.activeForeground': accent,
                'editor.selectionBackground': this.toRgba(selectionAccent, 0.35),
                'editor.inactiveSelectionBackground': this.toRgba(selectionAccent, 0.2),
                'editor.selectionHighlightBackground': this.toRgba(selectionAccent, 0.28),
                'editor.wordHighlightBackground': this.toRgba(highlightAccent, 0.2),
                'editor.wordHighlightStrongBackground': this.toRgba(highlightAccent, 0.34),
                'editor.findMatchBackground': this.toRgba(highlightAccent, 0.42),
                'editor.findMatchHighlightBackground': this.toRgba(highlightAccent, 0.3),
                'editorBracketMatch.border': this.toRgba(highlightAccent, 0.68),
                'editorWidget.border': this.toRgba(highlightAccent, 0.72),
                'editorSuggestWidget.highlightForeground': accent,
                'editorLink.activeForeground': accent,
            },
        })
        editor.defineTheme('tlink-hc', {
            base: 'hc-black',
            inherit: true,
            rules: [],
            colors: {
                'focusBorder': accent,
                'editorCursor.foreground': accent,
                'editorLineNumber.activeForeground': accent,
                'editor.selectionBackground': this.toRgba(selectionAccent, 0.45),
                'editor.inactiveSelectionBackground': this.toRgba(selectionAccent, 0.3),
                'editor.selectionHighlightBackground': this.toRgba(selectionAccent, 0.36),
                'editor.wordHighlightBackground': this.toRgba(highlightAccent, 0.32),
                'editor.wordHighlightStrongBackground': this.toRgba(highlightAccent, 0.48),
                'editor.findMatchBackground': this.toRgba(highlightAccent, 0.55),
                'editor.findMatchHighlightBackground': this.toRgba(highlightAccent, 0.42),
                'editorBracketMatch.border': highlightAccent,
                'editorWidget.border': highlightAccent,
                'editorSuggestWidget.highlightForeground': accent,
                'editorLink.activeForeground': accent,
            },
        })
        editor.defineTheme('tlink-solarized-light', {
            base: 'vs',
            inherit: true,
            rules: [],
            colors: {
                'focusBorder': accent,
                'editor.background': '#fdf6e3',
                'editor.foreground': '#657b83',
                'editorLineNumber.foreground': '#93a1a1',
                'editorLineNumber.activeForeground': accent,
                'editorCursor.foreground': accent,
                'editor.selectionBackground': this.toRgba(selectionAccent, 0.26),
                'editor.inactiveSelectionBackground': this.toRgba(selectionAccent, 0.16),
                'editor.selectionHighlightBackground': this.toRgba(selectionAccent, 0.2),
                'editor.wordHighlightBackground': this.toRgba(highlightAccent, 0.12),
                'editor.wordHighlightStrongBackground': this.toRgba(highlightAccent, 0.2),
                'editor.findMatchBackground': this.toRgba(highlightAccent, 0.36),
                'editor.findMatchHighlightBackground': this.toRgba(highlightAccent, 0.22),
                'editorBracketMatch.border': this.toRgba(highlightAccent, 0.6),
                'editorWidget.border': this.toRgba(highlightAccent, 0.62),
                'editorSuggestWidget.highlightForeground': accent,
                'editorLink.activeForeground': accent,
            },
        })
        editor.defineTheme('tlink-solarized-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [],
            colors: {
                'focusBorder': accent,
                'editor.background': '#002b36',
                'editor.foreground': '#93a1a1',
                'editorLineNumber.foreground': '#586e75',
                'editorLineNumber.activeForeground': accent,
                'editorCursor.foreground': accent,
                'editor.selectionBackground': this.toRgba(selectionAccent, 0.36),
                'editor.inactiveSelectionBackground': this.toRgba(selectionAccent, 0.2),
                'editor.selectionHighlightBackground': this.toRgba(selectionAccent, 0.28),
                'editor.wordHighlightBackground': this.toRgba(highlightAccent, 0.2),
                'editor.wordHighlightStrongBackground': this.toRgba(highlightAccent, 0.3),
                'editor.findMatchBackground': this.toRgba(highlightAccent, 0.42),
                'editor.findMatchHighlightBackground': this.toRgba(highlightAccent, 0.28),
                'editorBracketMatch.border': this.toRgba(highlightAccent, 0.7),
                'editorWidget.border': this.toRgba(highlightAccent, 0.74),
                'editorSuggestWidget.highlightForeground': accent,
                'editorLink.activeForeground': accent,
            },
        })
        editor.defineTheme('tlink-dracula', {
            base: 'vs-dark',
            inherit: true,
            rules: [],
            colors: {
                'focusBorder': accent,
                'editor.background': '#282a36',
                'editor.foreground': '#f8f8f2',
                'editorLineNumber.foreground': '#6272a4',
                'editorLineNumber.activeForeground': accent,
                'editorCursor.foreground': accent,
                'editor.selectionBackground': this.toRgba(selectionAccent, 0.34),
                'editor.inactiveSelectionBackground': this.toRgba(selectionAccent, 0.2),
                'editor.selectionHighlightBackground': this.toRgba(selectionAccent, 0.28),
                'editor.wordHighlightBackground': this.toRgba(highlightAccent, 0.2),
                'editor.wordHighlightStrongBackground': this.toRgba(highlightAccent, 0.32),
                'editor.findMatchBackground': this.toRgba(highlightAccent, 0.44),
                'editor.findMatchHighlightBackground': this.toRgba(highlightAccent, 0.3),
                'editorBracketMatch.border': this.toRgba(highlightAccent, 0.74),
                'editorWidget.border': this.toRgba(highlightAccent, 0.78),
                'editorSuggestWidget.highlightForeground': accent,
                'editorLink.activeForeground': accent,
            },
        })
        editor.defineTheme('tlink-monokai', {
            base: 'vs-dark',
            inherit: true,
            rules: [],
            colors: {
                'focusBorder': accent,
                'editor.background': '#272822',
                'editor.foreground': '#f8f8f2',
                'editorLineNumber.foreground': '#75715e',
                'editorLineNumber.activeForeground': accent,
                'editorCursor.foreground': accent,
                'editor.selectionBackground': this.toRgba(selectionAccent, 0.34),
                'editor.inactiveSelectionBackground': this.toRgba(selectionAccent, 0.2),
                'editor.selectionHighlightBackground': this.toRgba(selectionAccent, 0.26),
                'editor.wordHighlightBackground': this.toRgba(highlightAccent, 0.2),
                'editor.wordHighlightStrongBackground': this.toRgba(highlightAccent, 0.32),
                'editor.findMatchBackground': this.toRgba(highlightAccent, 0.44),
                'editor.findMatchHighlightBackground': this.toRgba(highlightAccent, 0.3),
                'editorBracketMatch.border': this.toRgba(highlightAccent, 0.74),
                'editorWidget.border': this.toRgba(highlightAccent, 0.78),
                'editorSuggestWidget.highlightForeground': accent,
                'editorLink.activeForeground': accent,
            },
        })
        editor.defineTheme('tlink-nord', {
            base: 'vs-dark',
            inherit: true,
            rules: [],
            colors: {
                'focusBorder': accent,
                'editor.background': '#2e3440',
                'editor.foreground': '#d8dee9',
                'editorLineNumber.foreground': '#4c566a',
                'editorLineNumber.activeForeground': accent,
                'editorCursor.foreground': accent,
                'editor.selectionBackground': this.toRgba(selectionAccent, 0.34),
                'editor.inactiveSelectionBackground': this.toRgba(selectionAccent, 0.2),
                'editor.selectionHighlightBackground': this.toRgba(selectionAccent, 0.26),
                'editor.wordHighlightBackground': this.toRgba(highlightAccent, 0.2),
                'editor.wordHighlightStrongBackground': this.toRgba(highlightAccent, 0.32),
                'editor.findMatchBackground': this.toRgba(highlightAccent, 0.44),
                'editor.findMatchHighlightBackground': this.toRgba(highlightAccent, 0.3),
                'editorBracketMatch.border': this.toRgba(highlightAccent, 0.74),
                'editorWidget.border': this.toRgba(highlightAccent, 0.78),
                'editorSuggestWidget.highlightForeground': accent,
                'editorLink.activeForeground': accent,
            },
        })
    }

    private cloneColorScheme (scheme: any): any {
        if (!scheme) {
            return scheme
        }
        return {
            ...scheme,
            colors: Array.isArray(scheme.colors) ? [...scheme.colors] : scheme.colors,
        }
    }

    private isSameColorScheme (a: any, b: any): boolean {
        if (!a && !b) {
            return true
        }
        if (!a || !b) {
            return false
        }
        const aColors = Array.isArray(a.colors) ? a.colors : []
        const bColors = Array.isArray(b.colors) ? b.colors : []
        if (aColors.length !== bColors.length) {
            return false
        }
        for (let i = 0; i < aColors.length; i++) {
            if (aColors[i] !== bColors[i]) {
                return false
            }
        }
        return a.foreground === b.foreground
            && a.background === b.background
            && a.cursor === b.cursor
            && (a.selection ?? null) === (b.selection ?? null)
            && (a.selectionForeground ?? null) === (b.selectionForeground ?? null)
            && (a.cursorAccent ?? null) === (b.cursorAccent ?? null)
    }

    private isTerminalLikeTab (tab: any): boolean {
        return !!(tab && typeof tab.configure === 'function' && tab.profile)
    }

    private toggleTerminalThemeForTab (term: any): void {
        if (!term?.profile) {
            return
        }
        const dark = this.config?.store?.terminal?.colorScheme
        const light = this.config?.store?.terminal?.lightColorScheme
        if (!dark || !light) {
            this.statusMessage = 'Terminal theme: unavailable'
            this.updateStatus()
            return
        }

        const current = term.profile.terminalColorScheme
        let next: any|undefined
        // Make the first click visible: switch to the opposite scheme from the current platform theme.
        const platformTheme = this.platform.getTheme()
        const primary = platformTheme === 'dark' ? light : dark
        const secondary = platformTheme === 'dark' ? dark : light

        if (!current) {
            next = this.cloneColorScheme(primary)
        } else if (this.isSameColorScheme(current, primary)) {
            next = this.cloneColorScheme(secondary)
        } else if (this.isSameColorScheme(current, secondary)) {
            next = undefined // follow app
        } else {
            next = this.cloneColorScheme(primary)
        }

        term.profile.terminalColorScheme = next
        try {
            term.configure()
        } catch {
            // ignore
        }
        this.statusMessage = `Terminal theme: ${next?.name ?? 'Follow app'}`
        this.updateStatus()
    }

    setFontSize (value: number): void {
        if (!value) {
            return
        }
        this.fontSize = Math.max(10, Math.min(28, value))
        this.primaryEditor?.updateOptions({ fontSize: this.fontSize, lineHeight: this.lineHeight })
        this.splitEditor?.updateOptions({ fontSize: this.fontSize, lineHeight: this.lineHeight })
        this.persistState()
    }

    setLineHeight (value: number): void {
        if (!value) {
            return
        }
        this.lineHeight = Math.max(14, Math.min(40, value))
        this.primaryEditor?.updateOptions({ lineHeight: this.lineHeight, fontSize: this.fontSize })
        this.splitEditor?.updateOptions({ lineHeight: this.lineHeight, fontSize: this.fontSize })
        this.persistState()
    }

    toggleAutosave (): void {
        this.autosaveEnabled = !this.autosaveEnabled
        this.startAutosave()
        this.persistState()
    }

    async goToLine (): Promise<void> {
        if (!(await this.ensureEditor())) {
            return
        }
        const currentLine = this.getActiveEditor()?.getPosition?.()?.lineNumber ?? 1
        const input = await this.promptForName('Go to line number', String(currentLine))
        if (input == null) {
            return
        }
        const line = parseInt(input.trim(), 10)
        if (!line || !isFinite(line) || line < 1) {
            this.setError('Enter a valid line number')
            return
        }
        this.getActiveEditor()?.revealLine(line)
        this.getActiveEditor()?.setPosition({ lineNumber: line, column: 1 })
        this.getActiveEditor()?.focus()
    }

    async runUndo (): Promise<void> {
        if (!(await this.ensureEditor())) {
            return
        }
        const editor = this.getActiveEditor()
        if (!editor) {
            return
        }
        await editor.getAction?.('undo')?.run?.()
        editor.trigger?.('keyboard', 'undo', null)
    }

    async runRedo (): Promise<void> {
        if (!(await this.ensureEditor())) {
            return
        }
        const editor = this.getActiveEditor()
        if (!editor) {
            return
        }
        await editor.getAction?.('redo')?.run?.()
        editor.trigger?.('keyboard', 'redo', null)
    }

    async cutSelection (): Promise<void> {
        if (!(await this.ensureEditor())) {
            return
        }
        const editor = this.getActiveEditor()
        const model = this.getActiveDoc()?.model
        const selection = editor?.getSelection?.()
        if (!editor || !model || !selection) {
            return
        }
        if (selection.startLineNumber === selection.endLineNumber && selection.startColumn === selection.endColumn) {
            return
        }
        const text = model.getValueInRange(selection)
        if (!text) {
            return
        }
        await this.writeTextToClipboard(text)
        editor.executeEdits('cut', [{
            range: selection,
            text: '',
            forceMoveMarkers: true,
        }])
        editor.focus?.()
    }

    async selectAllText (): Promise<void> {
        if (!(await this.ensureEditor())) {
            return
        }
        const editor = this.getActiveEditor()
        if (!editor) {
            return
        }
        await editor.getAction?.('editor.action.selectAll')?.run?.()
        editor.trigger?.('keyboard', 'editor.action.selectAll', null)
        editor.focus?.()
    }

    async runFind (): Promise<void> {
        if (!(await this.ensureEditor())) {
            return
        }
        this.getActiveEditor()?.trigger('keyboard', 'actions.find', null)
    }

    async runReplace (): Promise<void> {
        if (!(await this.ensureEditor())) {
            return
        }
        this.getActiveEditor()?.getAction('editor.action.startFindReplaceAction')?.run()
    }

    async formatDocument (): Promise<void> {
        if (!(await this.ensureEditor())) {
            return
        }
        await this.getActiveEditor()?.getAction('editor.action.formatDocument')?.run()
    }

    async formatAsJSON (): Promise<void> {
        if (!(await this.ensureEditor())) {
            return
        }
        const doc = this.getActiveDoc()
        if (!doc) {
            return
        }
        try {
            const parsed = JSON.parse(doc.model.getValue() || '{}')
            const pretty = JSON.stringify(parsed, null, 2)
            doc.model.setValue(pretty)
        } catch (err: any) {
            this.setError(`Invalid JSON: ${err?.message ?? err}`)
        }
    }

    private selectionHasText (selection: any): boolean {
        if (!selection) {
            return false
        }
        return selection.startLineNumber !== selection.endLineNumber || selection.startColumn !== selection.endColumn
    }

    private async transformSelectedText (statusMessage: string, transform: (value: string) => string): Promise<void> {
        if (!(await this.ensureEditor())) {
            return
        }
        const editor = this.getActiveEditor()
        const model = this.getActiveDoc()?.model
        if (!editor || !model) {
            return
        }
        const allSelections = editor.getSelections?.() ?? []
        const fallbackSelection = editor.getSelection?.()
        const selections = Array.isArray(allSelections) && allSelections.length
            ? allSelections
            : (fallbackSelection ? [fallbackSelection] : [])
        const textSelections = selections.filter(selection => this.selectionHasText(selection))
        if (!textSelections.length) {
            this.setError('Select text to format')
            return
        }

        const edits = textSelections.map(selection => ({
            range: selection,
            text: transform(model.getValueInRange(selection)),
            forceMoveMarkers: true,
        }))
        if (!edits.length) {
            return
        }

        editor.pushUndoStop?.()
        editor.executeEdits('text-formatting', edits)
        editor.pushUndoStop?.()
        editor.focus?.()
        this.statusMessage = statusMessage
        this.updateStatus()
    }

    private toTitleCase (value: string): string {
        return value.replace(/[^\s]+/g, token => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    }

    async trimTrailingWhitespace (): Promise<void> {
        if (!(await this.ensureEditor())) {
            return
        }
        await this.getActiveEditor()?.getAction('editor.action.trimTrailingWhitespace')?.run()
        this.statusMessage = 'Trimmed trailing spaces'
        this.updateStatus()
    }

    toggleIndentationStyle (): void {
        const doc = this.getActiveDoc()
        if (!doc) {
            return
        }
        const next = !doc.insertSpaces
        doc.insertSpaces = next
        doc.model.updateOptions({ insertSpaces: next })
        this.statusIndent = `${doc.insertSpaces ? 'Spaces' : 'Tabs'}:${doc.tabSize}`
    }

    toggleEditMenu (event?: MouseEvent): void {
        event?.stopPropagation()
        this.cancelEditMenuClose()
        this.cancelFileMenuClose()
        this.editMenuOpen = !this.editMenuOpen
        if (this.editMenuOpen) {
            this.fileMenuOpen = false
        }
    }

    private cancelEditMenuClose (): void {
        if (this.editMenuHoverCloseTimer) {
            clearTimeout(this.editMenuHoverCloseTimer)
            this.editMenuHoverCloseTimer = undefined
        }
    }

    openEditMenuOnHover (): void {
        this.cancelEditMenuClose()
        this.cancelFileMenuClose()
        this.editMenuOpen = true
        this.fileMenuOpen = false
    }

    keepEditMenuOpenOnHover (): void {
        this.cancelEditMenuClose()
        this.editMenuOpen = true
    }

    closeEditMenuOnLeave (): void {
        this.cancelEditMenuClose()
        this.editMenuHoverCloseTimer = window.setTimeout(() => {
            this.editMenuHoverCloseTimer = undefined
            this.editMenuOpen = false
        }, this.menuHoverCloseDelayMs)
    }

    async handleEditAction (action: string): Promise<void> {
        switch (action) {
        case 'quickOpen':
            await this.openQuickOpen()
            break
        case 'undo':
            await this.runUndo()
            break
        case 'redo':
            await this.runRedo()
            break
        case 'find':
            await this.runFind()
            break
        case 'replace':
            await this.runReplace()
            break
        case 'goto':
            await this.goToLine()
            break
        case 'format':
            await this.formatDocument()
            break
        case 'formatJson':
            await this.formatAsJSON()
            break
        case 'uppercase':
            await this.transformSelectedText('Uppercased selection', value => value.toUpperCase())
            break
        case 'lowercase':
            await this.transformSelectedText('Lowercased selection', value => value.toLowerCase())
            break
        case 'titleCase':
            await this.transformSelectedText('Title-cased selection', value => this.toTitleCase(value))
            break
        case 'trimTrailing':
            await this.trimTrailingWhitespace()
            break
        case 'cut':
            await this.cutSelection()
            break
        case 'copy':
            await this.copySelection()
            break
        case 'paste':
            await this.pasteClipboard()
            break
        case 'selectAll':
            await this.selectAllText()
            break
        case 'send':
            await this.sendSelectionToTerminal()
            break
        case 'run':
            await this.runActiveFile()
            break
        case 'openClipboard':
            await this.openFromClipboard()
            break
        case 'wrap':
            this.toggleWordWrap()
            break
        case 'minimap':
            this.toggleMinimap()
            break
        default:
            break
        }
        this.cancelEditMenuClose()
        this.editMenuOpen = false
    }

    toggleFileMenu (event?: MouseEvent): void {
        event?.stopPropagation()
        this.cancelFileMenuClose()
        this.cancelEditMenuClose()
        this.fileMenuOpen = !this.fileMenuOpen
        if (this.fileMenuOpen) {
            this.editMenuOpen = false
        }
    }

    private cancelFileMenuClose (): void {
        if (this.fileMenuHoverCloseTimer) {
            clearTimeout(this.fileMenuHoverCloseTimer)
            this.fileMenuHoverCloseTimer = undefined
        }
    }

    openFileMenuOnHover (): void {
        this.cancelFileMenuClose()
        this.cancelEditMenuClose()
        this.fileMenuOpen = true
        this.editMenuOpen = false
    }

    keepFileMenuOpenOnHover (): void {
        this.cancelFileMenuClose()
        this.fileMenuOpen = true
    }

    closeFileMenuOnLeave (): void {
        this.cancelFileMenuClose()
        this.fileMenuHoverCloseTimer = window.setTimeout(() => {
            this.fileMenuHoverCloseTimer = undefined
            this.fileMenuOpen = false
        }, this.menuHoverCloseDelayMs)
    }

    async handleFileAction (action: string): Promise<void> {
        switch (action) {
        case 'new':
            await this.newFile()
            break
        case 'newFolder':
            await this.createFolderInFolder(this.selectedFolderPath ?? this.folderRoot)
            break
        case 'open':
            await this.openFile()
            break
        case 'openLocal':
            await this.openLocalFile()
            break
        case 'openPath':
            await this.openFileByPathPrompt()
            break
        case 'save':
            await this.saveFile()
            break
        case 'saveAs':
            await this.saveFileAs()
            break
        case 'duplicate':
            {
                const selected = this.getSelectedActionTargets()
                if (selected.fileTargets.length || selected.folderTargets.length) {
                    await this.duplicateSelectionOnDisk(selected.fileTargets, selected.folderTargets)
                } else {
                    const activePath = this.getActiveDoc()?.path
                    if (!activePath) {
                        this.setError('Select at least one file or folder to duplicate.')
                        break
                    }
                    await this.duplicateSelectionOnDisk([activePath], [])
                }
            }
            break
        case 'move':
            {
                const selected = this.getSelectedActionTargets()
                if (selected.fileTargets.length || selected.folderTargets.length) {
                    await this.moveSelectionToFolderPrompt(selected.fileTargets, selected.folderTargets)
                } else {
                    const activePath = this.getActiveDoc()?.path
                    if (!activePath) {
                        this.setError('Select at least one file or folder to move.')
                        break
                    }
                    await this.moveSelectionToFolderPrompt([activePath], [])
                }
            }
            break
        case 'delete':
            {
                const selected = this.getSelectedActionTargets()
                if (selected.fileTargets.length || selected.folderTargets.length) {
                    await this.deleteSelectionOnDisk(selected.fileTargets, selected.folderTargets)
                } else {
                    await this.deleteActiveFileOnDisk()
                }
            }
            break
        case 'reopen':
            await this.reopenClosed()
            break
        default:
            break
        }
        this.cancelFileMenuClose()
        this.fileMenuOpen = false
    }

    toggleEOL (): void {
        const doc = this.getActiveDoc()
        if (!doc || !this.monaco) {
            return
        }
        const next = doc.model.getEOL() === '\r\n'
            ? this.monaco.editor.EndOfLineSequence.LF
            : this.monaco.editor.EndOfLineSequence.CRLF
        doc.model.setEOL(next)
        doc.eol = doc.model.getEOL() === '\r\n' ? 'CRLF' : 'LF'
        this.updateStatus()
    }

    setTabSize (value: number): void {
        const doc = this.getActiveDoc()
        if (!doc || !value) {
            return
        }
        const size = Math.max(1, Math.min(12, value))
        doc.tabSize = size
        doc.model.updateOptions({ tabSize: size })
        this.statusIndent = `${doc.insertSpaces ? 'Spaces' : 'Tabs'}:${doc.tabSize}`
    }

    async compareWithDisk (): Promise<void> {
        const doc = this.getActiveDoc()
        if (!doc?.path) {
            this.setError('File is not saved yet')
            return
        }
        try {
            const content = await fs.readFile(doc.path, 'utf8')
            this.enterDiff(doc, content, `${doc.name} (disk)`)
        } catch (err: any) {
            this.setError(`Compare failed: ${err?.message ?? err}`)
        }
    }

    async compareWithOtherDoc (docId: string): Promise<void> {
        const doc = this.getActiveDoc()
        const other = this.documents.find(d => d.id === docId)
        if (!doc || !other || docId === doc.id) {
            return
        }
        this.enterDiff(doc, other.model.getValue(), this.getDiffOptionLabel(other))
    }

    selectDiffTarget (docId: string): void {
        this.pendingDiffDocId = docId || null
    }

    diffWithSelected (): void {
        if (this.pendingDiffDocId) {
            this.compareWithOtherDoc(this.pendingDiffDocId)
        }
    }

    exitDiffMode (): void {
        this.viewMode = 'editor'
        this.diffEditor?.dispose?.()
        this.diffEditor = null
        this.diffOriginalModel?.dispose?.()
        this.diffOriginalModel = null
        this.statusMessage = ''
        this.layoutEditors()
    }

    toggleSplitView (targetDoc?: EditorDocument): void {
        if (!this.splitHost) {
            return
        }
        this.viewMode = 'editor'
        this.statusMessage = ''
        if (this.splitEditor) {
            this.splitEditor.dispose()
            this.splitEditor = null
            this.splitDocId = null
            this.focusedEditor = 'primary'
            this.layoutEditors()
            this.persistState()
            return
        }
        if (!this.monaco) {
            return
        }
        this.splitEditor = this.monaco.editor.create(this.splitHost.nativeElement, this.editorOptions())
        this.registerEditorShortcuts(this.splitEditor)
        this.splitEditor.onDidFocusEditorText(() => {
            this.focusedEditor = 'split'
            this.updateStatus()
        })
        const docToShow = targetDoc ?? this.pickSplitDoc()
        this.splitDocId = docToShow?.id ?? null
        this.splitEditor.setModel(docToShow?.model ?? null)
        if (docToShow) {
            this.setModelLanguage(docToShow)
        }
        this.layoutEditors()
        this.persistState()
    }

    selectSplitDoc (docId: string): void {
        if (!docId) {
            this.splitDocId = null
            this.splitEditor?.setModel(this.getActiveDoc()?.model ?? null)
            return
        }
        this.splitDocId = docId
        const doc = this.documents.find(d => d.id === docId)
        if (doc) {
            this.splitEditor?.setModel(doc.model)
        }
        this.persistState()
    }

    activateDoc (docId: string): void {
        const doc = this.documents.find(d => d.id === docId)
        if (!doc) {
            return
        }
        const docTreePath = doc.path ?? doc.tempPath ?? null
        this.setFileSelection(docTreePath ? [docTreePath] : [])
        this.setFolderSelection([])
        this.viewMode = 'editor'
        this.statusMessage = ''
        if (this.splitEditor && this.focusedEditor === 'split') {
            this.splitDocId = docId
            this.splitEditor.setModel(doc.model)
            this.setModelLanguage(doc)
            this.updateStatus()
            this.persistState()
            return
        }
        this.activeDocId = docId
        if (this.pendingDiffDocId === docId) {
            this.pendingDiffDocId = null
        }
        this.primaryEditor?.setModel(doc.model)
        if (!this.splitDocId) {
            this.splitEditor?.setModel(doc.model)
        }
        this.setModelLanguage(doc)
        this.updateTitle(doc)
        this.updateStatus()
        this.persistState()
    }

    async sendSelectionToTerminal (): Promise<void> {
        if (!(await this.ensureEditor())) {
            return
        }
        const model = this.getActiveDoc()?.model
        const editor = this.getActiveEditor()
        if (!model || !editor) {
            return
        }
        const selection = editor.getSelection()
        if (!selection) {
            return
        }
        const text = model.getValueInRange(selection)
        await this.writeTextToClipboard(text)
        window.dispatchEvent(new CustomEvent('tlink-send-to-terminal', { detail: { text } }))
    }

    async openFromClipboard (): Promise<void> {
        if (!(await this.ensureEditor())) {
            return
        }
        const text = await this.readTextFromClipboard()
        if (!text) {
            return
        }
        const name = this.nextUntitledName()
        const doc = this.createDocument({
            name,
            path: null,
            tempPath: this.allocateTempPath(name, this.selectedFolderPath),
            folderPath: this.selectedFolderPath,
            content: text,
            languageId: 'plaintext',
            eol: 'LF',
            tabSize: 4,
            insertSpaces: true,
        })
        this.documents.push(doc)
        this.activateDoc(doc.id)
        if (text.includes('\u001b[')) {
            this.applyAnsiDecorations(doc, text)
        }
        this.persistState()
    }

    private async initializeEditor (): Promise<void> {
        try {
            this.loadFoldersFromState()
        // Don't call updateTreeItems here - it will be called in ngAfterViewInit
        // to avoid ExpressionChangedAfterItHasBeenCheckedError
            const monaco = await this.loadMonaco()
            this.defineEditorThemes()
        if (!this.primaryHost) {
            throw new Error('Editor host unavailable')
        }

        if (!this.expandedFolders.size) {
            for (const f of this.folders) {
                this.expandedFolders.add(f.path)
            }
        }

            this.primaryEditor = monaco.editor.create(this.primaryHost.nativeElement, this.editorOptions())
            this.registerEditorShortcuts(this.primaryEditor)
            this.primaryEditor.onDidFocusEditorText(() => {
                this.focusedEditor = 'primary'
                this.updateStatus()
            })

            this.primaryEditor.onDidChangeCursorPosition(() => {
                this.updateStatus()
            })

            await this.restoreState()
            if (!this.documents.length) {
                await this.newFile()
            }
            if (this.pendingSplitDocId) {
                this.restoreSplitView()
            }
            this.loading = false
            this.applyTheme()
            this.layoutEditors()
            this.startAutosave()
            this.startExternalChangeWatcher()
            this.registerExternalHooks()
        } catch (err: any) {
            this.setError(`Failed to load editor: ${err?.message ?? err}`)
        }
    }

    private registerExternalHooks (): void {
        this.externalOpenHandler = (event: Event) => {
            const detail = (event as CustomEvent).detail ?? {}
            if (!detail?.content) {
                return
            }
            const doc = this.createDocument({
                name: detail.name ?? this.nextUntitledName(),
                path: null,
                content: detail.content,
                languageId: detail.languageId ?? 'plaintext',
                eol: 'LF',
                tabSize: 4,
                insertSpaces: true,
            })
            this.documents.push(doc)
            this.activateDoc(doc.id)
        }
        window.addEventListener('tlink-open-in-editor', this.externalOpenHandler)
    }

    private async ensureEditor (): Promise<boolean> {
        if (!this.primaryEditor) {
            await this.initializeEditor()
        }
        if (this.loadError) {
            this.setError(this.loadError ?? 'Editor not initialized')
            return false
        }
        return true
    }

    private editorOptions (): any {
        return {
            automaticLayout: true,
            minimap: { enabled: this.minimapEnabled },
            theme: this.currentThemeId(),
            wordWrap: this.wordWrapEnabled ? 'on' : 'off',
            lineNumbersMinChars: 2,
            lineDecorationsWidth: 8,
            glyphMargin: false,
            fontSize: this.fontSize,
            lineHeight: this.lineHeight,
            columnSelection: true,
            multiCursorModifier: 'alt',
            // Enable code completion features
            quickSuggestions: {
                other: true,
                comments: true,
                strings: true,
            },
            suggestOnTriggerCharacters: true,
            acceptSuggestionOnEnter: 'on',
            tabCompletion: 'on',
            wordBasedSuggestions: 'matchingDocuments',
            parameterHints: {
                enabled: true,
            },
            hover: {
                enabled: true,
            },
        }
    }

    private createDocument (snapshot: EditorDocumentSnapshot): EditorDocument {
        if (!this.monaco) {
            throw new Error('Monaco not ready')
        }
        const model = this.monaco.editor.createModel(snapshot.content, snapshot.languageId || 'plaintext')
        model.setEOL(snapshot.eol === 'CRLF' ? this.monaco.editor.EndOfLineSequence.CRLF : this.monaco.editor.EndOfLineSequence.LF)
        model.updateOptions({ tabSize: snapshot.tabSize, insertSpaces: snapshot.insertSpaces })
        const folderPath = snapshot.folderPath ?? (snapshot.path ? path.dirname(snapshot.path) : null)
        const doc: EditorDocument = {
            ...snapshot,
            folderPath,
            id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            model,
            isDirty: snapshot.isDirty ?? false,
            lastSavedValue: snapshot.lastSavedValue ?? snapshot.content,
            ansiDecorationIds: [],
            diskMtimeMs: null,
            diskSize: null,
            externalConflict: null,
        }
        model.onDidChangeContent(() => {
            doc.isDirty = doc.model.getValue() !== doc.lastSavedValue
            if (doc.languageId === 'plaintext') {
                const detected = this.detectLanguageFromContent(doc.model.getValue())
                if (detected && detected !== 'plaintext') {
                    this.monaco.editor.setModelLanguage(doc.model, detected)
                    doc.languageId = detected
                }
            }
            this.updateTitle(doc)
            this.updateStatus()
            this.queuePersistState()
            this.queueSaveTemp(doc)
        })
        model.onDidChangeOptions(() => {
            const opts = model.getOptions()
            doc.tabSize = opts.tabSize
            doc.insertSpaces = opts.insertSpaces
            this.updateStatus()
            this.queuePersistState()
        })
        // Auto-detect language when no extension (untitled)
        if (!snapshot.languageId || snapshot.languageId === 'plaintext') {
            const detected = this.pickLanguage(snapshot.name, snapshot.content)
            if (detected && detected !== 'plaintext') {
                this.monaco.editor.setModelLanguage(model, detected)
                doc.languageId = detected
            }
        }
        return doc
    }

    private openDocumentFromContent (name: string, filePath: string|null, content: string): void {
        if (filePath) {
            this.revealTreePath(filePath)
        }
        const existing = this.documents.find(d => this.isSameFsPath(d.path, filePath))
        if (existing) {
            if (!existing.isDirty && existing.model.getValue() !== content) {
                existing.lastSavedValue = content
                existing.model.setValue(content)
                existing.isDirty = false
                this.updateTitle(existing)
            }
            if (filePath) {
                this.refreshDocDiskSnapshot(existing, content)
            }
            this.syncOpenedFileScopes()
            this.activateDoc(existing.id)
            this.updateTreeItems()
            window.setTimeout(() => this.cdr.markForCheck(), 0)
            return
        }
        const doc = this.createDocument({
            name,
            path: filePath,
            tempPath: filePath ? null : this.allocateTempPath(name, this.selectedFolderPath),
            folderPath: this.getFolderForPath(filePath) ?? (filePath ? null : this.selectedFolderPath),
            content,
            languageId: this.pickLanguage(name, content),
            eol: content.includes('\r\n') ? 'CRLF' : 'LF',
            tabSize: 4,
            insertSpaces: true,
        })
        doc.lastSavedValue = content
        this.refreshDocDiskSnapshot(doc, content)
        this.documents.push(doc)
        this.syncOpenedFileScopes()
        this.activateDoc(doc.id)
        if (content.includes('\u001b[')) {
            this.applyAnsiDecorations(doc, content)
        }
        if (filePath) {
            this.rememberRecent(filePath)
        }
        this.persistState()
        this.updateTreeItems()
        window.setTimeout(() => this.cdr.markForCheck(), 0)
    }

    private pickLanguage (fileName: string, content?: string): string {
        const ext = (fileName.split('.').pop() || '').toLowerCase()
        const lang = this.monaco?.languages.getLanguages().find(l => l.extensions?.includes('.' + ext))
        if (lang?.id) {
            return lang.id
        }
        return this.detectLanguageFromContent(content ?? '') || 'plaintext'
    }

    private detectLanguageFromContent (content: string): string {
        const trimmed = content.trimStart()
        const firstLine = trimmed.split('\n')[0] || ''

        if (firstLine.startsWith('#!')) {
            if (firstLine.includes('python')) return 'python'
            if (firstLine.includes('bash') || firstLine.includes('sh')) return 'shell'
            if (firstLine.includes('node')) return 'javascript'
        }

        // JSON detection
        if ((trimmed.startsWith('{') || trimmed.startsWith('['))) {
            try {
                JSON.parse(trimmed)
                return 'json'
            } catch (_) {
                // ignore
            }
        }

        // YAML detection
        if (/^---\s/.test(trimmed) || /^[\w-]+:\s/.test(trimmed)) {
            return 'yaml'
        }

        // Python cues
        if (/^\s*import\s+\w+/m.test(content) || /def\s+\w+\(/.test(content)) {
            return 'python'
        }

        // Shell cues
        if (/^\s*(sudo|echo|cd|ls|export)\b/m.test(content) && content.includes('\n')) {
            return 'shell'
        }

        // JS/TS cues
        if (/^\s*(import|export)\s+/.test(content) || /function\s+\w+\(/.test(content)) {
            return 'javascript'
        }

        // HTML
        if (/<(html|body|div|span|head|script|style)[\s>]/i.test(content)) {
            return 'html'
        }

        // CSS
        if (/\.\w+\s*\{[^}]*\}/.test(content)) {
            return 'css'
        }

        return 'plaintext'
    }

    private async saveDocument (doc: EditorDocument): Promise<boolean> {
        const content = doc.model.getValue()
        const data = new TextEncoder().encode(content)

        const initialPath = doc.path
        if (initialPath) {
            const initialKey = this.getFsPathKey(initialPath)
            if (initialKey && this.deletingPathKeys.has(initialKey)) {
                return false
            }
            try {
                await fs.mkdir(path.dirname(initialPath), { recursive: true })
                if (!doc.path || !this.isSameFsPath(doc.path, initialPath)) {
                    return false
                }
                const currentKey = this.getFsPathKey(doc.path)
                if (currentKey && this.deletingPathKeys.has(currentKey)) {
                    return false
                }
                await fs.writeFile(doc.path, data)
                doc.isDirty = false
                doc.lastSavedValue = content
                this.refreshDocDiskSnapshot(doc, content)
                this.updateTitle(doc)
                this.rememberRecent(doc.path)
                if (doc.tempPath) {
                    await this.deleteTemp(doc.tempPath)
                    doc.tempPath = null
                }
                this.persistState()
                return true
            } catch (err: any) {
                this.setError(`Failed to save file: ${err?.message ?? err}`)
                return false
            }
        }

        const download = await this.platform.startDownload(doc.name || 'untitled.txt', 0o644, data.length)
        if (!download) {
            return false
        }

        try {
            await download.write(data)
            download.close()
            doc.isDirty = false
            doc.lastSavedValue = content
            const newPath = (download as any).filePath ?? null
            if (newPath) {
                doc.path = newPath
                doc.name = path.basename(newPath)
                doc.folderPath = this.getFolderForPath(newPath) ?? doc.folderPath
                this.rememberRecent(newPath)
                this.setModelLanguage(doc)
                this.refreshDocDiskSnapshot(doc, content)
            }
            if (doc.tempPath) {
                await this.deleteTemp(doc.tempPath)
                doc.tempPath = null
            }
            this.updateTitle(doc)
            this.syncOpenedFileScopes()
            this.persistState()
            return true
        } catch (err: any) {
            this.setError(`Failed to save file: ${err?.message ?? err}`)
            return false
        }
    }

    private snapshotDocument (doc: EditorDocument): EditorDocumentSnapshot {
        return {
            name: doc.name,
            path: doc.path,
            tempPath: doc.tempPath ?? null,
            folderPath: this.resolveDocFolder(doc),
            content: doc.model.getValue(),
            languageId: this.monaco?.editor.getModelLanguageId?.(doc.model) ?? 'plaintext',
            eol: doc.model.getEOL() === '\r\n' ? 'CRLF' : 'LF',
            tabSize: doc.tabSize,
            insertSpaces: doc.insertSpaces,
            isDirty: doc.isDirty,
            lastSavedValue: doc.lastSavedValue,
        }
    }

    private async confirmDiscard (doc: EditorDocument): Promise<boolean> {
        if (!doc.isDirty) {
            return true
        }
        return this.confirmAction(
            `Close ${doc.name} without saving?`,
            'Unsaved changes will be lost.',
            'Discard',
        )
    }

    private updateStatus (): void {
        const doc = this.getActiveDoc()
        const editor = this.getActiveEditor()
        if (!editor || !this.monaco || !doc) {
            this.statusLineCol = ''
            this.statusLanguage = ''
            this.statusEOL = ''
            this.statusIndent = ''
            this.statusWrap = ''
            this.breadcrumbs = []
            return
        }
        const pos = editor.getPosition?.() ?? editor.getModifiedEditor?.()?.getPosition?.()
        this.statusLineCol = pos ? `Ln ${pos.lineNumber}, Col ${pos.column}` : ''
        const lang = this.monaco.editor.getModelLanguageId?.(doc.model) ?? ''
        this.statusLanguage = lang || ''
        this.statusEOL = doc.model.getEOL() === '\r\n' ? 'CRLF' : 'LF'
        this.statusIndent = `${doc.insertSpaces ? 'Spaces' : 'Tabs'}:${doc.tabSize}`
        this.statusWrap = this.wordWrapEnabled ? 'Wrap:on' : 'Wrap:off'
        this.breadcrumbs = this.buildBreadcrumbs(doc, pos?.lineNumber ?? 0, pos?.column ?? 0)
    }

    private buildBreadcrumbs (doc: EditorDocument, line: number, column: number): string[] {
        const parts = doc.path ? doc.path.split(path.sep).filter(Boolean) : [doc.name]
        if (line) {
            const word = doc.model.getWordAtPosition({ lineNumber: line, column })?.word
            if (word) {
                parts.push(word)
            }
        }
        return parts
    }

    beginSidebarResize (event: MouseEvent): void {
        event.preventDefault()
        this.resizingSidebar = true
        this.resizeStartX = event.clientX
        this.resizeStartWidth = this.sidebarWidth
    }

    private resolveMonacoBase (): string {
        const candidates: string[] = []
        const seen = new Set<string>()
        const hasMonaco = (base: string): boolean => {
            try {
                return (
                    fsSync.existsSync(path.join(base, 'vs', 'loader.js')) &&
                    fsSync.existsSync(path.join(base, 'vs', 'editor', 'editor.main.js'))
                )
            } catch {
                return false
            }
        }
        const addCandidate = (candidate?: string|null): void => {
            if (!candidate) {
                return
            }
            const normalized = candidate.replace(/\\/g, '/')
            if (!normalized || seen.has(normalized)) {
                return
            }
            seen.add(normalized)
            candidates.push(normalized)
        }
        const addFileUrlCandidate = (urlValue?: string|null): void => {
            if (!urlValue || typeof urlValue !== 'string') {
                return
            }
            try {
                const parsed = new URL(urlValue)
                if (parsed.protocol !== 'file:') {
                    return
                }
                let filePath = decodeURIComponent(parsed.pathname)
                if (process.platform === 'win32' && filePath.startsWith('/')) {
                    filePath = filePath.slice(1)
                }
                addCandidate(path.join(path.dirname(filePath), 'assets', 'monaco'))
            } catch {
                // ignore malformed URLs
            }
        }

        if (typeof process !== 'undefined' && (process as any).cwd) {
            const cwd = (process as any).cwd()
            addCandidate(path.join(cwd, 'app', 'dist', 'assets', 'monaco'))
            addCandidate(path.join(cwd, 'web', 'dist', 'assets', 'monaco'))
            addCandidate(path.join(cwd, 'dist', 'assets', 'monaco'))
            addCandidate(path.join(cwd, 'assets', 'monaco'))
            addCandidate(path.join(cwd, 'node_modules', 'monaco-editor', 'min'))
        }

        const resourcesPath = (process as any)?.resourcesPath
        if (resourcesPath) {
            addCandidate(path.join(resourcesPath, 'app.asar', 'dist', 'assets', 'monaco'))
            addCandidate(path.join(resourcesPath, 'app.asar.unpacked', 'dist', 'assets', 'monaco'))
            addCandidate(path.join(resourcesPath, 'app', 'dist', 'assets', 'monaco'))
            addCandidate(path.join(resourcesPath, 'web', 'dist', 'assets', 'monaco'))
            addCandidate(path.join(resourcesPath, 'assets', 'monaco'))
            addCandidate(path.join(resourcesPath, 'app.asar', 'assets', 'monaco'))
            addCandidate(path.join(resourcesPath, 'app.asar.unpacked', 'assets', 'monaco'))
            addCandidate(path.join(resourcesPath, 'node_modules', 'monaco-editor', 'min'))
        }

        addFileUrlCandidate((document.currentScript as any)?.src ?? null)
        addFileUrlCandidate((document as any)?.baseURI ?? null)
        addFileUrlCandidate((window as any)?.location?.href ?? null)

        const found = candidates.find(base => hasMonaco(base))
        if (found) {
            return found
        }

        if (resourcesPath) {
            return path.join(resourcesPath, 'assets', 'monaco').replace(/\\/g, '/')
        }

        return 'assets/monaco'
    }

    private loadMonaco (): Promise<Monaco> {
        if (this.monaco) {
            return Promise.resolve(this.monaco)
        }
        if (this.monacoPromise) {
            return this.monacoPromise
        }

        this.monacoPromise = new Promise((resolve, reject) => {
            const finish = () => {
                const globalMonaco = (window as any).monaco as Monaco
                if (!globalMonaco) {
                    reject(new Error('Monaco not available'))
                    return
                }
                this.monaco = globalMonaco
                this.configureLanguageDefaults()
                resolve(globalMonaco)
            }

            const configureLoader = (amdRequire: any): boolean => {
                if (!amdRequire?.config) {
                    return false
                }
                (window as any).MonacoEnvironment = {
                    baseUrl: `${this.monacoBase}/vs`,
                    getWorkerUrl: () => `${this.monacoBase}/vs/base/worker/workerMain.js`,
                }
                amdRequire.config({
                    paths: {
                        vs: `${this.monacoBase}/vs`,
                    },
                })
                amdRequire(['vs/editor/editor.main'], () => finish(), reject)
                return true
            }

            const existingRequire = (window as any).require
            const existingMonacoAmd = this.monacoAmdRequire ?? (window as any).monacoAmdRequire
            if (existingMonacoAmd?.config) {
                try {
                    if (configureLoader(existingMonacoAmd)) {
                        return
                    }
                } catch (err) {
                    reject(err)
                    return
                }
            }

            if (existingRequire?.config && existingRequire?.toUrl) {
                try {
                    this.monacoAmdRequire = existingRequire
                    ;(window as any).monacoAmdRequire = existingRequire
                    if (configureLoader(existingRequire)) {
                        return
                    }
                } catch (err) {
                    reject(err)
                    return
                }
            }

            const previousRequire = (window as any).require
            const previousModule = (window as any).module
            ;(window as any).require = undefined
            ;(window as any).module = undefined

            const restoreGlobals = () => {
                if (previousRequire) {
                    (window as any).require = previousRequire
                } else {
                    delete (window as any).require
                }
                if (previousModule) {
                    (window as any).module = previousModule
                } else {
                    delete (window as any).module
                }
            }

        const script = document.createElement('script')
        script.src = `${this.monacoBase}/vs/loader.js`
        script.async = true
        script.onload = () => {
            try {
                    const amdRequire = (window as any).require
                    this.monacoAmdRequire = amdRequire
                    ;(window as any).monacoAmdRequire = amdRequire
                    if (!configureLoader(amdRequire)) {
                        reject(new Error('AMD loader is not ready'))
                        return
                    }
                } catch (err) {
                    reject(err)
                } finally {
                    restoreGlobals()
                }
            }
            script.onerror = () => {
                restoreGlobals()
                reject(new Error('Failed to load Monaco loader script'))
            }
            document.body.appendChild(script)
        })

        return this.monacoPromise
    }

    @HostListener('document:keydown', ['$event'])
    onKeydown (event: KeyboardEvent): void {
        if (!this.treeKeyboardActive || event.defaultPrevented) {
            return
        }
        const target = event.target as HTMLElement|null
        if (this.isTextInputLikeTarget(target) || this.getActiveEditor()?.hasTextFocus?.()) {
            return
        }
        const selection = this.getSelectedActionTargets()
        if (!selection.fileTargets.length && !selection.folderTargets.length) {
            return
        }

        const ctrlOrMeta = event.ctrlKey || event.metaKey
        const key = (event.key ?? '').toLowerCase()

        if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault()
            void this.deleteSelectionOnDisk(selection.fileTargets, selection.folderTargets)
            return
        }

        if (ctrlOrMeta && event.shiftKey && key === 'd') {
            event.preventDefault()
            void this.duplicateSelectionOnDisk(selection.fileTargets, selection.folderTargets)
            return
        }

        if (ctrlOrMeta && event.shiftKey && key === 'm') {
            event.preventDefault()
            void this.moveSelectionToFolderPrompt(selection.fileTargets, selection.folderTargets)
        }
    }

    private isTextInputLikeTarget (target: HTMLElement|null): boolean {
        if (!target) {
            return false
        }
        const tag = (target.tagName || '').toLowerCase()
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button') {
            return true
        }
        if (target.getAttribute?.('contenteditable') === 'true') {
            return true
        }
        return !!target.closest?.('input, textarea, select, [contenteditable="true"], .rename-input')
    }

    private configureLanguageDefaults (): void {
        if (!this.monaco) {
            return
        }
        this.monaco.languages.typescript?.javascriptDefaults.setDiagnosticsOptions({
            noSemanticValidation: false,
            noSyntaxValidation: false,
        })
        this.monaco.languages.typescript?.typescriptDefaults.setDiagnosticsOptions({
            noSemanticValidation: false,
            noSyntaxValidation: false,
        })
    }

    private isCancellationErrorLike (error: unknown, depth = 0): boolean {
        if (!error || depth > 4) {
            return false
        }
        if (typeof error === 'string') {
            const message = error.trim().toLowerCase()
            return message === 'canceled'
                || message === 'cancelled'
                || message === 'canceled: canceled'
                || message === 'cancelled: cancelled'
        }
        if (typeof error !== 'object') {
            return false
        }
        const err = error as any
        const name = typeof err.name === 'string' ? err.name.trim().toLowerCase() : ''
        const message = typeof err.message === 'string' ? err.message.trim().toLowerCase() : ''
        if (
            name === 'canceled'
            || name === 'cancelled'
            || name.includes('cancellation')
            || message === 'canceled'
            || message === 'cancelled'
            || message === 'canceled: canceled'
            || message === 'cancelled: cancelled'
        ) {
            return true
        }
        const nested = err.ngOriginalError ?? err.originalError ?? err.rejection ?? err.reason ?? err.error
        if (!nested || nested === err) {
            return false
        }
        return this.isCancellationErrorLike(nested, depth + 1)
    }

    private applyTheme (): void {
        if (!this.monaco) {
            return
        }
        try {
            this.defineEditorThemes()
            this.monaco.editor.setTheme(this.currentThemeId())
        } catch (error) {
            if (!this.isCancellationErrorLike(error)) {
                console.error('Failed to apply editor theme:', error)
            }
        }
    }

    private async ensureDocumentOnDisk (doc: EditorDocument): Promise<string|null> {
        if (doc.path) {
            const ok = await this.saveDocument(doc)
            return ok ? doc.path : null
        }
        const target = doc.tempPath ?? this.allocateTempPath(doc.name || 'untitled', doc.folderPath ?? this.selectedFolderPath)
        doc.tempPath = target
        try {
            await fs.mkdir(path.dirname(target), { recursive: true })
            await fs.writeFile(target, doc.model.getValue(), 'utf8')
            return target
        } catch {
            return null
        }
    }

    private getActiveSelectionText (): string|null {
        const editor = this.getActiveEditor()
        const model = this.getActiveDoc()?.model
        if (!editor || !model) {
            return null
        }
        const selection = editor.getSelection?.()
        if (!selection) {
            return null
        }
        // Monaco selection is empty when start==end
        if (
            selection.startLineNumber === selection.endLineNumber &&
            selection.startColumn === selection.endColumn
        ) {
            return null
        }
        const text = model.getValueInRange(selection)
        return text?.trim?.() ? text : null
    }

    private allocateTempPathForSnippet (baseName: string): string {
        // Keep extension so buildRunCommand can pick the right runner (python/node/bash/etc.)
        const compactName = this.toCompactAutoFileName(baseName || 'snippet.txt')
        const ext = path.extname(compactName) || '.txt'
        const stem = path.basename(compactName, ext) || 'snippet'
        const tempDir = this.getTempDir()
        let candidate = path.join(tempDir, `${stem}${ext}`)
        let index = 1
        while (fsSync.existsSync(candidate) && index < 1000) {
            candidate = path.join(tempDir, `${stem}-${index}${ext}`)
            index++
        }
        if (fsSync.existsSync(candidate)) {
            candidate = path.join(tempDir, `${stem}-${Date.now().toString(36)}${ext}`)
        }
        return candidate
    }

    private async ensureSnippetOnDisk (doc: EditorDocument, snippet: string): Promise<string|null> {
        const filePath = this.allocateTempPathForSnippet(doc.name || 'snippet.txt')
        try {
            await fs.mkdir(path.dirname(filePath), { recursive: true })
            await fs.writeFile(filePath, snippet, 'utf8')
            return filePath
        } catch {
            return null
        }
    }

    private buildRunCommand (doc: EditorDocument, filePath: string): string {
        const ext = (path.extname(doc.name || '') || '').toLowerCase()
        switch (ext) {
        case '.py':
            return `python3 "${filePath}"`
        case '.js':
        case '.mjs':
        case '.cjs':
            return `node "${filePath}"`
        case '.ts':
            return `ts-node "${filePath}"`
        case '.sh':
            return `bash "${filePath}"`
        default:
            return `bash "${filePath}"`
        }
    }

    async runActiveFile (): Promise<void> {
        if (!(await this.ensureEditor())) {
            return
        }
        const doc = this.getActiveDoc()
        if (!doc) {
            return
        }
        const selection = this.getActiveSelectionText()
        const filePath = selection
            ? await this.ensureSnippetOnDisk(doc, selection)
            : await this.ensureDocumentOnDisk(doc)
        if (!filePath) {
            this.setError('Save the file before running.')
            return
        }
        const cmd = this.buildRunCommand(doc, filePath)
        const terminal = await this.ensureRunTerminal(path.dirname(filePath))
        if (!terminal) {
            this.setError('Unable to open run terminal')
            return
        }
        this.sendToTerminal(terminal, `${cmd}\n`)
        this.statusMessage = `Running in terminal: ${cmd}`
        this.updateStatus()
    }

    async closeRunTerminal (): Promise<void> {
        const tab = this.runTerminalTab as (BaseTabComponent|null)
        if (!tab) {
            return
        }
        // Clear reference early to avoid re-entrancy
        this.runTerminalTab = null
        try {
            tab.destroy()
        } catch (err) {
            console.warn('Failed to close run terminal tab', err)
        }
    }

    private pickSplitDoc (): EditorDocument|null {
        if (this.pendingSplitDocId) {
            const match = this.documents.find(d => d.id === this.pendingSplitDocId)
            this.pendingSplitDocId = null
            if (match) {
                return match
            }
        }
        const activeDoc = this.getActiveDoc()
        const otherDoc = this.documents.find(d => d.id !== activeDoc?.id)
        if (otherDoc) {
            return otherDoc
        }
        if (activeDoc) {
            const name = `${activeDoc.name} copy`
            const doc = this.createDocument({
                name,
                path: null,
                tempPath: this.allocateTempPath(name, this.selectedFolderPath),
                folderPath: this.selectedFolderPath,
                content: activeDoc.model.getValue(),
                languageId: activeDoc.languageId,
                eol: activeDoc.eol,
                tabSize: activeDoc.tabSize,
                insertSpaces: activeDoc.insertSpaces,
            })
            doc.isDirty = true
            this.documents.push(doc)
            return doc
        }
        const name = this.nextUntitledName()
        const doc = this.createDocument({
            name,
            path: null,
            tempPath: this.allocateTempPath(name, this.selectedFolderPath),
            folderPath: this.selectedFolderPath,
            content: '',
            languageId: 'plaintext',
            eol: 'LF',
            tabSize: 4,
            insertSpaces: true,
        })
        this.documents.push(doc)
        return doc
    }

    private currentThemeId (): string {
        if (this.themeMode === 'light') {
            return 'tlink-vs'
        }
        if (this.themeMode === 'dark') {
            return 'tlink-vs-dark'
        }
        if (this.themeMode === 'hc') {
            return 'tlink-hc'
        }
        if (this.themeMode === 'solarized-light') {
            return 'tlink-solarized-light'
        }
        if (this.themeMode === 'solarized-dark') {
            return 'tlink-solarized-dark'
        }
        if (this.themeMode === 'dracula') {
            return 'tlink-dracula'
        }
        if (this.themeMode === 'monokai') {
            return 'tlink-monokai'
        }
        if (this.themeMode === 'nord') {
            return 'tlink-nord'
        }
        return this.platform.getTheme() === 'dark' ? 'tlink-vs-dark' : 'tlink-vs'
    }

    private restoreSplitView (): void {
        if (!this.pendingSplitDocId) {
            return
        }
        if (!this.splitHost || !this.monaco) {
            this.pendingSplitDocId = null
            return
        }
        if (this.splitEditor) {
            return
        }
        this.viewMode = 'editor'
        this.statusMessage = ''
        this.splitEditor = this.monaco.editor.create(this.splitHost.nativeElement, this.editorOptions())
        this.registerEditorShortcuts(this.splitEditor)
        this.splitEditor.onDidFocusEditorText(() => {
            this.focusedEditor = 'split'
            this.updateStatus()
        })
        const targetDoc = this.pickSplitDoc()
        this.splitDocId = targetDoc?.id ?? null
        this.splitEditor.setModel(targetDoc?.model ?? null)
        if (targetDoc) {
            this.setModelLanguage(targetDoc)
        }
        this.layoutEditors()
        this.persistState()
    }

    private setModelLanguage (doc: EditorDocument): void {
        if (!this.monaco || !doc?.model) {
            return
        }
        const lang = this.pickLanguage(doc.name, doc.model.getValue())
        this.monaco.editor.setModelLanguage(doc.model, lang)
        doc.languageId = lang
    }

    private registerEditorShortcuts (editor: any): void {
        if (!this.monaco || !editor) {
            return
        }
        const { KeyMod, KeyCode } = this.monaco
        editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyZ, () => this.runUndo())
        editor.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyZ, () => this.runRedo())
        editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyY, () => this.runRedo())
        editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyX, () => this.cutSelection())
        editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyC, () => this.copySelection())
        editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyV, () => this.pasteClipboard())
        editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyA, () => this.selectAllText())
        editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyS, () => this.saveFile())
        editor.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyS, () => this.saveFileAs())
        editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyP, () => this.openQuickOpen())
        editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyO, () => this.openFile())
        editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyN, () => this.newFile())
        editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyF, () => this.runFind())
        editor.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyF, () => this.runReplace())
        editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyG, () => this.goToLine())
        editor.addCommand(KeyMod.CtrlCmd | KeyCode.Enter, () => this.runActiveFile())
    }

    private nextUntitledName (folderPath?: string|null): string {
        const targetFolder = folderPath ?? this.selectedFolderPath ?? this.folderRoot
        let nextSeq = 1

        const collect = (rawName: string|null|undefined): void => {
            if (!rawName) {
                return
            }
            const match = /^Untitled-(\d+)$/i.exec(path.basename(rawName.trim()))
            if (!match) {
                return
            }
            const seq = Number.parseInt(match[1], 10)
            if (!Number.isNaN(seq) && seq >= nextSeq) {
                nextSeq = seq + 1
            }
        }

        for (const doc of this.documents) {
            collect(doc.name)
        }

        try {
            if (fsSync.existsSync(targetFolder) && fsSync.statSync(targetFolder).isDirectory()) {
                for (const name of fsSync.readdirSync(targetFolder)) {
                    collect(name)
                }
            }
        } catch {
            // ignore folder scan errors
        }

        while (nextSeq < 100000) {
            const candidate = `Untitled-${nextSeq}`
            const usedByDoc = this.documents.some(doc => doc.name === candidate)
            const usedOnDisk = fsSync.existsSync(path.join(targetFolder, candidate))
            if (!usedByDoc && !usedOnDisk) {
                return candidate
            }
            nextSeq++
        }

        return `Untitled-${Date.now()}`
    }

    private layoutEditors (): void {
        this.primaryEditor?.layout()
        this.splitEditor?.layout()
        this.diffEditor?.layout?.()
    }

    private startAutosave (): void {
        if (this.autosaveTimer) {
            clearInterval(this.autosaveTimer)
        }
        if (!this.autosaveEnabled) {
            return
        }
        this.autosaveTimer = window.setInterval(() => this.autosaveTick(), this.autosaveIntervalMs)
    }

    private async autosaveTick (): Promise<void> {
        for (const doc of this.documents) {
            if (!doc.isDirty) {
                continue
            }
            if (doc.path) {
                await this.saveDocument(doc)
                continue
            }

            if (!doc.tempPath) {
                const autosaveFolder = doc.folderPath ?? this.selectedFolderPath ?? this.folderRoot
                doc.folderPath = doc.folderPath ?? autosaveFolder
                doc.tempPath = this.allocateTempPath(doc.name || 'untitled', autosaveFolder)
            }

            await this.saveTemp(doc)
            this.queuePersistState()
        }
    }

    private refreshDocDiskSnapshot (doc: EditorDocument, knownContent?: string): void {
        if (!doc.path) {
            doc.diskMtimeMs = null
            doc.diskSize = null
            return
        }
        try {
            const stat = fsSync.statSync(doc.path)
            if (!stat.isFile()) {
                return
            }
            doc.diskMtimeMs = stat.mtimeMs
            doc.diskSize = stat.size
            if (knownContent !== undefined) {
                doc.lastSavedValue = knownContent
            }
            doc.externalConflict = null
        } catch {
            // Ignore missing files while editor state settles.
        }
    }

    private startExternalChangeWatcher (): void {
        if (this.externalWatchTimer) {
            clearInterval(this.externalWatchTimer)
        }
        this.externalWatchTimer = window.setInterval(() => {
            void this.checkExternalChangeTick()
        }, this.externalWatchIntervalMs)
    }

    private async checkExternalChangeTick (): Promise<void> {
        if (this.externalWatchBusy) {
            return
        }
        this.externalWatchBusy = true
        let changed = false
        try {
            for (const doc of this.documents) {
                if (!doc.path) {
                    continue
                }
                const pathKey = this.getFsPathKey(doc.path)
                if (pathKey && this.deletingPathKeys.has(pathKey)) {
                    continue
                }
                let stat: fsSync.Stats
                try {
                    stat = fsSync.statSync(doc.path)
                    if (!stat.isFile()) {
                        continue
                    }
                } catch {
                    continue
                }

                const mtimeMs = stat.mtimeMs
                const size = stat.size
                if (doc.diskMtimeMs === mtimeMs && doc.diskSize === size) {
                    continue
                }

                let diskContent = ''
                try {
                    diskContent = await fs.readFile(doc.path, 'utf8')
                } catch {
                    continue
                }

                const modelValue = doc.model.getValue()
                if (diskContent === modelValue) {
                    doc.isDirty = false
                    doc.lastSavedValue = diskContent
                    doc.externalConflict = null
                    doc.diskMtimeMs = mtimeMs
                    doc.diskSize = size
                    this.updateTitle(doc)
                    changed = true
                    continue
                }

                if (doc.isDirty) {
                    doc.externalConflict = {
                        diskContent,
                        diskMtimeMs: mtimeMs,
                        diskSize: size,
                    }
                    doc.diskMtimeMs = mtimeMs
                    doc.diskSize = size
                    changed = true
                    continue
                }

                doc.externalConflict = null
                doc.lastSavedValue = diskContent
                doc.diskMtimeMs = mtimeMs
                doc.diskSize = size
                doc.model.setValue(diskContent)
                doc.isDirty = false
                this.updateTitle(doc)
                if (doc.id === this.activeDocId || doc.id === this.splitDocId) {
                    this.statusMessage = `Reloaded ${doc.name} from disk`
                    this.updateStatus()
                }
                changed = true
            }
        } finally {
            this.externalWatchBusy = false
        }
        if (changed) {
            this.cdr.markForCheck()
        }
    }

    async reloadActiveDocFromConflict (): Promise<void> {
        const doc = this.activeExternalConflictDoc
        if (!doc?.externalConflict) {
            return
        }
        const conflict = doc.externalConflict
        doc.lastSavedValue = conflict.diskContent
        doc.externalConflict = null
        doc.diskMtimeMs = conflict.diskMtimeMs
        doc.diskSize = conflict.diskSize
        doc.model.setValue(conflict.diskContent)
        doc.isDirty = false
        this.updateTitle(doc)
        this.statusMessage = `Reloaded ${doc.name} from disk`
        this.updateStatus()
        this.persistState()
        this.cdr.markForCheck()
    }

    keepActiveDocLocalChanges (): void {
        const doc = this.activeExternalConflictDoc
        if (!doc?.externalConflict) {
            return
        }
        doc.diskMtimeMs = doc.externalConflict.diskMtimeMs
        doc.diskSize = doc.externalConflict.diskSize
        doc.externalConflict = null
        this.statusMessage = `Keeping local changes for ${doc.name}`
        this.updateStatus()
        this.persistState()
        this.cdr.markForCheck()
    }

    compareActiveDocWithConflictDisk (): void {
        const doc = this.activeExternalConflictDoc
        if (!doc?.externalConflict) {
            return
        }
        this.enterDiff(doc, doc.externalConflict.diskContent, `${doc.name} (disk changed)`)
    }

    private getAutosaveTargetFolder (): string {
        const selectedFile = this.getSelectedFilePathsFromTree()[0]
        if (selectedFile) {
            return path.dirname(selectedFile)
        }
        return this.selectedFolderPath ?? this.folderRoot
    }

    async newFile (): Promise<void> {
        if (!(await this.ensureEditor())) {
            return
        }
        const targetFolder = this.getAutosaveTargetFolder()
        const name = this.nextUntitledName(targetFolder)
        const doc = this.createDocument({
            name,
            path: null,
            tempPath: this.allocateTempPath(name, targetFolder),
            folderPath: targetFolder,
            content: '',
            languageId: 'plaintext',
            eol: 'LF',
            tabSize: 4,
            insertSpaces: true,
        })
        this.documents.push(doc)
        this.activateDoc(doc.id)
        this.persistState()
        this.updateTreeItems()
        window.setTimeout(() => this.cdr.markForCheck(), 0)
    }

    private queuePersistState (): void {
        if (this.persistStateTimer) {
            clearTimeout(this.persistStateTimer)
        }
        this.persistStateTimer = window.setTimeout(() => {
            this.persistStateTimer = undefined
            this.persistState()
        }, 250)
    }

    private persistState (): void {
        this.syncOpenedFileScopes()
        this.persistFolders()
        const docState = this.documents.map(doc => this.snapshotDocument(doc))
        const active = this.activeDocId
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('codeEditor.recent', JSON.stringify(this.recentFiles.slice(0, 10)))
            localStorage.setItem('codeEditor.docs', JSON.stringify(docState))
            localStorage.setItem('codeEditor.active', active ?? '')
            localStorage.setItem('codeEditor.themeMode', this.themeMode)
            localStorage.setItem('codeEditor.themeColor', this.editorThemeColor)
            localStorage.setItem('codeEditor.split', this.splitEditor ? '1' : '')
            localStorage.setItem('codeEditor.splitDoc', this.splitDocId ?? '')
            localStorage.setItem('codeEditor.sidebarWidth', String(this.sidebarWidth))
            localStorage.setItem('codeEditor.wordWrap', this.wordWrapEnabled ? '1' : '')
            localStorage.setItem('codeEditor.minimap', this.minimapEnabled ? '1' : '')
            localStorage.setItem('codeEditor.fontSize', String(this.fontSize))
            localStorage.setItem('codeEditor.lineHeight', String(this.lineHeight))
            localStorage.setItem('codeEditor.autosave', this.autosaveEnabled ? '1' : '')
        }
        // best-effort temp save for untitled docs
        for (const doc of this.documents) {
            if (!doc.path && doc.tempPath) {
                this.queueSaveTemp(doc)
            }
        }
        this.recoveryStateChangedHint.next()
    }

    private allocateTempPath (name: string, folderPath?: string|null): string {
        const base = folderPath ?? this.getTempDir()
        const compactName = this.toCompactAutoFileName(name || 'untitled.txt')
        const ext = path.extname(compactName)
        const stem = path.basename(compactName, ext) || 'untitled'
        let candidate = path.join(base, compactName)
        let index = 1
        while (fsSync.existsSync(candidate) && index < 1000) {
            candidate = path.join(base, `${stem}-${index}${ext}`)
            index++
        }
        if (fsSync.existsSync(candidate)) {
            candidate = path.join(base, `${stem}-${Date.now().toString(36)}${ext}`)
        }
        return candidate
    }

    private toCompactAutoFileName (rawName: string): string {
        const baseNameRaw = path.basename((rawName ?? '').trim() || 'untitled.txt')
        const cleaned = baseNameRaw
            .replace(/[\\/\u0000-\u001f]/g, '_')
            .replace(/^\.+$/, 'untitled')
            .trim() || 'untitled.txt'
        // Strip previous auto-generated prefix like "<timestamp>-<token>-"
        const withoutGeneratedPrefix = cleaned.replace(/^\d{10,}-[a-f0-9]{6,}-/i, '')
        const ext = path.extname(withoutGeneratedPrefix).slice(0, 20)
        let stem = path.basename(withoutGeneratedPrefix, ext)
        if (!stem) {
            stem = 'untitled'
        }
        const maxStem = 48
        if (stem.length > maxStem) {
            const head = stem.slice(0, 28)
            const tail = stem.slice(-12)
            stem = `${head}~${tail}`
        }
        return `${stem}${ext}`
    }

    private getTempDir (): string {
        return this.resolveStudioDir('tlink-studio-temp', 'code-editor-temp')
    }

    private queueSaveTemp (doc: EditorDocument): void {
        if (!doc.tempPath) {
            return
        }
        const existing = this.tempSaveTimers.get(doc.id)
        if (existing) {
            clearTimeout(existing)
        }
        const timer = window.setTimeout(() => {
            this.tempSaveTimers.delete(doc.id)
            if (!this.documents.some(d => d.id === doc.id)) {
                return
            }
            this.saveTemp(doc).catch(() => null)
        }, 500)
        this.tempSaveTimers.set(doc.id, timer)
    }

    private async saveTemp (doc: EditorDocument): Promise<void> {
        if (!doc.tempPath) {
            return
        }
        const tempPath = doc.tempPath
        let existedBefore = false
        try {
            existedBefore = fsSync.existsSync(tempPath)
        } catch {
            existedBefore = false
        }
        try {
            await fs.mkdir(path.dirname(tempPath), { recursive: true })
            await fs.writeFile(tempPath, doc.model.getValue(), 'utf8')
            if (!existedBefore) {
                this.updateTreeItems()
                window.setTimeout(() => this.cdr.markForCheck(), 0)
            }
        } catch {
            // best-effort temp save
        }
    }

    private async deleteTemp (tempPath: string): Promise<void> {
        try {
            await fs.unlink(tempPath)
        } catch {
            // ignore
        }
    }

    private async restoreState (): Promise<void> {
        this.recentFiles = this.loadRecent()
        if (typeof localStorage === 'undefined') {
            return
        }
        const savedTheme = localStorage.getItem('codeEditor.themeMode') as (EditorThemeMode|null)
        if (savedTheme && this.supportedThemeModes.includes(savedTheme)) {
            this.themeMode = savedTheme
        }
        const savedThemeColor = localStorage.getItem('codeEditor.themeColor')
        if (savedThemeColor) {
            this.editorThemeColor = this.normalizeHexColor(savedThemeColor, this.editorThemeColor)
        }
        const savedSidebar = localStorage.getItem('codeEditor.sidebarWidth')
        if (savedSidebar) {
            const parsed = parseInt(savedSidebar, 10)
            if (!isNaN(parsed) && parsed >= 160 && parsed <= 480) {
                this.sidebarWidth = parsed
            }
        }
        const savedWordWrap = localStorage.getItem('codeEditor.wordWrap')
        if (savedWordWrap !== null) {
            this.wordWrapEnabled = savedWordWrap === '1'
        }
        const savedMinimap = localStorage.getItem('codeEditor.minimap')
        if (savedMinimap !== null) {
            this.minimapEnabled = savedMinimap === '1'
        }
        const savedFontSize = localStorage.getItem('codeEditor.fontSize')
        if (savedFontSize) {
            const parsed = parseInt(savedFontSize, 10)
            if (!isNaN(parsed) && parsed >= 10 && parsed <= 28) {
                this.fontSize = parsed
            }
        }
        const savedLineHeight = localStorage.getItem('codeEditor.lineHeight')
        if (savedLineHeight) {
            const parsed = parseInt(savedLineHeight, 10)
            if (!isNaN(parsed) && parsed >= 14 && parsed <= 40) {
                this.lineHeight = parsed
            }
        }
        const savedAutosave = localStorage.getItem('codeEditor.autosave')
        if (savedAutosave !== null) {
            this.autosaveEnabled = savedAutosave === '1'
        }
        this.primaryEditor?.updateOptions({
            wordWrap: this.wordWrapEnabled ? 'on' : 'off',
            minimap: { enabled: this.minimapEnabled },
            fontSize: this.fontSize,
            lineHeight: this.lineHeight,
        })
        this.splitEditor?.updateOptions({
            wordWrap: this.wordWrapEnabled ? 'on' : 'off',
            minimap: { enabled: this.minimapEnabled },
            fontSize: this.fontSize,
            lineHeight: this.lineHeight,
        })
        const splitEnabled = localStorage.getItem('codeEditor.split') === '1'
        const savedSplitDoc = localStorage.getItem('codeEditor.splitDoc') || null
        const raw = localStorage.getItem('codeEditor.docs')
        if (!raw) {
            return
        }
        try {
            const docs: EditorDocumentSnapshot[] = JSON.parse(raw)
            for (const snap of docs) {
                let snapContent = snap.content
                if (!snap.path && snap.tempPath && fsSync.existsSync(snap.tempPath)) {
                    try {
                        snapContent = fsSync.readFileSync(snap.tempPath, 'utf8')
                    } catch {
                        // ignore temp read errors
                    }
                }
                const doc = this.createDocument({ ...snap, content: snapContent })
                doc.lastSavedValue = snap.lastSavedValue ?? snapContent
                this.refreshDocDiskSnapshot(doc, snapContent)
                this.documents.push(doc)
            }
            let folderStateChanged = this.syncOpenedFileScopes()
            const activeId = localStorage.getItem('codeEditor.active')
            if (activeId) {
                this.activateDoc(activeId)
            } else if (this.documents.length) {
                this.activateDoc(this.documents[0].id)
            }
            if (splitEnabled) {
                this.pendingSplitDocId = savedSplitDoc || this.activeDocId || (this.documents[0]?.id ?? null)
            }
            if (this.hydrateScopedRootsFromOpenDocuments()) {
                folderStateChanged = true
            }
            if (folderStateChanged) {
                this.persistFolders()
            }
        } catch {
            // ignore corrupted state
        }
    }

    private loadRecent (): string[] {
        if (typeof localStorage === 'undefined') {
            return []
        }
        try {
            return JSON.parse(localStorage.getItem('codeEditor.recent') ?? '[]') ?? []
        } catch {
            return []
        }
    }

    private rememberRecent (filePath: string): void {
        this.recentFiles = [filePath, ...this.recentFiles.filter(f => f !== filePath)].slice(0, 10)
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('codeEditor.recent', JSON.stringify(this.recentFiles))
        }
    }

    private getActiveEditor (): any {
        if (this.viewMode === 'diff') {
            return this.diffEditor
        }
        if (this.splitEditor?.hasTextFocus?.()) {
            return this.splitEditor
        }
        if (this.primaryEditor?.hasTextFocus?.()) {
            return this.primaryEditor
        }
        if (this.focusedEditor === 'split' && this.splitEditor) {
            return this.splitEditor
        }
        return this.primaryEditor
    }

    private getActiveDoc (): EditorDocument|null {
        if (this.viewMode === 'editor') {
            if (this.splitEditor?.hasTextFocus?.() && this.splitDocId) {
                return this.documents.find(d => d.id === this.splitDocId) ?? null
            }
            if (this.primaryEditor?.hasTextFocus?.() && this.activeDocId) {
                return this.documents.find(d => d.id === this.activeDocId) ?? null
            }
            if (this.focusedEditor === 'split' && this.splitDocId) {
                return this.documents.find(d => d.id === this.splitDocId) ?? null
            }
        }
        if (!this.activeDocId) {
            return null
        }
        return this.documents.find(d => d.id === this.activeDocId) ?? null
    }

    private disposeEditors (): void {
        this.primaryEditor?.dispose?.()
        this.splitEditor?.dispose?.()
        this.diffEditor?.dispose?.()
    }

    private disposeModels (): void {
        this.documents.forEach(doc => doc.model?.dispose?.())
        this.documents = []
    }

    private updateTitle (doc: EditorDocument): void {
        const suffix = doc.isDirty ? ' •' : ''
        this.setTitle(`${doc.name}${suffix}`)
    }

    private enterDiff (doc: EditorDocument, originalContent: string, label: string): void {
        if (!this.monaco || !this.diffHost) {
            return
        }
        this.viewMode = 'diff'
        this.diffEditor?.dispose?.()
        this.diffOriginalModel?.dispose?.()
        this.diffOriginalModel = this.monaco.editor.createModel(originalContent, this.pickLanguage(doc.name))
        this.diffEditor = this.monaco.editor.createDiffEditor(this.diffHost.nativeElement, {
            ...this.editorOptions(),
            renderSideBySide: true,
        })
        this.diffEditor.setModel({
            original: this.diffOriginalModel,
            modified: doc.model,
        })
        this.diffEditor.updateOptions({ readOnly: false })
        this.diffEditor.modifiedEditor?.updateOptions?.({ readOnly: false })
        this.diffEditor.originalEditor?.updateOptions?.({ readOnly: true })
        this.statusMessage = `Comparing against ${label}`
        this.layoutEditors()
    }

    private setError (message: string): void {
        this.loadError = message
        this.loading = false
    }

    @HostListener('document:click', ['$event'])
    closeEditMenu (event?: MouseEvent): void {
        const target = (event?.target ?? null) as any
        if (!target?.closest?.('.tab-sidebar')) {
            this.treeKeyboardActive = false
        }
        // Don't close menus when clicking inside them.
        // Note: this also protects against capture-phase document listeners closing the menu
        // before the menu item's click handler runs.
        if (target?.closest?.('.doc-context-menu') || target?.closest?.('.menu-container')) {
            return
        }
        // Close all context menus
        this.cancelEditMenuClose()
        this.cancelFileMenuClose()
        this.editMenuOpen = false
        this.fileMenuOpen = false
        this.docContextMenuOpen = false
        this.folderContextMenuOpen = false
        this.fileContextMenuOpen = false
        // Clear menu state
        this.docContextMenuDocId = null
        this.folderContextMenuPath = null
        this.folderContextMenuPaths = []
        this.folderContextScopeRoot = null
        this.folderContextScopeMode = 'full'
        this.fileContextMenuPath = null
        this.fileContextMenuPaths = []
    }

    @HostListener('document:contextmenu', ['$event'])
    closeContextMenusOnRightClick (event?: MouseEvent): void {
        const target = (event?.target ?? null) as any
        // Don't close if right-clicking on a menu or menu trigger
        if (target?.closest?.('.doc-context-menu') || target?.closest?.('.menu-container') || target?.closest?.('.tree-row')) {
            return
        }
        // Close all context menus when right-clicking elsewhere
        this.docContextMenuOpen = false
        this.folderContextMenuOpen = false
        this.fileContextMenuOpen = false
        this.docContextMenuDocId = null
        this.folderContextMenuPath = null
        this.folderContextMenuPaths = []
        this.folderContextScopeRoot = null
        this.folderContextScopeMode = 'full'
        this.fileContextMenuPath = null
        this.fileContextMenuPaths = []
    }

    @HostListener('document:mousemove', ['$event'])
    onSidebarDrag (event: MouseEvent): void {
        if (!this.resizingSidebar) {
            return
        }
        const delta = event.clientX - this.resizeStartX
        const next = Math.min(480, Math.max(160, this.resizeStartWidth + delta))
        if (next !== this.sidebarWidth) {
            this.sidebarWidth = next
            this.layoutEditors()
        }
    }

    @HostListener('document:mouseup')
    endSidebarDrag (): void {
        if (!this.resizingSidebar) {
            return
        }
        this.resizingSidebar = false
        this.persistState()
    }

    private parseAnsi (input: string): { text: string, segments: Array<{ start: number, end: number, classes: string }> } {
        const ESC = '\u001b['
        let i = 0
        let clean = ''
        const segments: Array<{ start: number, end: number, classes: string }> = []
        let activeStart = 0
        let fg: string|null = null
        let bg: string|null = null
        let bold = false
        let underline = false

        const pushSegment = (end: number) => {
            if (end > activeStart && (fg || bg || bold || underline)) {
                const classes = [
                    fg ? `ansi-fg-${fg}` : '',
                    bg ? `ansi-bg-${bg}` : '',
                    bold ? 'ansi-bold' : '',
                    underline ? 'ansi-underline' : '',
                ].filter(Boolean).join(' ')
                segments.push({ start: activeStart, end, classes })
            }
            activeStart = end
        }

        const setSgr = (codes: number[]) => {
            for (const code of codes) {
                if (code === 0) {
                    pushSegment(clean.length)
                    fg = bg = null
                    bold = underline = false
                    continue
                }
                if (code === 1) bold = true
                if (code === 4) underline = true
                if (code === 22) bold = false
                if (code === 24) underline = false
                if (code === 49) {
                    pushSegment(clean.length)
                    bg = null
                    continue
                }
                if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) {
                    const map: Record<number, string> = {
                        30: 'black', 31: 'red', 32: 'green', 33: 'yellow', 34: 'blue', 35: 'magenta', 36: 'cyan', 37: 'white',
                        90: 'brblack', 91: 'brred', 92: 'brgreen', 93: 'bryellow', 94: 'brblue', 95: 'brmagenta', 96: 'brcyan', 97: 'brwhite',
                    }
                    pushSegment(clean.length)
                    fg = map[code] ?? fg
                }
                if ((code >= 40 && code <= 47) || (code >= 100 && code <= 107)) {
                    /*
                     * Ignore ANSI background colors in the editor to keep selection
                     * and search highlights readable and consistent across themes.
                     */
                    continue
                }
            }
        }

        while (i < input.length) {
            const escPos = input.indexOf(ESC, i)
            if (escPos === -1) {
                clean += input.slice(i)
                break
            }
            clean += input.slice(i, escPos)
            i = escPos + ESC.length
            const mPos = input.indexOf('m', i)
            if (mPos === -1) {
                break
            }
            const seq = input.slice(i, mPos)
            const codes = seq.split(';').filter(Boolean).map(x => parseInt(x, 10)).filter(x => !isNaN(x))
            pushSegment(clean.length)
            setSgr(codes.length ? codes : [0])
            i = mPos + 1
        }
        pushSegment(clean.length)
        return { text: clean, segments }
    }

    private offsetToPosition (text: string): Array<{ start: number, line: number, col: number }> {
        const map: Array<{ start: number, line: number, col: number }> = []
        let line = 1
        let col = 1
        map.push({ start: 0, line, col })
        for (let idx = 0; idx < text.length; idx++) {
            const ch = text[idx]
            if (ch === '\n') {
                line++
                col = 1
                map.push({ start: idx + 1, line, col })
            } else {
                col++
            }
        }
        return map
    }

    private applyAnsiDecorations (doc: EditorDocument, rawContent: string): void {
        if (!this.monaco || !doc.model) {
            return
        }
        const { text, segments } = this.parseAnsi(rawContent)
        doc.model.setValue(text)
        this.setModelLanguage(doc)
        const lineMap = this.offsetToPosition(text)

        const findLine = (offset: number) => {
            let lo = 0
            let hi = lineMap.length - 1
            while (lo <= hi) {
                const mid = Math.floor((lo + hi) / 2)
                if (lineMap[mid].start <= offset && (mid === lineMap.length - 1 || lineMap[mid + 1].start > offset)) {
                    return lineMap[mid]
                }
                if (lineMap[mid].start > offset) {
                    hi = mid - 1
                } else {
                    lo = mid + 1
                }
            }
            return lineMap[0]
        }

        const decorations = segments.map(seg => {
            const startPos = findLine(seg.start)
            const endPos = findLine(seg.end)
            const startColumn = startPos.col + (seg.start - startPos.start)
            const endColumn = endPos.col + (seg.end - endPos.start)
            return {
                range: new this.monaco.Range(startPos.line, startColumn, endPos.line, endColumn),
                options: { inlineClassName: seg.classes },
            }
        })
        doc.ansiDecorationIds = doc.model.deltaDecorations(doc.ansiDecorationIds ?? [], decorations)
    }

    private async ensureRunTerminal (cwd: string): Promise<BaseTerminalTabComponentType | null> {
        const terminalService = this.resolveTerminalService()
        if (!terminalService) {
            this.setError('Local terminal service unavailable')
            return null
        }
        const existing = this.runTerminalTab as (BaseTerminalTabComponentType & BaseTabComponent) | null
        if (existing?.parent) {
            return existing
        }
        const runProfile = await this.resolveRunProfile()
        const term = await terminalService.openTab(runProfile, cwd, false)
        if (!term) {
            return null
        }
        // Mark this terminal as a dedicated "Run in terminal" pane so the terminal plugin can
        // show a close button inside the pane without affecting regular split panes.
        ;(term as any).__tlinkRunTerminal = true
        // Make sure the terminal toolbar (which contains the split-pane close button) is visible
        // for the code editor run terminal. Regular terminals can keep their default behavior.
        try {
            ;(term as any).enableToolbar = true
            ;(term as any).pinToolbar = true
            ;(term as any).revealToolbar = true
        } catch {}
        this.runTerminalTab = term
        ;(term as any).destroyed$?.subscribe(() => {
            if (this.runTerminalTab === term) {
                this.runTerminalTab = null
            }
        })
        await this.placeTerminalNextToEditor(term)
        return term
    }

    private async placeTerminalNextToEditor (term: BaseTerminalTabComponentType): Promise<void> {
        const terminalTab = term as BaseTerminalTabComponentType & BaseTabComponent
        if (terminalTab.parent === this.parent && terminalTab.parent instanceof SplitTabComponent) {
            terminalTab.parent.focus(terminalTab)
            return
        }
        if (this.parent instanceof SplitTabComponent) {
            // Prefer a bottom "console" layout for running code
            await this.parent.addTab(terminalTab, this, 'b')
            this.parent.focus(terminalTab)
            return
        }
        const idx = this.app.tabs.indexOf(this)
        this.app.removeTab(this)
        const split = this.tabsService.create({ type: SplitTabComponent })
        await split.addTab(this, null, 't')
        await split.addTab(terminalTab, this, 'b')
        this.app.addTabRaw(split, idx >= 0 ? idx : null)
        this.app.selectTab(split)
    }

    private sendToTerminal (term: BaseTerminalTabComponentType, text: string): void {
        const terminal = term as any
        const payload = Buffer.from(text)

        const sendNow = (): boolean => {
            try {
                if (terminal?.session?.open && typeof terminal.sendInput === 'function') {
                    terminal.sendInput(text)
                    return true
                }
                if (terminal?.session?.open && typeof terminal.session?.write === 'function') {
                    terminal.session.write(payload)
                    return true
                }
            } catch {
                // Retry through sessionChanged$ fallback below.
            }
            return false
        }

        if (sendNow()) {
            return
        }

        const sessionChanged$ = terminal?.sessionChanged$
        if (sessionChanged$?.subscribe) {
            const subscription = sessionChanged$.subscribe((session: any) => {
                if (!session?.open) {
                    return
                }
                try {
                    if (typeof terminal.sendInput === 'function') {
                        terminal.sendInput(text)
                    } else if (typeof session?.write === 'function') {
                        session.write(payload)
                    }
                } finally {
                    subscription.unsubscribe()
                }
            })
            // Avoid leaking subscription if the session never comes up.
            window.setTimeout(() => subscription.unsubscribe(), 5000)
            return
        }

        window.dispatchEvent(new CustomEvent('tlink-send-to-terminal', { detail: { text } }))
    }
}
