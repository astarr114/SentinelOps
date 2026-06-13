#!/bin/bash

ast-grep scan -r .rules/SelectItem.yml

ast-grep scan -r .rules/contrast.yml

ast-grep scan -r .rules/supabase-google-sso.yml

ast-grep scan -r .rules/toast-hook.yml

ast-grep scan -r .rules/slot-nesting.yml

ast-grep scan -r .rules/require-button-interaction.yml

ast-grep scan -r .rules/supabase-edge-function-get-body.yml

# ── Type/Component name collision check ──────────────────────────────────────
# Catches files that export both `export type FOO = ...` and `export function FOO`
# (or export const FOO) with the same identifier — this causes Vite bundler
# ambiguity and can silently break React context providers at runtime.
collision_output=$(python3 - << 'PYEOF'
import re, sys
from pathlib import Path

src = Path("src")
errors = []

for f in src.rglob("*.ts{x,}"):
    try:
        content = f.read_text()
    except Exception:
        continue

    type_names = set(re.findall(r"^export\s+type\s+(\w+)\s*=", content, re.MULTILINE))
    # Include function, const, class, enum value exports
    value_names = set(re.findall(r"^export\s+(?:function|const|class|enum)\s+(\w+)\b", content, re.MULTILINE))

    collisions = type_names & value_names
    for name in sorted(collisions):
        errors.append(f"{f}: '{name}' is exported as both a type alias and a value (function/const/class).")

if errors:
    print("\n".join(errors))
    sys.exit(1)
sys.exit(0)
PYEOF
)
collision_exit=$?

if [ $collision_exit -ne 0 ]; then
    echo ""
    echo "=== Type/Component Name Collision Detected ==="
    echo "$collision_output"
    echo ""
    echo "ERROR: One or more files export the same name as both a type and a value."
    echo "This causes Vite bundler ambiguity — React context providers may silently"
    echo "fail to wrap the component tree, causing 'must be used within Provider' errors."
    echo ""
    echo "Fix: rename either the type (e.g. MyType) or the component (e.g. MyContextProvider)"
    echo "so the exported names are distinct within the same file."
    exit 1
fi

useauth_output=$(ast-grep scan -r .rules/useAuth.yml 2>/dev/null)

if [ -z "$useauth_output" ]; then
    exit 0
fi

authprovider_output=$(ast-grep scan -r .rules/authProvider.yml 2>/dev/null)

if [ -n "$authprovider_output" ]; then
    exit 0
fi

echo "=== ast-grep scan -r .rules/useAuth.yml output ==="
echo "$useauth_output"
echo ""
echo "=== ast-grep scan -r .rules/authProvider.yml output ==="
echo "$authprovider_output"
echo ""
echo "⚠️  Issue detected:"
echo "The code uses useAuth Hook but does not have AuthProvider component wrapping the components."
echo "Please ensure that components using useAuth are wrapped with AuthProvider to provide proper authentication context."
echo ""
echo "Suggested fixes:"
echo "1. Add AuthProvider wrapper in app.tsx or corresponding root component"
echo "2. Ensure all components using useAuth are within AuthProvider scope"

