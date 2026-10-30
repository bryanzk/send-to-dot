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
        message.numberOfLines = 0; message.text = "Checking the selected file…"
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
            guard providers.count == 1, let provider = providers.first else { throw InboxFailure.message("Share exactly one PNG or JPEG.") }
            let types = provider.registeredTypeIdentifiers
            guard !types.contains(where: { $0.contains("heic") || $0.contains("heif") }),
                  let type = [UTType.png.identifier, UTType.jpeg.identifier].first(where: { types.contains($0) }) else {
                throw InboxFailure.message("Only an explicitly supplied PNG/JPEG file is accepted. HEIC, PDF and video are not converted.")
            }
            let data: Data = try await withCheckedThrowingContinuation { continuation in
                provider.loadFileRepresentation(forTypeIdentifier: type) { url, error in
                    if let error = error { continuation.resume(throwing: error); return }
                    do {
                        guard let url = url, let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize, size <= 8 * 1024 * 1024 else { throw InboxFailure.message("Image exceeds 8 MiB.") }
                        continuation.resume(returning: try Data(contentsOf: url))
                    } catch { continuation.resume(throwing: error) }
                }
            }
            try Task.checkCancellation()
            guard !closing else { return }
            _ = try InboxStorage.pairing()
            let item = try InboxStorage.enqueue(data); prepared = item
            message.text = "One original PNG/JPEG is ready. Sending includes embedded metadata. Destination: \(item.origin.absoluteString). Only a server receipt is immediate; check the original dot for its reply."
            send.isEnabled = true
        } catch { if !closing { message.text = error.localizedDescription } }
    }
    @objc private func upload() {
        guard let confirmed = prepared else { return }; send.isEnabled = false
        uploadTask = Task { @MainActor in
            do { message.text = try await InboxUpload.sendPending(confirmed: confirmed); prepared = nil }
            catch { message.text = "\(error.localizedDescription) Network failure may have an unknown outcome. Retry the saved image from Send to dot; its submission ID is preserved." }
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
