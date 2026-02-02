import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type AgentApprovalType = 'command' | 'patch';

export interface AgentApprovalRequest {
    id: string;
    type: AgentApprovalType;
    title: string;
    detail?: string;
    command?: string;
    patch?: string;
}

interface ApprovalQueueItem {
    request: AgentApprovalRequest;
    resolve: (approved: boolean) => void;
}

@Injectable({ providedIn: 'root' })
export class AgentApprovalService {
    private queue: ApprovalQueueItem[] = [];
    private current: ApprovalQueueItem | null = null;
    private pendingSubject = new BehaviorSubject<AgentApprovalRequest | null>(null);

    pending$ = this.pendingSubject.asObservable();

    requestApproval(request: AgentApprovalRequest): Promise<boolean> {
        return new Promise((resolve) => {
            this.queue.push({ request, resolve });
            this.flushQueue();
        });
    }

    resolveCurrent(approved: boolean): void {
        if (!this.current) return;
        const current = this.current;
        this.current = null;
        current.resolve(approved);
        this.flushQueue();
    }

    private flushQueue(): void {
        if (this.current || this.queue.length === 0) {
            if (!this.current) {
                this.pendingSubject.next(null);
            }
            return;
        }

        this.current = this.queue.shift() || null;
        this.pendingSubject.next(this.current?.request || null);
    }
}
