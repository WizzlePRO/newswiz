import ActivityKit
import SwiftUI

struct SettingsView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Form {
            Section("Server") {
                LabeledContent("Address", value: Shared.serverURL?.host ?? "—")
                if let url = Shared.serverURL {
                    Link("Open the web app", destination: url)
                    Link("Sources & Discover (web)", destination: url.appendingPathComponent("sources"))
                }
                Button("Sign out", role: .destructive) { model.signOut() }
            }
            Section {
                LabeledContent("Live Activities", value: LiveActivities.shared.enabled ? "On" : "Off")
            } header: {
                Text("Lock Screen")
            } footer: {
                Text("Reading progress and briefing progress show on the Lock Screen and in the Dynamic Island. Turn Live Activities on in Settings › NewsWiz.")
            }
            Section {
                Text("Media bias ratings: AllSides Media Bias Ratings™ by AllSides.com, CC BY-NC 4.0. Ratings describe outlets, not individual articles.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Settings")
    }
}
