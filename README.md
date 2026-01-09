# Tlink AI

<p align="center">
  <strong>AI-Enhanced Terminal Emulator with Integrated Code Editor</strong>
</p>

<p align="center">
  <a href="https://github.com/amishagrawal2001-arch/tlink-ai"><img alt="GitHub" src="https://img.shields.io/github/stars/amishagrawal2001-arch/tlink-ai?style=for-the-badge&logo=github"></a> &nbsp; <a href="https://github.com/amishagrawal2001-arch/tlink-ai/issues"><img alt="GitHub Issues" src="https://img.shields.io/github/issues/amishagrawal2001-arch/tlink-ai?style=for-the-badge&logo=github"></a> &nbsp; <a href="https://github.com/amishagrawal2001-arch/tlink-ai/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/amishagrawal2001-arch/tlink-ai?style=for-the-badge"></a>
</p>

<p align="center">
  <a href="https://ko-fi.com/J3J8KWTF">
    <img src="https://cdn.ko-fi.com/cdn/kofi3.png?v=2" width="150">
  </a>
</p>

---

> 👋 Managing remote environments? Check out [Warpgate, my smart SSH/HTTP/MySQL bastion server](https://github.com/warp-tech/warpgate), it works great with Tlink AI, you'll love it.

----

### About Tlink AI

Tlink AI is a fork of [Tlink](https://tlink.sh) with enhanced AI capabilities, integrated code editor, and business-focused features. See [BUSINESS_ENHANCEMENTS.md](./BUSINESS_ENHANCEMENTS.md) for detailed enhancement plans.

### Key Features

* **AI-Powered Terminal Assistant** - Context-aware command suggestions and automated troubleshooting
* **Integrated Code Editor** - Monaco-based editor with directory explorer, file management, and run-in-terminal capabilities
* **Enhanced Collaboration** - Workspace management and team features (coming soon)
* **All Original Tlink Features** - SSH, serial terminal, theming, split panes, and more

<br/>
<p align="center">
This README is also available in: <a  href="./README.es-ES.md">:es: Spanish</a> · <a  href="./README.ru-RU.md">:ru: Русский</a> · <a  href="./README.ko-KR.md">:kr: 한국어</a> · <a  href="./README.zh-CN.md">:cn: 简体中文</a> · <a  href="./README.it-IT.md">:it: Italiano</a> · <a href="./README.de-DE.md">:de: Deutsch</a> · <a href="./README.ja-JP.md">:jp: 日本語</a> · <a href="./README.id-ID.md">:id: Bahasa Indonesia</a> · <a href="./README.pt-BR.md">:brazil: Português</a> · <a href="./README.pl-PL.md">:poland: Polski</a>
</p>

----

[**Tlink AI**](https://github.com/amishagrawal2001-arch/tlink-ai) is an enhanced version of Tlink with AI-powered features, integrated code editor, and advanced terminal capabilities for Windows 10, macOS and Linux

* Integrated SSH and Telnet client and connection manager
* Integrated serial terminal
* Theming and color schemes
* Fully configurable shortcuts and multi-chord shortcuts
* Split panes
* Remembers your tabs
* PowerShell (and PS Core), WSL, Git-Bash, Cygwin, MSYS2, Cmder and CMD support
* Direct file transfer from/to SSH sessions via Zmodem
* Full Unicode support including double-width characters
* Doesn't choke on fast-flowing outputs
* Proper shell experience on Windows including tab completion (via Clink)
* Integrated encrypted container for SSH secrets and configuration
* SSH, SFTP and Telnet client available as a [web app](https://tlink.sh/app) (also [self-hosted](https://github.com/Eugeny/tlink-web)).

# Contents <!-- omit in toc -->

- [About Tlink AI](#about-tlink-ai)
- [Key Features](#key-features)
- [What Tlink AI is and isn't](#what-tlink-ai-is-and-isnt)
- [Terminal features](#terminal-features)
- [SSH Client](#ssh-client)
- [Serial Terminal](#serial-terminal)
- [Code Editor](#code-editor)
- [AI Integration](#ai-integration)
- [Portable](#portable)
- [Plugins](#plugins)
- [Themes](#themes)
- [Business Enhancements](#business-enhancements)
- [Contributing](#contributing)

<a name="about"></a>

# What Tlink AI is and isn't

* **Tlink AI is** an enhanced terminal emulator with AI integration, code editing capabilities, and advanced features - an alternative to Windows' standard terminal (conhost), PowerShell ISE, PuTTY, macOS Terminal.app and iTerm

* **Tlink AI is not** a new shell or a MinGW or Cygwin replacement. Neither is it lightweight - if RAM usage is of importance, consider [Conemu](https://conemu.github.io) or [Alacritty](https://github.com/jwilm/alacritty)

<a name="terminal"></a>

# Terminal features

![](docs/readme-terminal.png)

* A VT220 terminal + various extensions
* Multiple nested split panes
* Tabs on any side of the window
* Optional dockable window with a global spawn hotkey ("Quake console")
* Progress detection
* Notification on process completion
* Bracketed paste, multiline paste warnings
* Font ligatures
* Custom shell profiles
* Optional RMB paste and copy-on select (PuTTY style)

<a name="ssh"></a>

# SSH Client

![](docs/readme-ssh.png)

* SSH2 client with a connection manager
* X11 and port forwarding
* Automatic jump host management
* Agent forwarding (incl. Pageant and Windows native OpenSSH Agent)
* Login scripts

<a name="serial"></a>

# Serial Terminal

* Saved connections
* Readline input support
* Optional hex byte-by-byte input and hexdump output
* Newline conversion
* Automatic reconnection

<a name="portable"></a>

# Portable

Tlink AI will run as a portable app on Windows, if you create a `data` folder in the same location where `Tlink.exe` lives.

<a name="plugins"></a>

# Plugins

Plugins and themes can be installed directly from the Settings view inside Tlink AI.

* [docker](https://github.com/Eugeny/tlink-docker) - connect to Docker containers
* [title-control](https://github.com/kbjr/terminus-title-control) - allows modifying the title of the terminal tabs by providing a prefix, suffix, and/or strings to be removed
* [quick-cmds](https://github.com/Domain/terminus-quick-cmds) - quickly send commands to one or all terminal tabs
* [save-output](https://github.com/Eugeny/tlink-save-output) - record terminal output into a file
* [sync-config](https://github.com/starxg/terminus-sync-config) - sync the config to Gist or Gitee
* [clippy](https://github.com/Eugeny/tlink-clippy) - an example plugin which annoys you all the time
* [workspace-manager](https://github.com/composer404/tlink-workspace-manager) - allows creating custom workspace profiles based on the given config
* [search-in-browser](https://github.com/composer404/tlink-search-in-browser) - opens default system browser with a text selected from the Tlink's tab
* [sftp-tab](https://github.com/wljince007/tlink-sftp-tab) - open sftp tab for ssh connection like SecureCRT
* [background](https://github.com/moemoechu/tlink-background) - change Tlink background image and more...
* [highlight](https://github.com/moemoechu/tlink-highlight) - Tlink terminal keyword highlight plugin
* [web-auth-handler](https://github.com/Jazzmoon/tlink-web-auth-handler) - In-app web authentication popups (Built primarily for warpgate in-browser auth)
* [mcp-server](https://github.com/thuanpham582002/tlink-mcp-server) - Powerful Model Context Protocol server integration for Tlink that seamlessly connects with AI assistants through MCP clients like Cursor and Windsurf, enhancing your terminal workflow with intelligent AI capabilities.

<a name="themes"></a>

# Themes

* [hype](https://github.com/Eugeny/tlink-theme-hype) - a Hyper inspired theme
* [relaxed](https://github.com/Relaxed-Theme/relaxed-terminal-themes#terminus) - the Relaxed theme for Tlink
* [gruvbox](https://github.com/porkloin/terminus-theme-gruvbox)
* [windows10](https://www.npmjs.com/package/terminus-theme-windows10)
* [altair](https://github.com/yxuko/terminus-altair)
* [catppuccin](https://github.com/catppuccin/tlink) - Soothing pastel theme for Tlink
* [noctis](https://github.com/aaronhuggins/tlink-colors-noctis) - color themes inspired by Noctis VS Code theme

# Sponsors <!-- omit in toc -->

<a href="https://packagecloud.io"><img src="https://assets-production.packagecloud.io/assets/logo_v1-d5895e7b89b2dee19030e85515fd0f91d8f3b37c82d218a6531fc89c2b1b613c.png" width="200"></a>

[**packagecloud**](https://packagecloud.io) has provided free Debian/RPM repository hosting

[![](https://user-images.githubusercontent.com/161476/200423885-7aba2202-fea7-4409-95b9-3a062ce902c7.png)](https://keygen.sh/?via=eugene)

[**keygen**](https://keygen.sh/?via=eugene) has provided free release & auto-update hosting

<a href="https://iqhive.com/"><img src="https://iqhive.com/img/icons/logo.svg" width="200"></a>

[**IQ Hive**](https://iqhive.com) is providing financial support for the project development


<a name="contributing"></a>
# Contributing

Pull requests and plugins are welcome!

See [HACKING.md](./HACKING.md) and [API docs](https://docs.tlink.sh/) for information of how the project is laid out, and a very brief plugin development tutorial.

## Business Enhancements

Tlink AI includes a comprehensive roadmap for business-focused enhancements. See [BUSINESS_ENHANCEMENTS.md](./BUSINESS_ENHANCEMENTS.md) for detailed plans including:

- Workspace management and team collaboration
- Cloud sync and backup
- Enhanced AI integration
- Enterprise security features
- CI/CD integration
- Marketplace ecosystem
- And much more!

---
<a name="contributors"></a>

Thanks goes to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="http://www.russellmyers.com"><img src="https://avatars2.githubusercontent.com/u/184085?v=4?s=100" width="100px;" alt="Russell Myers"/><br /><sub><b>Russell Myers</b></sub></a><br /><a href="https://github.com/Eugeny/tlink/commits?author=mezner" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="http://www.morwire.com"><img src="https://avatars1.githubusercontent.com/u/3991658?v=4?s=100" width="100px;" alt="Austin Warren"/><br /><sub><b>Austin Warren</b></sub></a><br /><a href="https://github.com/Eugeny/tlink/commits?author=ehwarren" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/Drachenkaetzchen"><img src="https://avatars1.githubusercontent.com/u/162974?v=4?s=100" width="100px;" alt="Felicia Hummel"/><br /><sub><b>Felicia Hummel</b></sub></a><br /><a href="https://github.com/Eugeny/tlink/commits?author=Drachenkaetzchen" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/mikemaccana"><img src="https://avatars2.githubusercontent.com/u/172594?v=4?s=100" width="100px;" alt="Mike MacCana"/><br /><sub><b>Mike MacCana</b></sub></a><br /><a href="https://github.com/Eugeny/tlink/commits?author=mikemaccana" title="Tests">⚠️</a> <a href="#design-mikemaccana" title="Design">🎨</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/yxuko"><img src="https://avatars1.githubusercontent.com/u/1786317?v=4?s=100" width="100px;" alt="Yacine Kanzari"/><br /><sub><b>Yacine Kanzari</b></sub></a><br /><a href="https://github.com/Eugeny/tlink/commits?author=yxuko" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/BBJip"><img src="https://avatars2.githubusercontent.com/u/32908927?v=4?s=100" width="100px;" alt="BBJip"/><br /><sub><b>BBJip</b></sub></a><br /><a href="https://github.com/Eugeny/tlink/commits?author=BBJip" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/Futagirl"><img src="https://avatars2.githubusercontent.com/u/33533958?v=4?s=100" width="100px;" alt="Futagirl"/><br /><sub><b>Futagirl</b></sub></a><br /><a href="#design-Futagirl" title="Design">🎨</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind are welcome!
