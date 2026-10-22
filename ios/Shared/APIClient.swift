import Foundation

enum APIError: LocalizedError {
    case notSignedIn
    case unauthorized
    case server(Int)
    case badResponse

    var errorDescription: String? {
        switch self {
        case .notSignedIn: return "Sign in to your NewsWiz server first."
        case .unauthorized: return "Your session expired or the passphrase changed. Sign in again."
        case .server(let code): return "The server returned an error (\(code))."
        case .badResponse: return "The server sent something unexpected."
        }
    }
}

/// Talks to the NewsWiz server with the bearer token stored in the App Group.
struct APIClient {
    var baseURL: URL
    var token: String?

    static var current: APIClient? {
        guard let url = Shared.serverURL else { return nil }
        return APIClient(baseURL: url, token: Shared.token)
    }

    static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        d.dateDecodingStrategy = .custom { decoder in
            let s = try decoder.singleValueContainer().decode(String.self)
            if let date = withFraction.date(from: s) ?? plain.date(from: s) { return date }
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Bad date \(s)"))
        }
        return d
    }()

    /// The state endpoint takes camelCase keys (progressSource), so keys are sent as-is.
    static let encoder = JSONEncoder()

    // MARK: Auth

    /// Exchanges the passphrase for a token. Works for open servers too (empty passphrase).
    static func signIn(server: URL, passphrase: String) async throws -> String {
        var request = URLRequest(url: server.appendingPathComponent("api/login"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["passphrase": passphrase])
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.badResponse }
        if http.statusCode == 401 { throw APIError.unauthorized }
        guard http.statusCode == 200,
              let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let token = json["token"] as? String else { throw APIError.server(http.statusCode) }
        return token
    }

    // MARK: Endpoints

    func catchUp(longer: Bool = false) async throws -> CatchUp {
        try await get("api/catchup", query: longer ? [URLQueryItem(name: "longer", value: "1")] : [])
    }

    func latest(freeOnly: Bool = false, unreadOnly: Bool = false, lean: String? = nil, before: String? = nil) async throws -> ArticlePage {
        var q: [URLQueryItem] = [URLQueryItem(name: "limit", value: "50")]
        if freeOnly { q.append(URLQueryItem(name: "free", value: "1")) }
        if unreadOnly { q.append(URLQueryItem(name: "unread", value: "1")) }
        if let lean { q.append(URLQueryItem(name: "lean", value: lean)) }
        if let before { q.append(URLQueryItem(name: "before", value: before)) }
        return try await get("api/articles", query: q)
    }

    func saved() async throws -> SavedList { try await get("api/saved") }

    func article(_ id: Int) async throws -> ArticleDetail { try await get("api/articles/\(id)") }

    @discardableResult
    func updateState(_ id: Int, _ patch: StatePatch) async throws -> ReadingState {
        try await send("api/articles/\(id)/state", body: patch)
    }

    func finishCycle() async throws {
        let _: [String: Bool] = try await send("api/cycle", body: [String: String]())
    }

    // MARK: Plumbing

    private func request(_ path: String, query: [URLQueryItem] = []) -> URLRequest {
        var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { components.queryItems = query }
        var request = URLRequest(url: components.url!)
        request.timeoutInterval = 30
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        return request
    }

    private func get<T: Decodable>(_ path: String, query: [URLQueryItem] = []) async throws -> T {
        try await run(request(path, query: query))
    }

    private func send<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        var r = request(path)
        r.httpMethod = "POST"
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.httpBody = try Self.encoder.encode(body)
        return try await run(r)
    }

    private func run<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.badResponse }
        if http.statusCode == 401 { throw APIError.unauthorized }
        guard (200..<300).contains(http.statusCode) else { throw APIError.server(http.statusCode) }
        return try Self.decoder.decode(T.self, from: data)
    }
}
