import { AfterViewInit, Component, OnInit, ViewEncapsulation } from '@angular/core';
import { ThemeService } from '../../services/core/theme.service';

@Component({
    selector: 'app-tabby-server-settings-tab',
    templateUrl: './tabby-server-settings-tab.component.html',
    styleUrls: ['./tabby-server-settings-tab.component.scss'],
    encapsulation: ViewEncapsulation.None
})
export class TabbyServerSettingsTabComponent implements OnInit, AfterViewInit {
    constructor (private themeService: ThemeService) {}

    ngOnInit (): void {
        // Ensure theme variables are available even when this tab is opened first
        this.themeService.applyTheme(this.themeService.getCurrentTheme());
    }

    ngAfterViewInit (): void {
        // Refresh class bindings once container is attached to DOM
        this.themeService.refreshContainers();
    }
}
