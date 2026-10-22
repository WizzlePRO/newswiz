import SwiftUI
import UIKit

/// Reader view for one article: saved position, resume, Live Activity, and Handoff to the web app.
struct ReaderScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL
    @Environment(\.dismiss) private var dismiss
    var articleId: Int

    @State private var detail: ArticleDetail?
    @State private var error: String?
    @State private var progress = 0.0
    @State private var block = 0
    @State private var finished = false
    @State private var saved = false
    @State private var showResumeBanner = false
    @State private var pendingSave: Task<Void, Never>?
    @State private var webKey = UUID()

    private let finishedAt = 0.97

    var body: some View {
        Group {
            if let detail, let html = detail.content?.html {
                ReaderWebView(
                    html: header(detail.article) + html + footer(detail.article),
                    baseURL: detail.article.link,
                    resumeBlock: finished ? nil : detail.article.progressBlock,
                    onProgress: { p, b in track(progress: p, block: b) },
                    onOpenLink: { openURL($0) }
                )
                .id(webKey)
                .ignoresSafeArea(edges: .bottom)
                .overlay(alignment: .bottom) { progressPill(detail.article) }
                .overlay(alignment: .top) {
                    if showResumeBanner { resumeBanner }
                }
            } else if let detail {
                unavailable(detail)
            } else if let error {
                ContentUnavailableView("Couldn't load", systemImage: "wifi.exclamationmark", description: Text(error))
            } else {
                ProgressView()
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { toolbar }
        .task { await load() }
        .onDisappear {
            saveNow()
            if let d = detail, d.content?.status == "ok" {
                model.recordReading(d.article, progress: progress, finished: finished, wordCount: d.content?.wordCount)
            }
        }
        .userActivity("com.wizzlepro.newswiz.reading", isActive: detail != nil) { activity in
            // Handoff: pick the article up in Safari on a Mac or iPad, at the same server.
            activity.title = detail?.article.title
            if let server = Shared.serverURL { activity.webpageURL = server.appendingPathComponent("read/\(articleId)") }
        }
    }

    // MARK: Loading

    private func load() async {
        guard detail == nil, let api = model.api else { return }
        do {
            let d = try await api.article(articleId)
            detail = d
            saved = d.article.isSaved
            finished = d.article.isRead
            progress = d.article.progress
            block = d.article.progressBlock ?? 0
            model.opened(d.article)
            if d.content?.status == "ok" {
                showResumeBanner = !finished && (d.article.progressBlock ?? 0) > 0
                LiveActivities.shared.startReading(d.article, progress: progress, minutesLeft: minutesLeft(d))
            } else if d.content == nil, let link = d.article.link {
                // Not a reader-view outlet after all (e.g. its access changed): send to the publisher.
                model.awaitingManualProgress = d.article
                openURL(link)
                dismiss()
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    // MARK: Progress

    private func track(progress p: Double, block b: Int) {
        guard let detail else { return }
        // Only move forward from scrolling, like the web reader: scrolling up to re-read keeps your place.
        if p > progress || finished { progress = p; block = b }
        if !finished && p >= finishedAt {
            finished = true
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            LiveActivities.shared.finishReading()
        } else if !finished {
            LiveActivities.shared.updateReading(progress: progress, minutesLeft: minutesLeft(detail))
        }
        pendingSave?.cancel()
        pendingSave = Task {
            try? await Task.sleep(for: .seconds(1.5))
            guard !Task.isCancelled else { return }
            saveNow()
        }
    }

    private func saveNow() {
        guard detail != nil, progress > 0 else { return }
        let patch = StatePatch(progress: progress, block: block, progressSource: "reader")
        let id = articleId
        Task { try? await model.api?.updateState(id, patch) }
    }

    private func minutesLeft(_ d: ArticleDetail) -> Int {
        max(1, Int((Double(d.content?.wordCount ?? 0) * (1 - progress) / 230).rounded()))
    }

    // MARK: Pieces

    private func progressPill(_ article: Article) -> some View {
        Group {
            if finished {
                Label("Finished", systemImage: "checkmark.circle.fill")
            } else if let detail {
                Text("\(Int(progress * 100))% · \(minutesLeft(detail)) min left")
            }
        }
        .font(.footnote.weight(.semibold).monospacedDigit())
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(.regularMaterial, in: Capsule())
        .padding(.bottom, 12)
    }

    private var resumeBanner: some View {
        HStack {
            Text("Picked up where you left off (\(Int(progress * 100))%)").font(.footnote)
            Spacer()
            Button("Start over") {
                showResumeBanner = false
                progress = 0
                block = 0
                Task { try? await model.api?.updateState(articleId, StatePatch(read: false)) }
                if var d = detail {
                    d.article.progressBlock = nil
                    detail = d
                    webKey = UUID() // reload from the top
                }
            }
            .font(.footnote.weight(.semibold))
        }
        .padding(10)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal)
        .task {
            try? await Task.sleep(for: .seconds(6))
            showResumeBanner = false
        }
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItemGroup(placement: .topBarTrailing) {
            if let article = detail?.article {
                Button {
                    saved.toggle()
                    Task { await model.setSaved(article, saved) }
                } label: {
                    Image(systemName: saved ? "bookmark.fill" : "bookmark")
                }
                .accessibilityLabel(saved ? "Unsave" : "Save for later")
                if let link = article.link {
                    ShareLink(item: link)
                    Button { openURL(link) } label: { Image(systemName: "safari") }
                        .accessibilityLabel("Open on \(article.sourceName)")
                }
            }
        }
    }

    private func unavailable(_ d: ArticleDetail) -> some View {
        let reason: String
        switch d.content?.status {
        case "marked_paid": reason = "The publisher marks this article as subscriber-only, so it isn't shown here."
        case "too_short": reason = "Only a short teaser is available here. It may be a video or live page."
        case "blocked": reason = "This publisher doesn't allow automated readers to fetch its pages."
        default: reason = "A readable version isn't available right now."
        }
        return ContentUnavailableView {
            Label(d.article.title, systemImage: "doc.text")
        } description: {
            Text(reason)
        } actions: {
            if let link = d.article.link {
                Button("Open on \(d.article.sourceName)") {
                    model.awaitingManualProgress = d.article
                    openURL(link)
                }
                .buttonStyle(.borderedProminent)
            }
        }
    }

    private func header(_ a: Article) -> String {
        let byline = [a.author, a.sourceName, a.sortAt.formatted(date: .abbreviated, time: .shortened)]
            .compactMap { $0 }.map(escape).joined(separator: " · ")
        return """
        <header style="margin:8px 0 20px">
          <div style="font:-apple-system-caption1;font-family:-apple-system,system-ui;color:var(--muted)">\(escape(Lean.label(a.biasLean))) outlet · \(escape(a.accessModel == "free" ? "Free" : a.accessModel))</div>
          <h1 style="font-size:1.6em;line-height:1.15;margin:8px 0">\(escape(a.title))</h1>
          <div style="font:-apple-system-footnote;font-family:-apple-system,system-ui;color:var(--muted)">\(byline)</div>
        </header>
        """
    }

    private func footer(_ a: Article) -> String {
        var html = "<hr style=\"border:0;border-top:1px solid var(--rule);margin:32px 0 16px\">"
        if let link = a.link {
            html += "<p style=\"font-family:-apple-system,system-ui\"><a href=\"\(escape(link.absoluteString))\">Read on \(escape(a.sourceName)) ↗</a></p>"
        }
        if let donate = a.donateLink {
            html += "<p style=\"font-family:-apple-system,system-ui;color:var(--muted)\">\(escape(a.sourceName)) is free to read because readers support it. <a href=\"\(escape(donate.absoluteString))\">Support their journalism ↗</a></p>"
        }
        return html
    }

    private func escape(_ s: String) -> String {
        s.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;").replacingOccurrences(of: "\"", with: "&quot;")
    }
}
