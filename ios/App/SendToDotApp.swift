import SwiftUI

@main
struct SendToDotApp: App {
    var body: some Scene { WindowGroup { PairingView() } }
}
struct PairingView: View {
    @State private var origin = ""
    @State private var token = ""
    @State private var status = "Enter the phone connection code from your setup instructions. Keep the receiving computer on and connected to the internet."
    @State private var busy = false
    @State private var saved: PendingImage?
    @State private var confirmRetry = false
    var body: some View {
        NavigationStack {
            Form {
                Section("Connect this phone") {
                    TextField("Picture-receiving address", text: $origin).textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
                    SecureField("Phone connection code", text: $token).textInputAutocapitalization(.never).autocorrectionDisabled()
                    Button("Save on this device") {
                        do { try InboxStorage.pair(origin: origin, token: token); token = ""; status = "This phone is connected. Choose one JPG or PNG photo and share it to Send to dot."; refreshSaved() }
                        catch { status = inboxUserMessage(error) }
                    }.disabled(busy)
                }
                Section("Photo saved on this phone") {
                    if let saved = saved { Text("Send to: " + saved.origin.absoluteString).font(.footnote) }
                    Button("Send the saved photo again") { refreshSaved(); confirmRetry = saved != nil }.disabled(busy)
                        .confirmationDialog("Send this saved photo here?", isPresented: $confirmRetry, titleVisibility: .visible) {
                            if let saved = saved { Button("Send to " + saved.origin.absoluteString) { retry(confirmed: saved) } }
                            Button("Cancel", role: .cancel) { }
                        } message: {
                            Text(saved.map { "Send to: " + $0.origin.absoluteString + ". The original photo may include when and where it was taken. If a previous send stopped, the photo may already have arrived. Check your original dot conversation first." } ?? "There is no photo waiting on this phone.")
                        }
                    Button("Delete the copy saved here (keep the Photos original)", role: .destructive) {
                        do { try InboxStorage.discard(); status = "The copy saved here is deleted. Your original in Photos is not deleted. Already submitted photos are unchanged; the receiving address removes its copy after one hour."; refreshSaved() }
                        catch { status = inboxUserMessage(error) }
                    }.disabled(busy)
                }
                Section {
                    Text(status)
                    Text("This app keeps your phone connection code in the iPhone’s protected password storage. Your original photo, including details such as when and where it was taken, goes to your receiving address and the ChatGPT you allowed. Keep this app open while sending. This app is still being tested.").font(.footnote)
                    Button("Disconnect and delete the copy saved here", role: .destructive) {
                        do { try InboxStorage.disconnect(); status = "This phone is disconnected and the copy saved here is deleted. Your original in Photos is not deleted. To stop the code on other devices too, ask the person who helped you set this up."; refreshSaved() }
                        catch { status = inboxUserMessage(error) }
                    }.disabled(busy)
                }
            }.navigationTitle("Send to dot").task { refreshSaved() }
        }
    }
    private func refreshSaved() { do { saved = try InboxStorage.pending() } catch { saved = nil; status = inboxUserMessage(error) } }
    private func retry(confirmed: PendingImage) {
        busy = true
        Task { do { status = try await InboxUpload.sendPending(confirmed: confirmed) } catch { status = "\(inboxUserMessage(error)) We cannot be sure whether the photo arrived. Check your original dot conversation before sending the saved photo again." }; busy = false; refreshSaved() }
    }
}
