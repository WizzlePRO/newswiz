import ActivityKit
import SwiftUI
import UIKit
import WidgetKit

// MARK: - Reading now

/// Lock Screen and Dynamic Island while you're reading: title, outlet, lean, progress, minutes left.
/// Tapping it reopens the article at the paragraph you were on.
struct ReadingLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: ReadingActivityAttributes.self) { context in
            ReadingLockScreen(context: context)
                .activityBackgroundTint(Color(.systemBackground).opacity(0.85))
                .widgetURL(DeepLink.read(id: context.attributes.articleId).url)
        } dynamicIsland: { context in
            let tint = Lean.color(context.attributes.lean)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label(context.attributes.source, systemImage: "book.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(tint)
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.state.finished ? "Done" : "\(Int(context.state.progress * 100))%")
                        .font(.caption.weight(.bold).monospacedDigit())
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.attributes.title).font(.footnote.weight(.semibold)).lineLimit(2)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 4) {
                        ProgressView(value: context.state.progress).tint(tint)
                        Text(context.state.finished ? "Finished" : "\(context.state.minutesLeft) min left · tap to continue")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            } compactLeading: {
                Image(systemName: "book.fill").foregroundStyle(tint)
            } compactTrailing: {
                Text(context.state.finished ? "✓" : "\(Int(context.state.progress * 100))%")
                    .font(.caption2.weight(.bold).monospacedDigit())
            } minimal: {
                ProgressView(value: context.state.progress)
                    .progressViewStyle(.circular)
                    .tint(tint)
            }
            .widgetURL(DeepLink.read(id: context.attributes.articleId).url)
            .keylineTint(tint)
        }
    }
}

private struct ReadingLockScreen: View {
    var context: ActivityViewContext<ReadingActivityAttributes>

    var body: some View {
        let tint = Lean.color(context.attributes.lean)
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Label(context.attributes.source, systemImage: "book.fill").font(.caption.weight(.semibold)).foregroundStyle(tint)
                Spacer()
                Text(Lean.label(context.attributes.lean)).font(.caption2).foregroundStyle(.secondary)
            }
            Text(context.attributes.title).font(.headline).lineLimit(2)
            ProgressView(value: context.state.progress).tint(tint)
            HStack {
                Text(context.state.finished ? "Finished ✓" : "\(Int(context.state.progress * 100))% read")
                Spacer()
                if !context.state.finished { Text("\(context.state.minutesLeft) min left · tap to continue") }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding()
        .opacity(context.isStale ? 0.6 : 1)
    }
}

// MARK: - Briefing session

/// "12 of 40" through today's Catch up, with how many left/center/right stories you've opened.
struct BriefingLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: BriefingActivityAttributes.self) { context in
            BriefingLockScreen(context: context)
                .activityBackgroundTint(Color(.systemBackground).opacity(0.85))
                .widgetURL(DeepLink.catchUp.url)
        } dynamicIsland: { context in
            let fraction = Double(context.state.done) / Double(max(1, context.attributes.total))
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label("Catch up", systemImage: "newspaper.fill").font(.caption.weight(.semibold))
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("\(context.state.done)/\(context.attributes.total)").font(.caption.weight(.bold).monospacedDigit())
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 6) {
                        ProgressView(value: fraction)
                        SidesRow(state: context.state)
                    }
                }
            } compactLeading: {
                Image(systemName: "newspaper.fill")
            } compactTrailing: {
                Text(context.state.caughtUp ? "✓" : "\(context.state.done)/\(context.attributes.total)")
                    .font(.caption2.weight(.bold).monospacedDigit())
            } minimal: {
                ProgressView(value: fraction).progressViewStyle(.circular)
            }
            .widgetURL(DeepLink.catchUp.url)
        }
    }
}

private struct BriefingLockScreen: View {
    var context: ActivityViewContext<BriefingActivityAttributes>

    var body: some View {
        let fraction = Double(context.state.done) / Double(max(1, context.attributes.total))
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Label("Catch up", systemImage: "newspaper.fill").font(.caption.weight(.semibold))
                Spacer()
                Text(context.state.caughtUp ? "Caught up ✓" : "\(context.state.done) of \(context.attributes.total)")
                    .font(.caption.weight(.bold).monospacedDigit())
            }
            ProgressView(value: context.state.caughtUp ? 1 : fraction)
            SidesRow(state: context.state)
        }
        .padding()
    }
}

/// How many left / center / right stories you've opened so far.
private struct SidesRow: View {
    var state: BriefingActivityAttributes.ContentState

    var body: some View {
        HStack(spacing: 12) {
            dot("Left", state.left, Lean.color("left"))
            dot("Center", state.center, Lean.color("center"))
            dot("Right", state.right, Lean.color("right"))
            Spacer()
        }
        .font(.caption2)
    }

    private func dot(_ label: String, _ n: Int, _ color: Color) -> some View {
        HStack(spacing: 4) {
            Circle().fill(color).frame(width: 7, height: 7)
            Text("\(label) \(n)")
        }
    }
}
