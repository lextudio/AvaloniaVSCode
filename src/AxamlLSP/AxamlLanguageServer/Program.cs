using AvaloniaLanguageServer.Handlers;
using AvaloniaLanguageServer.Models;
using OmniSharp.Extensions.LanguageServer.Protocol.Server;
using System.Text.Json;

namespace AvaloniaLanguageServer;

public class Program
{
    static ILanguageServer? server;
    public static async Task Main(string[] args)
    {
        InitializeLogging();
        server = await LanguageServer.From(ConfigureOptions);

        Log.Logger.Information("Language server initialised");
        await server.WaitForExit;
    }

    static void ConfigureOptions(LanguageServerOptions options)
    {
        bool verboseLogs = false;
        string? workspaceRoot = null;
        options
            .WithInput(Console.OpenStandardInput())
            .WithOutput(Console.OpenStandardOutput())
            .ConfigureLogging(p => p
                .AddSerilog(Log.Logger)
                .AddLanguageProtocolLogging()
                .SetMinimumLevel(LogLevel.Trace)
            )
            .WithHandler<CompletionHandler>()
            .WithHandler<TextDocumentSyncHandler>()
            .WithHandler<DocumentSymbolHandler>()
            .WithServices(ConfigureServices)
            .OnInitialize((init_server, request, token) =>
            {
                server = init_server;
                try
                {
                    // Attempt to read client supplied initializationOptions.buildConfigurationPreference
                    var initOptions = request.InitializationOptions;
                    string? pref = null;
                    if (initOptions != null)
                    {
                        if (initOptions is JsonElement je && je.ValueKind == JsonValueKind.Object)
                        {
                            if (je.TryGetProperty("buildConfigurationPreference", out var bcp) && bcp.ValueKind == JsonValueKind.String)
                                pref = bcp.GetString();
                            if (je.TryGetProperty("verboseLogs", out var vl) && vl.ValueKind == JsonValueKind.True)
                                verboseLogs = true;
                            if (je.TryGetProperty("workspaceRoot", out var wr) && wr.ValueKind == JsonValueKind.String)
                                workspaceRoot = wr.GetString();
                        }
                    }
                    pref ??= Environment.GetEnvironmentVariable("AXAML_BUILD_CONFIGURATION_PREFERENCE");
                    if (!string.IsNullOrWhiteSpace(pref))
                        ProjectInfo.SetConfigurationPreference(pref!);
                    if (!verboseLogs)
                    {
                        // Optionally adjust Serilog level switch if we had one; here we just note flag.
                        Log.Logger.Information("Verbose logs disabled (some detailed steps suppressed)");
                    }
                }
                catch (Exception ex)
                {
                    Log.Logger.Debug(ex, "Failed to apply build configuration preference");
                }
                return Task.CompletedTask;
            });
    }

    static void ConfigureServices(IServiceCollection services)
    {
        services.AddSingleton(new ConfigurationItem { Section = "AXAML Server" });
        services.AddSingleton(new DocumentSelector(
            new DocumentFilter { Pattern = "**/*.axaml" }
        ));
        services.AddSingleton<Workspace>();
        services.AddSingleton(GetServer);
    }

    static ILanguageServer? GetServer() => server;

    static void InitializeLogging()
    {
        string logFilePath = Path.Combine(Path.GetTempPath(), "axaml.log");
        Log.Logger = new LoggerConfiguration()
            .WriteTo.File(logFilePath)
            .Enrich.FromLogContext()
            .MinimumLevel.Verbose()
            .CreateLogger();
    }
}