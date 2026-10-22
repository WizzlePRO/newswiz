import SwiftUI

/// The balanced briefing for the current news cycle.
struct CatchUpView: View {
    @Environment(AppModel.self) private var model
    @State private var longer = false
    @State private var briefingLive = LiveActivities.shared.briefingActive

    var body: some View {
        List {
            if let c = model.catchUp {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Since \(c.since.formatted(date: .abbreviated, time: .shortened)) · \(c.newArticles) new from \(c.outlets) outlets")
                            .font(.subheadline).foregroundStyle(.secondary)
                        let b = c.balance.briefing.bySide
                        BalanceBar(left: b.left, center: b.center, right: b.right, unrated: b.unrated)
                        HStack(spacing: 12) {
                            legend("Left", b.left, Lean.color("left"))
                            legend("Center", b.center, Lean.color("center"))
                            legend("Right", b.right, Lean.color("right"))
                            legend("Unrated", b.unrated, .gray)
                        }
                        .font(.caption)
                        Text("Lean ratings describe outlets, not individual articles.")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                    if LiveActivities.shared.enabled && !briefingLive {
                        Button {
                            model.startBriefingSession()
                            briefingLive = true
                        } label: {
                            Label("Track this briefing on my Lock Screen", systemImage: "rectangle.badge.checkmark")
                        }
                    }
                }

                if !c.inProgress.isEmpty {
                    Section("Continue reading") {
                        ForEach(c.inProgress) { ArticleRow(article: $0) }
                    }
                }

                Section("Your briefing · \(c.briefing.count)") {
                    ForEach(c.briefing) { ArticleRow(article: $0) }
                }

                Section {
                    if !longer && c.newArticles > c.briefing.count {
                        Button("Show a longer briefing") {
                            longer = true
                            Task { await model.refreshCatchUp(longer: true) }
                        }
                    }
                    Button {
                        Task {
                            await model.finishCycle()
                            briefingLive = false
                            longer = false
                        }
                    } label: {
                        Label("I'm caught up", systemImage: "checkmark.circle.fill").font(.headline)
                    }
                } footer: {
                    Text("Starts a fresh cycle from now. Saved and in-progress articles stay where they are.")
                }
            } else if model.loading {
                ProgressView().frame(maxWidth: .infinity)
            } else if let error = model.errorMessage {
                Text(error).foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Catch up")
        .refreshable { await model.refreshCatchUp(longer: longer) }
        .task { if model.catchUp == nil { await model.refreshCatchUp() } }
    }

    private func legend(_ label: String, _ n: Int, _ color: Color) -> some View {
        HStack(spacing: 4) {
            Circle().fill(color).frame(width: 8, height: 8)
            Text(label).foregroundStyle(.secondary)
            Text("\(n)").bold()
        }
    }
}
