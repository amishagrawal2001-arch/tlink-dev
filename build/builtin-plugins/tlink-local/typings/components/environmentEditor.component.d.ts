import { Subject } from 'rxjs';
/** @hidden */
export declare class EnvironmentEditorComponent {
    modelChange: Subject<any>;
    vars: {
        key: string;
        value: string;
    }[];
    private cachedModel;
    get model(): any;
    set model(value: any);
    getModel(): {};
    emitUpdate(): void;
    addEnvironmentVar(): void;
    removeEnvironmentVar(key: string): void;
    shouldShowExample(): boolean;
    addExample(): void;
}
