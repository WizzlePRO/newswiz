import Foundation
import Observation
import WidgetKit

/// App-wide state: sign-in, the current briefing, the reading list, and navigation requests.
@MainActor
@Observable
final class AppModel {
    /// One instance for the app, also reachable from App Intents.
    static let shared = AppModel()

    var signedIn = Shared.serverURL != nil && Shared.token != nil
    var catchUp: CatchUp?
    var saved: [Article] = []
    var loading = false
    var errorMessage: String?

    /// Set by deep links, widgets, and App Intents; RootView reacts to it.
    var pendingLink: DeepLink?
    /// An article opened on the publisher's site; when the app comes back, ask how far they got.
    var awaitingManualProgress: Article?

    /// Briefing articles opened during the current Briefing Live Activity, for its "12 of 40".
    private var briefingOpened = Set<Int>()

    var api: APIClient? { APIClient.current }

    // MARK: Session

    func signIn(server: URL, passphrase: String) async throws {
        let token = try await APIClient.signIn(server: server, passphrase: passphrase)
        Shared.serverURL = server
        Shared.token = token
        signedIn = true
        await refreshAll()
    }

    func signOut() {
        Shared.token = nil
        signedIn = false
        catchUp = nil
        saved = []
        LiveActivities.shared.stopReading()
        LiveActivities.shared.endBriefing(caughtUp: false)
        WidgetCenter.shared.reloadAllTimelines()
    }

    // MARK: Loading

    func refreshAll() async {
        async let a: Void = refreshCatchUp()
        async let b: Void = refreshSaved()
        _ = await (a, b)
    }

    func refreshCatchUp(longer: Bool = false) async {
        guard let api else { return }
        loading = true
        defer { loading = false }
        do {
            catchUp = try await api.catchUp(longer: longer)
            errorMessage = nil
            writeWidgetSnapshot()
        } catch {
            handle(error)
        }
    }

    func refreshSaved() async {
        guard let api else { return }
        do {
            saved = try await api.saved().items
        } catch {
            handle(error)
        }
    }

    // MARK: Actions

    func setSaved(_ article: Article, _ saved: Bool) async {
        try? await api?.updateState(article.id, StatePatch(saved: saved))
        await refreshSaved()
        patchLocal(article.id) { $0.savedAt = saved ? .now : nil }
    }

    func setRead(_ article: Article, _ read: Bool) async {
        try? await api?.updateState(article.id, StatePatch(read: read))
        patchLocal(article.id) {
            $0.readAt = read ? .now : nil
            $0.progress = read ? 1 : 0
        }
        if read { noteBriefingProgress(article) }
        writeWidgetSnapshot()
    }

    /// Record an open (reader view or publisher site).
    func opened(_ article: Article) {
        Task { try? await api?.updateState(article.id, StatePatch(opened: true)) }
        patchLocal(article.id) { $0.openedAt = $0.openedAt ?? .now }
        noteBriefingProgress(article)
    }

    /// For publisher-site articles: "about halfway", "finished", ...
    func setManualProgress(_ article: Article, _ progress: Double) async {
        let patch = progress >= 1 ? StatePatch(read: true) : StatePatch(progress: progress, progressSource: "manual")
        try? await api?.updateState(article.id, patch)
        await refreshAll()
    }

    /// After leaving the reader: keep "Continue reading" and its widget current without a reload.
    func recordReading(_ article: Article, progress: Double, finished: Bool, wordCount: Int?) {
        guard var c = catchUp else { return }
        var updated = article
        updated.progress = finished ? 1 : progress
        updated.readAt = finished ? (article.readAt ?? .now) : nil
        updated.wordCount = wordCount ?? article.wordCount
        c.inProgress.removeAll { $0.id == article.id }
        if !finished && progress > 0 { c.inProgress.insert(updated, at: 0) }
        for i in c.briefing.indices where c.briefing[i].id == article.id { c.briefing[i] = updated }
        catchUp = c
        writeWidgetSnapshot()
    }

    func finishCycle() async {
        try? await api?.finishCycle()
        LiveActivities.shared.endBriefing(caughtUp: true)
        briefingOpened = []
        await refreshCatchUp()
    }

    // MARK: Briefing Live Activity

    func startBriefingSession() {
        guard let c = catchUp else { return }
        briefingOpened = []
        LiveActivities.shared.startBriefing(total: c.briefing.count, since: c.since)
    }

    private func noteBriefingProgress(_ article: Article) {
        guard LiveActivities.shared.briefingActive, let c = catchUp,
              c.briefing.contains(where: { $0.id == article.id }) else { return }
        briefingOpened.insert(article.id)
        let opened = c.briefing.filter { briefingOpened.contains($0.id) }
        let side = { (lean: String) -> String in
            switch lean {
            case "left", "lean_left": return "left"
            case "right", "lean_right": return "right"
            case "center": return "center"
            default: return "unrated"
            }
        }
        LiveActivities.shared.updateBriefing(
            done: opened.count,
            left: opened.filter { side($0.biasLean) == "left" }.count,
            center: opened.filter { side($0.biasLean) == "center" }.count,
            right: opened.filter { side($0.biasLean) == "right" }.count
        )
    }

    // MARK: Helpers

    private func patchLocal(_ id: Int, _ change: (inout Article) -> Void) {
        guard var c = catchUp else { return }
        for i in c.briefing.indices where c.briefing[i].id == id { change(&c.briefing[i]) }
        for i in c.inProgress.indices where c.inProgress[i].id == id { change(&c.inProgress[i]) }
        catchUp = c
    }

    private func handle(_ error: Error) {
        if case APIError.unauthorized = error { signOut() }
        errorMessage = error.localizedDescription
    }

    /// Give the widgets something to show even when they can't reach the server.
    func writeWidgetSnapshot() {
        guard let c = catchUp else { return }
        WidgetSnapshot(c).save()
        WidgetCenter.shared.reloadAllTimelines()
    }
}
