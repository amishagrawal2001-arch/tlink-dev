import { PipeTransform } from '@angular/core';
import filesize from 'filesize';
type FilesizeOptions = Parameters<typeof filesize>[1];
export declare class FilesizePipe implements PipeTransform {
    transform(value: number | string | null | undefined, options?: FilesizeOptions): string;
}
export {};
