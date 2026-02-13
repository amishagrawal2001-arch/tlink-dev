import AbstractBinding from '@serialport/binding-abstract';
import { SerialPortInfo } from '../api';
import { SerialTabComponent } from '../components/serialTab.component';
export declare class SerialService {
    private injector;
    private hostApp;
    private constructor();
    detectBinding(): typeof AbstractBinding;
    listPorts(): Promise<SerialPortInfo[]>;
    quickConnect(query: string): Promise<SerialTabComponent | null>;
}
