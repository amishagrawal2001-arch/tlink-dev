import { Injectable } from '@angular/core';
import { RiskLevel, RiskAssessment } from '../../types/security.types';
import { LoggerService } from '../core/logger.service';

/**
 * 风险评估服务
 * 负责评估终端命令的安全风险级别
 */
@Injectable({ providedIn: 'root' })
export class RiskAssessmentService {
    // 危险模式匹配规则
    // All patterns use /i so a clever model can't bypass via `RM -RF /` or
    // `Rm -rf /`. Shells on macOS/Linux are case-sensitive but terminal
    // emulators, scripts with case-insensitive path lookup, and Windows
    // sub-shells make case-sensitivity a fragile trust boundary.
    private readonly DANGEROUS_PATTERNS = [
        {
            pattern: /\brm\s+-[rRfF]*[rR][rRfF]*\s+\//i,
            description: 'Recursive delete starting from a root-ish path',
            severity: RiskLevel.CRITICAL
        },
        {
            pattern: /\bsudo\s+rm\b/i,
            description: 'sudo delete command',
            severity: RiskLevel.CRITICAL
        },
        {
            pattern: /\bshred\s+(-[a-z]*\s+)?\//i,
            description: 'shred on a root-ish path',
            severity: RiskLevel.CRITICAL
        },
        {
            pattern: /\bmkfs(\.\w+)?\b/i,
            description: 'Filesystem (re)format',
            severity: RiskLevel.CRITICAL
        },
        {
            pattern: />\s*\/dev\/sd[a-z]/i,
            description: 'Redirect output to a raw block device',
            severity: RiskLevel.CRITICAL
        },
        {
            pattern: /\bchmod\s+-?R?\s*777\b/i,
            description: 'World-writable permission change',
            severity: RiskLevel.HIGH
        },
        {
            pattern: /^\s*mv\s+\S+\s+\/\s*$/im,
            description: 'Move file directly to /',
            severity: RiskLevel.HIGH
        },
        {
            pattern: /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
            description: 'Classic bash fork bomb',
            severity: RiskLevel.CRITICAL
        },
        {
            pattern: /\bdd\s+if=/i,
            description: 'dd command (potentially dangerous)',
            severity: RiskLevel.HIGH
        },
        {
            pattern: /\b(curl|wget)\b[^\n]*\|\s*(sudo\s+)?(sh|bash|zsh|fish|python\d?)\b/i,
            description: 'Download-and-execute pipeline',
            severity: RiskLevel.CRITICAL
        },
        {
            pattern: /\bformat\s+/i,
            description: 'Format command',
            severity: RiskLevel.CRITICAL
        },
        {
            pattern: /\bdel\s+\/s\b/i,
            description: 'Windows delete command',
            severity: RiskLevel.HIGH
        },
        {
            pattern: /\brd\s+\/s\b/i,
            description: 'Windows delete directory command',
            severity: RiskLevel.HIGH
        },

        // ─── Network-gear patterns (Cisco IOS / Junos / Arista / Linux routers) ───
        // The agent needs to distinguish "show me the config" (safe) from
        // "reload the device" (will take it offline). Patterns below assume
        // the command is about to run on a remote device via SSH/Telnet/Serial.
        {
            pattern: /\breload\b/i,
            description: 'Reboot network device',
            severity: RiskLevel.CRITICAL
        },
        {
            pattern: /\bwrite\s+erase\b|\berase\s+startup-config\b/i,
            description: 'Wipe device startup configuration',
            severity: RiskLevel.CRITICAL
        },
        {
            pattern: /\brequest\s+system\s+(reboot|halt|zeroize)\b/i,
            description: 'Junos reboot / halt / zeroize',
            severity: RiskLevel.CRITICAL
        },
        {
            pattern: /^\s*shutdown\b/i,
            description: 'Disable interface (device command, not OS shutdown)',
            severity: RiskLevel.HIGH
        },
        {
            pattern: /\bno\s+(interface|ip\s+address|vlan|router|access-list|route-map|neighbor)\b/i,
            description: 'Remove network configuration stanza',
            severity: RiskLevel.HIGH
        },
        {
            pattern: /\bclear\s+(ip\s+route|arp|mac\s+address-table|counters)\b/i,
            description: 'Clear network state tables',
            severity: RiskLevel.MEDIUM
        },
        {
            pattern: /\b(configure\s+terminal|conf\s+t|configure\s+exclusive|edit\s+private)\b/i,
            description: 'Enter device configuration mode',
            severity: RiskLevel.MEDIUM
        },
        {
            pattern: /\bcopy\s+(running-config|startup-config|flash:|tftp:|ftp:|scp:)/i,
            description: 'Copy device configuration (may overwrite / exfiltrate)',
            severity: RiskLevel.HIGH
        },
        {
            pattern: /\b(boot\s+system|boot\s+image)\b/i,
            description: 'Change device boot image',
            severity: RiskLevel.CRITICAL
        },
        {
            pattern: /\bdelete\s+(flash:|nvram:|slot0:)/i,
            description: 'Delete file from device storage',
            severity: RiskLevel.HIGH
        },
        {
            pattern: /\b(tftp|ftp)\s+\S+/i,
            description: 'Transfer file to/from device',
            severity: RiskLevel.MEDIUM
        },
        {
            pattern: /\b(format|erase)\s+(flash:|nvram:|slot0:)/i,
            description: 'Format / erase device storage',
            severity: RiskLevel.CRITICAL
        },
    ];

