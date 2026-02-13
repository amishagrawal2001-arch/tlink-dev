import { BaseTabComponent, NewTabParameters, PartialProfile, Profile, ProfileProvider } from 'tlink-core';
export interface ChatGPTProfile extends Profile {
    type: 'chatgpt';
    options: Record<string, never>;
}
export declare class ChatGPTProfilesService extends ProfileProvider<ChatGPTProfile> {
    id: string;
    name: string;
    getBuiltinProfiles(): Promise<PartialProfile<ChatGPTProfile>[]>;
    getNewTabParameters(_profile: ChatGPTProfile): Promise<NewTabParameters<BaseTabComponent>>;
    getDescription(_profile: PartialProfile<ChatGPTProfile>): string;
}
