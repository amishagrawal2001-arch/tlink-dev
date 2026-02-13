#!/bin/bash
# Comprehensive script to remove all Chinese text from TypeScript files
# This script replaces Chinese comments and strings with English equivalents

cd "$(dirname "$0")/src" || exit 1

echo "Removing Chinese text from TypeScript files..."

# Find all TypeScript files and replace Chinese patterns
find . -name "*.ts" -type f | while read -r file; do
    echo "Processing: $file"
    
    # Use sed with backup (create .bak files, then remove them)
    sed -i.bak \
        -e 's|安全相关类型定义|Security-related type definitions|g' \
        -e 's|风险级别|Risk level|g' \
        -e 's|风险评估结果|Risk assessment result|g' \
        -e 's|验证结果|Validation result|g' \
        -e 's|存储的同意|Stored consent|g' \
        -e 's|密码验证结果|Password validation result|g' \
        -e 's|安全配置|Security configuration|g' \
        -e 's|安全事件|Security event|g' \
        -e 's|安全统计|Security statistics|g' \
        -e 's|密码策略|Password policy|g' \
        -e 's|终端相关类型定义|Terminal-related type definitions|g' \
        -e 's|终端会话信息|Terminal session information|g' \
        -e 's|终端上下文|Terminal context|g' \
        -e 's|进程信息|Process information|g' \
        -e 's|系统信息|System information|g' \
        -e 's|项目信息（如果检测到）|Project information (if detected)|g' \
        -e 's|错误信息|Error message|g' \
        -e 's|缓冲区内容|Buffer content|g' \
        -e 's|命令执行结果|Command execution result|g' \
        -e 's|历史条目|History entry|g' \
        -e 's|环境变量变更|Environment variable change|g' \
        -e 's|终端主题|Terminal theme|g' \
        -e 's|文件系统状态|File system status|g' \
        -e 's|文件信息|File information|g' \
        -e 's|快捷键定义|Hotkey definition|g' \
        -e 's|终端能力|Terminal capability|g' \
        -e 's|剪贴板内容|Clipboard content|g' \
        -e 's|自动补全候选|Autocomplete candidate|g' \
        -e 's|终端警告/通知|Terminal warning/notification|g' \
        -e 's|时间戳（毫秒）|Timestamp (milliseconds)|g' \
        -e 's|是否|Whether|g' \
        -e 's|可选|Optional|g' \
        -e 's|用于|For|g' \
        -e 's|检测到|Detected|g' \
        -e 's|如果|If|g' \
        "$file"
    
    # Remove backup files
    rm -f "${file}.bak"
done

echo "Done! Chinese text removal complete."
echo ""
echo "Note: Some Chinese text may remain in:"
echo "- i18n translation files (zh-CN.ts - these are intentional)"
echo "- User-facing strings (should use i18n instead)"
echo ""
echo "Please verify the changes before committing."
