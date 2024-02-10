const { contributes } = require("../../package.json");

/**
 * Various app constants
 */
export namespace AppConstants {
    export const _contributes = contributes;
    // todo: implement instance methods using this configuration object to read/write workspace settings. This feels like it should be part of VSCode's API.
    export const allConfigurationIDs = contributes.configuration;
    // todo: use this for API tests! Compare returned array to explicitly defined constants.
    export const allCommandIDs = contributes.commands.map((v: any) => v.command);

    export const insertPropertyCommandId = "avalonia.InsertProperty";
    export const previewerParamState = "previewerParams";
    export const previewProcessCommandId = "avalonia.previewProcess";
    export const localhost = "127.0.0.1";
    export const htmlUrl = `http://${AppConstants.localhost}`;

    export function webSocketAddress(port: number) {
        return `ws://${AppConstants.localhost}:${port}/ws`;
    }

    export const updateAssetsMessage = "updateAssetsMessage";
    export const showPreviewMessage = "showPreviewMessage";

    export const showPreviewToSideCommand = "avalonia.showPreviewToSide";
    export const previewerAssetsCommand = "avalonia.createPreviewerAssets";

    export const previewerPanelViewType = "avaloniaPreviewer";
    export const winExe = "WinExe";

    export const solutionData = "avalonia.solutionData";
    export const solutionDiscoveryMeta = "avalonia.solutionDiscoveryMeta";

    export const updatePreviewerContent = "avalonia.updatePreviewerContext";

    export const extensionId = "lextudio.vscode-axaml";

    export const newProjectCommandId = "avalonia.newProject";
}

export default AppConstants;
