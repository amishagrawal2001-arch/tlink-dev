export interface OutputAnalyzerPattern {
    regex: string
    suggestion: string
    severity: 'info' | 'warning' | 'error'
}

export const DEFAULT_OUTPUT_ANALYZER_PATTERNS: OutputAnalyzerPattern[] = [
    {
        regex: 'command not found',
        suggestion: 'Command not found. Check spelling or install the package.',
        severity: 'error',
    },
    {
        regex: 'Permission denied',
        suggestion: 'Permission denied. Try running with sudo or check file permissions.',
        severity: 'warning',
    },
    {
        regex: 'Connection refused',
        suggestion: 'Connection refused. Check if the service is running and the port is correct.',
        severity: 'error',
    },
    {
        regex: 'No such file or directory',
        suggestion: 'File or directory not found. Verify the path exists.',
        severity: 'warning',
    },
    {
        regex: 'Address already in use',
        suggestion: 'Port already in use. Find and stop the process using that port, or use a different port.',
        severity: 'error',
    },
    {
        regex: 'ENOSPC|No space left on device',
        suggestion: 'Disk full. Free up disk space to continue.',
        severity: 'error',
    },
    {
        regex: 'ECONNREFUSED',
        suggestion: 'Connection refused. The target server may be down or unreachable.',
        severity: 'error',
    },
    {
        regex: 'ETIMEOUT|Connection timed out',
        suggestion: 'Connection timed out. Check network connectivity and firewall settings.',
        severity: 'error',
    },
    {
        regex: 'Module not found|Cannot find module',
        suggestion: 'Module not found. Try running npm install or yarn install.',
        severity: 'error',
    },
    {
        regex: 'SyntaxError:|TypeError:|ReferenceError:',
        suggestion: 'JavaScript error detected. Check the stack trace for the source.',
        severity: 'error',
    },
    {
        regex: 'FATAL|PANIC|Segmentation fault',
        suggestion: 'Fatal error detected. Check logs for more details.',
        severity: 'error',
    },
    {
        regex: 'Out of memory|OOMKilled|heap out of memory',
        suggestion: 'Out of memory. Increase available memory or optimize the process.',
        severity: 'error',
    },
]
