#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "${BASH_SOURCE[0]%/*}" && pwd)"
EXT_DIR="$ROOT_DIR/src/vscode-avalonia"
OUT_DIR="${1:-$ROOT_DIR/output}"

echo "Packaging Avalonia VS Code extension"
echo "Root: $ROOT_DIR"
echo "Extension: $EXT_DIR"
echo "Output: $OUT_DIR"

mkdir -p "$OUT_DIR"

pushd "$EXT_DIR" >/dev/null

# Always ensure fresh README / LICENSE copied from root for marketplace packaging
rm -f README.md LICENSE
cp "$ROOT_DIR/README.md" README.md
cp "$ROOT_DIR/LICENSE" LICENSE

# Build server & tools (expects user to have run dotnet restore earlier)
echo "Building language server + solution parser (Release)..."
dotnet build "$ROOT_DIR/src/AvaloniaLSP/AvaloniaLanguageServer/AvaloniaLanguageServer.csproj" -c Release --nologo --output "$EXT_DIR/avaloniaServer"
dotnet build "$ROOT_DIR/src/SolutionParser/SolutionParser.csproj" -c Release --nologo --output "$EXT_DIR/solutionParserTool"

echo "Building extension (TypeScript)..."
yarn --silent install --frozen-lockfile || yarn install
yarn --silent compile

echo "Packaging with vsce..."
if command -v vsce >/dev/null 2>&1; then
	vsce package -o "$OUT_DIR"
else
	echo "vsce not found. Install with: npm install -g @vscode/vsce" >&2
	exit 1
fi

# Remove temporary README/LICENSE copies (they come from root)
rm -f README.md LICENSE

popd >/dev/null

echo "Package(s) written to $OUT_DIR"
