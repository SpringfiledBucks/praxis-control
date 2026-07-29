using Microsoft.UI.Xaml;

namespace PraxisControl.Windows;

public partial class App : Application
{
    private Window? _window;

    public App()
    {
        InitializeComponent();
        UnhandledException += (_, args) => LogException("unhandled", args.Exception);
    }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        try
        {
            _window = new MainWindow();
            _window.Activate();
        }
        catch (Exception error)
        {
            LogException("startup", error);
            throw;
        }
    }

    internal static void LogException(string phase, Exception error)
    {
        try
        {
            var configuredDataDirectory = Environment.GetEnvironmentVariable("PRAXIS_DATA_DIR");
            var dataDirectory = string.IsNullOrWhiteSpace(configuredDataDirectory)
                ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PraxisControl")
                : Path.GetFullPath(configuredDataDirectory);
            var logDirectory = Path.Combine(dataDirectory, "logs");
            Directory.CreateDirectory(logDirectory);
            var entry = $"[{DateTimeOffset.Now:O}] {phase}{Environment.NewLine}{error}{Environment.NewLine}{Environment.NewLine}";
            File.AppendAllText(Path.Combine(logDirectory, "windows-client.log"), entry);
        }
        catch
        {
            // Logging must never replace the original failure.
        }
    }
}