    // 系统修改命令
    private readonly SYSTEM_COMMANDS = [
        'rm', 'del', 'rd', 'mv', 'cp', 'chmod', 'chown', 'dd', 'fdisk',
        'mkfs', 'format', 'mount', 'umount', 'sysctl', 'echo', 'tee'
    ];

    // 网络命令（可能需要额外检查）
    private readonly NETWORK_COMMANDS = [
        'curl', 'wget', 'ssh', 'scp', 'ftp', 'telnet', 'nc', 'netcat'
    ];

    // 只读安全命令
    private readonly READONLY_COMMANDS = [
        'ls', 'cat', 'grep', 'find', 'ps', 'df', 'du', 'top', 'htop',
        'pwd', 'whoami', 'which', 'whereis', 'type', 'file', 'stat',
        'head', 'tail', 'less', 'more', 'sort', 'uniq', 'wc', 'echo'
    ];

    constructor(private logger: LoggerService) {}

    /**
     * 评估命令风险
     */
    async assessRisk(command: string): Promise<RiskLevel> {
        const assessment = await this.performAssessment(command);
        return assessment.level;
    }

    /**
     * 执行详细的风险评估
     */
    async performAssessment(command: string): Promise<RiskAssessment> {
        this.logger.debug('Assessing risk for command', { command });

        const matchedPatterns: {
            pattern: string;
            match: string;
            severity: RiskLevel;
        }[] = [];
        let maxSeverity = RiskLevel.LOW;
        const reasons: string[] = [];

        // 1. 检查危险模式
        for (const rule of this.DANGEROUS_PATTERNS) {
            if (rule.pattern.test(command)) {
                matchedPatterns.push({
                    pattern: rule.pattern.source,
                    match: command.match(rule.pattern)?.[0] || '',
                    severity: rule.severity
                });
                reasons.push(`Dangerous pattern detected: ${rule.description}`);

                if (this.getSeverityLevel(rule.severity) > this.getSeverityLevel(maxSeverity)) {
                    maxSeverity = rule.severity;
                }
            }
        }

        // 2. 检查系统修改命令
        const hasSystemCommand = this.hasCommand(command, this.SYSTEM_COMMANDS);
        if (hasSystemCommand && maxSeverity < RiskLevel.MEDIUM) {
            maxSeverity = RiskLevel.MEDIUM;
            reasons.push('Includes system-modifying command');
        }

        // 3. 检查网络命令
        const hasNetworkCommand = this.hasCommand(command, this.NETWORK_COMMANDS);
        if (hasNetworkCommand && maxSeverity < RiskLevel.MEDIUM) {
            maxSeverity = RiskLevel.MEDIUM;
            reasons.push('Includes network command; may involve external requests');
        }

        // 4. 检查是否主要是只读命令
        const hasOnlyReadonly = this.hasOnlyReadonlyCommands(command, this.READONLY_COMMANDS);
        if (hasOnlyReadonly && maxSeverity < RiskLevel.MEDIUM) {
            maxSeverity = RiskLevel.LOW;
            reasons.push('Contains only read-only safe commands');
        }

        // 5. 计算风险分数
        const score = this.calculateRiskScore(command, maxSeverity, matchedPatterns);

        // 6. 生成建议
        const suggestions = this.generateSuggestions(command, maxSeverity, reasons);

        const assessment: RiskAssessment = {
            level: maxSeverity,
            score,
            reasons,
            patterns: matchedPatterns,
            suggestions
        };

        this.logger.info('Risk assessment completed', { assessment });
        return assessment;
    }

    /**
     * 检查命令中是否包含指定命令
     */
    private hasCommand(command: string, cmdList: string[]): boolean {
        const lowerCommand = command.toLowerCase();
        return cmdList.some(cmd => new RegExp(`\\b${cmd}\\b`).test(lowerCommand));
    }

