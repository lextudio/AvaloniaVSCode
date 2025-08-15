// The module 'vscode' contains the VS Code extensibility API

import * as vscode from "vscode";
import * as fs from "fs-extra";
import * as lsp from "vscode-languageclient/node";
import { createLanguageService } from "./client";
import { registerAvaloniaCommands } from "./commands";
import { CommandManager } from "./commandManager";
import * as util from "./util/Utilities";
import { AppConstants, logger } from "./util/Utilities";
import { getLastDiscoveryMeta, buildSolutionModel, getSolutionDataFile } from "./services/solutionParser";

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

	// One-time configuration migration notice (legacy -> categorized keys)
	try {
		const migrationFlag = 'avalonia.configMigration.v1';
		if (!context.globalState.get<boolean>(migrationFlag, false)) {
			interface Mapping { oldKey: string; newKey: string; }
			const mappings: Mapping[] = [
				{ oldKey: 'avalonia.verboseLogs', newKey: 'avalonia.trace.verbose' },
				{ oldKey: 'avalonia.buildEmitBinlog', newKey: 'avalonia.previewer.emitBinlog' },
				{ oldKey: 'avalonia.buildRunDotnetInfo', newKey: 'avalonia.previewer.runDotnetInfo' },
				{ oldKey: 'avalonia.buildConfigurationPreference', newKey: 'avalonia.completion.buildConfigurationPreference' },
				{ oldKey: 'avalonia.debounceFsEventsMs', newKey: 'avalonia.completion.debounceFsEventsMs' },
				{ oldKey: 'avalonia.suppressXamlStylerRecommendation', newKey: 'avalonia.misc.suppressXamlStylerRecommendation' },
				{ oldKey: 'axaml.trace.server', newKey: 'avalonia.trace.server' }
			];
			const cfg = vscode.workspace.getConfiguration();
			const migrated: string[] = [];
			for (const m of mappings) {
				// Skip if new key already explicitly set anywhere
				const newInspect = cfg.inspect<any>(m.newKey);
				if (newInspect && (newInspect.globalValue !== undefined || newInspect.workspaceValue !== undefined || newInspect.workspaceFolderValue !== undefined)) {
					continue;
				}
				const oldInspect = cfg.inspect<any>(m.oldKey);
				if (!oldInspect) { continue; }
				const apply = async (value: any, scope: vscode.ConfigurationTarget) => {
					if (value !== undefined) {
						await cfg.update(m.newKey, value, scope);
						migrated.push(`${m.oldKey} → ${m.newKey}`);
					}
				};
				// Preserve per-scope values if present
				if (oldInspect.globalValue !== undefined) { await apply(oldInspect.globalValue, vscode.ConfigurationTarget.Global); }
				if (oldInspect.workspaceValue !== undefined) { await apply(oldInspect.workspaceValue, vscode.ConfigurationTarget.Workspace); }
				if (oldInspect.workspaceFolderValue !== undefined) { await apply(oldInspect.workspaceFolderValue, vscode.ConfigurationTarget.WorkspaceFolder); }
			}
			if (migrated.length) {
				const detail = migrated.join('\n');
				vscode.window.showInformationMessage('Avalonia settings reorganized. Legacy keys migrated to new categories.', 'View Details', 'Dismiss')
					.then(choice => {
						if (choice === 'View Details') {
							vscode.window.showInformationMessage(detail, { modal: true, detail });
						}
					});
			}
			await context.globalState.update(migrationFlag, true);
		}
	} catch (e:any) {
		logger.appendLine(`Settings migration failed: ${e?.message ?? e}`);
	}

	// Recommend XAML Styler extension if not installed and user hasn't suppressed recommendation
	try {
		const stylerId = "dabbinavo.xamlstyler";
		const suppress = vscode.workspace.getConfiguration().get<boolean>("avalonia.misc.suppressXamlStylerRecommendation", vscode.workspace.getConfiguration().get<boolean>("avalonia.suppressXamlStylerRecommendation", false));
		if (!suppress && !vscode.extensions.getExtension(stylerId)) {
			const choice = await vscode.window.showInformationMessage(
				"For formatting AXAML you can optionally install 'XAML Styler'. Would you like to view it?",
				"Show Extension",
				"Don't Show Again"
			);
			if (choice === "Show Extension") {
				await vscode.commands.executeCommand("workbench.extensions.search", stylerId);
			} else if (choice === "Don't Show Again") {
				// Update both new and old keys for consistency
				await vscode.workspace.getConfiguration().update("avalonia.misc.suppressXamlStylerRecommendation", true, vscode.ConfigurationTarget.Global);
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

	// Diagnostics command: show last solution discovery details
	const diagCmd = vscode.commands.registerCommand("avalonia.showSolutionDiscoveryInfo", async () => {
		const meta = getLastDiscoveryMeta(context);
		if (!meta) {
			vscode.window.showInformationMessage("No solution discovery metadata recorded yet. Building model now...");
			try {
				await buildSolutionModel(context, true);
				const newMeta = getLastDiscoveryMeta(context);
				if (!newMeta) {
					vscode.window.showWarningMessage("Still no metadata after build (possible build failure or no workspace folder).");
					return;
				}
				const rebuiltDetail = `Patterns: ${newMeta.searchedPatterns.join(", ")}\nMatched: ${newMeta.matchedFiles.join("; ") || "(none)"}\nSelected: ${newMeta.selectedFile || "(none)"}\nFallback: ${newMeta.fallbackToRoot}\nTime: ${newMeta.timestamp}`;
				vscode.window.showInformationMessage("Avalonia Solution Discovery", { modal: true, detail: rebuiltDetail }, "OK");
			} catch (e:any) {
				vscode.window.showErrorMessage(`Error building solution model: ${e?.message ?? e}`);
			}
			return;
		}
		const detail = `Patterns: ${meta.searchedPatterns.join(", ")}\nMatched: ${meta.matchedFiles.join("; ") || "(none)"}\nSelected: ${meta.selectedFile || "(none)"}\nFallback: ${meta.fallbackToRoot}\nTime: ${meta.timestamp}`;
		vscode.window.showInformationMessage("Avalonia Solution Discovery", { modal: true, detail }, "OK");
	});
	context.subscriptions.push(diagCmd);

	const openJsonCmd = vscode.commands.registerCommand("avalonia.openSolutionModelJson", async () => {
		try {
			const p = await getSolutionDataFile(context);
			if (!p || !(await fs.pathExists(p))) {
				vscode.window.showWarningMessage("Solution model JSON not found yet. Run 'Show solution discovery info' first.");
				return;
			}
			const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(p));
			await vscode.window.showTextDocument(doc, { preview: false });
		} catch (e:any) {
			vscode.window.showErrorMessage(`Cannot open solution model JSON: ${e?.message ?? e}`);
		}
	});
	context.subscriptions.push(openJsonCmd);

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

	// Status bar item for assembly / model readiness
	const status = vscode.window.createStatusBarItem("avaloniaAssemblyStatus", vscode.StatusBarAlignment.Left, 90);
	status.text = "Avalonia: Initializing";
	status.tooltip = "Avalonia language features waiting for assembly build";
	status.show();
	context.subscriptions.push(status);

	let lastAssemblyError: string | undefined;
	async function refreshAssemblyStatus() {
		try {
			await buildSolutionModel(context, false);
			const dataFile = await getSolutionDataFile(context);
			if (dataFile && (await fs.pathExists(dataFile))) {
				status.text = "Avalonia: Ready";
				status.tooltip = "Avalonia completion metadata available";
				lastAssemblyError = undefined;
			} else {
				status.text = "Avalonia: Build Needed";
				status.tooltip = "Build the project (Run Previewer Assets) to enable completion";
			}
		} catch (e:any) {
			lastAssemblyError = e?.message ?? String(e);
			status.text = "Avalonia: Error";
			status.tooltip = `Error building solution model: ${lastAssemblyError}`;
		}
	}

	// Watch for changes to launch.json or project files with debounce to avoid rapid rebuild churn
	if (vscode.workspace.workspaceFolders?.length) {
		const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
		const launchWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, '.vscode/launch.json'));
		const projWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, '**/*.{csproj,fsproj}'));
		let rebuildTimer: NodeJS.Timeout | undefined;
		let pendingEvents = 0;
		const cfg = vscode.workspace.getConfiguration('avalonia');
		let debounceMs = cfg.get<number>('completion.debounceFsEventsMs', cfg.get<number>('debounceFsEventsMs', 600));
		const scheduleRebuild = () => {
			pendingEvents++;
			if (rebuildTimer) { clearTimeout(rebuildTimer); }
			// Debounce delay using configured interval
			rebuildTimer = setTimeout(async () => {
				const events = pendingEvents; pendingEvents = 0;
				status.text = 'Avalonia: Updating';
				try {
					await buildSolutionModel(context, true);
					await refreshAssemblyStatus();
					logger.appendLine(`Debounced rebuild executed after ${events} FS event(s).`);
				} catch (err:any) {
					logger.appendLine(`Debounced rebuild failed: ${err?.message ?? err}`);
				}
			}, debounceMs);
		};
		launchWatcher.onDidCreate(scheduleRebuild, null, context.subscriptions);
		launchWatcher.onDidChange(scheduleRebuild, null, context.subscriptions);
		launchWatcher.onDidDelete(scheduleRebuild, null, context.subscriptions);
		projWatcher.onDidCreate(scheduleRebuild, null, context.subscriptions);
		projWatcher.onDidChange(scheduleRebuild, null, context.subscriptions);
		projWatcher.onDidDelete(scheduleRebuild, null, context.subscriptions);
		context.subscriptions.push(launchWatcher, projWatcher, { dispose: () => rebuildTimer && clearTimeout(rebuildTimer) });
		refreshAssemblyStatus();
	}

	// Invalidate metadata cache command (notify server to clear any in-memory state + delete cache files heuristically)
	context.subscriptions.push(vscode.commands.registerCommand('avalonia.invalidateMetadataCache', async () => {
		try {
			await languageClient?.sendNotification('avalonia/invalidateMetadataCache');
			// Best effort: delete temp files matching pattern locally
			const tmp = await fs.readdir(require('os').tmpdir());
			let removed = 0;
			for (const f of tmp) {
				if (f.startsWith('avalonia-meta-') && f.endsWith('.avalonia-metadata.json')) {
					try { await fs.remove(require('path').join(require('os').tmpdir(), f)); removed++; } catch {}
				}
			}
			vscode.window.showInformationMessage(`Avalonia metadata cache invalidated (${removed} file(s) removed).`);
		} catch (e:any) {
			vscode.window.showErrorMessage(`Failed to invalidate metadata cache: ${e?.message ?? e}`);
		}
	}));

	languageClient = await createLanguageService();

	// Rebuild model command
	context.subscriptions.push(vscode.commands.registerCommand("avalonia.rebuildSolutionModel", async () => {
		status.text = "Avalonia: Updating";
		try {
			await buildSolutionModel(context, true);
			await refreshAssemblyStatus();
			vscode.window.showInformationMessage("Solution model rebuilt.");
		} catch (e:any) {
			vscode.window.showErrorMessage(`Failed to rebuild: ${e?.message ?? e}`);
		}
	}));

	// Show chosen project (executable) from language server (preferred) or fallback to solution model JSON
	context.subscriptions.push(vscode.commands.registerCommand("avalonia.showChosenProject", async () => {
		try {
			let shown = false;
			if (languageClient) {
				try {
					const resp:any = await languageClient.sendRequest("avalonia/chosenProject", "");
					if (resp && resp.found) {
						vscode.window.showInformationMessage(`Executable project: ${resp.name}\nOutputType: ${resp.outputType}${resp.normalizedOutputType && resp.normalizedOutputType !== resp.outputType ? ' (normalized: ' + resp.normalizedOutputType + ')' : ''}\nTargetPath: ${resp.targetPath || '(none)'}\nDesignerHostPath: ${resp.designerHostPath || '(none)'}`);
						shown = true;
					}
				} catch {}
			}
			if (shown) { return; }
			const p = await getSolutionDataFile(context);
			if (!p || !(await fs.pathExists(p))) {
				vscode.window.showWarningMessage("Solution model JSON not found.");
				return;
			}
			const json = JSON.parse(await fs.readFile(p, 'utf8'));
			const projects: any[] = json.projects || [];
			// NOTE: Original regex used inline case-insensitive group syntax /^(?i:WinExe|Exe)$/ which is invalid in JavaScript.
			// Replace with equivalent using the 'i' flag. Simplified alternation (Win)?Exe.
			const exe = projects.find(pr => /^(?:Win)?Exe$/i.test(pr.normalizedOutputType || pr.outputType)) || projects.find(pr => pr.targetPath);
			if (!exe) {
				vscode.window.showInformationMessage("No executable / targetPath project detected in model.");
				return;
			}
			vscode.window.showInformationMessage(`Executable project: ${exe.name}\nOutputType: ${exe.outputType}${exe.normalizedOutputType && exe.normalizedOutputType !== exe.outputType ? ' (normalized: ' + exe.normalizedOutputType + ')' : ''}\nTargetPath: ${exe.targetPath || '(none)'}\nDesignerHostPath: ${exe.designerHostPath || '(none)'}`);
		} catch (e:any) {
			vscode.window.showErrorMessage(`Failed to read chosen project: ${e?.message ?? e}`);
		}
	}));

	// Toggle verbose logs (updates config which triggers restart)
	context.subscriptions.push(vscode.commands.registerCommand("avalonia.toggleVerboseLogs", async () => {
		const cfg = vscode.workspace.getConfiguration('avalonia');
		const current = cfg.get<boolean>('trace.verbose', cfg.get<boolean>('verboseLogs', false));
		await cfg.update('trace.verbose', !current, vscode.ConfigurationTarget.Global);
		await cfg.update('verboseLogs', !current, vscode.ConfigurationTarget.Global); // legacy sync
		vscode.window.showInformationMessage(`Avalonia verbose logs ${!current ? 'enabled' : 'disabled'} (server will restart).`);
	}));

	// Show last assembly resolution error
	context.subscriptions.push(vscode.commands.registerCommand("avalonia.showAssemblyResolutionError", () => {
		if (lastAssemblyError) {
			vscode.window.showErrorMessage(lastAssemblyError, { modal: true });
		} else {
			vscode.window.showInformationMessage("No assembly resolution errors recorded.");
		}
	}));

	try {
		logger.appendLine("Starting Avalonia Language Server...");
		await languageClient.start();
	} catch (error) {
		logger.appendLine(`Failed to start Avalonia Language Server. ${error}`);
	}

	// React to configuration changes for build configuration preference
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async e => {
		if (e.affectsConfiguration('avalonia.completion.buildConfigurationPreference') || e.affectsConfiguration('avalonia.buildConfigurationPreference') || e.affectsConfiguration('avalonia.trace.verbose') || e.affectsConfiguration('avalonia.verboseLogs')) {
			try {
				logger.appendLine('Restarting language server due to configuration change...');
				await languageClient?.stop();
				languageClient = await createLanguageService();
				await languageClient.start();
				logger.appendLine('Language server restarted with new configuration preference.');
			} catch (err) {
				logger.appendLine(`Failed to restart language server: ${err}`);
			}
		}
	}));
}

// This method is called when your extension is deactivated
export async function deactivate() {
	await languageClient?.stop();
	logger.appendLine("Language client stopped");
}
