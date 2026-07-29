using System.Text.Json;

namespace PraxisControl.Windows.Services;

internal sealed record RuntimeState(
    int Pid,
    string Host,
    int Port,
    string Url,
    DateTimeOffset StartedAt,
    string ShutdownToken,
    string ApiToken)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static async Task<RuntimeState> ReadAsync(CancellationToken cancellationToken = default)
    {
        var configuredDataDirectory = Environment.GetEnvironmentVariable("PRAXIS_DATA_DIR");
        var dataDirectory = string.IsNullOrWhiteSpace(configuredDataDirectory)
            ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PraxisControl")
            : Path.GetFullPath(configuredDataDirectory);
        var statePath = Path.Combine(dataDirectory, "runtime", "service.json");

        try
        {
            await using var stream = File.OpenRead(statePath);
            var state = await JsonSerializer.DeserializeAsync<RuntimeState>(stream, JsonOptions, cancellationToken);
            return state ?? throw new InvalidDataException("服务状态文件为空。");
        }
        catch (FileNotFoundException)
        {
            throw new InvalidOperationException("服务尚未启动。请先使用 Praxis Control 启动入口，或通过 CLI 执行 start --no-open。");
        }
        catch (JsonException error)
        {
            throw new InvalidDataException("服务状态文件无效，请先运行 praxis status 或重新启动服务。", error);
        }
    }
}
