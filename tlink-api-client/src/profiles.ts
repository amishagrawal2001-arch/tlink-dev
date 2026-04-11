import { Injectable } from '@angular/core'
import { ProfileProvider, NewTabParameters, PartialProfile } from 'tlink-core'
import { APIClientProfile } from './api/interfaces'
import { APIClientTabComponent } from './components/apiClientTab.component'

@Injectable({ providedIn: 'root' })
export class APIClientProfilesService extends ProfileProvider<APIClientProfile> {
    id = 'api-client'
    name = 'API Client'
    settingsComponent = undefined

    configDefaults = {
        options: {
            url: 'https://httpbin.org/get',
            method: 'GET',
            headers: [],
            body: '',
            bodyType: 'none',
            timeout: 30000,
            auth: { type: 'none' },
        },
    }

    async getBuiltinProfiles (): Promise<PartialProfile<APIClientProfile>[]> {
        return [{
            id: 'api-client:new',
            type: 'api-client',
            name: 'New API Request',
            icon: 'fas fa-globe',
            options: {
                url: 'https://httpbin.org/get',
                method: 'GET',
                headers: [],
                body: '',
                bodyType: 'none',
                timeout: 30000,
                auth: { type: 'none' },
            },
            isBuiltin: true,
            isTemplate: true,
        }]
    }

    async getNewTabParameters (profile: APIClientProfile): Promise<NewTabParameters<APIClientTabComponent>> {
        return {
            type: APIClientTabComponent,
            inputs: { profile },
        }
    }

    getDescription (profile: PartialProfile<APIClientProfile>): string {
        return profile.options?.url ?? 'API Client'
    }

    getSuggestedName (profile: PartialProfile<APIClientProfile>): string | null {
        return profile.options?.url ? `${profile.options.method ?? 'GET'} ${profile.options.url}` : 'API Request'
    }
}
