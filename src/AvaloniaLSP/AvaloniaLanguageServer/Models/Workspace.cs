
using System.Text.Json;
using Avalonia.Ide.CompletionEngine;
using Avalonia.Ide.CompletionEngine.AssemblyMetadata;
using Avalonia.Ide.CompletionEngine.DnlibMetadataProvider;
using AvaloniaLanguageServer.Services;


namespace AvaloniaLanguageServer.Models;

public class Workspace
{
    public ProjectInfo? ProjectInfo { get; private set; }
    public BufferService BufferService { get; } = new();

    public async Task InitializeAsync(DocumentUri uri, string? RootPath)
    {
        try
        {
            ProjectInfo = await ProjectInfo.GetProjectInfoAsync(uri);
            if (ProjectInfo == null)
            {
                Log.Logger.Debug("[Workspace] No project file located for {Uri}", uri);
            }
            else
            {
                var asm = ProjectInfo.AssemblyPath();
                Log.Logger.Information("[Workspace] AssemblyPath after discovery: {Found} Exists={Exists}", asm, !string.IsNullOrEmpty(asm) && File.Exists(asm));
            }
            CompletionMetadata = BuildCompletionMetadata(RootPath);
            if (CompletionMetadata != null)
            {
                Log.Logger.Information("[Workspace] Completion metadata built successfully");
            }
            else
            {
                Log.Logger.Information("[Workspace] Completion metadata not available yet (RootPath={Root} ProjectInfo? {HasProj})", RootPath, ProjectInfo != null);
            }
        }
        catch (Exception e)
        {
            throw new Exception($"Failed to initialize workspace: {uri}", e);
        }
    }

    Metadata? BuildCompletionMetadata(string? RootPath)
    {
        if (RootPath == null)
            return null;

        var slnFile = SolutionName(RootPath) ?? Path.GetFileNameWithoutExtension(RootPath);

        if (slnFile == null)
            return null;


        var slnFilePath = Path.Combine(Path.GetTempPath(), $"{slnFile}.json");

        if (!File.Exists(slnFilePath))
            return null;

        string content = File.ReadAllText(slnFilePath);
        var package = JsonSerializer.Deserialize<SolutionData>(content);
        var exeProj = package!.GetExecutableProject();

        if (exeProj == null || string.IsNullOrEmpty(exeProj.TargetPath))
            return null;

        // Prefer designer host path as the primary XAML assembly if provided; otherwise fall back to target path.
        var primaryXamlAssembly = string.IsNullOrEmpty(exeProj.DesignerHostPath)
            ? exeProj.TargetPath
            : exeProj.DesignerHostPath;

        IAssemblyProvider provider = new DepsJsonFileAssemblyProvider(exeProj.TargetPath, primaryXamlAssembly);
        return _metadataReader.GetForTargetAssembly(provider);
    }

    string? SolutionName(string RootPath)
    {
        // Prefer .slnx over .sln if present. Pick the first (closest) file.
        IEnumerable<string> Enumerate(string pattern) => Directory.EnumerateFiles(RootPath, pattern, SearchOption.AllDirectories);

        var candidates = Enumerate("*.slnx").Concat(Enumerate("*.sln"))
            .Select(p => new { Path = p, Depth = p.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar).Length })
            .OrderBy(p => p.Depth)
            .ThenBy(p => p.Path, StringComparer.OrdinalIgnoreCase);

        var first = candidates.FirstOrDefault();
        return first != null ? Path.GetFileName(first.Path) : null;
    }

    public Metadata? CompletionMetadata { get; private set; }
    readonly MetadataReader _metadataReader = new(new DnlibMetadataProvider());
}