import SwiftUI

@main
struct SendToDotApp: App {
    var body: some Scene { WindowGroup { PairingView() } }
}
struct PairingView: View {
    @State private var origin = ""
    @State private var token = ""
    @State private var status = "Pair with an upload-only code. The server and computer must remain online."
    @State private var busy = false
    @State private var saved: PendingImage?
    @State private var confirmRetry = false
    var body: some View {
        NavigationStack {
            Form {
                Section("Device pairing") {
                    TextField("https://your-approved-origin", text: $origin).textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
                    SecureField("Upload-only pairing code", text: $token).textInputAutocapitalization(.never).autocorrectionDisabled()
                    Button("Save on this device") {
                        do { try InboxStorage.pair(origin: origin, token: token); token = ""; status = "Paired. Share one PNG/JPEG using Send to dot."; refreshSaved() }
                        catch { status = error.localizedDescription }
                    }.disabled(busy)
                }
                Section("Saved upload") {
                    if let saved = saved { Text("Saved destination: " + saved.origin.absoluteString).font(.footnote) }
                    Button("Review and retry saved image") { refreshSaved(); confirmRetry = saved != nil }.disabled(busy)
                        .confirmationDialog("Send the saved original image to this destination?", isPresented: $confirmRetry, titleVisibility: .visible) {
                            if let saved = saved { Button("Send to " + saved.origin.absoluteString) { retry(confirmed: saved) } }
                            Button("Cancel", role: .cancel) { }
                        } message: {
                            Text(saved.map { "Destination: " + $0.origin.absoluteString + ". Includes original image metadata. Reuses the existing submission ID; a previous timed-out request may already have arrived." } ?? "No pending image.")
                        }
                    Button("Discard saved image", role: .destructive) {
                        do { try InboxStorage.discard(); status = "Device copy discarded. A prior server receipt may still exist until its retention expires."; refreshSaved() }
                        catch { status = error.localizedDescription }
                    }.disabled(busy)
                }
                Section {
                    Text(status)
                    Text("Keychain stores the upload code together with its exact destination on this device. Original image bytes, including metadata, go to your configured server and authorized ChatGPT. This is a foreground prototype.").font(.footnote)
                    Button("Disconnect this device", role: .destructive) {
                        do { try InboxStorage.disconnect(); status = "Local pairing and pending image removed. Server revocation is separate."; refreshSaved() }
                        catch { status = error.localizedDescription }
                    }.disabled(busy)
                }
            }.navigationTitle("Send to dot").task { refreshSaved() }
        }
    }
    private func refreshSaved() { do { saved = try InboxStorage.pending() } catch { saved = nil; status = error.localizedDescription } }
    private func retry(confirmed: PendingImage) {
        busy = true
        Task { do { status = try await InboxUpload.sendPending(confirmed: confirmed) } catch { status = "\(error.localizedDescription) If delivery timed out, its outcome is unknown; retry keeps the same submission ID." }; busy = false; refreshSaved() }
    }
}
