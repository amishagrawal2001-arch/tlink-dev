import { Component, Input, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core'
import { BaseComponent as CoreBaseComponent, ConfigService, getCSSFontFamily } from 'tlink-core'
import { TerminalColorScheme } from '../api/interfaces'

// Fallback base class to avoid runtime crashes if the core export is undefined
const BaseComponent: any = CoreBaseComponent ?? class {}

/** @hidden */
@Component({
    selector: 'color-scheme-preview',
    templateUrl: './colorSchemePreview.component.pug',
    styleUrls: ['./colorSchemePreview.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ColorSchemePreviewComponent extends BaseComponent {
    @Input() scheme: TerminalColorScheme
    @Input() fontPreview = false

    constructor (
        public config: ConfigService,
        changeDetector: ChangeDetectorRef,
    ) {
        super()
        this.subscribeUntilDestroyed(config.changed$, () => {
            changeDetector.markForCheck()
        })
    }

    getPreviewFontFamily (): string {
        return getCSSFontFamily(this.config.store)
    }
}
