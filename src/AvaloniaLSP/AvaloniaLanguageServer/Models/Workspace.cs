
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
        {
            Log.Logger.Information("[Workspace] Executable project or TargetPath missing in solution model (ExeProjectNull={ExeNull} TargetPathNull={TargetNull})", exeProj == null, exeProj?.TargetPath == null);
            // Fallback: try to use discovered project assembly path directly if available
            if (ProjectInfo != null)
            {
                var fallbackAsm = ProjectInfo.AssemblyPath();
                if (!string.IsNullOrEmpty(fallbackAsm) && File.Exists(fallbackAsm))
                {
                    try
                    {
                        Log.Logger.Information("[Workspace] Attempting fallback metadata load from assembly path {Asm}", fallbackAsm);
                        IAssemblyProvider fallbackProvider = new DepsJsonFileAssemblyProvider(fallbackAsm, fallbackAsm);
                        var fallbackMeta = _metadataReader.GetForTargetAssembly(fallbackProvider);
                        if (fallbackMeta != null)
                        {
                            Log.Logger.Information("[Workspace] Fallback metadata load succeeded");
                            return fallbackMeta;
                        }
                        else
                        {
                            Log.Logger.Information("[Workspace] Fallback metadata load returned null");
                        }
                    }
                    catch (Exception ex)
                    {
                        Log.Logger.Information(ex, "[Workspace] Fallback metadata load failed");
                    }
                }
            }
            return null;
        }

        // Prefer designer host path as the primary XAML assembly if provided; otherwise fall back to target path.
        var primaryXamlAssembly = string.IsNullOrEmpty(exeProj.DesignerHostPath)
            ? exeProj.TargetPath
            : exeProj.DesignerHostPath;

        IAssemblyProvider provider = new DepsJsonFileAssemblyProvider(exeProj.TargetPath, primaryXamlAssembly);

        // Attempt to load from cache first (cache keyed by target assembly path + last write time)
        try
        {
            var cacheKey = BuildMetadataCacheKey(exeProj.TargetPath);
            var cacheFile = Path.Combine(Path.GetTempPath(), cacheKey + ".avalonia-metadata.json");
            if (File.Exists(cacheFile))
            {
                var cached = TryDeserializeMetadata(cacheFile);
                if (cached != null)
                {
                    Log.Logger.Information("[Workspace] Loaded completion metadata from cache {File}", cacheFile);
                    return cached;
                }
            }
        }
        catch (Exception ex)
        {
            Log.Logger.Debug(ex, "[Workspace] Failed reading metadata cache");
        }

        var meta = _metadataReader.GetForTargetAssembly(provider);
        if (meta == null)
            Log.Logger.Information("[Workspace] Metadata reader returned null for TargetPath={TargetPath}", exeProj.TargetPath);
        else
        {
            try
            {
                var cacheKey = BuildMetadataCacheKey(exeProj.TargetPath);
                var cacheFile = Path.Combine(Path.GetTempPath(), cacheKey + ".avalonia-metadata.json");
                SerializeMetadata(cacheFile, meta);
                Log.Logger.Information("[Workspace] Wrote completion metadata cache {File}", cacheFile);
            }
            catch (Exception ex)
            {
                Log.Logger.Debug(ex, "[Workspace] Failed writing metadata cache");
            }
        }
        return meta;
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

    static string BuildMetadataCacheKey(string targetAssemblyPath)
    {
        try
        {
            var fi = new FileInfo(targetAssemblyPath);
            var stamp = fi.Exists ? fi.LastWriteTimeUtc.Ticks.ToString("x") : "nostamp";
            var hashInput = targetAssemblyPath + "|" + stamp;
            using var sha = System.Security.Cryptography.SHA256.Create();
            var bytes = System.Text.Encoding.UTF8.GetBytes(hashInput);
            var hash = Convert.ToHexString(sha.ComputeHash(bytes)).Substring(0, 16);
            return "avalonia-meta-" + hash;
        }
        catch
        {
            return "avalonia-meta-fallback";
        }
    }

    static void SerializeMetadata(string path, Metadata meta)
    {
        // Simple custom JSON format: namespaces -> types -> minimal properties/events flags.
        using var fs = File.Create(path);
        using var jw = new System.Text.Json.Utf8JsonWriter(fs, new System.Text.Json.JsonWriterOptions { Indented = false });
        jw.WriteStartObject();
        jw.WritePropertyName("namespaces");
        jw.WriteStartObject();
        foreach (var ns in meta.Namespaces)
        {
            jw.WritePropertyName(ns.Key);
            jw.WriteStartObject();
            foreach (var type in ns.Value)
            {
                var t = type.Value;
                jw.WritePropertyName(t.Name);
                jw.WriteStartObject();
                jw.WriteString("fullName", t.FullName);
                if (t.IsEnum) jw.WriteBoolean("isEnum", true);
                if (t.IsMarkupExtension) jw.WriteBoolean("isMarkup", true);
                if (t.HasHintValues && t.HintValues != null)
                {
                    jw.WritePropertyName("hints");
                    jw.WriteStartArray();
                    foreach (var h in t.HintValues)
                        jw.WriteStringValue(h);
                    jw.WriteEndArray();
                }
                if (t.Properties.Count > 0)
                {
                    jw.WritePropertyName("props");
                    jw.WriteStartArray();
                    foreach (var p in t.Properties)
                    {
                        jw.WriteStartObject();
                        jw.WriteString("n", p.Name);
                        if (p.Type != null) jw.WriteString("t", p.Type.FullName);
                        jw.WriteBoolean("a", p.IsAttached);
                        jw.WriteBoolean("s", p.IsStatic);
                        jw.WriteBoolean("g", p.HasGetter);
                        jw.WriteBoolean("w", p.HasSetter);
                        jw.WriteEndObject();
                    }
                    jw.WriteEndArray();
                }
                if (t.Events.Count > 0)
                {
                    jw.WritePropertyName("evts");
                    jw.WriteStartArray();
                    foreach (var ev in t.Events)
                    {
                        jw.WriteStartObject();
                        jw.WriteString("n", ev.Name);
                        if (ev.Type != null) jw.WriteString("t", ev.Type.FullName);
                        jw.WriteBoolean("a", ev.IsAttached);
                        jw.WriteEndObject();
                    }
                    jw.WriteEndArray();
                }
                jw.WriteEndObject();
            }
            jw.WriteEndObject();
        }
        jw.WriteEndObject();
        jw.WriteEndObject();
    }

    static Metadata? TryDeserializeMetadata(string path)
    {
        try
        {
            using var fs = File.OpenRead(path);
            using var doc = System.Text.Json.JsonDocument.Parse(fs);
            if (!doc.RootElement.TryGetProperty("namespaces", out var nss) || nss.ValueKind != System.Text.Json.JsonValueKind.Object)
                return null;
            var meta = new Metadata();
            foreach (var nsProp in nss.EnumerateObject())
            {
                var nsName = nsProp.Name;
                if (nsProp.Value.ValueKind != System.Text.Json.JsonValueKind.Object) continue;
                foreach (var typeProp in nsProp.Value.EnumerateObject())
                {
                    if (typeProp.Value.ValueKind != System.Text.Json.JsonValueKind.Object) continue;
                    var typeName = typeProp.Name;
                    var elem = typeProp.Value;
                    var mt = new MetadataType(typeName)
                    {
                        FullName = elem.TryGetProperty("fullName", out var fn) ? fn.GetString() ?? typeName : typeName,
                        IsEnum = elem.TryGetProperty("isEnum", out var isEnumEl) && isEnumEl.GetBoolean(),
                        IsMarkupExtension = elem.TryGetProperty("isMarkup", out var isMarkupEl) && isMarkupEl.GetBoolean(),
                        HasHintValues = elem.TryGetProperty("hints", out var hintsEl) && hintsEl.ValueKind == System.Text.Json.JsonValueKind.Array,
                        HintValues = elem.TryGetProperty("hints", out var hEl) && hEl.ValueKind == System.Text.Json.JsonValueKind.Array ? hEl.EnumerateArray().Select(v => v.GetString() ?? "").Where(s => !string.IsNullOrEmpty(s)).ToArray() : null
                    };
                    if (elem.TryGetProperty("props", out var propsEl) && propsEl.ValueKind == System.Text.Json.JsonValueKind.Array)
                    {
                        foreach (var p in propsEl.EnumerateArray())
                        {
                            var pn = p.TryGetProperty("n", out var pnEl) ? pnEl.GetString() ?? "" : "";
                            if (string.IsNullOrEmpty(pn)) continue;
                            var ptFull = p.TryGetProperty("t", out var ptEl) ? ptEl.GetString() : null;
                            var dummyType = ptFull != null ? new MetadataType(ptFull.Split('.').Last()) { FullName = ptFull } : null;
                            var mp = new MetadataProperty(pn, dummyType, null,
                                p.TryGetProperty("a", out var aEl) && aEl.GetBoolean(),
                                p.TryGetProperty("s", out var sEl) && sEl.GetBoolean(),
                                p.TryGetProperty("g", out var gEl) && gEl.GetBoolean(),
                                p.TryGetProperty("w", out var wEl) && wEl.GetBoolean());
                            mt.Properties.Add(mp);
                        }
                    }
                    if (elem.TryGetProperty("evts", out var evtsEl) && evtsEl.ValueKind == System.Text.Json.JsonValueKind.Array)
                    {
                        foreach (var ev in evtsEl.EnumerateArray())
                        {
                            var en = ev.TryGetProperty("n", out var enEl) ? enEl.GetString() ?? "" : "";
                            if (string.IsNullOrEmpty(en)) continue;
                            var etFull = ev.TryGetProperty("t", out var etEl) ? etEl.GetString() : null;
                            var dummyType = etFull != null ? new MetadataType(etFull.Split('.').Last()) { FullName = etFull } : null;
                            var me = new MetadataEvent(en, dummyType, null,
                                ev.TryGetProperty("a", out var a2El) && a2El.GetBoolean());
                            mt.Events.Add(me);
                        }
                    }
                    meta.AddType("clr-namespace:" + (mt.FullName.Contains('.') ? mt.FullName.Substring(0, mt.FullName.LastIndexOf('.')) : "") + ";assembly=Cached", mt);
                }
            }
            return meta;
        }
        catch
        {
            return null;
        }
    }
}