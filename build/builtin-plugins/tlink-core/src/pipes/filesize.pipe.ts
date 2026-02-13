import { Pipe, PipeTransform } from '@angular/core'
import filesize from 'filesize'

type FilesizeOptions = Parameters<typeof filesize>[1]

@Pipe({
    name: 'filesize',
})
export class FilesizePipe implements PipeTransform {
    transform (value: number | string | null | undefined, options?: FilesizeOptions): string {
        if (value === null || value === undefined) {
            return ''
        }

        const numeric = typeof value === 'string' ? Number(value) : value
        if (!Number.isFinite(numeric)) {
            return ''
        }

        const formatted = options ? filesize(numeric, options) : filesize(numeric)
        if (typeof formatted === 'string') {
            return formatted
        }
        if (Array.isArray(formatted)) {
            return `${formatted[0]} ${formatted[1]}`
        }
        if (formatted && typeof formatted === 'object') {
            return `${formatted.value} ${formatted.symbol}`
        }
        return ''
    }
}
