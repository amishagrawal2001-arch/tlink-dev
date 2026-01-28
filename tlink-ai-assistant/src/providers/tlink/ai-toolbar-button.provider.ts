import { Injectable } from '@angular/core';
import { ToolbarButtonProvider, ToolbarButton, AppService } from 'tlink-core';
import { AiAssistantService } from '../../services/core/ai-assistant.service';

/**
 * Tlink toolbar button provider
 * Adds AI assistant button to Tlink toolbar using sidebar approach
 */
@Injectable()
export class AiToolbarButtonProvider extends ToolbarButtonProvider {

    constructor(
        private app: AppService,
        private aiService: AiAssistantService
    ) {
        super();
    }

    provide(): ToolbarButton[] {
        return [
            {
                icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M6 12.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5ZM3 8.062C3 6.76 4.235 5.765 5.53 5.886a26.58 26.58 0 0 0 4.94 0C11.765 5.765 13 6.76 13 8.062v1.157a.933.933 0 0 1-.765.935c-.845.147-2.34.346-4.235.346-1.895 0-3.39-.2-4.235-.346A.933.933 0 0 1 3 9.219V8.062Zm4.542-.827a.25.25 0 0 0-.217.068l-.92.9a24.767 24.767 0 0 1-1.871-.183.25.25 0 0 0-.068.495c.55.076 1.232.149 2.02.193a.25.25 0 0 0 .189-.071l.754-.736.847 1.71a.25.25 0 0 0 .404.062l.932-.97a25.286 25.286 0 0 0 1.922-.188.25.25 0 0 0-.068-.495c-.538.074-1.207.145-1.98.189a.25.25 0 0 0-.166.076l-.754.785-.842-1.7a.25.25 0 0 0-.182-.135Z"/>
                    <path d="M8.5 1.866a1 1 0 1 0-1 0V3h-2A4.5 4.5 0 0 0 1 7.5V8a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1v1a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1v-.5A4.5 4.5 0 0 0 10.5 3h-2V1.866ZM14 7.5V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7.5A3.5 3.5 0 0 1 5.5 4h5A3.5 3.5 0 0 1 14 7.5Z"/>
                </svg>`,
                weight: 0, // Changed from 100 to 0 to move button to left toolbar
                title: 'AI Assistant',
                touchBarTitle: 'AI',
                click: () => {
                    this.aiService.openAssistantWindow();
                },
                submenu: async () => [
                    {
                        title: 'Open AI Assistant',
                        click: () => this.aiService.openAssistantWindow()
                    },
                    {
                        title: 'Settings...',
                        click: () => this.openSettings()
                    }
                ]
            }
        ];
    }

    /**
     * Open settings page
     * Note: Settings page is accessed through Tlink settings menu, users can manually navigate to "AI Assistant" settings
     */
    private openSettings(): void {
        // Try to access SettingsTabComponent via nodeRequire (Electron context)
        try {
            if (typeof window !== 'undefined' && (window as any).nodeRequire) {
                const { SettingsTabComponent } = (window as any).nodeRequire('tlink-settings');
                
                // Find existing Settings tab (could be top-level or in a split)
                let existingSettingsTab: any = null;
                let parentSplit: any = null;
                
                for (const tab of this.app.tabs) {
                    if (tab instanceof SettingsTabComponent) {
                        existingSettingsTab = tab;
                        break;
                    } else if (tab.constructor.name === 'SplitTabComponent' && typeof (tab as any).getAllTabs === 'function') {
                        const innerTabs = (tab as any).getAllTabs();
                        const settingsTab = innerTabs.find((t: any) => t instanceof SettingsTabComponent);
                        if (settingsTab) {
                            existingSettingsTab = settingsTab;
                            parentSplit = tab;
                            break;
                        }
                    }
                }
                
                if (existingSettingsTab) {
                    // Settings tab already exists, focus it and navigate to AI Assistant section
                    if (parentSplit) {
                        this.app.selectTab(parentSplit);
                        if (typeof parentSplit.focus === 'function') {
                            parentSplit.focus(existingSettingsTab);
                        }
                    } else {
                        this.app.selectTab(existingSettingsTab);
                    }
                    // Set activeTab to ai-assistant
                    existingSettingsTab.activeTab = 'ai-assistant';
                } else {
                    // No Settings tab exists, open a new one
                    this.app.openNewTabRaw({
                        type: SettingsTabComponent,
                        inputs: { activeTab: 'ai-assistant' }
                    });
                }
            } else {
                // Fallback for web mode or if nodeRequire is not available
                console.warn('Cannot access SettingsTabComponent - opening settings without section focus');
                // Try to find settings tab by checking for tabs with 'settings-tab' selector or title
                const settingsTab = this.app.tabs.find(tab => 
                    tab.title === 'Settings' || 
                    (tab as any).constructor?.name === 'SettingsTabComponent'
                );
                if (settingsTab) {
                    this.app.selectTab(settingsTab);
                    if ((settingsTab as any).activeTab !== undefined) {
                        (settingsTab as any).activeTab = 'ai-assistant';
                    }
                }
            }
        } catch (err) {
            console.error('Failed to open settings:', err);
        }
    }
}
