export interface Project {
	name: string;
	path: string;
	targetPath: string;
	outputType: string;
	// Normalized textual output type (present in parser JSON as NormalizedOutputType)
	normalizedOutputType?: string;
	designerHostPath: string;
	targetFramework: string;
	depsFilePath: string;
	runtimeConfigFilePath: string;
	projectReferences: string[];
	directoryPath: string;
}

export interface File {
	path: string;
	targetPath: string;
	projectPath: string;
}

export interface Solution {
	solution: string;
	projects: Project[];
	files: File[];
}
