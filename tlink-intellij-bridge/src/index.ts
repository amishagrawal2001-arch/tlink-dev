/* eslint-disable @typescript-eslint/no-extraneous-class */
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { CommandProvider, ConfigProvider } from 'tlink-core'

import { IntelliJBridgeConfigProvider } from './config'
import { IntelliJBridgeService } from './bridge.service'
import { IntelliJBridgeCommandProvider } from './commandProvider'

@NgModule({
    imports: [
        CommonModule,
    ],
    providers: [
        IntelliJBridgeService,
        { provide: ConfigProvider, useClass: IntelliJBridgeConfigProvider, multi: true },
        { provide: CommandProvider, useClass: IntelliJBridgeCommandProvider, multi: true },
    ],
})
export default class IntelliJBridgeModule { }

export { IntelliJBridgeService }
