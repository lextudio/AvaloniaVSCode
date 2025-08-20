#!/bin/bash

cd ./src/vscode-axaml
yarn install

cd ..

echo $PWD

# Build AXAML LSP
dotnet build $PWD/AxamlLSP/AxamlLanguageServer/AxamlLanguageServer.csproj /property:GenerateFullPaths=true --output $PWD/vscode-axaml/axamlServer

# Build  Solution parser
dotnet build $PWD/SolutionParser/SolutionParser.csproj /property:GenerateFullPaths=true --output $PWD/vscode-axaml/solutionParserTool

echo 🎉 Great success