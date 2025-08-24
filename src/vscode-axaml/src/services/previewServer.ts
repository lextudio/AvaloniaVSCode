import * as net from "net";
import { logger } from "../util/Utilities";
import { EventDispatcher, IEvent } from "strongly-typed-events";
import { Messages } from "./messageParser";

import * as sm from "../models/solutionModel";

/**
 * Represents a preview server that can send data and update XAML files.
 */
export interface IPreviewServer {
	sendData(data: Buffer): void;
	updateXaml(fileData: sm.File, xamlText: string): void;
}

/**
 * Represents a preview server that can send data and update XAML files.
 */
export class PreviewServer implements IPreviewServer {
	/**
	 * Starts the preview server.
	 */
	public async start() {
		logger.info(`PreviewServer.start ${this._assemblyName}`);

		this._server.listen(this._port, this._host, () =>
			logger.info(`Preview server listening on port ${this._port}`)
		);
		this._server.on("connection", this.handleSocketEvents.bind(this));
	}

	handleSocketEvents(socket: net.Socket) {
		logger.info(`Preview server connected on port ${socket.localPort}`);
		this._socket = socket;

		socket.on("data", (data) => {
			this._onMessage.dispatch(this, data);
			const msg = Messages.parseIncomingMessage(data);
			logger.info(JSON.stringify(msg.message));
			if (msg.type === Messages.startDesignerSessionMessageId) {
				logger.info("Start designer session message received.");
				const pixelFormat = Messages.clientSupportedPixelFormatsMessage();
				socket.write(pixelFormat);
				logger.info("Sent client supported pixel formats.");

				// TODO: Investigate this oddity
				// const renderInfo = Messages.clientRenderInfoMessage();
				// socket.write(renderInfo);
			} else if (msg.type === Messages.updateXamlResultMessageId) {
				logger.info("XAML update completed");
				this._isReady = true;
				this._onReady.dispatch((this as unknown) as IPreviewServer);
			} else if (msg.type === Messages.htmlTransportStartedMessageId) {
				logger.info("HTML transport started");
			} else {
				logger.info("msg: " + msg.type);
			}
		});

		socket.on("close", () => {
			logger.info(`Preview server closed for ${this._assemblyName}`);
			this._server.close();
			this._socket?.destroy();
		});

		socket.on("error", (error) => {
			logger.error(`Preview server error: ${error}`);
			logger.show();
		});
	}

	/**
	 * Stops the preview server.
	 */
	public stop() {
		logger.info(`PreviewServer.stop ${this._assemblyName}`);
		this._server.close();
	}

	/**
	 * Gets whether the preview server is running.
	 */
	public get isRunning() {
		return this._server?.listening;
	}

	public get isReady() {
		return this._isReady;
	}

	/**
	 * Gets an instance of the preview server for the specified assembly name and port.
	 * @param assemblyName The name of the assembly.
	 * @param port The port to use for the preview server.
	 */
	public static getInstance(assemblyName: string, port: number): PreviewServer {
		let instance = PreviewServer.getInstanceByAssemblyName(assemblyName);
		if (instance) {
			// If the port is different, stop and replace the instance
			if ((instance as any)._port !== port) {
				instance.stop();
				PreviewServer._servers.delete(assemblyName);
				instance = undefined;
			} else {
				return instance;
			}
		}
		const newInstance = new PreviewServer(assemblyName, port);
		PreviewServer._servers.set(assemblyName, newInstance);
		return newInstance;
	}

	/**
	 * Gets an instance of the preview server for the specified assembly name
	 * @param assemblyName The name of the assembly.
	 */
	public static getInstanceByAssemblyName(assemblyName: string): PreviewServer | undefined {
		var instance = PreviewServer._servers.get(assemblyName);
		return instance;
	}

	private constructor(private _assemblyName: string, private _port: number) {
		this._server = net.createServer();
	}

	updateXaml(fileData: sm.File, xamlText: string): void {
		this._isReady = false;
		const updateXamlMessage = Messages.updateXaml(fileData.targetPath, xamlText);
		this._socket?.write(updateXamlMessage);
	}

	sendData(data: Buffer): void {
		logger.info("In PreviewServer.sendData");
	}

	public get onMessage(): IEvent<IPreviewServer, Buffer> {
		return this._onMessage.asEvent();
	}

	_onMessage = new EventDispatcher<IPreviewServer, Buffer>();
	_onReady = new EventDispatcher<IPreviewServer, void>();

	public get onReady(): IEvent<IPreviewServer, void> {
		return this._onReady.asEvent();
	}

	_server: net.Server;
	_socket: net.Socket | undefined;
	_host = "127.0.0.1";
	private _isReady = false;

	private static _instance: PreviewServer;

	private static _servers = new Map<string, PreviewServer>();
}
