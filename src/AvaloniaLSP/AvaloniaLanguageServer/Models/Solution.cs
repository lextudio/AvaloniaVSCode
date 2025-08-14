using System.Text.Json.Serialization;
using System;
namespace AvaloniaLanguageServer.Models
{
    public partial class SolutionData
    {
        [JsonPropertyName("solution")]
        public string Solution { get; set; } = string.Empty;

        [JsonPropertyName("projects")]
        public Project[] Projects { get; set; } = Array.Empty<Project>();

        [JsonPropertyName("files")]
        public ProjectFile[] Files { get; set; } = Array.Empty<ProjectFile>();

        public Project? GetExecutableProject()
        {
            return Projects.FirstOrDefault(project => project.OutputType == "WinExe");
        }
    }

    public partial class ProjectFile
    {
        [JsonPropertyName("path")]
        public string Path { get; set; } = string.Empty;

        [JsonPropertyName("targetPath")]
        public string TargetPath { get; set; } = string.Empty;

        [JsonPropertyName("projectPath")]
        public string ProjectPath { get; set; } = string.Empty;
    }

    public partial class Project
    {
        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("path")]
        public string Path { get; set; } = string.Empty;

        [JsonPropertyName("targetPath")]
        public string TargetPath { get; set; } = string.Empty;

        [JsonPropertyName("outputType")]
        public string OutputType { get; set; } = string.Empty;

        [JsonPropertyName("designerHostPath")]
        public string DesignerHostPath { get; set; } = string.Empty;

        [JsonPropertyName("targetFramework")]
        public string TargetFramework { get; set; } = string.Empty;

        [JsonPropertyName("depsFilePath")]
        public string DepsFilePath { get; set; } = string.Empty;

        [JsonPropertyName("runtimeConfigFilePath")]
        public string RuntimeConfigFilePath { get; set; } = string.Empty;

        [JsonPropertyName("projectReferences")]
        public string[] ProjectReferences { get; set; } = Array.Empty<string>();

        [JsonPropertyName("directoryPath")]
        public string DirectoryPath { get; set; } = string.Empty;


        [JsonPropertyName("intermediateOutputPath")]
        public string IntermediateOutputPath { get; set; } = string.Empty;
    }

}