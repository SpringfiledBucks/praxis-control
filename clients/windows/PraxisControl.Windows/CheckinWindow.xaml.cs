using System.Text.Json;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using PraxisControl.Windows.Services;

namespace PraxisControl.Windows;

public sealed partial class CheckinWindow : Window
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly PraxisApiClient _client;
    private readonly int _activeWip;
    private readonly Func<Task> _onSaved;
    private string? _analyzedInput;

    internal CheckinWindow(PraxisApiClient client, int activeWip, Func<Task> onSaved)
    {
        _client = client;
        _activeWip = activeWip;
        _onSaved = onSaved;
        InitializeComponent();
        AppWindow.Resize(new global::Windows.Graphics.SizeInt32(1000, 820));
        CheckinDate.Date = DateTimeOffset.Now;
        if (Environment.GetEnvironmentVariable("PRAXIS_WINDOWS_E2E_AUTOSUBMIT") == "1")
        {
            EnsureE2EDataDirectory();
            RootLayout.Loaded += RunE2EAsync;
        }
    }

    private async void Analyze_Click(object sender, RoutedEventArgs e) => await AnalyzeAsync();

    private async Task<bool> AnalyzeAsync()
    {
        SetBusy(true, "正在执行规则分析…");
        try
        {
            var input = ReadInput();
            var analysis = await _client.AnalyzeCheckinAsync(input);
            _analyzedInput = JsonSerializer.Serialize(input, JsonOptions);
            Recommendation.Text = analysis.Recommendation;
            AnalysisDetails.Text = BuildDetails(analysis);
            ResultBar.Severity = analysis.Status switch
            {
                "READY" => InfoBarSeverity.Success,
                "BLOCKED" => InfoBarSeverity.Error,
                _ => InfoBarSeverity.Warning,
            };
            ResultBar.Title = $"{analysis.Status} · 可用 {analysis.UsableMinutes} 分钟";
            ResultBar.IsOpen = true;
            SaveButton.IsEnabled = true;
            FooterStatus.Text = "分析完成；请确认输入未改变后保存。";
            return true;
        }
        catch (Exception error)
        {
            ShowError(error.Message);
            return false;
        }
        finally
        {
            SetBusy(false, FooterStatus.Text);
        }
    }

    private async void Save_Click(object sender, RoutedEventArgs e) => await SaveAsync();

    private async Task<bool> SaveAsync()
    {
        SetBusy(true, "正在写入事实库…");
        try
        {
            var input = ReadInput();
            if (_analyzedInput != JsonSerializer.Serialize(input, JsonOptions))
            {
                throw new InvalidOperationException("输入在分析后发生变化，请重新分析再保存。");
            }
            var created = await _client.CreateCheckinAsync(input);
            ResultBar.Severity = InfoBarSeverity.Success;
            ResultBar.Title = "已保存";
            Recommendation.Text = $"记录 ID：{created.Id}";
            AnalysisDetails.Text = "输入、分析快照、规则版本和审计事件已写入。";
            ResultBar.IsOpen = true;
            SaveButton.IsEnabled = false;
            FooterStatus.Text = "保存成功，可关闭窗口。";
            await _onSaved();
            return true;
        }
        catch (Exception error)
        {
            ShowError(error.Message);
            return false;
        }
        finally
        {
            SetBusy(false, FooterStatus.Text);
        }
    }

    private async void RunE2EAsync(object sender, RoutedEventArgs e)
    {
        RootLayout.Loaded -= RunE2EAsync;
        try
        {
            StageGoal.Text = "交付轻量版";
            MainContradiction.Text = "原生客户端缺少可重复闭环证据";
            Bottleneck.Text = "人工输入会被桌面活动打断";
            MainAction.Text = "验证 Windows 原生表单闭环";
            Deliverable.Text = "一条可审计的原生日常决策";
            StopCondition.Text = "分析、保存和主窗口刷新均成功";
            ExplicitNotDo.Text = "不写入默认用户数据目录";
            HasAuthorization.IsChecked = true;
            HasRecoveryPlan.IsChecked = true;

            if (!await AnalyzeAsync()) throw new InvalidOperationException("原生表单自动分析失败。");
            if (!SaveButton.IsEnabled) throw new InvalidOperationException("分析成功后保存按钮未启用。");
            if (!await SaveAsync()) throw new InvalidOperationException("原生表单自动保存失败。");

            Title = "E2E SAVED - Praxis Control";
        }
        catch (Exception error)
        {
            App.LogException("checkin-e2e", error);
            Title = "E2E FAILED - Praxis Control";
            ShowError(error.Message);
        }
    }

    private static void EnsureE2EDataDirectory()
    {
        var configuredDataDirectory = Environment.GetEnvironmentVariable("PRAXIS_DATA_DIR");
        if (string.IsNullOrWhiteSpace(configuredDataDirectory))
        {
            throw new InvalidOperationException("Windows E2E automation requires an isolated data directory.");
        }

        var dataDirectory = Path.GetFullPath(configuredDataDirectory);
        var testRoot = Path.GetFullPath(Path.Combine(Path.GetTempPath(), "PraxisControlE2E"));
        var testRootPrefix = testRoot + Path.DirectorySeparatorChar;
        if (!dataDirectory.StartsWith(testRootPrefix, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Windows E2E automation is restricted to the system test directory.");
        }
    }

    private DailyInput ReadInput()
    {
        var selectedRisk = (RiskLevel.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? "low";
        var date = CheckinDate.Date ?? DateTimeOffset.Now;
        return new DailyInput(
            date.ToString("yyyy-MM-dd"),
            ToInt(AvailableMinutes.Value),
            ToInt(ReservePercent.Value),
            ToInt(Energy.Value),
            ToInt(Attention.Value),
            StageGoal.Text.Trim(),
            MainContradiction.Text.Trim(),
            Bottleneck.Text.Trim(),
            MainAction.Text.Trim(),
            Deliverable.Text.Trim(),
            ToInt(EstimatedMinutes.Value),
            StopCondition.Text.Trim(),
            ExplicitNotDo.Text.Trim(),
            ToInt(ContradictionContribution.Value),
            ToInt(BottleneckContribution.Value),
            ToInt(EvidenceStrength.Value),
            selectedRisk,
            HasAuthorization.IsChecked == true,
            LossTolerable.IsChecked == true,
            HasRecoveryPlan.IsChecked == true,
            OpensNewCoreProject.IsChecked == true,
            _activeWip);
    }

    private static int ToInt(double value) => double.IsNaN(value) ? 0 : Convert.ToInt32(value);

    private static string BuildDetails(DailyAnalysisResponse analysis)
    {
        var lines = new List<string>
        {
            $"能力 {analysis.CapacityBand} · 收益 {analysis.BenefitBand} · 可行性 {analysis.FeasibilityBand} · 风险 {analysis.RiskBand}",
        };
        if (analysis.Reasons.Count > 0) lines.Add($"依据：{string.Join('；', analysis.Reasons)}");
        if (analysis.Warnings.Count > 0) lines.Add($"警告：{string.Join('；', analysis.Warnings)}");
        if (analysis.TriggeredRules.Count > 0) lines.Add($"触发规则：{string.Join("、", analysis.TriggeredRules)}");
        lines.Add($"下次复盘触发：{analysis.NextReviewTrigger}");
        return string.Join(Environment.NewLine, lines);
    }

    private void ShowError(string message)
    {
        ResultBar.Severity = InfoBarSeverity.Error;
        ResultBar.Title = "操作未完成";
        Recommendation.Text = message;
        AnalysisDetails.Text = "请检查输入和服务状态后重试。";
        ResultBar.IsOpen = true;
        SaveButton.IsEnabled = false;
        FooterStatus.Text = "需要修正";
    }

    private void SetBusy(bool busy, string status)
    {
        FooterStatus.Text = status;
        if (busy) SaveButton.IsEnabled = false;
    }
}
