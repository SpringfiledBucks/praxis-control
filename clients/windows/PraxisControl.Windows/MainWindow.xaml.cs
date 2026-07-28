using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Text.Json;
using Microsoft.UI.Xaml;
using PraxisControl.Windows.Services;

namespace PraxisControl.Windows;

public sealed partial class MainWindow : Window, INotifyPropertyChanged
{
    private PraxisApiClient? _client;
    private bool _isConnected;
    private string _statusText = "正在连接本机服务…";
    private string _activeWip = "—";
    private string _awaitingReview = "—";
    private string _reviewedLast7Days = "—";
    private string _graphSummary = "—";
    private string _latestAction = "尚无可显示的行动";

    public MainWindow()
    {
        InitializeComponent();
        AppWindow.Resize(new global::Windows.Graphics.SizeInt32(1100, 720));
        Activated += MainWindow_Activated;
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public bool IsConnected { get => _isConnected; private set => SetField(ref _isConnected, value); }
    public string StatusText { get => _statusText; private set => SetField(ref _statusText, value); }
    public string ActiveWip { get => _activeWip; private set => SetField(ref _activeWip, value); }
    public string AwaitingReview { get => _awaitingReview; private set => SetField(ref _awaitingReview, value); }
    public string ReviewedLast7Days { get => _reviewedLast7Days; private set => SetField(ref _reviewedLast7Days, value); }
    public string GraphSummary { get => _graphSummary; private set => SetField(ref _graphSummary, value); }
    public string LatestAction { get => _latestAction; private set => SetField(ref _latestAction, value); }

    private async void MainWindow_Activated(object sender, WindowActivatedEventArgs args)
    {
        Activated -= MainWindow_Activated;
        await RefreshAsync();
    }

    private async void Refresh_Click(object sender, RoutedEventArgs e) => await RefreshAsync();

    private void OpenWeb_Click(object sender, RoutedEventArgs e)
    {
        if (_client is null) return;
        Process.Start(new ProcessStartInfo(_client.ServiceUrl) { UseShellExecute = true });
    }

    private async void Shutdown_Click(object sender, RoutedEventArgs e)
    {
        if (_client is null) return;
        try
        {
            await _client.RequestShutdownAsync();
            ResetDisconnected("已提交安全关闭请求。关闭窗口不会被用作服务关闭信号。");
        }
        catch (Exception error)
        {
            StatusText = $"关闭请求失败：{error.Message}";
        }
    }

    private async Task RefreshAsync()
    {
        StatusText = "正在连接本机服务…";
        _client?.Dispose();
        _client = null;
        IsConnected = false;

        try
        {
            var client = await PraxisApiClient.ConnectAsync();
            var dashboardTask = client.GetDashboardAsync();
            var graphTask = client.GetGraphAsync();
            await Task.WhenAll(dashboardTask, graphTask);
            var dashboard = await dashboardTask;
            var graph = await graphTask;

            _client = client;
            ActiveWip = $"{dashboard.ActiveWip} / 3";
            AwaitingReview = dashboard.AwaitingReview.ToString();
            ReviewedLast7Days = dashboard.ReviewedLast7Days.ToString();
            GraphSummary = $"{graph.Nodes.Count} 点 · {graph.Edges.Count} 边";
            LatestAction = ExtractLatestAction(dashboard.LatestCheckin);
            IsConnected = true;
            StatusText = $"已连接 {client.ServiceUrl} · API v{PraxisApiClient.SupportedApiVersion}";
        }
        catch (Exception error)
        {
            ResetDisconnected(error.Message);
        }
    }

    private void ResetDisconnected(string message)
    {
        _client?.Dispose();
        _client = null;
        IsConnected = false;
        ActiveWip = AwaitingReview = ReviewedLast7Days = GraphSummary = "—";
        LatestAction = "服务连接后显示最近行动";
        StatusText = message;
    }

    private static string ExtractLatestAction(JsonElement? latestCheckin)
    {
        if (latestCheckin is not { ValueKind: JsonValueKind.Object } latest) return "尚无日常决策记录";
        return latest.TryGetProperty("main_action", out var action) && action.ValueKind == JsonValueKind.String
            ? action.GetString() ?? "尚无日常决策记录"
            : "尚无日常决策记录";
    }

    private void SetField<T>(ref T field, T value, [CallerMemberName] string? propertyName = null)
    {
        if (EqualityComparer<T>.Default.Equals(field, value)) return;
        field = value;
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
    }
}
