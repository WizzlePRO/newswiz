import SwiftUI

/// One article in any list. Tapping opens the in-app reader for free outlets, or the publisher in Safari.
struct ArticleRow: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL
    var article: Article

    var body: some View {
        Group {
            if article.readerView {
                NavigationLink(value: article.id) { content }
            } else {
                Button {
                    guard let link = article.link else { return }
                    model.opened(article)
                    model.awaitingManualProgress = article
                    openURL(link)
                } label: { content }
                .buttonStyle(.plain)
            }
        }
        .swipeActions(edge: .leading) {
            Button {
                Task { await model.setSaved(article, !article.isSaved) }
            } label: {
                Label(article.isSaved ? "Unsave" : "Save", systemImage: article.isSaved ? "bookmark.slash" : "bookmark")
            }
            .tint(.blue)
        }
        .swipeActions(edge: .trailing) {
            Button {
                Task { await model.setRead(article, !article.isRead) }
            } label: {
                Label(article.isRead ? "Unread" : "Read", systemImage: article.isRead ? "circle" : "checkmark.circle")
            }
            .tint(.green)
        }
    }

    private var content: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 6) {
                    Text(article.sourceName).font(.caption.weight(.bold))
                    LeanChip(lean: article.biasLean, overridden: article.biasOverridden)
                    AccessBadge(access: article.accessModel)
                    Spacer(minLength: 0)
                }
                Text(article.title)
                    .font(.headline)
                    .foregroundStyle(article.isRead ? .secondary : .primary)
                    .multilineTextAlignment(.leading)
                if let summary = article.summary {
                    Text(summary).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
                }
                HStack(spacing: 8) {
                    Text(article.sortAt.shortAgo)
                    if article.isSaved { Image(systemName: "bookmark.fill").foregroundStyle(.blue) }
                    if article.isInProgress {
                        ProgressView(value: article.progress).frame(maxWidth: 80)
                        Text("\(Int(article.progress * 100))%")
                    } else if article.isRead {
                        Label("Read", systemImage: "checkmark")
                    }
                    if !article.readerView { Label(article.sourceName, systemImage: "safari").labelStyle(.iconOnly) }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            if let image = article.image {
                AsyncImage(url: image) { img in
                    img.resizable().scaledToFill()
                } placeholder: {
                    Color.secondary.opacity(0.1)
                }
                .frame(width: 72, height: 56)
                .clipShape(RoundedRectangle(cornerRadius: 6))
            }
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }
}
