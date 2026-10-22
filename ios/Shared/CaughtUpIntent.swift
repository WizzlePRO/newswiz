import AppIntents
import Foundation
import WidgetKit

/// "I'm caught up": starts a new news cycle. Runs from the Catch-up widget's button without opening the app.
struct MarkCaughtUpIntent: AppIntent {
    static var title: LocalizedStringResource = "Mark caught up"
    static var description = IntentDescription("Start a fresh news cycle in NewsWiz.")

    func perform() async throws -> some IntentResult {
        guard let server = Shared.serverURL else { return .result() }
        var request = URLRequest(url: server.appendingPathComponent("api/cycle"))
        request.httpMethod = "POST"
        if let token = Shared.token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        _ = try? await URLSession.shared.data(for: request)

        if var snapshot = WidgetSnapshot.load() {
            snapshot.newCount = 0
            snapshot.left = 0; snapshot.center = 0; snapshot.right = 0; snapshot.unrated = 0
            snapshot.cycleSince = .now
            snapshot.updatedAt = .now
            snapshot.save()
        }
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}
