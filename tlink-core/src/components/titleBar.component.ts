import { Component, Input } from '@angular/core'
import { HostWindowService } from '../api'
import { HomeBaseService } from '../services/homeBase.service'

/** @hidden */
@Component({
    selector: 'title-bar',
    templateUrl: './titleBar.component.pug',
    styleUrls: ['./titleBar.component.scss'],
})
export class TitleBarComponent {
    @Input() hideControls: boolean

    constructor (
        public hostWindow: HostWindowService,
        public homeBase: HomeBaseService,
    ) { }
}
