import SwiftUI
import WidgetKit

@main
struct NewsWizWidgets: WidgetBundle {
    var body: some Widget {
        ContinueReadingWidget()
        CatchUpWidget()
        ReadingLiveActivity()
        BriefingLiveActivity()
    }
}

// MARK: - Timeline shared by both widgets

struct SnapshotEntry: TimelineEntry {
    var date: Date
    var snapshot: WidgetSnapshot
    var signedIn: Bool
}

/// Shows the app's last snapshot right away, then refreshes from the server every 30 minutes.
struct SnapshotProvider: TimelineProvider {
    func placeholder(in context: Context) -> SnapshotEntry {
        SnapshotEntry(date: .now, snapshot: .placeholder, signedIn: true)
    }

    func getSnapshot(in context: Context, completion: @escaping (SnapshotEntry) -> Void) {
        let stored = WidgetSnapshot.load()
        completion(SnapshotEntry(date: .now, snapshot: stored ?? .placeholder, signedIn: stored != nil || context.isPreview))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SnapshotEntry>) -> Void) {
        Task {
            var snapshot = WidgetSnapshot.load()
            if let api = APIClient.current, let fresh = try? await api.catchUp() {
                snapshot = WidgetSnapshot(fresh)
                snapshot?.save()
            }
            let entry = SnapshotEntry(date: .now, snapshot: snapshot ?? .placeholder, signedIn: snapshot != nil)
            completion(Timeline(entries: [entry], policy: .after(.now.addingTimeInterval(30 * 60))))
        }
    }
}

// MARK: - Continue Reading

struct ContinueReadingWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "ContinueReading", provider: SnapshotProvider()) { entry in
            ContinueReadingView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Continue Reading")
        .description("Pick up the article you were partway through, right where you stopped.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular])
    }
}

struct ContinueReadingView: View {
    @Environment(\.widgetFamily) private var family
    var entry: SnapshotEntry

    var body: some View {
        if let item = entry.snapshot.inProgress.first {
            switch family {
            case .accessoryCircular:
                Gauge(value: item.progress) { Image(systemName: "book") } currentValueLabel: {
                    Text("\(Int(item.progress * 100))")
                }
                .gaugeStyle(.accessoryCircularCapacity)
                .widgetURL(DeepLink.read(id: item.id).url)
            case .accessoryRectangular:
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.title).font(.headline).lineLimit(2)
                    ProgressView(value: item.progress)
                    Text(remaining(item)).font(.caption2)
                }
                .widgetURL(DeepLink.read(id: item.id).url)
            case .systemMedium:
                VStack(alignment: .leading, spacing: 8) {
                    Text("CONTINUE READING").font(.caption2.weight(.bold)).foregroundStyle(.secondary)
                    ForEach(entry.snapshot.inProgress.prefix(2)) { item in
                        Link(destination: DeepLink.read(id: item.id).url) { row(item) }
                    }
                    Spacer(minLength: 0)
                }
            default:
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Circle().fill(Lean.color(item.lean)).frame(width: 8, height: 8)
                        Text(item.source).font(.caption2.weight(.semibold)).lineLimit(1)
                    }
                    Text(item.title).font(.footnote.weight(.semibold)).lineLimit(4)
                    Spacer(minLength: 0)
                    ProgressView(value: item.progress).tint(Lean.color(item.lean))
                    Text(remaining(item)).font(.caption2).foregroundStyle(.secondary)
                }
                .widgetURL(DeepLink.read(id: item.id).url)
            }
        } else {
            VStack(spacing: 6) {
                Image(systemName: "book.closed")
                Text(entry.signedIn ? "Nothing in progress" : "Open NewsWiz to sign in").font(.caption).multilineTextAlignment(.center)
            }
            .foregroundStyle(.secondary)
            .widgetURL(DeepLink.saved.url)
        }
    }

    private func row(_ item: WidgetSnapshot.Item) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 5) {
                Circle().fill(Lean.color(item.lean)).frame(width: 7, height: 7)
                Text(item.source).font(.caption2.weight(.semibold))
                Spacer()
                Text(remaining(item)).font(.caption2).foregroundStyle(.secondary)
            }
            Text(item.title).font(.footnote.weight(.semibold)).lineLimit(1)
            ProgressView(value: item.progress).tint(Lean.color(item.lean))
        }
    }

    private func remaining(_ item: WidgetSnapshot.Item) -> String {
        if let m = item.minutesLeft { return "\(Int(item.progress * 100))% · \(m) min left" }
        return "\(Int(item.progress * 100))% read"
    }
}

// MARK: - Catch up

struct CatchUpWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "CatchUp", provider: SnapshotProvider()) { entry in
            CatchUpWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Catch up")
        .description("How much is new this cycle, and the left/center/right balance of it.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline])
    }
}

struct CatchUpWidgetView: View {
    @Environment(\.widgetFamily) private var family
    var entry: SnapshotEntry

    var body: some View {
        let s = entry.snapshot
        switch family {
        case .accessoryInline:
            Text("\(s.newCount) new · L\(s.left) C\(s.center) R\(s.right)")
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 3) {
                Text("\(s.newCount) new stories").font(.headline)
                BalanceStrip(s: s).frame(height: 6)
                Text("since \(s.cycleSince.formatted(date: .omitted, time: .shortened))").font(.caption2)
            }
            .widgetURL(DeepLink.catchUp.url)
        default:
            VStack(alignment: .leading, spacing: 6) {
                Text("CATCH UP").font(.caption2.weight(.bold)).foregroundStyle(.secondary)
                Text("\(s.newCount)").font(.system(size: 34, weight: .bold, design: .rounded)).contentTransition(.numericText())
                Text("new from \(s.outlets) outlets since \(s.cycleSince.formatted(date: .omitted, time: .shortened))")
                    .font(.caption2).foregroundStyle(.secondary).lineLimit(2)
                BalanceStrip(s: s).frame(height: 8)
                if family == .systemMedium {
                    HStack {
                        Text("L \(s.left) · C \(s.center) · R \(s.right)").font(.caption2).foregroundStyle(.secondary)
                        Spacer()
                        Button(intent: MarkCaughtUpIntent()) {
                            Label("Caught up", systemImage: "checkmark.circle.fill").font(.caption.weight(.semibold))
                        }
                        .tint(.accentColor)
                    }
                }
            }
            .widgetURL(DeepLink.catchUp.url)
        }
    }
}

/// A tiny balance bar that works in every widget size.
struct BalanceStrip: View {
    var s: WidgetSnapshot

    var body: some View {
        GeometryReader { geo in
            let total = CGFloat(max(1, s.left + s.center + s.right + s.unrated))
            HStack(spacing: 0) {
                Lean.color("left").frame(width: geo.size.width * CGFloat(s.left) / total)
                Lean.color("center").frame(width: geo.size.width * CGFloat(s.center) / total)
                Lean.color("right").frame(width: geo.size.width * CGFloat(s.right) / total)
                Color.gray.frame(width: geo.size.width * CGFloat(s.unrated) / total)
            }
        }
        .clipShape(Capsule())
    }
}
