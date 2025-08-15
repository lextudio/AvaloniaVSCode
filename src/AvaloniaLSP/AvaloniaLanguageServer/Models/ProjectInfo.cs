using AvaloniaLanguageServer.Utilities;
using System.Diagnostics;
using System.Collections.Concurrent;
using System.Text.RegularExpressions;
using System.Threading;
using Serilog;
using System.Text.Json;

namespace AvaloniaLanguageServer.Models;

public class ProjectInfo
{
    public static Task<ProjectInfo?> GetProjectInfoAsync(DocumentUri uri)
        => GetProjectInfoAsync(uri, CancellationToken.None);

    public static async Task<ProjectInfo?> GetProjectInfoAsync(DocumentUri uri, CancellationToken cancellationToken)
    {
        string path = Utils.FromUri(uri);
        string root = Directory.GetDirectoryRoot(path);
        string? current = Path.GetDirectoryName(path);

        if (!File.Exists(path) || current == null)
            return null;

        var files = Array.Empty<FileInfo>();
        var info = await Task.Run(() =>
        {
            while (root != current && files.Length == 0)
            {
                    if (cancellationToken.IsCancellationRequested)
                        return (ProjectInfo?)null;
                var directory = new DirectoryInfo(current!);
                files = directory.GetFiles("*.csproj", SearchOption.TopDirectoryOnly);
                files = files.Concat(directory.GetFiles("*.fsproj", SearchOption.TopDirectoryOnly)).ToArray();
                if (files.Length != 0)
                    break;

                current = Path.GetDirectoryName(current);
            }

            return files.Length != 0 ? new ProjectInfo(files.FirstOrDefault()?.FullName, current) : null;
        });

        return info;
    }

    ProjectInfo(string? projectPath, string? projectDirectory)
    {
        ProjectPath = projectPath ?? throw new ArgumentNullException(nameof(projectPath));
        ProjectDirectory = projectDirectory ?? throw new ArgumentNullException(nameof(projectDirectory));
    }

    /// <summary>
    /// Returns full project path
    /// </summary>
    public string ProjectPath { get; }

    /// <summary>
    /// Project directory path
    /// </summary>
    public string ProjectDirectory { get; }

    public string AssemblyPath()
        => AssemblyPath(CancellationToken.None);

