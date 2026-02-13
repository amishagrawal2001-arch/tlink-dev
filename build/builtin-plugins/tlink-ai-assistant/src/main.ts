/**
 * Tlink AI Assistant Plugin - Main Entry Point
 *
 * This file serves as the main entry point for the Tlink AI Assistant plugin.
 * It initializes the Angular module and integrates with Tlink's plugin system.
 */

import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import AiAssistantModule from './index';

// Bootstrap the Angular application
platformBrowserDynamic()
    .bootstrapModule(AiAssistantModule)
    .catch(err => console.error('Error starting Tlink AI Assistant:', err));

export default AiAssistantModule;
