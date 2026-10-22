import SwiftUI

/// Everything, newest first, with quick filters.
struct LatestView: View {
    @Environment(AppModel.self) private var model
    @State private var articles: [Article] = []
    @State private var nextBefore: String?
    @State private var freeOnly = false
    @State private var unreadOnly = false
    @State private var lean: String?
    @State private var loading = false

    private let leans = ["left", "lean_left", "center", "lean_right", "right"]

    var body: some View {
        List {
            ForEach(articles) { article in
                ArticleRow(article: article)
                    .onAppear { if article.id == articles.last?.id { Task { await load(more: true) } } }
            }
            if loading { ProgressView().frame(maxWidth: .infinity) }
        }
        .navigationTitle("Latest")
        .toolbar {
            Menu {
                Toggle("Free only", isOn: $freeOnly)
                Toggle("Unread only", isOn: $unreadOnly)
                Picker("Outlet lean", selection: $lean) {
                    Text("Any lean").tag(String?.none)
                    ForEach(leans, id: \.self) { Text(Lean.label($0)).tag(Optional($0)) }
                }
            } label: {
                Label("Filters", systemImage: freeOnly || unreadOnly || lean != nil
                      ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
            }
        }
        .refreshable { await load(more: false) }
        .task(id: "\(freeOnly)\(unreadOnly)\(lean ?? "")") { await load(more: false) }
    }

    private func load(more: Bool) async {
        guard let api = model.api, !loading, !more || nextBefore != nil else { return }
        loading = true
        defer { loading = false }
        do {
            let page = try await api.latest(freeOnly: freeOnly, unreadOnly: unreadOnly, lean: lean, before: more ? nextBefore : nil)
            articles = more ? articles + page.articles : page.articles
            nextBefore = page.articles.count < 50 ? nil : page.nextBefore
        } catch {
            model.errorMessage = error.localizedDescription
        }
    }
}
