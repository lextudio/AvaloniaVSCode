# Contribution Guide

Welcome to Avalonia Extension for VS Code! We appreciate your interest in contributing. This guide will help you get started with contributing to our project. Please read it carefully.

## System Requirements

1. dotnet 9.0, you can download it from [here](https://dotnet.microsoft.com/download)
2. NodeJS, npm 
   You can get NodeJS and npm using NVM (Node Version Manager) by running the following command:
   
    `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash`

   See: https://github.com/nvm-sh/nvm for the latest version of this command.

3. Install yarn
   yarn can be installed with the following command:
    
    `npm install -g yarn`

4. Latest Visual Studio Code

## Set up

1. Fork and Clone the repository

    `git clone --recursive https://github.com/lextudio/AvaloniaVSCode`

2. Update submodules
This extension uses git submodules to pull in the Solution Parser and the Avalonia Visual Studio repo. Run the following to pull in the submodules:

    `git submodule update --init --recursive`

3. Run the `build.sh`, currently repo does not have build script for Windows

## How to contribute

1. Create a new issue or use the existing to contribute (assign it yourself)
2. Create a new branch for the issue
3. Send the PR with description

## Run and Debug

Hit `F5` this will a new vscode window with the dev extension running. Open an Avalonia project to use it.

## Package Extension

Ensure you have `vsce` installed:

```bash
npm install -g @vscode/vsce
```

Build & package (outputs VSIX under ./output):

```bash
./package.sh
```

Or specify a custom output directory:

```bash
./package.sh /path/to/out
```

The script will:

- Copy the root README and LICENSE into `src/vscode-avalonia` temporarily
- Build the language server (Release) & solution parser
- Compile the TypeScript client
- Run `vsce package` and place the .vsix in the output folder
- Remove the temporary README / LICENSE copies from the extension folder
