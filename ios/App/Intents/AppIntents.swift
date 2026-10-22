import AppIntents
import Foundation

/// "Continue reading in NewsWiz": opens the article you were last partway through.
struct ContinueReadingIntent: AppIntent {
    static var title: LocalizedStringResource = "Continue reading"
    static var description = IntentDescription("Open the article you were last partway through.")
    static var openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        if let id = WidgetSnapshot.load()?.inProgress.first?.id {
            AppModel.shared.pendingLink = .read(id: id)
        } else {
            AppModel.shared.pendingLink = .saved
        }
        return .result()
    }
}

/// "Catch me up with NewsWiz": opens the balanced briefing.
struct OpenCatchUpIntent: AppIntent {
    static var title: LocalizedStringResource = "Catch me up"
    static var description = IntentDescription("Open your balanced news briefing.")
    static var openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        AppModel.shared.pendingLink = .catchUp
        return .result()
    }
}

struct NewsWizShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: ContinueReadingIntent(),
            phrases: ["Continue reading in \(.applicationName)", "Resume my article in \(.applicationName)"],
            shortTitle: "Continue reading",
            systemImageName: "book"
        )
        AppShortcut(
            intent: OpenCatchUpIntent(),
            phrases: ["Catch me up with \(.applicationName)", "What's the news in \(.applicationName)"],
            shortTitle: "Catch up",
            systemImageName: "newspaper"
        )
        AppShortcut(
            intent: MarkCaughtUpIntent(),
            phrases: ["I'm caught up in \(.applicationName)"],
            shortTitle: "Mark caught up",
            systemImageName: "checkmark.circle"
        )
    }
}
