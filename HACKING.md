# Some background

Tlink is an Electron app, with the frontend written in Typescript with the help of Angular framework. It's built using Webpack.

# Getting started

First of all, clone this repository.

# Install Dependencies
- [Node.js](https://nodejs.org/en/download/) **version 15 or newer*
- [Yarn](https://yarnpkg.com/)

First, from within the `tlink` directory install the dependencies via yarn:

```
# macOS & Windows:
yarn
```

```
# Linux (Debian/Ubuntu here as an example)
sudo apt install libfontconfig-dev libsecret-1-dev libarchive-tools libnss3 libatk1.0-0 libatk-bridge2.0-0 libgdk-pixbuf2.0-0 libgtk-3-0 libgbm1 cmake
yarn
```

_⚠️Note: If you forked this repository, you may need to pull down the tags from this repository before installing node modules. `git pull --tags upstream master`_

Build Tlink:

```
yarn run build
```

Start Tlink

```
yarn start
```

# Building an installer

To build an installer, first complete a "normal" build as described above and then run:

```
node scripts/prepackage-plugins.mjs

node scripts/build-windows.mjs
# or
node scripts/build-linux.mjs
# or
node scripts/build-macos.mjs
```

The artifacts will be produced in the `dist` folder.

# Project layout
```
tlink
├─ app                                  # Electron app, just the bare essentials
|  ├─ src                               # Electron renderer code
|  └─ main.js                           # Electron main entry point
├─ build
├─ clink                                # Clink distribution, for Windows
├─ scripts                              # Maintenance scripts
├─ tlink-community-color-schemes     # Plugin that provides color schemes
├─ tlink-core                        # Plugin that provides base UI and tab management
├─ tlink-electron                    # Plugin that provides Electron-specific functions
├─ tlink-local                       # Plugin that provides local shells and profiles
├─ tlink-plugin-manager              # Plugin that installs other plugins
├─ tlink-settings                    # Plugin that provides the settings tab
├─ tlink-terminal                    # Plugin that provides terminal tabs
└─ tlink-web                         # Plugin that provides web-specific functions
```

# Plugin layout
```
tlink-pluginname
├─ src                                  # Typescript code
|  ├─ components                        # Angular components
|  |  ├─ foo.component.ts               # Code
|  |  ├─ foo.component.scss             # Styles
|  |  └─ foo.component.pug              # Template
|  ├─ services                          # Angular services
|  |  └─ foo.service.ts
|  ├─ api.ts                            # Publicly exported API
|  └─ index.ts                          # Module entry point
├─ package.json
├─ tsconfig.json
└─ webpack.config.js
```

# Plugins

The app will load all plugins from the source checkout in the dev mode, from the user's plugins directory at all times (click `Open Plugins Directory` under `Settings` > `Plugins`) and from the directory specified by the `TLINK_PLUGINS` environment var.

Only modules whose `package.json` file contains a `tlink-plugin` keyword will be loaded.

If you're currently in your plugin's directory, start Tlink as `TLINK_PLUGINS=$(pwd) tlink --debug`

A plugin should only provide a default export, which should be a `NgModule` class (or a `NgModuleWithDependencies` where applicable). This module will be injected as a dependency to the app's root module.

```javascript
import { NgModule } from '@angular/core'

@NgModule()
export default class MyModule {
  constructor () {
    console.log('Angular engaged, cap\'n.')
  }
}
```

Plugins provide functionality by exporting singular or multi providers:


```javascript
import { NgModule, Injectable } from '@angular/core'
import { ToolbarButtonProvider, ToolbarButton } from 'tlink-core'

@Injectable()
export class MyButtonProvider extends ToolbarButtonProvider {
    provide (): ToolbarButton[] {
        return [{
            icon: 'star',
            title: 'Foobar',
            weight: 10,
            click: () => {
                alert('Woohoo!')
            }
        }]
    }
}

@NgModule({
    providers: [
        { provide: ToolbarButtonProvider, useClass: MyButtonProvider, multi: true },
    ],
})
export default class MyModule { }
```


See `tlink-core/src/api.ts`, `tlink-settings/src/api.ts`, `tlink-local/src/api.ts` and `tlink-terminal/src/api.ts` for the available extension points.

Also check out [the example plugin](https://github.com/Eugeny/tlink-clippy).

Publish your plugin on NPM with a `tlink-plugin` keyword to make it appear in the Plugin Manager.
