import { Injectable, ComponentFactoryResolver, ApplicationRef, Injector, EmbeddedViewRef, ComponentRef, EnvironmentInjector, createComponent } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { ConfigService } from 'tlink-core';
import { AiSidebarComponent } from '../../components/chat/ai-sidebar.component';

/**
 * Preset message interface
 */
export interface PresetMessage {
    message: string;
    autoSend: boolean;
}

/**
 * AI Sidebar configuration interface
 */
export interface AiSidebarConfig {
    enabled?: boolean;
    position?: 'left' | 'right';
    showInToolbar?: boolean;
    sidebarVisible?: boolean;
    sidebarCollapsed?: boolean;
    sidebarWidth?: number;
}

/**
 * AI Sidebar Service - Manages the lifecycle of AI chat sidebar
 *
 * Uses Flexbox layout, inserts sidebar into app-root as the first child element,
 * app-root becomes a horizontal flex container, sidebar on the left
 */
@Injectable({ providedIn: 'root' })
export class AiSidebarService {
    private sidebarComponentRef: ComponentRef<AiSidebarComponent> | null = null;
    private sidebarElement: HTMLElement | null = null;
    private styleElement: HTMLStyleElement | null = null;
    private resizeHandle: HTMLElement | null = null;
    private _isVisible = false;
    private _fullWindowMode = false;

    // Resize constants
    private readonly MIN_WIDTH = 280;
    private readonly MAX_WIDTH = 500;
    private readonly DEFAULT_WIDTH = 320;
    private readonly MAX_WIDTH_VW = 0.35; // 35% of viewport
    private currentWidth: number = this.DEFAULT_WIDTH;
    private isResizing = false;

    // Preset message Subject (for hotkey functionality)
    private presetMessageSubject = new Subject<PresetMessage>();

    /**
     * Get preset message Observable
     */
    get presetMessage$(): Observable<PresetMessage> {
        return this.presetMessageSubject.asObservable();
    }

    /**
     * Whether sidebar is visible
     */
    get sidebarVisible(): boolean {
        return this._isVisible;
    }

    constructor(
        private componentFactoryResolver: ComponentFactoryResolver,
        private appRef: ApplicationRef,
        private injector: Injector,
        private environmentInjector: EnvironmentInjector,
        private config: ConfigService,
    ) { }

    /**
     * Show sidebar
     * @param fullWindowMode If true, make sidebar full-window (no margin, no dock)
     */
    show(fullWindowMode: boolean = false): void {
        if (this._isVisible) {
            // If already visible and switching modes, recreate
            if (this._fullWindowMode !== fullWindowMode) {
                this.hide()
            } else {
                return
            }
        }

        // Check for full window mode flag from window object (set by appRoot)
        if (!fullWindowMode && (window as any).__aiAssistantFullWindowMode) {
            fullWindowMode = true
        }

        this._fullWindowMode = fullWindowMode
        this.createSidebar(fullWindowMode);

        const pluginConfig = this.getPluginConfig();
        // Only save visibility state if not in full window mode (separate window)
        if (!fullWindowMode) {
            pluginConfig.sidebarVisible = true;
            this.savePluginConfig(pluginConfig);
        }

        this._isVisible = true;
    }

    /**
     * Hide sidebar
     */
    hide(): void {
        if (!this._isVisible) {
            return;
        }

        this.destroySidebar();

        const pluginConfig = this.getPluginConfig();
        // Only save visibility state if not in full window mode (separate window)
        if (!this._fullWindowMode) {
            pluginConfig.sidebarVisible = false;
            this.savePluginConfig(pluginConfig);
        }

        this._isVisible = false;
        this._fullWindowMode = false;
    }

