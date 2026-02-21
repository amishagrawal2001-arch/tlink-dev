import { Injector } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ParsedShareSessionLink, SessionSharingService } from 'tlink-core';
import { BaseTerminalProfile } from '../api/interfaces';
import { BaseTerminalTabComponent } from '../api/baseTerminalTab.component';
import { SharedSessionViewerSession } from '../sharedSessionViewer.session';
interface SharedSessionTabProfile extends BaseTerminalProfile {
    options: {
        shareUrl?: string;
        sessionId?: string;
        wsUrl?: string;
    };
}
export declare class SharedSessionTabComponent extends BaseTerminalTabComponent<SharedSessionTabProfile> {
    private ngbModal;
    private sessionSharing;
    shareUrl: string;
    parsedLink: ParsedShareSessionLink | null;
    session: SharedSessionViewerSession | null;
    private connecting;
    private passwordPromptCancelled;
    private reconnecting;
    private tabDestroyed;
    constructor(injector: Injector, ngbModal: NgbModal, sessionSharing: SessionSharingService);
    ngOnInit(): void;
    protected onFrontendReady(): void;
    reconnectSharedSession(): Promise<void>;
    ngOnDestroy(): void;
    private buildProfile;
    private resolveParsedLink;
    private connect;
    private promptPasswordAndReconnect;
    private handleSessionDisconnected;
}
export {};
