import { InputProcessingOptions } from '../middleware/inputProcessing';
/** @hidden */
export declare class InputProcessingSettingsComponent {
    options: InputProcessingOptions;
    backspaceModes: {
        key: string;
        name: string;
    }[];
    getBackspaceModeName(key: any): string | undefined;
    setBackspaceMode(mode: any): void;
}
