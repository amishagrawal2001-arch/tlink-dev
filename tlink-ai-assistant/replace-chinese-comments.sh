#!/bin/bash
# Script to replace common Chinese comment patterns with English equivalents

cd "$(dirname "$0")"

# Common Chinese comment replacements
find src -type f \( -name "*.ts" -o -name "*.html" \) ! -path "*/i18n/translations/*" -exec sed -i '' \
  -e 's/等待应用就绪后初始化/Wait for app to be ready before initializing/g' \
  -e 's/初始化 AI 服务/Initialize AI service/g' \
  -e 's/延迟 1 秒初始化侧边栏/Delay 1 second to initialize sidebar/g' \
  -e 's/订阅热键事件/Subscribe to hotkey events/g' \
  -e 's/处理热键事件/Handle hotkey events/g' \
  -e 's/处理命令生成快捷键/Handle command generation hotkey/g' \
  -e 's/处理命令解释快捷键/Handle command explanation hotkey/g' \
  -e 's/尝试获取选中文本/Try to get selected text/g' \
  -e 's/尝试获取最后一条命令/Try to get last command/g' \
  -e 's/获取终端上下文/Get terminal context/g' \
  -e 's/构建提示并发送/Build prompt and send/g' \
  -e 's/构建提示/Build prompt/g' \
  -e 's/发送消息（自动发送）/Send message (auto-send)/g' \
  -e 's/读取更多上下文让用户选择/Read more context for user selection/g' \
  -e 's/直接是终端/Directly is terminal/g' \
  -e 's/获取所有终端标签/Get all terminal tabs/g' \
  -e 's/向当前终端发送命令/Send command to current terminal/g' \
  -e 's/向指定终端发送命令/Send command to specified terminal/g' \
  -e 's/获取当前终端的选中文本/Get selected text from current terminal/g' \
  -e 's/用于快捷键功能/Used for hotkey functionality/g' \
  -e 's/命令解释/Command explanation/g' \
  -e 's/注意：/Note: /g' \
  -e 's/如果当前没有活动终端，会尝试获取任意可用终端/If no active terminal, try to get any available terminal/g' \
  -e 's/首先尝试当前活动终端/First try current active terminal/g' \
  -e 's/如果当前活动终端没有输出，尝试获取第一个可用终端/If current active terminal has no output, try to get first available terminal/g' \
  {} \;

echo "Chinese comment replacement completed"
