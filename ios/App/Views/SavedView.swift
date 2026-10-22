import SwiftUI

/// The reading list: in progress first, then not started, then finished.
struct SavedView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let started = model.saved.filter(\.isInProgress)
        let unstarted = model.saved.filter { !$0.isRead && $0.progress == 0 }
        let finished = model.saved.filter(\.isRead)
        List {
            if model.saved.isEmpty {
                ContentUnavailableView("Nothing saved yet", systemImage: "bookmark",
                                       description: Text("Swipe right on any article to save it for later."))
            }
            section("In progress", started)
            section("Not started", unstarted)
            section("Finished", finished)
        }
        .navigationTitle("Saved")
        .refreshable { await model.refreshSaved() }
        .task { await model.refreshSaved() }
    }

    @ViewBuilder
    private func section(_ title: String, _ items: [Article]) -> some View {
        if !items.isEmpty {
            Section("\(title) · \(items.count)") {
                ForEach(items) { article in
                    VStack(alignment: .leading, spacing: 4) {
                        ArticleRow(article: article)
                        if let minutes = article.minutesLeft(), !article.isRead {
                            Text("\(minutes) min left").font(.caption).foregroundStyle(.secondary)
                        }
                        if !article.readerView && !article.isRead {
                            Menu("Where I stopped: \(Int(article.progress * 100))%") {
                                ForEach([0.25, 0.5, 0.75, 1.0], id: \.self) { p in
                                    Button(p == 1 ? "Finished" : "About \(Int(p * 100))%") {
                                        Task { await model.setManualProgress(article, p) }
                                    }
                                }
                            }
                            .font(.caption)
                        }
                    }
                }
            }
        }
    }
}
