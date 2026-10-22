import Foundation

/// An article as the server returns it (see README "API for the mobile apps").
struct Article: Codable, Identifiable, Hashable {
    var id: Int
    /// Kept as strings: one malformed publisher URL shouldn't fail a whole response.
    var url: String
    var title: String
    var summary: String?
    var author: String?
    var imageUrl: String?
    var section: String?
    var sortAt: Date
    var sourceSlug: String
    var sourceName: String
    var ownershipType: String
    var accessModel: String
    var meteredLimit: Int?
    var meteredPeriod: String?
    var donateUrl: String?
    var country: String
    var biasLean: String
    var biasRater: String?
    var biasOverridden: Bool
    var openedAt: Date?
    var savedAt: Date?
    var readAt: Date?
    var progress: Double
    /// Present on saved / in-progress items.
    var progressBlock: Int?
    var wordCount: Int?
    /// True when the article opens in the in-app reader (free outlet that allows it).
    var readerView: Bool

    var link: URL? { URL(string: url) }
    var image: URL? { imageUrl.flatMap(URL.init(string:)) }
    var donateLink: URL? { donateUrl.flatMap(URL.init(string:)) }

    var isRead: Bool { readAt != nil }
    var isSaved: Bool { savedAt != nil }
    var isInProgress: Bool { !isRead && progress > 0 }

    func minutesLeft(wordsPerMinute: Double = 230) -> Int? {
        guard let words = wordCount else { return nil }
        return max(1, Int((Double(words) * (1 - progress) / wordsPerMinute).rounded()))
    }
}

struct BalanceSummary: Codable, Hashable {
    struct Sides: Codable, Hashable {
        var left: Int
        var center: Int
        var right: Int
        var unrated: Int
    }

    var articles: Int
    var outlets: Int
    var bySide: Sides
    var byOwnership: [String: Int]
    var international: Int
}

struct CatchUp: Codable {
    struct Balance: Codable {
        var briefing: BalanceSummary
        var allNew: BalanceSummary
    }

    var since: Date
    var newArticles: Int
    var outlets: Int
    var briefing: [Article]
    var inProgress: [Article]
    var balance: Balance
}

struct ArticlePage: Codable {
    var articles: [Article]
    var nextBefore: String?
}

struct SavedList: Codable {
    var items: [Article]
}

struct ArticleDetail: Codable {
    struct Content: Codable {
        /// ok | not_free | marked_paid | too_short | blocked | failed
        var status: String
        var html: String?
        var wordCount: Int?
        var blockCount: Int?
    }

    var article: Article
    var content: Content?
}

struct ReadingState: Codable {
    var articleId: Int
    var openedAt: Date?
    var savedAt: Date?
    var readAt: Date?
    var progress: Double
    var progressBlock: Int?
}

/// Body for POST /api/articles/:id/state. Nil fields are left out.
struct StatePatch: Encodable {
    var opened: Bool?
    var saved: Bool?
    var read: Bool?
    var progress: Double?
    var block: Int?
    var progressSource: String?
}

extension WidgetSnapshot {
    /// Built the same way by the app (after loading) and by the widgets (when they refresh themselves).
    init(_ c: CatchUp) {
        let sides = c.balance.allNew.bySide
        self.init(
            updatedAt: .now, cycleSince: c.since, newCount: c.newArticles, outlets: c.outlets,
            left: sides.left, center: sides.center, right: sides.right, unrated: sides.unrated,
            inProgress: c.inProgress.prefix(3).map {
                Item(id: $0.id, title: $0.title, source: $0.sourceName, lean: $0.biasLean, progress: $0.progress, minutesLeft: $0.minutesLeft())
            }
        )
    }
}
