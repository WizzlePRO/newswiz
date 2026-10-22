import SwiftUI

struct LoginView: View {
    @Environment(AppModel.self) private var model
    @State private var server = Shared.serverURL?.absoluteString ?? "https://"
    @State private var passphrase = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("https://your-app.up.railway.app", text: $server)
                        .keyboardType(.URL)
                        .textContentType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField("Passphrase", text: $passphrase)
                        .textContentType(.password)
                } header: {
                    Text("Your NewsWiz server")
                } footer: {
                    Text("The address of your NewsWiz web app and the APP_PASSPHRASE you set on the server.")
                }
                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }
                Section {
                    Button {
                        Task { await signIn() }
                    } label: {
                        HStack {
                            Text("Sign in")
                            if busy { Spacer(); ProgressView() }
                        }
                    }
                    .disabled(busy || URL(string: server)?.host == nil)
                }
            }
            .navigationTitle("NewsWiz")
        }
    }

    private func signIn() async {
        guard let url = URL(string: server.trimmingCharacters(in: .whitespaces).trimmingCharacters(in: CharacterSet(charactersIn: "/"))) else { return }
        busy = true
        defer { busy = false }
        do {
            try await model.signIn(server: url, passphrase: passphrase)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}
