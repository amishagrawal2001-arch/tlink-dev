import { StreamProcessingSettingsComponent } from './components/streamProcessingSettings.component';
import { LoginScriptsSettingsComponent } from './components/loginScriptsSettings.component';
import { TerminalDecorator } from './api/decorator';
import { TerminalContextMenuItemProvider } from './api/contextMenuProvider';
import { TerminalColorSchemeProvider } from './api/colorSchemeProvider';
import { Frontend } from './frontends/frontend';
import { XTermFrontend, XTermWebGLFrontend } from './frontends/xtermFrontend';
/** @hidden */
export default class TerminalModule {
}
export { TerminalDecorator, TerminalContextMenuItemProvider, TerminalColorSchemeProvider };
export { Frontend, XTermFrontend, XTermWebGLFrontend };
export { BaseTerminalTabComponent } from './api/baseTerminalTab.component';
export { ConnectableTerminalTabComponent } from './api/connectableTerminalTab.component';
export * from './api/interfaces';
export * from './middleware/streamProcessing';
export * from './middleware/loginScriptProcessing';
export * from './middleware/oscProcessing';
export * from './middleware/utf8Splitter';
export * from './middleware/inputProcessing';
export * from './api/middleware';
export * from './session';
export { LoginScriptsSettingsComponent, StreamProcessingSettingsComponent };
export { MultifocusService } from './services/multifocus.service';