    /**
     * 检查是否仅包含只读命令
     */
    private hasOnlyReadonlyCommands(command: string, readonlyCmds: string[]): boolean {
        const lowerCommand = command.toLowerCase();

        // 提取所有命令词
        const words = lowerCommand.split(/\s+/);
        const cmdWords = words.filter(word =>
            !word.startsWith('-') &&
            !word.startsWith('/') &&
            !word.startsWith('.') &&
            !/^\d+$/.test(word)
        );

        // 检查是否所有命令都在只读列表中
        return cmdWords.every(word =>
            readonlyCmds.some(cmd => word === cmd) ||
            this.isArgumentOrPath(word)
        );
    }

    /**
     * 检查是否是参数或路径
     */
    private isArgumentOrPath(word: string): boolean {
        return word.startsWith('-') ||
               word.startsWith('/') ||
               word.startsWith('./') ||
               word.startsWith('../') ||
               word.includes(':') ||
               word.includes('=') ||
               /^\d+$/.test(word);
    }

    /**
     * 计算风险分数
     */
    private calculateRiskScore(command: string, level: RiskLevel, patterns: any[]): number {
        let score = 0;

        // 基础分数
        switch (level) {
            case RiskLevel.CRITICAL:
                score = 90;
                break;
            case RiskLevel.HIGH:
                score = 70;
                break;
            case RiskLevel.MEDIUM:
                score = 40;
                break;
            case RiskLevel.LOW:
                score = 10;
                break;
        }

        // 根据匹配的模式调整
        score += patterns.length * 10;

        // 根据命令长度调整（长命令可能更复杂）
        if (command.length > 200) {
            score += 10;
        }

        return Math.min(score, 100);
    }

    /**
     * 生成安全建议
     */
    private generateSuggestions(_command: string, level: RiskLevel, reasons: string[]): string[] {
        const suggestions: string[] = [];

        if (level === RiskLevel.CRITICAL) {
            suggestions.push('This command is extremely dangerous and may cause data loss or system damage');
            suggestions.push('Strongly recommended to back up important data before executing');
            suggestions.push('Consider using a safer alternative');
        } else if (level === RiskLevel.HIGH) {
            suggestions.push('This command may modify the system or delete files');
            suggestions.push('Please make sure you understand the command');
            suggestions.push('Consider validating in a test environment first');
        } else if (level === RiskLevel.MEDIUM) {
            suggestions.push('This command may involve system operations');
            suggestions.push('Ensure you have appropriate permissions');
        } else {
            suggestions.push('This command appears relatively safe');
        }

        // 根据具体原因添加建议
        if (reasons.some(r => r.toLowerCase().includes('network command'))) {
            suggestions.push('Be cautious with network access and avoid unknown sources');
        }

        if (reasons.some(r => r.toLowerCase().includes('permission'))) {
            suggestions.push('Check file permissions and avoid granting excessive privileges');
        }

        return suggestions;
    }

    /**
     * 获取风险级别对应的数值
     */
    private getSeverityLevel(level: RiskLevel): number {
        switch (level) {
            case RiskLevel.LOW:
                return 1;
            case RiskLevel.MEDIUM:
                return 2;
            case RiskLevel.HIGH:
                return 3;
            case RiskLevel.CRITICAL:
                return 4;
            default:
                return 0;
        }
    }

    /**
     * 检查是否为危险命令
     */
    async isDangerous(command: string): Promise<boolean> {
        const assessment = await this.performAssessment(command);
        return assessment.level === RiskLevel.HIGH || assessment.level === RiskLevel.CRITICAL;
    }

    /**
     * 获取风险级别描述
     */
    getRiskLevelDescription(level: RiskLevel): string {
        switch (level) {
            case RiskLevel.LOW:
                return 'Low risk - safe command';
            case RiskLevel.MEDIUM:
                return 'Medium risk - use caution';
            case RiskLevel.HIGH:
                return 'High risk - dangerous command';
            case RiskLevel.CRITICAL:
                return 'Critical risk - extremely dangerous command';
            default:
                return 'Unknown risk';
        }
    }

    /**
     * 获取风险级别颜色
     */
    getRiskLevelColor(level: RiskLevel): string {
        switch (level) {
            case RiskLevel.LOW:
                return '#28a745'; // 绿色
            case RiskLevel.MEDIUM:
                return '#ffc107'; // 黄色
            case RiskLevel.HIGH:
                return '#fd7e14'; // 橙色
            case RiskLevel.CRITICAL:
                return '#dc3545'; // 红色
            default:
                return '#6c757d'; // 灰色
        }
    }

    /**
     * 批量评估多个命令
     */
    async assessMultiple(commands: string[]): Promise<{ command: string; level: RiskLevel }[]> {
        const results: { command: string; level: RiskLevel }[] = [];
        for (const command of commands) {
            const level = await this.assessRisk(command);
            results.push({ command, level });
        }
        return results;
    }
}
