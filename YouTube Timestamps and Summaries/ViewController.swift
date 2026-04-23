//
//  ViewController.swift
//  YouTube Timestamps and Summaries
//
//  Created by Matus Vojtek on 21/04/2026.
//

import Cocoa
import SafariServices
import WebKit

let extensionBundleIdentifier = "Matuko.YouTube-Timestamps-and-Summaries.Extension"

final class ViewController: NSViewController, WKNavigationDelegate, WKScriptMessageHandler {

    @IBOutlet private var webView: WKWebView!

    private let store = SharedGeminiStore.shared
    private var hasSizedWindow = false
    private var isSigningIn = false
    private var statusMessage: String?

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
        webView.loadFileURL(
            Bundle.main.url(forResource: "Main", withExtension: "html")!,
            allowingReadAccessTo: Bundle.main.resourceURL!
        )
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
        let fixedSize = NSSize(width: 760, height: 860)
        window.setContentSize(fixedSize)
        window.minSize = fixedSize
        window.maxSize = fixedSize
        window.center()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        Task {
            await pushState()
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let action = body["action"] as? String else {
            return
        }

        switch action {
        case "ready", "refreshState":
            Task {
                await pushState()
            }

        case "saveConfig":
            guard !store.usesBundledConfig else {
                Task {
                    await pushState(message: "This build already includes the Google Cloud setup.")
                }
                return
            }

            let clientID = (body["clientID"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let clientSecret = (body["clientSecret"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let projectID = (body["projectID"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let newConfig = GeminiOAuthConfig(clientID: clientID, clientSecret: clientSecret, projectID: projectID)
            let previousConfig = store.config

            store.config = newConfig
            if previousConfig != newConfig {
                store.clearToken()
            }

            Task {
                await pushState(message: "Gemini setup values saved.")
            }

        case "savePrompts":
            let timestampsPrompt = (body["timestampsPrompt"] as? String ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            let summaryPrompt = (body["summaryPrompt"] as? String ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            let selectedModel = GeminiModelOption.resolved(from: body["selectedModel"] as? String)

            store.prompts = GeminiPromptConfig(
                timestamps: timestampsPrompt.isEmpty ? SharedGeminiState.defaultTimestampsPrompt : timestampsPrompt,
                summary: summaryPrompt.isEmpty ? SharedGeminiState.defaultSummaryPrompt : summaryPrompt
            )
            store.model = selectedModel

            Task {
                await pushState(message: "Gemini settings saved.")
            }

        case "resetPrompts":
            store.prompts = .default
            store.model = .defaultOption

            Task {
                await pushState(message: "Gemini settings reset to the defaults.")
            }

        case "startSignIn":
            Task {
                guard !isSigningIn else {
                    await pushState(message: "Google sign-in is already in progress in your browser.")
                    return
                }

                isSigningIn = true
                await pushState(message: "Opening Google sign-in in your default browser...")
                var finalMessage: String

                do {
                    try await GeminiOAuthManager.shared.signIn { [weak self] progressMessage in
                        await self?.pushState(message: progressMessage)
                    }
                    finalMessage = "Google sign-in completed."
                } catch {
                    finalMessage = error.localizedDescription
                }

                isSigningIn = false
                await pushState(message: finalMessage)
            }

        case "signOut":
            Task {
                guard GeminiOAuthManager.shared.hasSignedInUser() else {
                    await pushState(message: "There is no Google session to sign out.")
                    return
                }

                await GeminiOAuthManager.shared.signOut()
                await pushState(message: "Google access removed from this Mac.")
            }

        case "openPreferences":
            openPreferences()

        default:
            break
        }
    }

    private func openPreferences() {
        SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { [weak self] error in
            Task { @MainActor [weak self] in
                if let error {
                    await self?.pushState(message: "Safari could not open the extension settings: \(error.localizedDescription)")
                } else {
                    await self?.pushState(message: "Safari extension settings opened.")
                }
            }
        }
    }

    @objc
    private func handleAppDidBecomeActive() {
        Task {
            await pushState()
        }
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
        let config = store.config
        let prompts = store.prompts
        let usesBundledConfig = store.usesBundledConfig
        let uiConfig = usesBundledConfig ? nil : config

        return [
            "clientID": uiConfig?.clientID ?? "",
            "clientSecret": uiConfig?.clientSecret ?? "",
            "projectID": uiConfig?.projectID ?? "",
            "selectedModel": store.model.rawValue,
            "timestampsPrompt": prompts.timestamps,
            "summaryPrompt": prompts.summary,
            "isConfigured": config?.isComplete ?? false,
            "isSignedIn": GeminiOAuthManager.shared.hasSignedInUser(),
            "isSigningIn": isSigningIn,
            "usesBundledConfig": usesBundledConfig,
            "extensionEnabled": extensionEnabled as Any,
            "usesSettingsLabel": ProcessInfo.processInfo.operatingSystemVersion.majorVersion >= 13,
            "message": (message ?? statusMessage) ?? NSNull(),
        ]
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
}
