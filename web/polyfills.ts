/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/no-extraneous-class */

import './polyfills.buffer'
import { Duplex } from 'stream-browserify'

const Tlink = window['Tlink']

export class SocketProxy extends Duplex {
    socket: any

    constructor (...args: any[]) {
        super({
            allowHalfOpen: false,
        })
        this.socket = window['__connector__'].createSocket(...args)
        this.socket.connect$.subscribe(() => this['emit']('connect'))
        this.socket.data$.subscribe(data => this['emit']('data', Buffer.from(data)))
        this.socket.error$.subscribe(error => this['emit']('error', error))
    }

    connect (...args: any[]) {
        this.socket.connect(...args)
    }

    setNoDelay () { }

    setTimeout () { }

    _read (_size: number): void { }

    _write (chunk: Buffer, _encoding: string, callback: (error?: Error | null) => void): void {
        this.socket.write(chunk)
        callback()
    }

    _destroy (error: Error|null, callback: (error: Error|null) => void): void {
        this.socket.close(error)
        callback(error)
    }
}

Tlink.registerMock('fs', {
    rmdirSync: () => null,
    realpathSync: () => null,
    readdir: () => null,
    stat: () => null,
    appendFile: () => null,
    constants: {},
})
Tlink.registerMock('fs/promises', {})
Tlink.registerMock('tls', {})
Tlink.registerMock('module', {
    globalPaths: [],
    prototype: { require: window['require'] },
})

Tlink.registerMock('http', {
    Agent: class {},
    request: {},
})
Tlink.registerMock('https', {
    Agent: class {},
    request: {},
})
Tlink.registerMock('querystring', {})
Tlink.registerMock('tty', { isatty: () => false })
Tlink.registerMock('child_process', {})
Tlink.registerMock('readable-stream', {})
Tlink.registerMock('os', {
    arch: () => 'web',
    platform: () => 'web',
    homedir: () => '/home',
    tmpdir: () => '/tmp',
    constants: {
        errno: {},
    },
})
Tlink.registerModule('buffer', {
    Buffer: window['Buffer'],
})
Tlink.registerModule('crypto', {
    ...require('crypto-browserify'),
    getHashes () {
        return ['sha1', 'sha224', 'sha256', 'sha384', 'sha512', 'md5', 'rmd160']
    },
    timingSafeEqual (a, b) {
        return a.equals(b)
    },
})
Tlink.registerMock('dns', {})
Tlink.registerMock('@luminati-io/socksv5', {})
Tlink.registerMock('util', require('util/'))
Tlink.registerMock('keytar', {
    getPassword: () => null,
})
Tlink.registerMock('@serialport/bindings', {})
Tlink.registerMock('@serialport/bindings-cpp', {})
Tlink.registerMock('tmp', {})

Tlink.registerModule('net', {
    Socket: SocketProxy,
})
Tlink.registerModule('events', require('events'))
Tlink.registerModule('path', require('path-browserify'))
Tlink.registerModule('url', {
    ...require('url'),
    pathToFileURL: x => `file://${x}`,
})
Tlink.registerModule('zlib', {
    ...require('browserify-zlib'),
    constants: require('browserify-zlib'),
})
Tlink.registerModule('assert', Object.assign(
    require('assert'),
    {
        assertNotStrictEqual: () => true,
        notStrictEqual: () => true,
    },
))
Tlink.registerModule('constants', require('constants-browserify'))
Tlink.registerModule('stream', require('stream-browserify'))
Tlink.registerModule('readline', {
    ...require('readline-browserify'),
    cursorTo: () => null,
    clearLine: stream => stream.write('\r'),
})

Tlink.registerModule('@angular/core', require('@angular/core'))
Tlink.registerModule('@angular/cdk', require('@angular/cdk'))
Tlink.registerModule('@angular/cdk/clipboard', require('@angular/cdk/clipboard'))
Tlink.registerModule('@angular/cdk/drag-drop', require('@angular/cdk/drag-drop'))
Tlink.registerModule('@angular/compiler', require('@angular/compiler'))
Tlink.registerModule('@angular/common', require('@angular/common'))
Tlink.registerModule('@angular/forms', require('@angular/forms'))
Tlink.registerModule('@angular/platform-browser', require('@angular/platform-browser'))
Tlink.registerModule('@angular/platform-browser/animations', require('@angular/platform-browser/animations'))
Tlink.registerModule('@angular/platform-browser-dynamic', require('@angular/platform-browser-dynamic'))
Tlink.registerModule('@angular/animations', require('@angular/animations'))
Tlink.registerModule('@angular/localize', require('@angular/localize'))
Tlink.registerModule('@angular/localize/init', require('@angular/localize/init'))
Tlink.registerModule('@ng-bootstrap/ng-bootstrap', require('@ng-bootstrap/ng-bootstrap'))
Tlink.registerModule('ngx-toastr', require('ngx-toastr'))
Tlink.registerModule('deepmerge', require('deepmerge'))
Tlink.registerModule('rxjs', require('rxjs'))
Tlink.registerModule('rxjs/operators', require('rxjs'))
Tlink.registerModule('string_decoder', require('string_decoder'))
Tlink.registerModule('js-yaml', require('js-yaml'))
Tlink.registerModule('zone.js/dist/zone.js', require('zone.js/dist/zone.js'))
Tlink.registerModule('any-promise', require('any-promise'))

Object.assign(window, {
    __dirname: '__dirname',
    setImmediate: setTimeout as any,
})

process.addListener = () => null
