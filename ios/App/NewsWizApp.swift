import SwiftUI

@main
struct NewsWizApp: App {
    @State private var model = AppModel.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .onOpenURL { url in
                    // Widgets, Live Activities, and Shortcuts open newswiz:// links.
                    if let link = DeepLink(url: url) { model.pendingLink = link }
                }
                .onContinueUserActivity("com.wizzlepro.newswiz.reading") { activity in
                    if let id = activity.webpageURL.flatMap({ Int($0.lastPathComponent) }) {
                        model.pendingLink = .read(id: id)
                    }
                }
        }
    }
}
