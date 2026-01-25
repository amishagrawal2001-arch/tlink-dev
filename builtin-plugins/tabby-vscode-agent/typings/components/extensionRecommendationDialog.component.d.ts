import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { UrlOpeningService } from '../services/urlOpening.service';
export declare class ExtensionRecommendationDialogComponent {
    modal: NgbActiveModal;
    private urlOpeningService;
    constructor(modal: NgbActiveModal, urlOpeningService: UrlOpeningService);
    openMarketplace(): void;
    dismiss(): void;
}
