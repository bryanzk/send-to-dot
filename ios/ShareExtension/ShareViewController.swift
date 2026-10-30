import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
    private let message = UILabel()
    private let send = UIButton(type: .system)
    private var prepared: PendingImage?
    private var preparationTask: Task<Void, Never>?
    private var uploadTask: Task<Void, Never>?
    private var closing = false
    override func viewDidLoad() {
        super.viewDidLoad(); view.backgroundColor = .systemBackground
        message.numberOfLines = 0; message.text = "Checking your photo…"
        send.setTitle("Send original image", for: .normal); send.isEnabled = false
        send.addTarget(self, action: #selector(upload), for: .touchUpInside)
        let cancel = UIButton(type: .system); cancel.setTitle("Close (keep any saved image)", for: .normal); cancel.addTarget(self, action: #selector(close), for: .touchUpInside)
        let stack = UIStackView(arrangedSubviews: [message, send, cancel]); stack.axis = .vertical; stack.spacing = 20; stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack); NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 24), stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -24), stack.centerYAnchor.constraint(equalTo: view.centerYAnchor)])
        preparationTask = Task { await prepare() }
    }
    @MainActor private func prepare() async {
        do {
            let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
            guard providers.count == 1, let provider = providers.first else { throw InboxFailure.message("Choose just one JPG or PNG photo. Nothing was sent.") }
            let types = provider.registeredTypeIdentifiers
            guard !types.contains(where: { $0.contains("heic") || $0.contains("heif") }),
                  let type = [UTType.png.identifier, UTType.jpeg.identifier].first(where: { types.contains($0) }) else {
                throw InboxFailure.message("Choose a JPG or PNG photo. Other kinds of files, including videos, cannot be sent here. Nothing was sent.")
            }
            let data: Data = try await withCheckedThrowingContinuation { continuation in
                provider.loadFileRepresentation(forTypeIdentifier: type) { url, error in
                    if let error = error { continuation.resume(throwing: error); return }
                    do {
                        guard let url = url, let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize, size <= 8 * 1024 * 1024 else { throw InboxFailure.message("This photo is too large. Choose one smaller than 8 MB. Nothing was sent.") }
                        continuation.resume(returning: try Data(contentsOf: url))
                    } catch { continuation.resume(throwing: error) }
                }
            }
            try Task.checkCancellation()
            guard !closing else { return }
            _ = try InboxStorage.pairing()
            let item = try InboxStorage.enqueue(data); prepared = item
            message.text = "One original PNG/JPEG is ready. Sending includes embedded metadata. Send to: \(item.origin.absoluteString). After sending, check your original dot conversation for the photo and reply."
            send.isEnabled = true
        } catch { if !closing { message.text = inboxUserMessage(error) } }
    }
    @objc private func upload() {
        guard let confirmed = prepared else { return }; send.isEnabled = false
        uploadTask = Task { @MainActor in
            do { message.text = try await InboxUpload.sendPending(confirmed: confirmed); prepared = nil }
            catch { message.text = "\(inboxUserMessage(error)) We cannot be sure whether the photo arrived. Check your original dot conversation before using Send to dot to send the saved photo again." }
        }
    }
    @objc private func close() {
        closing = true
        preparationTask?.cancel()
        // A completed enqueue is deliberately retained. An in-flight upload may already
        // have reached the server; closing/cancelling is not a recall operation.
        uploadTask?.cancel()
        extensionContext?.completeRequest(returningItems: nil)
    }
}
