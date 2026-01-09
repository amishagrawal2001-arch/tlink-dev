# Tabby (formerly Terminus) - AI Coding Assistant Instructions

## Project Overview
Tabby is an Electron-based terminal emulator and SSH/serial client built with Angular and TypeScript. It features a plugin-based architecture where functionality is provided through modular plugins that extend the core application.

## Architecture
- **Main App**: `app/` - Electron main/renderer processes
- **Core Plugins**: `tlink-*` directories provide functionality via Angular modules
- **Build System**: Webpack with separate configs for main process, renderer, and plugins
- **Extension Points**: Plugins use multi-providers to extend UI and functionality

## Key Components
- `tlink-core`: Base UI, tabs, theming, config management
- `tlink-terminal`: VT220 terminal emulation and tab management
- `tlink-ssh`: SSH client with connection manager
- `tlink-local`: Local shell profiles and execution
- `tlink-settings`: Settings UI and configuration
- `tlink-plugin-manager`: Plugin installation from NPM

## Development Workflow
```bash
# Setup
yarn  # Install dependencies (requires Node 15+, Yarn)

# Development
yarn run build:typings  # Generate TypeScript definitions
yarn run build         # Build all modules
yarn start             # Run in dev mode with hot reload

# Production build
node scripts/prepackage-plugins.mjs
node scripts/build-macos.mjs  # or build-linux.mjs, build-windows.mjs
```

## Plugin Development
- Plugins are Angular NgModules exported as default
- Use multi-providers for extension points (e.g., `ToolbarButtonProvider`)
- Include `"tlink-plugin"` keyword in package.json
- Structure: `src/` with `components/`, `services/`, `api.ts`, `index.ts`
- Templates use Pug, styles use SCSS

## Code Patterns
- **Imports**: Use path mapping `"tlink-*": ["../../tlink-*/src"]`
- **Extension Points**: Extend via providers like `TabContextMenuItemProvider`
- **Services**: Injectable classes for business logic
- **Components**: Angular components with `.component.ts`, `.component.pug`, `.component.scss`

## Build System
- **Webpack**: Modular configs in each plugin's `webpack.config.mjs`
- **TypeScript**: Strict mode with Angular compiler options
- **Native Modules**: `scripts/build-native.mjs` handles platform-specific binaries
- **Dependencies**: `scripts/install-deps.mjs` installs system dependencies

## Testing & Quality
- **Linting**: `yarn run lint` (ESLint with TypeScript rules)
- **Type Checking**: Built into webpack build process
- **CI/CD**: GitHub Actions with platform-specific builds

## Key Files
- `HACKING.md`: Development setup and plugin architecture
- `scripts/vars.mjs`: Plugin list and build configuration
- `tlink-core/src/api.ts`: Core extension points
- `package.json`: Build scripts and dependencies</content>
<parameter name="filePath">/Users/surajsharma/Tlink/.github/copilot-instructions.md