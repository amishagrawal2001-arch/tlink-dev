#!/bin/bash
# Post-build fix script for template requires
# This ensures Angular receives strings from module.default

cd "$(dirname "$0")"

if [ ! -f "dist/index.js" ]; then
    echo "Error: dist/index.js not found. Build the plugin first."
    exit 1
fi

echo "Applying template fix..."

# Use Python to fix template requires
python3 << 'PYTHON'
import re

with open('dist/index.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Count before
before = len(re.findall(r'template:\s*__webpack_require__\([^)]+\)(?!\.default)', content))

if before > 0:
    # Apply fix
    new_content = re.sub(
        r'template:\s*(__webpack_require__\([^)]+\))(?!\.default)',
        r'template: ((\1).default || \1)',
        content
    )
    
    with open('dist/index.js', 'w', encoding='utf-8') as f:
        f.write(new_content)
    
    after = len(re.findall(r'template:.*\.default', new_content))
    print(f"✅ Fixed {before} template require() calls")
    print(f"   Now {after} templates access .default property")
else:
    print("✅ All templates already fixed")
PYTHON

echo ""
echo "Fix applied. Rebuild main application if needed."
