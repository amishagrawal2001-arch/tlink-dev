import { Injectable } from '@angular/core'
import { ToolbarButtonProvider, ToolbarButton, AppService } from 'tlink-core'
import { APIClientTabComponent } from './components/apiClientTab.component'

@Injectable()
export class APIClientButtonProvider extends ToolbarButtonProvider {
    constructor (private app: AppService) {
        super()
    }

    provide (): ToolbarButton[] {
        return [{
            icon: require('./icons/api.svg'),
            title: 'API Client',
            weight: 15,
            click: () => {
                this.app.openNewTab({
                    type: APIClientTabComponent,
                    inputs: {
                        profile: {
                            type: 'api-client',
                            name: 'API Client',
                            options: {
                                url: 'https://httpbin.org/get',
                                method: 'GET',
                                headers: [],
                                body: '',
                                bodyType: 'none',
                                timeout: 30000,
                                auth: { type: 'none' },
                            },
                        },
                    },
                })
            },
        }]
    }
}
