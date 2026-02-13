import { StreamProcessingOptions } from '../middleware/streamProcessing';
/** @hidden */
export declare class StreamProcessingSettingsComponent {
    options: StreamProcessingOptions;
    inputModes: ({
        key: null;
        name: "Normal";
        description: "Input is sent as you type";
    } | {
        key: string;
        name: "Local echo";
        description: "Immediately echoes your input locally";
    } | {
        key: string;
        name: "Line by line";
        description: "Line editor, input is sent after you press Enter";
    } | {
        key: string;
        name: "Hexadecimal";
        description: "Send bytes by typing in hex values";
    })[];
    outputModes: ({
        key: null;
        name: "Normal";
        description: "Output is shown as it is received";
    } | {
        key: string;
        name: "Hexadecimal";
        description: "Output is shown as a hexdump";
    })[];
    newlineModes: ({
        key: null;
        name: "Keep";
    } | {
        key: string;
        name: "Strip";
    } | {
        key: string;
        name: "Force CR";
    } | {
        key: string;
        name: "Force LF";
    } | {
        key: string;
        name: "Force CRLF";
    } | {
        key: string;
        name: "Implicit CR in every LF";
    } | {
        key: string;
        name: "Implicit LF in every CR";
    })[];
    getInputModeName(key: any): "Normal" | "Local echo" | "Line by line" | "Hexadecimal" | undefined;
    getOutputModeName(key: any): "Normal" | "Hexadecimal" | undefined;
    setInputMode(mode: any): void;
    setOutputMode(mode: any): void;
}
