export declare class ShellIntegrationService {
    private electron;
    private hostApp;
    private automatorWorkflows;
    private automatorWorkflowsLocation;
    private automatorWorkflowsDestination;
    private registryKeys;
    private constructor();
    isInstalled(): Promise<boolean>;
    install(): Promise<void>;
    remove(): Promise<void>;
    private updatePaths;
}
