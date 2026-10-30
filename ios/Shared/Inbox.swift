import Foundation
import Security
import ImageIO
import UniformTypeIdentifiers
import Darwin

// Compile this file into both targets. Supply your own signing identifiers in Info.plist.
enum InboxFailure: LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let text) = self { return text }; return nil }
}
struct PendingImage: Codable { let id: String; let mime: String; let origin: URL; let credentialGeneration: String }
struct Pairing: Codable { let origin: URL; let token: String; let generation: String }
enum InboxStorage {
    static func setting(_ name: String) throws -> String {
        guard let value = Bundle.main.object(forInfoDictionaryKey: name) as? String,
              !value.isEmpty, !value.contains("$(") else { throw InboxFailure.message("Signing/shared-container configuration is missing.") }
        return value
    }
    static func container() throws -> URL {
        let group = try setting("InboxAppGroup")
        guard let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else {
            throw InboxFailure.message("Shared container unavailable. Check both targets' App Groups entitlements.")
        }
        return url
    }
    static func origin(_ value: String) throws -> URL {
        guard let url = URL(string: value), let c = URLComponents(url: url, resolvingAgainstBaseURL: false),
              c.scheme == "https", c.host != nil, c.user == nil, c.password == nil,
              c.query == nil, c.fragment == nil, c.path.isEmpty, c.port == nil || c.port == 443 else {
            throw InboxFailure.message("Enter the exact HTTPS origin, with no trailing slash, path, credentials or query.")
        }
        return url
    }
    static func keyQuery() throws -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: "send-to-dot-upload",
         kSecAttrAccount as String: "single-phone",
         kSecAttrAccessGroup as String: try setting("InboxKeychainGroup")]
    }
    static func pair(origin text: String, token: String) throws {
        let destination = try origin(text)
        guard token.count >= 24, token.count <= 512, !token.contains(where: { $0.isWhitespace }) else {
            throw InboxFailure.message("Enter the upload-only pairing code, not an owner or OpenAI credential.")
        }
        try queueLock {
            guard try pending() == nil else { throw InboxFailure.message("A saved image is bound to its confirmed destination. Discard it before changing pairing, then share and confirm again.") }
            // One atomic Keychain value; never combine an origin file with a separately updated token.
            let pair = Pairing(origin: destination, token: token, generation: UUID().uuidString)
            let query = try keyQuery(), data = try JSONEncoder().encode(pair)
            let update = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
            if update == errSecItemNotFound {
                var item = query; item[kSecValueData as String] = data
                item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
                item[kSecAttrSynchronizable as String] = false
                guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else { throw InboxFailure.message("Keychain save failed. Check signing entitlements.") }
            } else if update != errSecSuccess { throw InboxFailure.message("Keychain update failed.") }
        }
    }
    static func pairing() throws -> Pairing {
        var query = try keyQuery(); query[kSecReturnData as String] = true; query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data, let pair = try? JSONDecoder().decode(Pairing.self, from: data),
              UUID(uuidString: pair.generation) != nil else {
            throw InboxFailure.message("Open Send to dot and pair this device first. Keep the phone unlocked.")
        }
        _ = try origin(pair.origin.absoluteString)
        return pair
    }
    static func metadataURL() throws -> URL { try container().appendingPathComponent("pending.json") }
    static func bytesURL(_ id: String) throws -> URL {
        guard UUID(uuidString: id) != nil else { throw InboxFailure.message("Invalid queue identifier.") }
        return try container().appendingPathComponent("image-" + id)
    }
    static func pending() throws -> PendingImage? {
        let path = try metadataURL()
        if !FileManager.default.fileExists(atPath: path.path) { return nil }
        return try JSONDecoder().decode(PendingImage.self, from: Data(contentsOf: path))
    }
    private static func queueLock<T>(_ operation: () throws -> T) throws -> T {
        let path = try container().appendingPathComponent("queue.lock").path
        let fd = Darwin.open(path, O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
        guard fd >= 0 else { throw InboxFailure.message("Queue lock unavailable.") }
        defer { Darwin.close(fd) }
        guard flock(fd, LOCK_EX) == 0 else { throw InboxFailure.message("Queue busy.") }
        defer { flock(fd, LOCK_UN) }
        return try operation()
    }
    static func enqueue(_ data: Data) throws -> PendingImage {
        try queueLock { try enqueueLocked(data) }
    }
    private static func enqueueLocked(_ data: Data) throws -> PendingImage {
        guard try pending() == nil else { throw InboxFailure.message("A previous upload is pending. Retry or discard it in Send to dot before sharing again.") }
        guard !data.isEmpty, data.count <= 8 * 1024 * 1024,
              let source = CGImageSourceCreateWithData(data as CFData, nil), CGImageSourceGetCount(source) == 1,
              let type = CGImageSourceGetType(source) as String?,
              [UTType.png.identifier, UTType.jpeg.identifier].contains(type),
              let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = props[kCGImagePropertyPixelWidth] as? NSNumber,
              let height = props[kCGImagePropertyPixelHeight] as? NSNumber,
              width.int64Value > 0, height.int64Value > 0,
              width.int64Value <= 16_000_000, height.int64Value <= 16_000_000,
              width.int64Value * height.int64Value <= 16_000_000 else {
            throw InboxFailure.message("Choose one PNG/JPEG, up to 8 MiB and 16 million pixels. Other formats are not converted.")
        }
        let pair = try pairing()
        let item = PendingImage(id: UUID().uuidString, mime: type == UTType.png.identifier ? "image/png" : "image/jpeg", origin: pair.origin, credentialGeneration: pair.generation)
        try data.write(to: bytesURL(item.id), options: [.atomic, .completeFileProtection])
        do { try JSONEncoder().encode(item).write(to: metadataURL(), options: [.atomic, .completeFileProtection]) }
        catch { try? FileManager.default.removeItem(at: bytesURL(item.id)); throw error }
        return item
    }
    static func discard(expectedID: String? = nil) throws {
        try queueLock {
        if let expectedID = expectedID, try pending()?.id != expectedID { return }
        let item = try pending()
        var paths = [try metadataURL()]
        if let item = item { paths.append(try bytesURL(item.id)) }
        for url in paths where FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
    }
        }
    static func disconnect() throws {
        let status = SecItemDelete(try keyQuery() as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw InboxFailure.message("Keychain deletion failed.") }
        try discard()
    }
}
enum InboxUpload {
    static func sendPending(confirmed: PendingImage) async throws -> String {
        guard let item = try InboxStorage.pending() else { throw InboxFailure.message("No pending image.") }
        let pair = try InboxStorage.pairing()
        guard item.id == confirmed.id, item.origin == confirmed.origin,
              item.credentialGeneration == confirmed.credentialGeneration,
              pair.origin == item.origin, pair.generation == item.credentialGeneration else {
            throw InboxFailure.message("Destination or pairing changed. Nothing was sent. Discard the saved image, then share and confirm it again.")
        }
        var request = URLRequest(url: pair.origin.appendingPathComponent("api/upload"))
        request.httpMethod = "POST"; request.timeoutInterval = 30
        request.setValue("Bearer " + pair.token, forHTTPHeaderField: "Authorization")
        request.setValue(pair.origin.absoluteString, forHTTPHeaderField: "Origin")
        request.setValue(item.mime, forHTTPHeaderField: "Content-Type")
        request.setValue(item.id, forHTTPHeaderField: "X-Share-ID")
        // Foreground, bounded request. No background delivery guarantee.
        let session = URLSession(configuration: .ephemeral, delegate: RejectRedirects(), delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        let (data, response) = try await session.upload(for: request, fromFile: InboxStorage.bytesURL(item.id))
        guard let http = response as? HTTPURLResponse else { throw InboxFailure.message("Unknown response. Retain this image and retry with the same ID.") }
        guard http.statusCode == 201 else {
            let message: String
            switch http.statusCode {
            case 401, 403: message = "Pairing expired or denied. Discard this saved image, pair again, then share and confirm it again."
            case 413: message = "The image exceeds the upload limit."
            case 429, 503: message = "Server busy. Retry this saved image later."
            default: message = "Upload was rejected. This saved image has not been silently resubmitted."
            }
            throw InboxFailure.message(message)
        }
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any], let file = json["file_id"] as? String, UUID(uuidString: file) != nil else {
            throw InboxFailure.message("Unknown receipt. Keep the saved image; retry uses its existing ID.")
        }
        try InboxStorage.discard(expectedID: item.id)
        return "Server received the image. Check the original dot conversation; this receipt does not prove a reply."
    }
}

private final class RejectRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}
