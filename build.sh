#!/bin/bash

cd $(dirname $0)

cd ./src/vscode-axaml
yarn install

cd ..

echo $PWD

# Build AXAML LSP
dotnet build $PWD/AxamlLSP/AxamlLanguageServer/AxamlLanguageServer.csproj /property:GenerateFullPaths=true --output $PWD/vscode-axaml/AxamlServer

# Build  Solution parser
dotnet build $PWD/SolutionParser/SolutionParser.csproj /property:GenerateFullPaths=true --output $PWD/vscode-axaml/solutionParserTool

echo 🎉 Great success