import SwiftUI

enum Tab: Hashable { case catchUp, latest, saved, settings }

struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase
    @State private var tab: Tab = .catchUp
    @State private var catchUpPath: [Int] = []
    @State private var latestPath: [Int] = []
    @State private var savedPath: [Int] = []
    @State private var manualProgress: Article?

    var body: some View {
        if !model.signedIn {
            LoginView()
        } else {
            TabView(selection: $tab) {
                NavigationStack(path: $catchUpPath) {
                    CatchUpView().readerDestination()
                }
                .tabItem { Label("Catch up", systemImage: "newspaper") }
                .tag(Tab.catchUp)

                NavigationStack(path: $latestPath) {
                    LatestView().readerDestination()
                }
                .tabItem { Label("Latest", systemImage: "clock") }
                .tag(Tab.latest)

                NavigationStack(path: $savedPath) {
                    SavedView().readerDestination()
                }
                .tabItem { Label("Saved", systemImage: "bookmark") }
                .tag(Tab.saved)

                NavigationStack {
                    SettingsView()
                }
                .tabItem { Label("Settings", systemImage: "gearshape") }
                .tag(Tab.settings)
            }
            .onChange(of: model.pendingLink) { _, link in route(link) }
            .onAppear { route(model.pendingLink) }
            .onChange(of: scenePhase) { _, phase in
                guard phase == .active else { return }
                // Back from a publisher's site: ask how far they got.
                if let article = model.awaitingManualProgress {
                    model.awaitingManualProgress = nil
                    manualProgress = article
                }
                // Only the reading list: refreshing the briefing would reshuffle it mid-read.
                Task { await model.refreshSaved() }
            }
            .sheet(item: $manualProgress) { ManualProgressSheet(article: $0) }
        }
    }

    private func route(_ link: DeepLink?) {
        guard let link else { return }
        model.pendingLink = nil
        switch link {
        case .read(let id):
            tab = .catchUp
            catchUpPath = [id]
        case .catchUp:
            tab = .catchUp
            catchUpPath = []
        case .saved:
            tab = .saved
            savedPath = []
        }
    }
}

private extension View {
    func readerDestination() -> some View {
        navigationDestination(for: Int.self) { ReaderScreen(articleId: $0) }
    }
}
