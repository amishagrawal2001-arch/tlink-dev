/**
 * Interface for shell strategy
 * Defines the contract for different shell implementations
 */
export interface ShellStrategy {
    /**
     * Get the shell type identifier
     */
    getShellType(): string;
    /**
     * Get the setup script for this shell type
     * @param startMarker The start marker for command tracking
     * @param endMarker The end marker for command tracking
     */
    getSetupScript(startMarker: string, endMarker: string): string;
    /**
     * Get the command prefix for this shell type
     */
    getCommandPrefix(): string;
    /**
     * Get the cleanup script for this shell type
     */
    getCleanupScript(): string;
}
/**
 * Base abstract class for shell strategies
 */
export declare abstract class BaseShellStrategy implements ShellStrategy {
    abstract getShellType(): string;
    abstract getSetupScript(startMarker: string, endMarker: string): string;
    abstract getCleanupScript(): string;
    /**
     * Default command prefix is empty
     */
    getCommandPrefix(): string;
}
/**
 * Bash shell strategy
 */
export declare class BashShellStrategy extends BaseShellStrategy {
    getShellType(): string;
    getCleanupScript(): string;
    getSetupScript(startMarker: string, endMarker: string): string;
}
/**
 * Zsh shell strategy
 */
export declare class ZshShellStrategy extends BaseShellStrategy {
    getShellType(): string;
    getCleanupScript(): string;
    getSetupScript(startMarker: string, endMarker: string): string;
}
/**
 * POSIX sh shell strategy
 */
export declare class ShShellStrategy extends BaseShellStrategy {
    getShellType(): string;
    getCleanupScript(): string;
    getSetupScript(startMarker: string, endMarker: string): string;
    getCommandPrefix(): string;
}
/**
 * Unknown shell strategy - fallback to sh
 */
export declare class UnknownShellStrategy extends ShShellStrategy {
    getShellType(): string;
}
/**
 * Shell context class that manages shell strategies
 */
export declare class ShellContext {
    private strategies;
    private defaultStrategy;
    constructor();
    /**
     * Register a new shell strategy
     * @param strategy The shell strategy to register
     */
    registerStrategy(strategy: ShellStrategy): void;
    /**
     * Get a shell strategy by type
     * @param shellType The shell type to get
     * @returns The shell strategy for the given type, or the default strategy if not found
     */
    getStrategy(shellType: string): ShellStrategy;
    /**
     * Generate shell detection script
     * @returns Shell detection script
     */
    getShellDetectionScript(): string;
    /**
     * Detect shell type from terminal output
     * @param terminalOutput The terminal output containing shell type
     * @returns The detected shell type
     */
    detectShellType(terminalOutput: string): string | null;
}
