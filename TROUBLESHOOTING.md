# Troubleshooting Guide

This guide helps diagnose and resolve common issues with the Avalonia VS Code extension (LeXtudio fork): solution / project discovery, assembly resolution, metadata & completion, previewer, and logging noise.

## Quick Checklist

1. Build once: `dotnet build` (or use the status bar rebuild command) after cloning / cleaning.
2. Status bar says `Avalonia: Ready` (otherwise use `Avalonia: Rebuild solution model`).
3. Open an `.axaml` file and trigger completion (Ctrl+Space). If you see only `Build the project`, follow the Completion section below.
4. Previewer assets: Run `Create previewer assets` if preview doesn't load.

## Solution & Project Discovery

The extension searches for a solution file in this priority order:

1. First `.slnx` found (shallowest depth, then lexicographical)
2. First `.sln` (same ordering)
3. Folder scan fallback (all `*.csproj` / `*.fsproj`).

Commands:

- `Avalonia: Show solution discovery info` – shows patterns, matches, chosen file, and if folder fallback was used.
- `Avalonia: Open solution model JSON` – opens the cached model in your temp directory.
- `Avalonia: Rebuild solution model` – forces regeneration (invalidates discovery metadata).

Symptoms & Fixes:

- Chosen solution not expected: Rename or remove deeper nested copies; ensure your desired file is shallower.
- Model JSON empty (~ <200B): Build your project; TargetPath likely missing.

## Executable Project Selection

The language server selects the executable project for metadata by order:

1. First project with `OutputType=WinExe`
2. Then `OutputType=Exe`
3. Then any project with a non-empty `TargetPath`

Commands:

- `Avalonia: Show chosen executable project`
- `Avalonia: Invalidate Avalonia metadata cache` (forces fresh metadata extraction next completion cycle)

If incorrect:

- Ensure the intended startup project has `OutputType` set appropriately.
- Rebuild & run `Show chosen executable project` again.

## Assembly Resolution & Metadata

The server resolves the assembly in this order:

1. `launch.json` `program` field (top trust)
2. Conventional `bin/<Config>[/<TFM>[/<RID>]]` paths (config order: Debug→Release or per preference)
3. MSBuild property evaluation (`TargetPath`, then `OutDir` + `AssemblyName` + TFMs)

Fallback: If the solution model lacks a valid executable project or `TargetPath`, it attempts the resolved project assembly directly.

### Metadata Cache

The first successful metadata build is serialized to a compact cache file in the OS temp directory (`avalonia-meta-*.avalonia-metadata.json`).

Benefits:

- Faster cold start (skips assembly parsing when cache matches assembly timestamp)
- Lower CPU on repeated window reloads

Invalidation triggers:

- Assembly timestamp change (rebuild / new build output)
- Manual: `Avalonia: Invalidate Avalonia metadata cache`

If metadata seems stale (missing new types/properties):

1. Rebuild your project (`dotnet build`)
2. Invalidate cache via command
3. Trigger completion again

Command:

- `Avalonia: Show last assembly resolution error` (only when status shows Error)

Common Issues:

- Build configuration mismatch: Set `Avalonia > Build Configuration Preference` in settings to `Debug` or `Release` explicitly.
- `TargetPath` empty: Run a full build; ensure the project isn’t excluded or conditionally built.
- Multi-targeting: Ensure at least one target produces the XAML assembly and `TargetFramework` is resolvable.

## Completion Issues

Symptom: Only a single `Build the project` completion item.

Steps:

1. Check status bar – must be `Avalonia: Ready`.
2. Run `Show chosen executable project` – confirm `TargetPath` exists on disk.
3. Toggle verbose logs (see Logging section) and re-trigger completion; look for lines:
   - `[Completion] Init proj=... asm=... meta=...`
   - `[Completion] Returning N completion items (namespaceCount=X)`
4. If `asm=true` but `meta=false` and fallback fails, inspect solution JSON for missing `targetPath` and rebuild.
5. If metadata previously existed but now incomplete, run `Invalidate Avalonia metadata cache`.

## Previewer Issues

- Run `Create previewer assets` to generate required MSBuild targets & assets.
- Ensure the app builds without runtime errors.
- Check the dev tools console (Help > Toggle Developer Tools) for WebView errors on Windows/Linux.

## Logging & Verbose Mode

Configuration:

- `Avalonia > Verbose Logs` (default: off)
- `Avalonia > Build Configuration Preference` (Debug / Release / Auto)
- `Avalonia > Debounce Fs Events Ms` (default 600) – adjust if rapid edits still cause too many rebuilds or if rebuild feels laggy.

Commands:

- `Avalonia: Toggle verbose Avalonia logs` – flips the setting and restarts the server.

Log Categories (key prefixes):

- `[SolutionDiscovery]` – discovery patterns & selection.
- `[SolutionModel]` – model cache reuse (size & hash).
- `[Workspace]` – assembly path detection, metadata build / fallback.
- `[AsmLookup]` – assembly search steps (verbose only).
- `[Completion]` – initialization summary & item counts.

When verbose logs are OFF: Only high-level success/failure lines (no per-path scanning).
When ON: Full assembly probing (launch.json, conventions, msbuild) and metadata fallback attempts.

Log Locations:

- Language server file: OS temp directory `avalonia.log` (macOS example: `/var/folders/.../T/avalonia.log`).
- VS Code Output: `Avalonia` output channel & `Language Server` channel (protocol trace if enabled).

Reducing Noise:

- Disable verbose logs.
- Set `axaml.trace.server` to `messages` (default) instead of `verbose` in settings.
- Increase debounce interval if frequent solution model rebuild messages appear.

## Forcing a Clean State

1. Stop VS Code.
2. Delete the solution model JSON in temp folder (`<SolutionName>.sln[x].json`).
3. Delete `bin` / `obj` of your project(s).
4. Reopen folder; build once; trigger completion.

## Collecting Diagnostics for Issues

Provide when filing an issue:

- OS, .NET SDK version (`dotnet --info`), extension version.
- Copy of lines from log containing: `[SolutionDiscovery]`, first `[Workspace]` assembly lines, `[Completion] Init`, any `[AsmLookup]` failures.
- Size & first 10 lines of solution model JSON.

## Known Edge Cases

| Case | Impact | Mitigation |
|------|--------|------------|
| Multi-root workspaces | Discovery only scans first root | Open only relevant folder for now |
| TargetPath created in post-build step | Metadata missing until run | Ensure main build produces assembly directly |
| Conditional project inclusion | Missing project in JSON | Ensure conditions are satisfied for selected configuration |

## FAQ

Q: Why is completion still slow the first time?  
A: Metadata extraction reads all referenced assemblies; subsequent completions are cached.

Q: Can I point to a specific project manually?  
A: Not yet; planned option: explicit project override.

Q: How do I reduce CPU usage during startup?  
A: Disable verbose logs, ensure single solution file, and avoid opening very large non-Avalonia folders simultaneously.

---
If you encounter a scenario not covered here, open an issue with the diagnostics bundle described above.
