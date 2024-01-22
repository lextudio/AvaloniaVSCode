import path = require("path");
import * as vscode from "vscode";
import * as sm from "../models/solutionModel";
import { getSolutionModel } from "../services/solutionParser";

export const avaloniaFileExtension = "axaml";
export const avaloniaLanguageId = "axaml";
export const logger = vscode.window.createOutputChannel("Avalonia Client", { log: true });

/**
 * Checks if the given document is an Avalonia file.
 * @param document vscode TextDocument
 * @returns `true` if it's an Avalonia file, `false` otherwise
 */
export function isAvaloniaFile(document: vscode.TextDocument): boolean {
	return path.extname(document.fileName) === `.${avaloniaFileExtension}`;
}

/**
 * Checks if the given document is an Avalonia file.
 * @param filePath file path
 * @returns filename
 */
export function getFileName(filePath: string): string {
	return path.basename(filePath);
}

/**
 * Returns executable project from solution model
 * @param solution solution model
 * @returns executable project
 */
export function getExecutableProject(solution: sm.Solution): sm.Project | undefined {
	// Accept WinExe or Exe (cross-platform). Prefer WinExe if present.
	const matches = solution.projects.filter(
		(p) => {
			const type = (p.normalizedOutputType || p.outputType || "").toString();
			return /^(?:Win)?Exe$/i.test(type);
		}
	);
	if (!matches.length) {
		return undefined;
	}
	const winExe = matches.find(p => /WinExe/i.test((p.normalizedOutputType || p.outputType || "").toString()));
	return winExe ?? matches[0];
}
/**
 * Returns the file details from solution model
 * @param file file path
 * @param context vscode extension context
 * @returns File details from solution model
 */
export function getFileDetails(file: string, context: vscode.ExtensionContext): sm.File | undefined {
	const solution = getSolutionModel(context);
	const fileData = solution?.files.find((f) => f.path === file);
	return fileData;
}

declare global {
	interface Array<T> {
		getValue(property: string): string;
	}

	interface String {
		putInQuotes(): string;
	}
}
Array.prototype.getValue = function (this: string[], property: string): string {
	const value = this.find((line) => line.includes(property));
	return value ? value.split("=")[1].trim() : "";
};

String.prototype.putInQuotes = function (this: string): string {
	return `"${this}"`;
};

/**
 * Various app constants
 */
export class AppConstants {
	static readonly insertPropertyCommandId = "avalonia.InsertProperty";
	static readonly previewerParamState = "previewerParams";
	static readonly previewProcessCommandId = "avalonia.previewProcess";
	static readonly localhost = "127.0.0.1";
	static readonly htmlUrl = `http://${AppConstants.localhost}`;

	static webSocketAddress = (port: number) => `ws://${AppConstants.localhost}:${port}/ws`;

	static readonly updateAssetsMessages: "updateAssetsMessage";
	static readonly showPreviewMessage: "showPreviewMessage";

	static readonly showPreviewToSideCommand = "avalonia.showPreviewToSide";
	static readonly previewerAssetsCommand = "avalonia.createPreviewerAssets";

	// Must match WebPreviewerPanel.viewType so tab lookup works
	static readonly previewerPanelViewType = "webPreviewer";
	static readonly winExe = "WinExe";

	static readonly solutionData = "avalonia.solutionData";
	static readonly solutionDiscoveryMeta = "avalonia.solutionDiscoveryMeta";

	static readonly updatePreviewerContent = "avalonia.updatePreviewerContext";

	static readonly extensionId = "lextudio.vscode-axaml";

	static readonly newProjectCommandId = "avalonia.newProject";
}
