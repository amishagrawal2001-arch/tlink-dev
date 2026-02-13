import { AppService, Command, CommandProvider } from 'tlink-core';
import { ChatTabComponent } from './components/chatTab.component';
export declare class ChatGPTCommandProvider extends CommandProvider {
    private app;
    constructor(app: AppService);
    provide(): Promise<Command[]>;
    private openChatTab;
    private findChatTab;
}
export default class ChatGPTModule {
}
export { ChatTabComponent };
