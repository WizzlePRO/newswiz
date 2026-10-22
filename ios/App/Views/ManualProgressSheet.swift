import SwiftUI

/// Shown when you come back from reading on a publisher's site: the app can't see that page, so ask.
struct ManualProgressSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var article: Article

    var body: some View {
        VStack(spacing: 16) {
            Text("How far did you get?").font(.headline)
            Text(article.title).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center).lineLimit(2)
            HStack(spacing: 10) {
                ForEach([0.25, 0.5, 0.75], id: \.self) { p in
                    Button("\(Int(p * 100))%") { record(p) }.buttonStyle(.bordered)
                }
                Button("Finished") { record(1) }.buttonStyle(.borderedProminent)
            }
            HStack {
                Button("Save for later") {
                    Task { await model.setSaved(article, true) }
                    dismiss()
                }
                Spacer()
                Button("Skip") { dismiss() }
            }
            .font(.subheadline)
        }
        .padding()
        .presentationDetents([.height(220)])
    }

    private func record(_ p: Double) {
        Task { await model.setManualProgress(article, p) }
        dismiss()
    }
}
