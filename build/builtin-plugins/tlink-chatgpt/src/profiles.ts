import { Injectable } from '@angular/core'
import { BaseTabComponent, NewTabParameters, PartialProfile, Profile, ProfileProvider } from 'tlink-core'

import { ChatTabComponent } from './components/chatTab.component'

export interface ChatGPTProfile extends Profile {
    type: 'chatgpt'
    options: Record<string, never>
}

@Injectable({ providedIn: 'root' })
export class ChatGPTProfilesService extends ProfileProvider<ChatGPTProfile> {
    id = 'chatgpt'
    name = 'AI Chat'

    async getBuiltinProfiles (): Promise<PartialProfile<ChatGPTProfile>[]> {
        return [
            {
                id: 'chatgpt:default',
                type: this.id,
                name: 'AI Chat',
                icon: 'fas fa-comments',
                options: {},
                isBuiltin: true,
            },
        ]
    }

    async getNewTabParameters (_profile: ChatGPTProfile): Promise<NewTabParameters<BaseTabComponent>> {
        return {
            type: ChatTabComponent,
        }
    }

    getDescription (_profile: PartialProfile<ChatGPTProfile>): string {
        return 'AI chat'
    }
}
