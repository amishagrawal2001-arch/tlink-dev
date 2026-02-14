import { Injectable } from '@angular/core'
import { Command, CommandLocation, CommandProvider, ConfigService } from 'tlink-core'

import { IntelliJBridgeService } from './bridge.service'

@Injectable()
export class IntelliJBridgeCommandProvider extends CommandProvider {
    constructor (
        private config: ConfigService,
        private bridge: IntelliJBridgeService,
    ) {
        super()
    }

    async provide (): Promise<Command[]> {
        if (this.config.store?.intellijBridge?.enabled === false) {
            return []
        }

        const openEditor = new Command()
        openEditor.id = 'intellij-bridge:open-editor'
        openEditor.label = 'IntelliJ: Open editor'
        openEditor.icon = '<i class="fas fa-laptop-code"></i>'
        openEditor.locations = [CommandLocation.StartPage]
        openEditor.weight = 190
        openEditor.run = async () => {
            await this.bridge.openEditor()
        }

        const copyLaunch = new Command()
        copyLaunch.id = 'intellij-bridge:copy-launch-command'
        copyLaunch.label = 'IntelliJ: Copy agent launch command'
        copyLaunch.icon = '<i class="fas fa-plug"></i>'
        copyLaunch.locations = [CommandLocation.RightToolbar, CommandLocation.StartPage]
        copyLaunch.weight = 200
        copyLaunch.run = async () => {
            this.bridge.copyLaunchCommandToClipboard()
        }

        const copySnippet = new Command()
        copySnippet.id = 'intellij-bridge:copy-mcp-snippet'
        copySnippet.label = 'IntelliJ: Copy MCP JSON snippet'
        copySnippet.icon = '<i class="fas fa-copy"></i>'
        copySnippet.locations = [CommandLocation.StartPage]
        copySnippet.weight = 201
        copySnippet.run = async () => {
            this.bridge.copyMcpJsonSnippetToClipboard()
        }

        const openAssets = new Command()
        openAssets.id = 'intellij-bridge:open-assets'
        openAssets.label = 'IntelliJ: Open bundled integration assets'
        openAssets.icon = '<i class="fas fa-folder-open"></i>'
        openAssets.locations = [CommandLocation.StartPage]
        openAssets.weight = 202
        openAssets.run = async () => {
            this.bridge.openAssetRoot()
        }

        const revealRuntimeScript = new Command()
        revealRuntimeScript.id = 'intellij-bridge:reveal-runtime-script'
        revealRuntimeScript.label = 'IntelliJ: Reveal runtime agent script'
        revealRuntimeScript.icon = '<i class="fas fa-file-code"></i>'
        revealRuntimeScript.locations = [CommandLocation.StartPage]
        revealRuntimeScript.weight = 203
        revealRuntimeScript.run = async () => {
            this.bridge.revealRuntimeAgentScript()
        }

        return [openEditor, copyLaunch, copySnippet, openAssets, revealRuntimeScript]
    }
}
