import Foundation
import SwiftUI

/// Values shared by the app and its widget extension (they talk through the App Group).
enum Shared {
    /// Must match the App Group capability on both targets (see ios/README.md).
    static let appGroup = "group.com.wizzlepro.newswiz"

    static var defaults: UserDefaults { UserDefaults(suiteName: appGroup) ?? .standard }

    enum Key {
        static let serverURL = "serverURL"
        static let token = "token"
        static let snapshot = "widgetSnapshot"
    }

    static var serverURL: URL? {
        get { defaults.string(forKey: Key.serverURL).flatMap(URL.init(string:)) }
        set { defaults.set(newValue?.absoluteString, forKey: Key.serverURL) }
    }

    static var token: String? {
        get { defaults.string(forKey: Key.token) }
        set { defaults.set(newValue, forKey: Key.token) }
    }
}

// MARK: - Deep links

/// newswiz://read/123, newswiz://catchup, newswiz://saved
enum DeepLink: Equatable {
    case read(id: Int)
    case catchUp
    case saved

    var url: URL {
        switch self {
        case .read(let id): return URL(string: "newswiz://read/\(id)")!
        case .catchUp: return URL(string: "newswiz://catchup")!
        case .saved: return URL(string: "newswiz://saved")!
        }
    }

    init?(url: URL) {
        guard url.scheme == "newswiz" else { return nil }
        switch url.host {
        case "read":
            guard let id = Int(url.lastPathComponent) else { return nil }
            self = .read(id: id)
        case "catchup": self = .catchUp
        case "saved": self = .saved
        default: return nil
        }
    }
}

// MARK: - Widget snapshot

/// What the app last knew, written for the widgets so they render instantly and offline.
struct WidgetSnapshot: Codable {
    struct Item: Codable, Hashable, Identifiable {
        var id: Int
        var title: String
        var source: String
        var lean: String
        var progress: Double
        var minutesLeft: Int?
    }

    var updatedAt: Date
    var cycleSince: Date
    var newCount: Int
    var outlets: Int
    var left: Int
    var center: Int
    var right: Int
    var unrated: Int
    var inProgress: [Item]

    static let placeholder = WidgetSnapshot(
        updatedAt: .now, cycleSince: .now.addingTimeInterval(-6 * 3600), newCount: 412, outlets: 48,
        left: 12, center: 11, right: 11, unrated: 6,
        inProgress: [Item(id: 0, title: "How Maine voters feel about the high-stakes Senate election", source: "PBS NewsHour", lean: "lean_left", progress: 0.45, minutesLeft: 4)]
    )

    static func load() -> WidgetSnapshot? {
        guard let data = Shared.defaults.data(forKey: Shared.Key.snapshot) else { return nil }
        return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
    }

    func save() {
        if let data = try? JSONEncoder().encode(self) { Shared.defaults.set(data, forKey: Shared.Key.snapshot) }
    }
}

// MARK: - Lean colors (match the web app)

enum Lean {
    static func color(_ lean: String) -> Color {
        switch lean {
        case "left": return Color(red: 0.12, green: 0.37, blue: 0.75)
        case "lean_left": return Color(red: 0.36, green: 0.56, blue: 0.85)
        case "center": return Color(red: 0.48, green: 0.42, blue: 0.59)
        case "lean_right": return Color(red: 0.85, green: 0.44, blue: 0.42)
        case "right": return Color(red: 0.72, green: 0.20, blue: 0.17)
        default: return Color.gray
        }
    }

    static func label(_ lean: String) -> String {
        switch lean {
        case "left": return "Left"
        case "lean_left": return "Lean left"
        case "center": return "Center"
        case "lean_right": return "Lean right"
        case "right": return "Right"
        case "mixed": return "Mixed"
        default: return "Unrated"
        }
    }

    /// Position on the five-step scale, or nil for unrated/mixed.
    static func step(_ lean: String) -> Int? {
        ["left", "lean_left", "center", "lean_right", "right"].firstIndex(of: lean)
    }
}
