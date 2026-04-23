import { Injectable } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import * as CryptoJS from 'crypto-js';
import { PasswordValidationResult } from '../../types/security.types';
import { LoggerService } from '../core/logger.service';
import { FileStorageService } from '../core/file-storage.service';
import { PasswordPromptComponent } from '../../components/security/password-prompt.component';

@Injectable({ providedIn: 'root' })
export class PasswordManagerService {
    private readonly STORAGE_KEY = 'ai-assistant-password-hash';
    private readonly STATE_KEY = 'ai-assistant-password-state';
    private readonly MAX_ATTEMPTS = 5;
    private readonly LOCKOUT_TIME = 15 * 60 * 1000; // 15分钟

    private attempts = 0;
    private lockoutUntil: number | null = null;

    /** 文件存储键名 */
    private readonly PASSWORD_FILENAME = 'password';
    private readonly PASSWORD_STATE_FILENAME = 'password-state';

    constructor(
        private logger: LoggerService,
        private fileStorage: FileStorageService,
        private modal: NgbModal
    ) {
        this.loadState();
    }

    /**
     * 设置密码
     */
    setPassword(password: string): void {
        const hash = this.hashPassword(password);
        this.fileStorage.save(this.PASSWORD_FILENAME, { hash });
        this.logger.info('Password set successfully');
    }

    /**
     * 验证密码
     */
    async requestPassword(): Promise<boolean> {
        // 检查是否被锁定
        if (this.isLocked()) {
            const remainingTime = this.getRemainingLockoutTime();
            this.logger.warn('Password attempts locked', { remainingTime });
            alert(`Account locked. Please wait ${Math.ceil(remainingTime / 60000)} minutes and try again.`);
            return false;
        }

        // Prompt via the in-app modal component rather than the browser's
        // native `prompt()`. Native prompt exposes the plaintext in the
        // window URL bar on some platforms, blocks the main thread, can't be
        // styled, and keeps the string pinned in browser memory until GC.
        // The Angular modal's input is a local component field; we zero it
        // out explicitly after verification finishes.
        let password: string
        try {
            const ref = this.modal.open(PasswordPromptComponent, {
                backdrop: 'static',
                keyboard: true,
                centered: true,
            });
            ref.componentInstance.title = 'Enter your password to continue';
            password = await ref.result as string
            // Clear the component's copy immediately (best-effort; strings
            // are immutable but this lets the GC reclaim sooner).
            ref.componentInstance.password = ''
        } catch {
            // User dismissed / cancelled — treat as "no".
            return false;
        }
        if (!password) {
            return false;
        }

        // 验证密码
        const isValid = await this.verifyPassword(password);
        // Overwrite the local reference so it's not retained in closure.
        password = '';

        if (isValid) {
            this.resetAttempts();
            this.logger.info('Password verified successfully');
            return true;
        } else {
            this.attempts++;
            this.logger.warn('Password verification failed', { attempts: this.attempts });

            if (this.attempts >= this.MAX_ATTEMPTS) {
                this.lockoutUntil = Date.now() + this.LOCKOUT_TIME;
                this.saveState();
                this.logger.error('Password attempts exceeded, account locked');
                alert(`Too many incorrect attempts. Account locked for ${this.LOCKOUT_TIME / 60000} minutes.`);
            }

            return false;
        }
    }

    /**
     * 检查是否有密码保护
     */
    hasPassword(): boolean {
        const data = this.fileStorage.load<{ hash: string }>(this.PASSWORD_FILENAME, { hash: '' });
        return !!data.hash;
    }

    /**
     * 清除密码
     */
    clearPassword(): void {
        this.fileStorage.delete(this.PASSWORD_FILENAME);
        this.resetAttempts();
        this.logger.info('Password cleared');
    }

    /**
     * 验证密码是否正确
     */
    private async verifyPassword(password: string): Promise<boolean> {
        const data = this.fileStorage.load<{ hash: string }>(this.PASSWORD_FILENAME, { hash: '' });
        if (!data.hash) {
            // 没有设置密码，允许通过
            return true;
        }

        const inputHash = this.hashPassword(password);
        return inputHash === data.hash;
    }

    /**
     * 哈希密码
     */
    private hashPassword(password: string): string {
        // 使用SHA-256哈希密码
        return CryptoJS.SHA256(password).toString();
    }

    /**
     * 检查是否被锁定
     */
    private isLocked(): boolean {
        return this.lockoutUntil !== null && Date.now() < this.lockoutUntil;
    }

    /**
     * 获取剩余锁定时间
     */
    private getRemainingLockoutTime(): number {
        if (this.lockoutUntil === null) return 0;
        return Math.max(0, this.lockoutUntil - Date.now());
    }

    /**
     * 重置尝试次数
     */
    private resetAttempts(): void {
        this.attempts = 0;
        this.lockoutUntil = null;
        this.saveState();
    }

    /**
     * 保存状态
     */
    private saveState(): void {
        const state = {
            attempts: this.attempts,
            lockoutUntil: this.lockoutUntil
        };
        this.fileStorage.save(this.PASSWORD_STATE_FILENAME, state);
    }

    /**
     * 加载状态
     */
    private loadState(): void {
        try {
            const state = this.fileStorage.load<{
                attempts: number;
                lockoutUntil: number | null;
            }>(this.PASSWORD_STATE_FILENAME, { attempts: 0, lockoutUntil: null });

            if (state) {
                this.attempts = state.attempts || 0;
                this.lockoutUntil = state.lockoutUntil;

                // 检查锁定是否过期
                if (this.lockoutUntil && Date.now() >= this.lockoutUntil) {
                    this.resetAttempts();
                }
            }
        } catch (error) {
            this.logger.error('Failed to load password state', error);
        }
    }

    /**
     * 获取验证结果
     */
    getValidationResult(): PasswordValidationResult {
        return {
            valid: this.attempts === 0 && !this.isLocked(),
            attempts: this.attempts,
            locked: this.isLocked(),
            lockExpiry: this.lockoutUntil || undefined
        };
    }

    /**
     * 获取总尝试次数
     */
    getTotalAttempts(): number {
        return this.attempts;
    }

    /**
     * 获取失败次数
     */
    getFailedAttempts(): number {
        return Math.max(0, this.attempts - 1);
    }
}
