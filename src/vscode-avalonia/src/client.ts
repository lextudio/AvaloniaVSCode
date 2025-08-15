import * as vscode from "vscode";
import * as lsp from "vscode-languageclient/node";
import { getDotnetRuntimePath, getLanguageServerPath as getAvaloniaServerPath } from "./runtimeManager";
import { avaloniaLanguageId, logger } from "./util/Utilities";

export async function createLanguageService(): Promise<lsp.LanguageClient> {
	logger.appendLine("Creating language service");

	const serverOptions = await getServerStartupOptions();
	let outputChannel = logger;

	const avaloniaCfg = vscode.workspace.getConfiguration("avalonia");
	const pref = avaloniaCfg.get<string>("completion.buildConfigurationPreference", avaloniaCfg.get<string>("buildConfigurationPreference", "Auto"));
	const verbose = avaloniaCfg.get<boolean>("trace.verbose", avaloniaCfg.get<boolean>("verboseLogs", false));
	const clientOptions: lsp.LanguageClientOptions = {
		documentSelector: [{ language: avaloniaLanguageId }],
		progressOnInitialization: true,
		outputChannel,
		initializationOptions: {
			buildConfigurationPreference: pref,
			verboseLogs: verbose,
			workspaceRoot: vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0 ? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined
		},
		synchronize: {
			configurationSection: "avalonia",
			fileEvents: vscode.workspace.createFileSystemWatcher("**/*.axaml"),
		},
		middleware: {
			provideDocumentFormattingEdits: (document, options, token, next) =>
				next(
					document,
					{
						...options,
						insertFinalNewline: true,
					},
					token
				),
		},
	};

	const client = new lsp.LanguageClient(avaloniaLanguageId, "Avalonia LSP", serverOptions, clientOptions);

	return client;
}

async function getServerStartupOptions(): Promise<lsp.ServerOptions> {
	const dotnetCommandPath = await getDotnetRuntimePath();
	const serverPath = getAvaloniaServerPath();

	// Log resolved paths for easier troubleshooting
	logger.appendLine(`[Avalonia LSP] dotnet: ${dotnetCommandPath}`);
	logger.appendLine(`[Avalonia LSP] Language server DLL: ${serverPath}`);

	const executable = {
		command: dotnetCommandPath,
		args: [serverPath],
		options: {
			env: process.env,
		},
	};

	return {
		run: executable,
		debug: executable,
	};
}
