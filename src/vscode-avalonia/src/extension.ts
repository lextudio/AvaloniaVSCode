// The module 'vscode' contains the VS Code extensibility API

import * as vscode from "vscode";
import * as lsp from "vscode-languageclient/node";
import { createLanguageService } from "./client";
import { registerAvaloniaCommands } from "./commands";
import { CommandManager } from "./commandManager";
import * as util from "./util/Utilities";
import { AppConstants, logger } from "./util/Utilities";

let languageClient: lsp.LanguageClient | null = null;

export async function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "Avalonia UI" is now active!');

	// Warn about conflicting / legacy Avalonia extensions that should be uninstalled
	const conflicting = [
		"AvaloniaTeam.vscode-avalonia", // legacy / upstream variant
		"microhobby.vscode-avalonia-community" // community fork
	];
	const installedConflicts = conflicting
		.map(id => vscode.extensions.getExtension(id))
		.filter(ext => !!ext) as vscode.Extension<any>[];
	if (installedConflicts.length) {
		const names = installedConflicts.map(e => e.id).join(", ");
		const choice = await vscode.window.showWarningMessage(
			`Other Avalonia extensions detected (${names}). They may conflict. It is recommended to uninstall them and keep only 'lextudio.vscode-axaml'.`,
			"Open Extensions"
		);
		if (choice === "Open Extensions") {
			await vscode.commands.executeCommand("workbench.extensions.search", "@installed avalonia");
		}
	}

	// Recommend XAML Styler extension if not installed and user hasn't suppressed recommendation
	try {
		const stylerId = "dabbinavo.xamlstyler";
		const suppress = vscode.workspace.getConfiguration().get<boolean>("avalonia.suppressXamlStylerRecommendation", false);
		if (!suppress && !vscode.extensions.getExtension(stylerId)) {
			const choice = await vscode.window.showInformationMessage(
				"For formatting AXAML you can optionally install 'XAML Styler'. Would you like to view it?",
				"Show Extension",
				"Don't Show Again"
			);
			if (choice === "Show Extension") {
				await vscode.commands.executeCommand("workbench.extensions.search", stylerId);
			} else if (choice === "Don't Show Again") {
				await vscode.workspace.getConfiguration().update("avalonia.suppressXamlStylerRecommendation", true, vscode.ConfigurationTarget.Global);
			}
		}
	} catch (e) {
		logger.appendLine(`Failed recommending XAML Styler: ${e}`);
	}

	// Track activation count and prompt for rating after threshold
	try {
		const ratingSuppressKey = "avalonia.rateSuppress";
		const activationCountKey = "avalonia.activationCount";
		const suppressed = context.globalState.get<boolean>(ratingSuppressKey, false);
		if (!suppressed) {
			let count = context.globalState.get<number>(activationCountKey, 0) + 1;
			await context.globalState.update(activationCountKey, count);
			const threshold = 10;
			if (count === threshold) {
				const choice = await vscode.window.showInformationMessage(
					"Enjoying Avalonia tools from LeXtudio Inc.? Would you like to rate the extension on the Marketplace?",
					"Rate Now",
					"Remind Me Later",
					"Don't Ask Again"
				);
				if (choice === "Rate Now") {
					await vscode.env.openExternal(vscode.Uri.parse("https://marketplace.visualstudio.com/items?itemName=lextudio.vscode-axaml&ssr=false#review-details"));
					await context.globalState.update(ratingSuppressKey, true); // Don't re-prompt after rating
				} else if (choice === "Don't Ask Again") {
					await context.globalState.update(ratingSuppressKey, true);
				} else if (choice === "Remind Me Later") {
					// Reset counter to prompt again after threshold more activations
					await context.globalState.update(activationCountKey, 0);
				}
			}
		}
	} catch (e) {
		logger.appendLine(`Failed handling rating prompt: ${e}`);
	}

	const commandManager = new CommandManager();
	context.subscriptions.push(registerAvaloniaCommands(commandManager, context));

	if (!vscode.workspace.workspaceFolders) {
		return;
	}

	vscode.window.onDidChangeActiveTextEditor((editor) => {
		if (editor && util.isAvaloniaFile(editor.document)) {
			// get avalonia previewer panel from tab groups
			const previewTab = vscode.window.tabGroups.all
				.flatMap((tabGroup) => tabGroup.tabs)
				.find((tab) => {
					const tabInput = tab.input as { viewType: string | undefined };
					if (!tabInput || !tabInput.viewType) {
						return false;
					}
					return tabInput.viewType.endsWith(AppConstants.previewerPanelViewType);
				});

			vscode.commands.executeCommand(AppConstants.updatePreviewerContent, editor.document.uri);

			if (!previewTab || previewTab?.label.endsWith(util.getFileName(editor.document.fileName))) {
				return;
			}
		}
	});

	vscode.workspace.onDidSaveTextDocument((document) => {
		if (util.isAvaloniaFile(document)) {
			vscode.commands.executeCommand(AppConstants.updatePreviewerContent, document.uri);
		}
	});

	const insertCmd = vscode.commands.registerTextEditorCommand(
		AppConstants.insertPropertyCommandId,
		(
			textEditor: vscode.TextEditor,
			edit: vscode.TextEditorEdit,
			prop: { repositionCaret: boolean } | undefined
		) => {
			if (prop?.repositionCaret) {
				const cursorPos = textEditor.selection.active;
				const newPos = cursorPos.with(cursorPos.line, cursorPos.character - 1);
				textEditor.selection = new vscode.Selection(newPos, newPos);
			}
			vscode.commands.executeCommand("editor.action.triggerSuggest");
		}
	);
	context.subscriptions.push(insertCmd);

	languageClient = await createLanguageService();

	try {
		logger.appendLine("Starting Avalonia Language Server...");
		await languageClient.start();
	} catch (error) {
		logger.appendLine(`Failed to start Avalonia Language Server. ${error}`);
	}
}

// This method is called when your extension is deactivated
export async function deactivate() {
	await languageClient?.stop();
	logger.appendLine("Language client stopped");
}
