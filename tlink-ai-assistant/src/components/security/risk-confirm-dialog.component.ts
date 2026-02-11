import { Component, Input, Output, EventEmitter } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { RiskLevel } from '../../types/security.types';

@Component({
    selector: 'app-risk-confirm-dialog',
    templateUrl: './risk-confirm-dialog.component.html',
    styleUrls: ['./risk-confirm-dialog.component.scss']
})
export class RiskConfirmDialogComponent {
    @Input() command: string = '';
    @Input() explanation: string = '';
    @Input() riskLevel: RiskLevel = RiskLevel.MEDIUM;
    @Input() suggestions: string[] = [];

    @Output() confirmed = new EventEmitter<boolean>();

    constructor(public activeModal: NgbActiveModal) { }

    /**
     * 确认执行
     */
    confirm(): void {
        this.confirmed.emit(true);
        this.activeModal.close(true);
    }

    /**
     * 取消执行
     */
    cancel(): void {
        this.confirmed.emit(false);
        this.activeModal.dismiss(false);
    }

    /**
     * 获取风险级别文本
     */
    getRiskLevelText(): string {
        switch (this.riskLevel) {
            case RiskLevel.LOW:
                return 'Low risk';
            case RiskLevel.MEDIUM:
                return 'Medium risk';
            case RiskLevel.HIGH:
                return 'High risk';
            case RiskLevel.CRITICAL:
                return 'Critical risk';
            default:
                return 'Unknown risk';
        }
    }

    /**
     * 获取风险级别颜色
     */
    getRiskLevelColor(): string {
        switch (this.riskLevel) {
            case RiskLevel.LOW:
                return 'var(--ai-risk-low)';
            case RiskLevel.MEDIUM:
                return 'var(--ai-risk-medium)';
            case RiskLevel.HIGH:
                return 'var(--ai-risk-high)';
            case RiskLevel.CRITICAL:
                return 'var(--ai-risk-critical)';
            default:
                return 'var(--ai-secondary)';
        }
    }

    /**
     * 获取风险级别图标
     */
    getRiskLevelIcon(): string {
        switch (this.riskLevel) {
            case RiskLevel.LOW:
                return 'fa fa-check-circle';
            case RiskLevel.MEDIUM:
                return 'fa fa-exclamation-triangle';
            case RiskLevel.HIGH:
                return 'fa fa-exclamation-circle';
            case RiskLevel.CRITICAL:
                return 'fa fa-ban';
            default:
                return 'fa fa-question-circle';
        }
    }

    /**
     * 是否为高风险
     */
    isHighRisk(): boolean {
        return this.riskLevel === RiskLevel.HIGH || this.riskLevel === RiskLevel.CRITICAL;
    }
}
