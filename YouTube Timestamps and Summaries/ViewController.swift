//
//  ViewController.swift
//  Timestamps & Summaries for YT
//
//  Created by Matus Vojtek on 21/04/2026.
//

import Cocoa
import FoundationModels
import SafariServices
import WebKit

let extensionBundleIdentifier = "Matuko.YouTube-Timestamps-and-Summaries.Extension"

@MainActor
final class ViewController: NSViewController, WKNavigationDelegate, WKScriptMessageHandler {

    @IBOutlet private var webView: WKWebView!

    private let safariBundleIdentifier = "com.apple.Safari"
    private let codexAuthService = CodexAuthService()
    private var hasSizedWindow = false
    private var statusMessage: String?
    private var codexLoginSession: CodexDeviceLoginSession?
    private var codexLoginError: String?

    override func viewDidLoad() {
        super.viewDidLoad()

        webView.navigationDelegate = self
        webView.configuration.userContentController.add(self, name: "controller")
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleAppDidBecomeActive),
            name: NSApplication.didBecomeActiveNotification,
            object: nil
        )
        loadCompanionApp()
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    override func viewDidAppear() {
        super.viewDidAppear()

        guard !hasSizedWindow, let window = view.window else {
            return
        }

        hasSizedWindow = true
        let fixedSize = NSSize(width: 760, height: 900)
        window.setContentSize(fixedSize)
        window.minSize = fixedSize
        window.maxSize = fixedSize
        window.center()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        Task { @MainActor in
            await pushState()
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: any Error) {
        showLoadError(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: any Error) {
        showLoadError(error)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let action = body["action"] as? String else {
            return
        }

        switch action {
        case "ready", "refreshState":
            Task { @MainActor in
                await pushState()
            }

        case "openPreferences":
            openPreferences()

        case "saveGenerationSettings":
            saveGenerationSettings(body)

        case "startCodexLogin":
            startCodexLogin()

        case "signOutCodex":
            signOutCodex()

        case "copyCodexCode":
            copyCodexCode()

        default:
            break
        }
    }

    private func saveGenerationSettings(_ body: [String: Any]) {
        let settings = GenerationSettings(
            providerID: body["providerID"] as? String ?? GenerationSettings.defaultProviderID,
            modelID: body["modelID"] as? String ?? GenerationSettings.defaultModelID,
            summaryEngine: body["summaryEngine"] as? String ?? GenerationSettings.defaultSummaryEngine
        )
        settings.save()
        Task { @MainActor in
            await pushState(message: "Settings updated.")
        }
    }

    private func startCodexLogin() {
        Task { @MainActor in
            do {
                codexLoginError = nil
                let session = try await codexAuthService.startDeviceLogin()
                codexLoginSession = session
                NSWorkspace.shared.open(session.verificationURL)
                await pushState(message: "ChatGPT sign-in opened in your browser.")
                await pollCodexLogin(session)
            } catch {
                codexLoginError = error.localizedDescription
                codexLoginSession = nil
                await pushState(message: "ChatGPT sign-in could not start.")
            }
        }
    }

    private func signOutCodex() {
        codexAuthService.signOut()
        codexLoginSession = nil
        codexLoginError = nil
        Task { @MainActor in
            await pushState(message: "Signed out of ChatGPT.")
        }
    }

    private func copyCodexCode() {
        guard let code = codexLoginSession?.userCode, !code.isEmpty else {
            Task { @MainActor in
                await pushState(message: "There is no sign-in code to copy yet.")
            }
            return
        }

        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(code, forType: .string)

        Task { @MainActor in
            await pushState(message: "Sign-in code copied.")
        }
    }

    private func pollCodexLogin(_ session: CodexDeviceLoginSession) async {
        while codexLoginSession?.id == session.id {
            do {
                try await Task.sleep(nanoseconds: UInt64(session.intervalSeconds * 1_000_000_000))
                let completed = try await codexAuthService.pollDeviceLogin(session)
                if completed {
                    codexLoginSession = nil
                    codexLoginError = nil
                    await pushState(message: "ChatGPT is connected.")
                    return
                }
                await pushState()
            } catch {
                codexLoginError = error.localizedDescription
                codexLoginSession = nil
                await pushState(message: "ChatGPT sign-in did not complete.")
                return
            }
        }
    }

    private func openPreferences() {
        Task { @MainActor in
            await pushState(message: "Opening Safari extension settings...")
            await showExtensionPreferences()
        }
    }

    private func showExtensionPreferences(maxAttempts: Int = 3) async {
        var lastError: Error?

        await openSafari()
        try? await Task.sleep(nanoseconds: 1_000_000_000)

        for attempt in 1...maxAttempts {
            do {
                if attempt > 1 {
                    await openSafari()
                    try? await Task.sleep(nanoseconds: 1_000_000_000)
                }

                try await showExtensionPreferencesOnce()

                // SafariServices can report success while Safari is still waking up.
                // A second direct request is more reliable than pre-launching Safari.
                if attempt == 1 {
                    try? await Task.sleep(nanoseconds: 1_000_000_000)
                    try? await showExtensionPreferencesOnce()
                }

                bringSafariForward()
                await pushState(message: "Safari should now show Extensions. If it only opened Safari, choose Safari > Settings > Extensions.")
                return
            } catch {
                lastError = error
                await openSafari()
                if attempt < maxAttempts {
                    try? await Task.sleep(nanoseconds: 1_000_000_000)
                }
            }
        }

        if let lastError {
            print("[CompanionApp] Safari extension settings handoff failed: \(lastError.localizedDescription)")
        }

        bringSafariForward()
        await pushState(message: "Safari is open. If Extensions did not appear, choose Safari > Settings > Extensions.")
    }

    private func openSafari() async {
        if let safari = NSRunningApplication.runningApplications(withBundleIdentifier: safariBundleIdentifier).first {
            activateSafariApplication(safari)
            return
        }

        guard let safariURL = NSWorkspace.shared.urlForApplication(withBundleIdentifier: safariBundleIdentifier) else {
            return
        }

        await withCheckedContinuation { continuation in
            let configuration = NSWorkspace.OpenConfiguration()
            configuration.activates = true
            NSWorkspace.shared.openApplication(at: safariURL, configuration: configuration) { _, _ in
                continuation.resume()
            }
        }
    }

    private func bringSafariForward() {
        guard let safari = NSRunningApplication
            .runningApplications(withBundleIdentifier: safariBundleIdentifier)
            .first
        else {
            return
        }

        activateSafariApplication(safari)
    }

    private func activateSafariApplication(_ safari: NSRunningApplication) {
        if #available(macOS 14.0, *) {
            safari.activate()
        } else {
            safari.activate(options: [.activateIgnoringOtherApps])
        }
    }

    private func showExtensionPreferencesOnce() async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            }
        }
    }

    @objc
    private func handleAppDidBecomeActive() {
        Task { @MainActor in
            await pushState()
        }
    }

    private func loadCompanionApp() {
        guard
            let htmlURL = Bundle.main.url(forResource: "Main", withExtension: "html"),
            let html = try? String(contentsOf: htmlURL, encoding: .utf8)
        else {
            showFallbackHTML("The companion app UI could not be loaded from the app bundle.")
            return
        }

        webView.loadHTMLString(html, baseURL: htmlURL.deletingLastPathComponent())
    }

    private func showLoadError(_ error: any Error) {
        showFallbackHTML("The companion app UI could not be loaded: \(error.localizedDescription)")
    }

    private func showFallbackHTML(_ message: String) {
        let escapedMessage = message
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
        webView.loadHTMLString("""
        <!doctype html>
        <html>
        <body style="margin:0;padding:28px;font:15px -apple-system,BlinkMacSystemFont,sans-serif;color:#111;background:#f7f6f2">
            <h1 style="margin:0 0 12px">Timestamps &amp; Summaries for YT</h1>
            <p>\(escapedMessage)</p>
        </body>
        </html>
        """, baseURL: nil)
    }

    @MainActor
    private func pushState(message: String? = nil) async {
        if let message {
            statusMessage = message
        }

        let payload = await buildState(message: message)
        guard
            let data = try? JSONSerialization.data(withJSONObject: payload, options: []),
            let json = String(data: data, encoding: .utf8)
        else {
            return
        }

        _ = try? await webView.evaluateJavaScript("window.renderAppState(\(json));")
    }

    private func buildState(message: String?) async -> [String: Any] {
        let extensionEnabled = await fetchExtensionEnabled()
        let appleIntelligenceState = appleIntelligenceState()
        let settings = GenerationSettings.load()
        let effectiveSettings = effectiveGenerationSettings(settings, appleIntelligenceAvailable: appleIntelligenceState.available)
        let codexStatus = await codexAuthService.statusPayload(refresh: true)

        return [
            "appleIntelligenceAvailable": appleIntelligenceState.available,
            "appleIntelligenceAvailability": appleIntelligenceState.availability,
            "codex": mergedCodexStatus(codexStatus),
            "codexLogin": codexLoginSession?.payload ?? NSNull(),
            "settings": effectiveSettings.payload,
            "providerOptions": GenerationSettings.providerOptions,
            "modelOptions": GenerationSettings.modelOptions,
            "summaryOptions": summaryOptions(modelID: effectiveSettings.modelID, appleIntelligenceAvailable: appleIntelligenceState.available),
            "extensionEnabled": extensionEnabled as Any,
            "usesSettingsLabel": ProcessInfo.processInfo.operatingSystemVersion.majorVersion >= 13,
            "message": (message ?? statusMessage) ?? NSNull(),
        ]
    }

    private func effectiveGenerationSettings(
        _ settings: GenerationSettings,
        appleIntelligenceAvailable: Bool
    ) -> GenerationSettings {
        guard settings.summaryEngine == "appleIntelligence", !appleIntelligenceAvailable else {
            return settings
        }

        return GenerationSettings(
            providerID: settings.providerID,
            modelID: settings.modelID,
            summaryEngine: "selectedModel"
        )
    }

    private func summaryOptions(modelID: String, appleIntelligenceAvailable: Bool) -> [[String: String]] {
        let modelLabel = GenerationSettings.modelOptions
            .first { $0["id"] == modelID }?["label"]
            ?? "Selected model"
        let modelOption = [
            "id": "selectedModel",
            "label": modelLabel,
        ]

        guard appleIntelligenceAvailable else {
            return [modelOption]
        }

        return [
            [
                "id": "appleIntelligence",
                "label": "Apple Intelligence",
            ],
            modelOption,
        ]
    }

    private func mergedCodexStatus(_ codexStatus: [String: Any]) -> [String: Any] {
        guard let codexLoginError, !codexLoginError.isEmpty else {
            return codexStatus
        }

        var nextStatus = codexStatus
        if (nextStatus["connected"] as? Bool) != true {
            nextStatus["error"] = codexLoginError
        }
        return nextStatus
    }

    private func fetchExtensionEnabled() async -> Bool? {
        await withCheckedContinuation { continuation in
            SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionBundleIdentifier) { state, error in
                guard error == nil else {
                    continuation.resume(returning: nil)
                    return
                }

                continuation.resume(returning: state?.isEnabled)
            }
        }
    }

    private func appleIntelligenceState() -> (available: Bool, availability: String) {
        let model = SystemLanguageModel.default
        return (model.isAvailable, availabilityDescription(model.availability))
    }

    private func availabilityDescription(_ availability: SystemLanguageModel.Availability) -> String {
        switch availability {
        case .available:
            return "available"
        case .unavailable(.appleIntelligenceNotEnabled):
            return "Apple Intelligence is not enabled"
        case .unavailable(.deviceNotEligible):
            return "this Mac does not support Apple Intelligence"
        case .unavailable(.modelNotReady):
            return "the on-device model is not ready yet"
        @unknown default:
            return "unknown availability"
        }
    }
}
