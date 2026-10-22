import ActivityKit
import Foundation

/// Live Activity while reading an article: Lock Screen + Dynamic Island show how far you are.
struct ReadingActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var progress: Double
        var minutesLeft: Int
        var finished: Bool
    }

    var articleId: Int
    var title: String
    var source: String
    var lean: String
}

/// Live Activity for working through a Catch-up briefing: "12 of 40" plus the balance so far.
struct BriefingActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var done: Int
        var left: Int
        var center: Int
        var right: Int
        var caughtUp: Bool
    }

    var total: Int
    var since: Date
}
