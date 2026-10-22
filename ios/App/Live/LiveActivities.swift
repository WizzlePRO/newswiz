import ActivityKit
import Foundation

/// Starts, updates, and ends NewsWiz's two Live Activities. All calls are safe to make even
/// when Live Activities are turned off (they just do nothing).
@MainActor
final class LiveActivities {
    static let shared = LiveActivities()

    private var reading: Activity<ReadingActivityAttributes>?
    private var briefing: Activity<BriefingActivityAttributes>?
    private var lastReadingUpdate = Date.distantPast
    private var lastReadingProgress = -1.0

    var enabled: Bool { ActivityAuthorizationInfo().areActivitiesEnabled }

    private init() {
        // Reattach to activities that survived an app relaunch.
        reading = Activity<ReadingActivityAttributes>.activities.first
        briefing = Activity<BriefingActivityAttributes>.activities.first
    }

    // MARK: Reading

    /// Show "reading now" for this article on the Lock Screen and Dynamic Island.
    func startReading(_ article: Article, progress: Double, minutesLeft: Int) {
        guard enabled else { return }
        if let current = reading, current.attributes.articleId == article.id {
            updateReading(progress: progress, minutesLeft: minutesLeft, force: true)
            return
        }
        // One article at a time: end the previous one quietly.
        let previous = Activity<ReadingActivityAttributes>.activities
        Task { for activity in previous { await activity.end(nil, dismissalPolicy: .immediate) } }

        let attributes = ReadingActivityAttributes(articleId: article.id, title: article.title, source: article.sourceName, lean: article.biasLean)
        let state = ReadingActivityAttributes.ContentState(progress: progress, minutesLeft: minutesLeft, finished: false)
        do {
            reading = try Activity.request(attributes: attributes, content: .init(state: state, staleDate: staleDate()))
            lastReadingProgress = progress
            lastReadingUpdate = .now
        } catch {
            reading = nil
        }
    }

    /// Throttled: at most every 5 seconds or 2% of progress, unless forced.
    func updateReading(progress: Double, minutesLeft: Int, force: Bool = false) {
        guard let activity = reading else { return }
        let due = force || abs(progress - lastReadingProgress) >= 0.02 || Date.now.timeIntervalSince(lastReadingUpdate) >= 5
        guard due else { return }
        lastReadingProgress = progress
        lastReadingUpdate = .now
        let state = ReadingActivityAttributes.ContentState(progress: progress, minutesLeft: minutesLeft, finished: false)
        Task { await activity.update(.init(state: state, staleDate: staleDate())) }
    }

    /// Finished: show the checkmark briefly, then clear it.
    func finishReading() {
        guard let activity = reading else { return }
        reading = nil
        let state = ReadingActivityAttributes.ContentState(progress: 1, minutesLeft: 0, finished: true)
        Task { await activity.end(.init(state: state, staleDate: nil), dismissalPolicy: .after(.now.addingTimeInterval(120))) }
    }

    func stopReading() {
        guard let activity = reading else { return }
        reading = nil
        Task { await activity.end(nil, dismissalPolicy: .immediate) }
    }

    // MARK: Briefing

    var briefingActive: Bool { briefing != nil }

    func startBriefing(total: Int, since: Date) {
        guard enabled, briefing == nil else { return }
        let attributes = BriefingActivityAttributes(total: total, since: since)
        let state = BriefingActivityAttributes.ContentState(done: 0, left: 0, center: 0, right: 0, caughtUp: false)
        briefing = try? Activity.request(attributes: attributes, content: .init(state: state, staleDate: staleDate()))
    }

    func updateBriefing(done: Int, left: Int, center: Int, right: Int) {
        guard let activity = briefing else { return }
        let state = BriefingActivityAttributes.ContentState(done: done, left: left, center: center, right: right, caughtUp: false)
        Task { await activity.update(.init(state: state, staleDate: staleDate())) }
    }

    func endBriefing(caughtUp: Bool) {
        guard let activity = briefing else { return }
        briefing = nil
        var state = activity.content.state
        state.caughtUp = caughtUp
        Task { await activity.end(.init(state: state, staleDate: nil), dismissalPolicy: caughtUp ? .after(.now.addingTimeInterval(300)) : .immediate) }
    }

    /// Live Activities last up to 8 hours; mark them stale a little before that.
    private func staleDate() -> Date { .now.addingTimeInterval(7 * 3600) }
}
