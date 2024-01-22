import * as vscode from "vscode";
import path = require("path");
import { AppConstants, logger } from "../util/Utilities";
import { PreviewProcessManager } from "../previewProcessManager";

export class WebPreviewerPanel {
  public static currentPanel: WebPreviewerPanel | undefined;

  public static readonly viewType = "webPreviewer";

  private readonly _panel: vscode.WebviewPanel;
  private readonly _fileUrl: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(
    url: string,
    fileUri: vscode.Uri,
    extensionUri: vscode.Uri,
    processManager?: PreviewProcessManager,
    previewColumn: vscode.ViewColumn = vscode.ViewColumn.Active
  ) {
    const column = previewColumn || vscode.window.activeTextEditor?.viewColumn;

    // If we already have a panel, show it.
    if (WebPreviewerPanel.currentPanel) {
      WebPreviewerPanel.currentPanel._panel.reveal(column);
      WebPreviewerPanel.currentPanel._update(url);
      return;
    }

    // Otherwise, create a new panel.
    const panel = vscode.window.createWebviewPanel(
      WebPreviewerPanel.viewType,
      "Previewer",
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
      }
    );
    WebPreviewerPanel.currentPanel = new WebPreviewerPanel(
      panel,
      url,
	  fileUri,
      processManager
    );

    this.updateTitle(fileUri);
    WebPreviewerPanel.currentPanel._panel.iconPath = {
      dark: vscode.Uri.joinPath(extensionUri, "media", "preview-dark.svg"),
      light: vscode.Uri.joinPath(extensionUri, "media", "preview-light.svg"),
    };
  }

  public static updateTitle(file: vscode.Uri) {
    const currentPanel = WebPreviewerPanel.currentPanel;
    if (currentPanel) {
      currentPanel._panel.title = `Preview ${path.basename(file.fsPath)}`;
    }
  }

  private constructor(
    panel: vscode.WebviewPanel,
    url: string,
	fileUrl: vscode.Uri,
    private readonly _processManager?: PreviewProcessManager
  ) {
    this._panel = panel;
	this._fileUrl = fileUrl;

    // Set the webview's initial html content
    this._update(url);

    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the panel is closed programmatically
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

	// Listen for messages from the webview
	this._panel.webview.onDidReceiveMessage(async (message) => {
		if (message?.command === 'restartPreviewer') {
			if (this._processManager) {
				this._processManager.killPreviewProcess();
				await vscode.commands.executeCommand(AppConstants.previewProcessCommandId, this._fileUrl); 
				await vscode.commands.executeCommand(AppConstants.showPreviewToSideCommand, this._fileUrl);
			}
		}
	}, null, this._disposables);
  }

  /**
   * Cleans up and disposes of webview resources when the webview panel is closed.
   */
  public dispose() {
    WebPreviewerPanel.currentPanel = undefined;
    logger.appendLine("Previewer panel disposed");

    // Dispose of the current webview panel
    this._panel.dispose();

    this._processManager?.killPreviewProcess();
    // Dispose of all disposables (i.e. commands) for the current webview panel
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private _update(url: string) {
    this._panel.webview.html = this._getHtmlForWebview(url);
  }

  private _getHtmlForWebview(url: string): string {
    return `
	<!DOCTYPE html>
	<html>
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<title>Web Previewer</title>
		<style>
			html, body {
				margin: 0;
				padding: 0;
				width: 100%;
				height: 100%;
				overflow: auto;
			}

			body {
				background-size: 15px 15px;
				background-image:
					linear-gradient(to right, var(--vscode-focusBorder) 0.1px, transparent 1px),
					linear-gradient(to bottom, var(--vscode-focusBorder) 0.1px, transparent 1px);
			}

			button {
				transition-duration: 0.2s;
				border-radius: 100px;
				border: none;
				background: var(--vscode-button-background);
				color: var(--vscode-button-foreground);
				min-width: 22px;
				font-size: 18px;
			}
			button:hover {
				background: var(--vscode-button-hoverBackground);
			}

			#menubar {
				background: var(--vscode-tab-activeBackground);
				position: fixed;
				padding: 5px;
				width: 100%;
				height: 20px;
				z-index: 1;
			}

			#scalable {
				margin-top: 25px;
				transform-origin: top left;
				transform: scale(1);
				width: max-content;
				height: max-content;
				z-index: 2;
			}

			iframe {
				width: 7680px;
				height: 4320px;
				border: none;
				display: block;
			}
		</style>
	</head>
	<body>
		   <div id="menubar">
			   <button id="restartPreviewerBtn" title="Restart Previewer" style="padding: 2px 8px;">🔄</button>
			   <span style="margin: 0 8px; color: var(--vscode-editor-foreground);">|</span>
			   <input type="range" id="scaleSlider" min="25" max="200" value="100" style="width: 120px; margin-left: 8px;" />
			   <span id="scaleLabel" style="min-width: 48px; text-align: center;">100%</span>
			   <button id="resetScaleBtn" title="Reset scale" style="padding: 2px 8px;">🔁</button>
		   </div>

		<div id="scalable">
			<iframe src="${url}" id="preview" scrolling="no"></iframe>
		</div>
		<script>
			   var scaleSlider = document.getElementById('scaleSlider');
			   var scaleLabel = document.getElementById('scaleLabel');
			   var resetScaleBtn = document.getElementById('resetScaleBtn');
			   var restartPreviewerBtn = document.getElementById('restartPreviewerBtn');
			   var scalable = document.getElementById('scalable');
			   var previewFrame = document.getElementById('preview');
			   var scale = 1.0;

			   function setScale(newScale) {
				   scale = newScale;
				   if (scalable) {
					   scalable.style.transform = 'scale(' + scale + ')';
				   }
				   if (scaleLabel) {
					   scaleLabel.textContent = Math.round(scale * 100) + '%';
				   }
				   if (scaleSlider) {
					   scaleSlider.value = Math.round(scale * 100);
				   }
			   }

			   if (scaleSlider) {
				   scaleSlider.addEventListener('input', function() {
					   var newScale = Number(scaleSlider.value) / 100;
					   setScale(newScale);
				   });
			   }
			   if (resetScaleBtn) {
				   resetScaleBtn.addEventListener('click', function() {
					   setScale(1.0);
				   });
			   }

				if (restartPreviewerBtn) {
					restartPreviewerBtn.addEventListener('click', function() {
						const vscode = acquireVsCodeApi();
						vscode.postMessage({ command: 'restartPreviewer' });
					});
				}

			   // Initialize scale on load
			   setScale(scale);

		</script>
	</body>
	</html>`;
  }
}