    public string AssemblyPath(CancellationToken cancellationToken)
    {
        // 1. launch.json (highest trust)
        var launchJsonPath = TryFindLaunchJson(ProjectDirectory);
        if (launchJsonPath is not null)
        {
            var launchResolved = TryResolveFromLaunchJson(launchJsonPath);
            if (!string.IsNullOrEmpty(launchResolved))
            {
                Log.Information("[AsmLookup] Resolved from launch.json program={Assembly}", launchResolved);
                return launchResolved!;
            }
            else
            {
                Log.Information("[AsmLookup] launch.json present but no valid 'program' entry resolved in {Launch}", launchJsonPath);
            }
        }

        var assemblyBaseName = Path.GetFileNameWithoutExtension(ProjectPath);
    var debugFirstOrder = GetOrderedConfigurations();
        var triedConventions = new List<string>();

        // 2. Conventional bin/<Config>[/<TFM>[/<RID>]] search (cheap heuristic)
        var conventionalTriedPaths = new List<string>();
        foreach (var config in debugFirstOrder)
        {
            if (cancellationToken.IsCancellationRequested) return string.Empty;
            var baseDir = Path.Combine(ProjectDirectory, "bin", config);
            Log.Information("[AsmLookup] Convention scan baseDir={BaseDir} config={Config}", baseDir, config);
            if (!Directory.Exists(baseDir)) { triedConventions.Add(config + ":missing-bin"); continue; }

            // Quick direct candidate at root
            var direct = Path.Combine(baseDir, assemblyBaseName + ".dll");
            conventionalTriedPaths.Add(direct);
            if (File.Exists(direct))
            {
                Log.Information("[AsmLookup] Found direct conventional assembly {Path}", direct);
                return direct;
            }

            // Depth-1 directories (likely TFMs)
            try
            {
                foreach (var tfmDir in Directory.EnumerateDirectories(baseDir))
                {
                    var candidate = Path.Combine(tfmDir, assemblyBaseName + ".dll");
                    conventionalTriedPaths.Add(candidate);
                    if (File.Exists(candidate))
                    {
                        Log.Information("[AsmLookup] Found TFM conventional assembly {Path}", candidate);
                        return candidate;
                    }
                    // One more depth for RID
                    foreach (var ridDir in Directory.EnumerateDirectories(tfmDir))
                    {
                        var ridCandidate = Path.Combine(ridDir, assemblyBaseName + ".dll");
                        conventionalTriedPaths.Add(ridCandidate);
                        if (File.Exists(ridCandidate))
                        {
                            Log.Information("[AsmLookup] Found RID conventional assembly {Path}", ridCandidate);
                            return ridCandidate;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Log.Information(ex, "[AsmLookup] Conventional search exception for {Project} {Config}", ProjectPath, config);
            }
            triedConventions.Add(config);
        }

        // 3. msbuild-evaluated (accurate but slower) per configuration
        var triedMsBuild = new List<string>();
        foreach (var config in debugFirstOrder)
        {
            try
            {
                var props = EvaluateMsBuildProperties(ProjectPath, config, new[] { "TargetPath", "OutDir", "AssemblyName", "TargetFramework", "TargetFrameworks" }, cancellationToken);
                Log.Information("[AsmLookup] MSBuild props for {Project} config={Config} keys={Keys}", ProjectPath, config, string.Join(',', props.Keys));
                if (cancellationToken.IsCancellationRequested) return string.Empty;

                if (props.TryGetValue("TargetPath", out var targetPath) && !string.IsNullOrWhiteSpace(targetPath) && File.Exists(targetPath))
                {
                    Log.Information("[AsmLookup] Found MSBuild TargetPath {TargetPath}", targetPath);
                    return targetPath;
                }

                props.TryGetValue("OutDir", out var outDir);
                props.TryGetValue("AssemblyName", out var assemblyNameOverride);
                var assemblyName = string.IsNullOrWhiteSpace(assemblyNameOverride) ? assemblyBaseName : assemblyNameOverride;
                outDir = string.IsNullOrWhiteSpace(outDir) ? Path.Combine("bin", config) : outDir;
                var rootedOutDir = Path.IsPathRooted(outDir) ? outDir : Path.GetFullPath(Path.Combine(ProjectDirectory, outDir));
                if (Directory.Exists(rootedOutDir))
                {
                    foreach (var tfm in EnumerateTargetFrameworks(props))
                    {
                        var tfmCandidate = Path.Combine(rootedOutDir, tfm, assemblyName + ".dll");
                        if (File.Exists(tfmCandidate))
        {
                            Log.Information("[AsmLookup] Found MSBuild TFM candidate {Path}", tfmCandidate);
                            return tfmCandidate;
                        }
                    }
                    var candidate = Directory.GetFiles(rootedOutDir, assemblyName + ".dll", SearchOption.AllDirectories).FirstOrDefault();
                    if (!string.IsNullOrEmpty(candidate))
                    {
                        Log.Information("[AsmLookup] Found MSBuild recursive candidate {Path}", candidate);
                        return candidate;
                    }
                }
            }
            catch (Exception ex)
            {
                Log.Information(ex, "[AsmLookup] MSBuild property resolution failed for {Project} {Config}", ProjectPath, config);
            }
            triedMsBuild.Add(config);
        }

        Log.Information("[AsmLookup] Assembly not found for {Project}. Conventions tried: {Conv}. MsBuild tried: {MsBuild}. LaunchJson={LaunchJson} TriedPaths={Paths}", ProjectPath, string.Join(',', triedConventions), string.Join(',', triedMsBuild), launchJsonPath ?? "not-found", string.Join('|', conventionalTriedPaths));
        return string.Empty;
    }

    static Dictionary<string, string> EvaluateMsBuildProperties(string projectPath, string configuration, IEnumerable<string> properties)
        => EvaluateMsBuildProperties(projectPath, configuration, properties, CancellationToken.None);

    static Dictionary<string, string> EvaluateMsBuildProperties(string projectPath, string configuration, IEnumerable<string> properties, CancellationToken cancellationToken)
    {
        var key = $"{projectPath}::{configuration}";
        var projectTimestamp = SafeGetLastWriteTimeUtc(projectPath);
        if (s_propsCache.TryGetValue(key, out var cached))
        {
            if (cached.ProjectTimestamp == projectTimestamp && (DateTime.UtcNow - cached.FetchedAt) < CacheTtl)
                return cached.Props;
        }

        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        try
        {
            string propsArg = string.Join(" ", properties.Select(p => $"-getProperty:{p}"));
            var psi = new ProcessStartInfo
            {
                FileName = "dotnet",
                Arguments = $"msbuild \"{projectPath}\" -nologo -property:Configuration={configuration} {propsArg}",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
                WorkingDirectory = Path.GetDirectoryName(projectPath) ?? Environment.CurrentDirectory
            };

            using var proc = Process.Start(psi);
            if (proc == null)
                return result;

            using var reg = cancellationToken.Register(() =>
            {
                try { if (!proc.HasExited) proc.Kill(entireProcessTree: true); } catch { }
            });

            string stdout = string.Empty;
            if (!cancellationToken.IsCancellationRequested)
            {
                stdout = proc.StandardOutput.ReadToEnd();
                _ = proc.StandardError.ReadToEnd(); // ignore
            }

            // Wait up to 5s or cancellation
            var deadline = DateTime.UtcNow + TimeSpan.FromSeconds(5);
            while (!proc.HasExited && DateTime.UtcNow < deadline && !cancellationToken.IsCancellationRequested)
            {
                Thread.Sleep(50);
            }
            if (!proc.HasExited)
            {
                try { proc.Kill(entireProcessTree: true); } catch { }
            }

            if (cancellationToken.IsCancellationRequested)
                return result; // empty

            var rx = new Regex(@"^(?<name>[A-Za-z0-9_]+)\s*=\s*(?<value>.*)$", RegexOptions.Compiled);
            foreach (var line in stdout.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries))
            {
                var m = rx.Match(line.Trim());
                if (m.Success)
                {
                    result[m.Groups["name"].Value] = m.Groups["value"].Value.Trim();
                }
            }
        }
        catch { }

        s_propsCache[key] = new CachedProps { Props = result, ProjectTimestamp = projectTimestamp, FetchedAt = DateTime.UtcNow };
        return result;
    }

    static DateTime SafeGetLastWriteTimeUtc(string path)
    {
        try { return File.GetLastWriteTimeUtc(path); } catch { return DateTime.MinValue; }
    }

    static readonly TimeSpan CacheTtl = TimeSpan.FromSeconds(30);
    static readonly ConcurrentDictionary<string, CachedProps> s_propsCache = new();
    static readonly string[] s_configurationFallback = new[] { "Debug", "Release" };

    static string s_configurationPreference = "Auto"; // Auto | Debug | Release
    public static void SetConfigurationPreference(string preference)
    {
        if (string.Equals(preference, "Debug", StringComparison.OrdinalIgnoreCase)) s_configurationPreference = "Debug";
        else if (string.Equals(preference, "Release", StringComparison.OrdinalIgnoreCase)) s_configurationPreference = "Release";
        else s_configurationPreference = "Auto";
    }

    static IEnumerable<string> GetOrderedConfigurations()
    {
        return s_configurationPreference switch
        {
            "Debug" => new[] { "Debug", "Release" },
            "Release" => new[] { "Release", "Debug" },
            _ => s_configurationFallback
        };
    }

    public static void InvalidateCache(string projectPath)
    {
        foreach (var key in s_propsCache.Keys)
        {
            if (key.StartsWith(projectPath + "::", StringComparison.OrdinalIgnoreCase))
                s_propsCache.TryRemove(key, out _);
        }
    }

    static IEnumerable<string> EnumerateTargetFrameworks(Dictionary<string,string> props)
    {
        if (props.TryGetValue("TargetFramework", out var single) && !string.IsNullOrWhiteSpace(single))
            yield return single.Trim();
        if (props.TryGetValue("TargetFrameworks", out var multi) && !string.IsNullOrWhiteSpace(multi))
        {
            foreach (var part in multi.Split(new[]{';'}, StringSplitOptions.RemoveEmptyEntries))
                yield return part.Trim();
        }
    }

    static string? TryFindLaunchJson(string startDir)
    {
        try
        {
            var current = startDir;
            while (!string.IsNullOrEmpty(current))
            {
                var candidate = Path.Combine(current, ".vscode", "launch.json");
                if (File.Exists(candidate))
                    return candidate;
                var parent = Path.GetDirectoryName(current);
                if (parent == current) break;
                current = parent;
            }
        }
        catch { }
        return null;
    }

    static string? TryResolveFromLaunchJson(string launchJsonPath)
    {
        try
        {
            var json = File.ReadAllText(launchJsonPath);
            using var doc = JsonDocument.Parse(json);
            if (!doc.RootElement.TryGetProperty("configurations", out var configs) || configs.ValueKind != JsonValueKind.Array)
                return null;

            var root = Directory.GetParent(Path.GetDirectoryName(launchJsonPath)!)?.FullName ?? Path.GetPathRoot(launchJsonPath);
            foreach (var cfg in configs.EnumerateArray())
            {
                if (!cfg.TryGetProperty("program", out var programProp))
                    continue;
                var program = programProp.GetString();
                if (string.IsNullOrWhiteSpace(program))
                    continue;

                program = program.Replace("${workspaceFolder}", root, StringComparison.OrdinalIgnoreCase);
                if (!Path.IsPathRooted(program))
                {
                    var baseDir = root ?? Directory.GetCurrentDirectory();
                    program = Path.GetFullPath(Path.Combine(baseDir, program));
                }

                if (File.Exists(program))
                    return program;
            }
        }
        catch (Exception ex)
        {
            Log.Debug(ex, "Failed parsing launch.json {Launch}", launchJsonPath);
        }
        return null;
    }
    class CachedProps
    {
        public required Dictionary<string, string> Props { get; init; }
        public DateTime ProjectTimestamp { get; init; }
        public DateTime FetchedAt { get; init; }
    }

    public bool IsAssemblyExist
    {
        get
        {
            string assemblyPath = AssemblyPath();
            return !string.IsNullOrEmpty(assemblyPath) && File.Exists(assemblyPath);
        }
    }

}
