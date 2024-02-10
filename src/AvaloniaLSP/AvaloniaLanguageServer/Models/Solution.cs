using System.Text.Json.Serialization;
using System;
namespace AvaloniaLanguageServer.Models
{
    public partial class SolutionData
    {
        [JsonPropertyName("solution")]
        public string Solution { get; set; } = string.Empty;

        /// <remarks>May include permutations of projects e.g. Name: "ProjectName (TFM)" or "ProjectName (TFM, RID)"</remarks>
        [JsonPropertyName("projects")]
        public Project[] Projects { get; set; } = Array.Empty<Project>();

        [JsonPropertyName("files")]
        public ProjectFile[] Files { get; set; } = Array.Empty<ProjectFile>();

        public const string OutputTypeWinExe = "WinExe";
        public const string OutputTypeExe = "Exe";

        public Project? GetExecutableProject()
        {
            bool IsWinExe(Project p) => string.Equals(p.NormalizedOutputType ?? p.OutputType, OutputTypeWinExe, StringComparison.OrdinalIgnoreCase);
            bool IsExe(Project p) => string.Equals(p.NormalizedOutputType ?? p.OutputType, OutputTypeExe, StringComparison.OrdinalIgnoreCase);
            var exe = Projects.FirstOrDefault(IsWinExe)
                      ?? Projects.FirstOrDefault(IsExe)
                      ?? Projects.FirstOrDefault(p => !string.IsNullOrWhiteSpace(p.TargetPath));
            return exe;
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

        // Normalized textual representation of OutputType (e.g. WinExe, Exe, Library)
        [JsonPropertyName("normalizedOutputType")]
        public string NormalizedOutputType { get; set; } = string.Empty;

        [JsonPropertyName("designerHostPath")]
        public string DesignerHostPath { get; set; } = string.Empty;

        [JsonPropertyName("targetFramework")]
        public string TargetFramework { get; set; } = string.Empty;

        [JsonPropertyName("targetFrameworks")]
        public string[] TargetFrameworks { get; set; } = Array.Empty<string>();

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