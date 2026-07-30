using System.Net.Http.Json;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace PraxisControl.Windows.Services;

internal sealed class PraxisApiClient : IDisposable
{
    public const int SupportedApiVersion = 1;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly HttpClient _http;
    private readonly RuntimeState _runtime;

    private PraxisApiClient(RuntimeState runtime)
    {
        _runtime = runtime;
        _http = new HttpClient { BaseAddress = new Uri(runtime.Url), Timeout = TimeSpan.FromSeconds(5) };
        _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", runtime.ApiToken);
    }

    public static async Task<PraxisApiClient> ConnectAsync(CancellationToken cancellationToken = default)
    {
        var runtime = await RuntimeState.ReadAsync(cancellationToken);
        var client = new PraxisApiClient(runtime);
        try
        {
            var meta = await client.GetAsync<MetaResponse>("/api/meta", cancellationToken);
            if (meta.ApiVersion != SupportedApiVersion)
            {
                throw new NotSupportedException($"服务 API 版本为 {meta.ApiVersion}，客户端仅支持 {SupportedApiVersion}。请升级客户端或服务。");
            }
            return client;
        }
        catch
        {
            client.Dispose();
            throw;
        }
    }

    public string ServiceUrl => _runtime.Url;

    public Task<DashboardResponse> GetDashboardAsync(CancellationToken cancellationToken = default) =>
        GetAsync<DashboardResponse>("/api/dashboard", cancellationToken);

    public Task<GraphResponse> GetGraphAsync(CancellationToken cancellationToken = default) =>
        GetAsync<GraphResponse>("/api/graph", cancellationToken);

    public Task<DailyAnalysisResponse> AnalyzeCheckinAsync(DailyInput input, CancellationToken cancellationToken = default) =>
        PostApiAsync<DailyInput, DailyAnalysisResponse>("/api/checkins/analyze", input, cancellationToken);

    public Task<CreateCheckinResponse> CreateCheckinAsync(DailyInput input, CancellationToken cancellationToken = default) =>
        PostApiAsync<DailyInput, CreateCheckinResponse>("/api/checkins", input, cancellationToken);

    public async Task RequestShutdownAsync(CancellationToken cancellationToken = default)
    {
        using var response = await _http.PostAsJsonAsync(
            "/api/system/shutdown",
            new { token = _runtime.ShutdownToken },
            JsonOptions,
            cancellationToken);
        response.EnsureSuccessStatusCode();
    }

    private async Task<T> GetAsync<T>(string route, CancellationToken cancellationToken)
    {
        using var response = await _http.GetAsync(route, cancellationToken);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<T>(JsonOptions, cancellationToken)
            ?? throw new InvalidDataException($"服务返回了空响应：{route}");
    }

    private async Task<TResponse> PostApiAsync<TRequest, TResponse>(
        string route,
        TRequest body,
        CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, route)
        {
            Content = JsonContent.Create(body, options: JsonOptions),
        };
        using var response = await _http.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var error = await response.Content.ReadFromJsonAsync<ErrorResponse>(JsonOptions, cancellationToken);
            throw new InvalidOperationException(error?.Message ?? $"请求失败：HTTP {(int)response.StatusCode}");
        }
        return await response.Content.ReadFromJsonAsync<TResponse>(JsonOptions, cancellationToken)
            ?? throw new InvalidDataException($"服务返回了空响应：{route}");
    }

    public void Dispose() => _http.Dispose();
}

internal sealed record MetaResponse(int ApiVersion, string RulesetVersion, string Backend);

internal sealed record DashboardResponse(
    IReadOnlyList<ProjectSummary> ActiveProjects,
    JsonElement? LatestCheckin,
    int AwaitingReview,
    int ReviewedLast7Days,
    int ActiveWip);

internal sealed record ProjectSummary(
    string Id,
    string Title,
    string Kind,
    [property: JsonPropertyName("current_bottleneck")] string CurrentBottleneck);

internal sealed record GraphResponse(IReadOnlyList<GraphNode> Nodes, IReadOnlyList<GraphEdge> Edges);
internal sealed record GraphNode(
    string Id,
    [property: JsonPropertyName("object_type")] string ObjectType,
    string Title,
    string Status);

internal sealed record GraphEdge(
    string Id,
    [property: JsonPropertyName("source_id")] string SourceId,
    [property: JsonPropertyName("target_id")] string TargetId,
    [property: JsonPropertyName("relation_type")] string RelationType,
    double? Strength);

internal sealed record DailyInput(
    string CheckinDate,
    int AvailableMinutes,
    int ReservePercent,
    int Energy,
    int Attention,
    string StageGoal,
    string MainContradiction,
    string Bottleneck,
    string MainAction,
    string Deliverable,
    int EstimatedMinutes,
    string StopCondition,
    string ExplicitNotDo,
    int ContradictionContribution,
    int BottleneckContribution,
    int EvidenceStrength,
    string RiskLevel,
    bool HasAuthorization,
    bool LossTolerable,
    bool HasRecoveryPlan,
    bool OpensNewCoreProject,
    int ActiveWip);

internal sealed record DailyAnalysisResponse(
    string Status,
    int UsableMinutes,
    string CapacityBand,
    string BenefitBand,
    string FeasibilityBand,
    string RiskBand,
    string Recommendation,
    IReadOnlyList<string> Reasons,
    IReadOnlyList<string> Warnings,
    IReadOnlyList<string> TriggeredRules,
    IReadOnlyList<string> Assumptions,
    string NextReviewTrigger);

internal sealed record CreateCheckinResponse(string Status, string Id);
internal sealed record ErrorResponse(string Status, string Message);