    /**
     * Toggle sidebar visibility
     */
    toggle(): void {
        if (this._isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    /**
     * Get current visibility state
     */
    get visible(): boolean {
        return this._isVisible;
    }

    /**
     * Send preset message and execute
     * Used for hotkey functionality - auto-fill and send message
     * @param message Message content
     * @param autoSend Whether to auto-send (otherwise only fill, don't send)
     */
    sendPresetMessage(message: string, autoSend: boolean = true): void {
        if (!this._isVisible) {
            this.show();
        }

        // Notify sidebar component to fill message
        this.presetMessageSubject.next({ message, autoSend });
    }

    /**
     * Initialize - called when application starts
     * Note: Sidebar is now opened in separate window, so don't auto-show on startup
     */
    initialize(): void {
        const pluginConfig = this.getPluginConfig();
        // Don't show sidebar by default - it's now opened in a separate window.
        if (pluginConfig.sidebarVisible === true) {
            pluginConfig.sidebarVisible = false;
            this.savePluginConfig(pluginConfig);
        }
    }

    /**
     * Create sidebar component
     * 
     * Uses fixed positioning approach:
     * 1. Sidebar position: fixed, fixed on the left
     * 2. Main content area pushed away via margin-left
     * This doesn't change any existing element's flex layout
     * 
     * @param fullWindowMode If true, make sidebar full-window (no margin, no dock)
     */
    private createSidebar(fullWindowMode: boolean = false): void {
        // Use createComponent API (Angular 14+), pass EnvironmentInjector
        // This ensures component can correctly resolve all root-level service dependencies
        this.sidebarComponentRef = createComponent(AiSidebarComponent, {
            environmentInjector: this.environmentInjector,
            elementInjector: this.injector
        });

        // Attach to application
        this.appRef.attachView(this.sidebarComponentRef.hostView);

        // Get DOM element
        const domElem = (this.sidebarComponentRef.hostView as EmbeddedViewRef<any>).rootNodes[0] as HTMLElement;
        // Directly set component host element styles - ensure flex layout is correct
        domElem.style.display = 'flex';
        domElem.style.flexDirection = 'column';
        domElem.style.height = '100%';
        domElem.style.width = '100%';
        domElem.style.overflow = 'hidden';

        // Create wrapper element - use fixed positioning
        const wrapper = document.createElement('div');
        wrapper.className = 'ai-sidebar-wrapper';

        // Load saved width or use default value
        this.currentWidth = fullWindowMode ? window.innerWidth : this.clampWidth(this.loadSidebarWidth());

        // Get viewport height - use absolute pixel values to ensure scroll container calculates correctly
        const viewportHeight = window.innerHeight;
        wrapper.style.cssText = `
            position: fixed;
            left: 0;
            top: 0;
            width: ${this.currentWidth}px;
            height: ${viewportHeight}px;
            display: flex;
            flex-direction: column;
            background: var(--bs-body-bg, #1e1e1e);
            ${fullWindowMode ? '' : 'border-right: 1px solid var(--bs-border-color, #333);'}
            ${fullWindowMode ? '' : 'box-shadow: 2px 0 10px rgba(0,0,0,0.3);'}
            z-index: 1000;
            overflow: hidden;
        `;

        // Listen to window size changes, dynamically update height
        const resizeHandler = () => {
            wrapper.style.height = `${window.innerHeight}px`;
            const clampedWidth = this.clampWidth(this.currentWidth);
            if (clampedWidth !== this.currentWidth) {
                this.currentWidth = clampedWidth;
                wrapper.style.width = `${clampedWidth}px`;
                this.updateLayoutCSS(clampedWidth);
            }
        };
        window.addEventListener('resize', resizeHandler);
        // Store handler for removal on destroy
        (wrapper as any)._resizeHandler = resizeHandler;

        // Create resize handle (drag bar)
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'ai-sidebar-resize-handle';
        resizeHandle.style.cssText = `
            position: absolute;
            top: 0;
            right: -4px;
            width: 8px;
            height: 100%;
            cursor: ew-resize;
            background: transparent;
            z-index: 1001;
            transition: background 0.2s;
        `;

        // Show highlight on mouse hover
        resizeHandle.addEventListener('mouseenter', () => {
            resizeHandle.style.background = 'var(--ai-primary, #4dabf7)';
        });
        resizeHandle.addEventListener('mouseleave', () => {
            if (!this.isResizing) {
                resizeHandle.style.background = 'transparent';
            }
        });

        // Add drag logic
        this.setupResizeHandler(resizeHandle, wrapper, viewportHeight);

        wrapper.appendChild(resizeHandle);
        this.resizeHandle = resizeHandle;

        wrapper.appendChild(domElem);

        // Insert into body
        document.body.appendChild(wrapper);

        this.sidebarElement = wrapper;

        // Inject layout CSS - only add margin-left to push main content away (unless full window mode)
        this.injectLayoutCSS(fullWindowMode);

        // Inject service reference into component
        if (this.sidebarComponentRef) {
            const component = this.sidebarComponentRef.instance;
            component.sidebarService = this;
        }
    }

    /**
     * Destroy sidebar component
     */
    private destroySidebar(): void {
        // Remove injected CSS
        this.removeLayoutCSS();

        // Remove resize listener
        if (this.sidebarElement) {
            const handler = (this.sidebarElement as any)._resizeHandler;
            if (handler) {
                window.removeEventListener('resize', handler);
            }
        }

        if (this.sidebarComponentRef) {
            this.appRef.detachView(this.sidebarComponentRef.hostView);
            this.sidebarComponentRef.destroy();
            this.sidebarComponentRef = null;
        }

        if (this.sidebarElement) {
            this.sidebarElement.remove();
            this.sidebarElement = null;
        }
    }

    /**
     * Adjust .content element styles - only process the second (deeper) .content
     */
    private adjustContentStyles(appRoot: Element, apply: boolean): void {
        const contentElements = appRoot.querySelectorAll('.content');

        if (contentElements.length > 1) {
            // Select the second (deeper) .content element, this is Tlink's main content area
            const contentElement = contentElements[1] as HTMLElement;
            if (apply) {
                contentElement.style.width = 'auto';
                contentElement.style.flex = '1 1 auto';
                contentElement.style.minWidth = '0';
            } else {
                contentElement.style.removeProperty('width');
                contentElement.style.removeProperty('flex');
                contentElement.style.removeProperty('min-width');
            }
        } else if (contentElements.length === 1) {
            // If there's only one .content, process it
            const contentElement = contentElements[0] as HTMLElement;
            if (apply) {
                contentElement.style.width = 'auto';
                contentElement.style.flex = '1 1 auto';
                contentElement.style.minWidth = '0';
            } else {
                contentElement.style.removeProperty('width');
                contentElement.style.removeProperty('flex');
                contentElement.style.removeProperty('min-width');
            }
        }
    }

    /**
     * Inject layout CSS - use margin-left to push main content away
     *
     * Fixed positioning approach: sidebar fixed, main content area margin-left
     * 
     * @param fullWindowMode If true, hide main content and make sidebar full-window
     */
    private injectLayoutCSS(fullWindowMode: boolean = false): void {
        const style = document.createElement('style');
        style.id = 'ai-sidebar-layout-css';
        
        if (fullWindowMode) {
            // Full window mode: hide main content, show only sidebar
            style.textContent = `
                /* Hide main content in full window mode */
                app-root .content-body,
                app-root .left-dock,
                app-root .right-dock,
                app-root .tab-bar {
                    display: none !important;
                }
                /* Make sidebar full window */
                .ai-sidebar-wrapper {
                    width: 100vw !important;
                    left: 0 !important;
                }
            `;
        } else {
            // Sidebar mode: push main content away
            style.textContent = `
                /* Reserve space for the sidebar without shrinking the main content */
                app-root {
                    margin-left: ${this.currentWidth}px !important;
                    width: calc(100% - ${this.currentWidth}px) !important;
                }
                /* Adjust .content width to extend to viewport edge (accounting for right dock) */
                app-root .content {
                    width: calc(100vw - ${this.currentWidth}px) !important;
                    max-width: calc(100vw - ${this.currentWidth}px) !important;
                }
                /* Ensure tab bar extends fully to keep right toolbar buttons visible */
                app-root .content > .tab-bar {
                    width: 100% !important;
                }
            `;
        }

        document.head.appendChild(style);
        this.styleElement = style;
    }

    /**
     * Remove layout CSS
     */
    private removeLayoutCSS(): void {
        if (this.styleElement) {
            this.styleElement.remove();
            this.styleElement = null;
        }
    }

    /**
     * Setup resize handle drag logic
     */
    private setupResizeHandler(handle: HTMLElement, wrapper: HTMLElement, viewportHeight: number): void {
        let startX: number;
        let startWidth: number;

        const onMouseDown = (e: MouseEvent) => {
            e.preventDefault();
            this.isResizing = true;
            startX = e.clientX;
            startWidth = this.currentWidth;

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            document.body.style.cursor = 'ew-resize';
            document.body.style.userSelect = 'none';
        };

        const onMouseMove = (e: MouseEvent) => {
            if (!this.isResizing) return;

            const delta = e.clientX - startX;
            let newWidth = startWidth + delta;

            // Limit width range
            newWidth = this.clampWidth(newWidth);

            this.currentWidth = newWidth;
            wrapper.style.width = `${newWidth}px`;

            // Update app-root's margin-left
            this.updateLayoutCSS(newWidth);
        };

        const onMouseUp = () => {
            this.isResizing = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            handle.style.background = 'transparent';

            // Save width to configuration
            this.saveSidebarWidth(this.currentWidth);
        };

        handle.addEventListener('mousedown', onMouseDown);
    }

    /**
     * Update layout CSS (called during resize)
     */
    private updateLayoutCSS(width: number): void {
        const clamped = this.clampWidth(width);
        
        if (this.styleElement) {
            if (this._fullWindowMode) {
                // Full window mode: hide main content
                this.styleElement.textContent = `
                    /* Hide main content in full window mode */
                    app-root .content-body,
                    app-root .left-dock,
                    app-root .right-dock,
                    app-root .tab-bar {
                        display: none !important;
                    }
                    /* Make sidebar full window */
                    .ai-sidebar-wrapper {
                        width: 100vw !important;
                        left: 0 !important;
                    }
                `;
            } else {
                // Sidebar mode: push main content away
                this.styleElement.textContent = `
                    app-root {
                        margin-left: ${clamped}px !important;
                        width: calc(100% - ${clamped}px) !important;
                    }
                    /* Adjust .content width to extend to viewport edge (accounting for right dock) */
                    app-root .content {
                        width: calc(100vw - ${clamped}px) !important;
                        max-width: calc(100vw - ${clamped}px) !important;
                    }
                    /* Ensure tab bar extends fully to keep right toolbar buttons visible */
                    app-root .content > .tab-bar {
                        width: 100% !important;
                    }
                `;
            }
        }
    }

    /**
     * Load saved sidebar width
     */
    private loadSidebarWidth(): number {
        const pluginConfig = this.getPluginConfig();
        const savedWidth = pluginConfig.sidebarWidth;
        if (savedWidth && savedWidth >= this.MIN_WIDTH && savedWidth <= this.MAX_WIDTH) {
            return this.clampWidth(savedWidth);
        }
        return this.clampWidth(this.DEFAULT_WIDTH);
    }

    /**
     * Clamp width to min/max and viewport percentage
     */
    private clampWidth(width: number): number {
        const maxByViewport = Math.floor(window.innerWidth * this.MAX_WIDTH_VW);
        const effectiveMax = Math.min(this.MAX_WIDTH, maxByViewport);
        return Math.max(this.MIN_WIDTH, Math.min(effectiveMax, width));
    }

    /**
     * Save sidebar width to configuration
     */
    private saveSidebarWidth(width: number): void {
        const pluginConfig = this.getPluginConfig();
        pluginConfig.sidebarWidth = width;
        this.savePluginConfig(pluginConfig);
    }

    /**
     * Get plugin configuration
     */
    private getPluginConfig(): AiSidebarConfig {
        return this.config.store.pluginConfig?.['ai-assistant'] || {};
    }

    /**
     * Save plugin configuration
     */
    private savePluginConfig(pluginConfig: AiSidebarConfig): void {
        if (!this.config.store.pluginConfig) {
            this.config.store.pluginConfig = {};
        }
        this.config.store.pluginConfig['ai-assistant'] = pluginConfig;
        this.config.save();
    }
}
