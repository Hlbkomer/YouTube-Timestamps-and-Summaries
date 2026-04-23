//
//  SharedGeminiState.swift
//  YouTube Timestamps and Summaries
//
//  Created by Codex on 21/04/2026.
//

import Foundation
import Security

enum SharedGeminiState {
    static let appGroupIdentifier = "group.Matuko.YouTube-Timestamps-and-Summaries.shared"
    static let configKey = "gemini.oauth.config"
    static let promptConfigKey = "gemini.prompt.config"
    static let modelKey = "gemini.model"
    static let tokenKey = "gemini.oauth.token"
    static let localSecretsResourceName = "LocalSecrets"
    static let bundledClientID = ""
    static let bundledClientSecret = ""
    static let bundledProjectID = ""
    static let bundledClientIDInfoKey = "BundledGeminiOAuthClientID"
    static let bundledClientSecretInfoKey = "BundledGeminiOAuthClientSecret"
    static let bundledProjectIDInfoKey = "BundledGeminiProjectID"
    static let requestedScopes = [
        "https://www.googleapis.com/auth/cloud-platform",
        "https://www.googleapis.com/auth/generative-language.retriever",
    ]
    static let defaultTimestampsPrompt = "Please create chronological timestamps for this video. No bullet points, one timestamp per line in the format MM:SS Title."
    static let defaultSummaryPrompt = "Please summarize this video."
    static let legacyDefaultTimestampsPrompts = [
        "Create chronological YouTube timestamps for this video. Return only one timestamp per line in the format MM:SS Title. Start at 00:00, keep titles short, and make the sections useful for jumping through the video."
    ]
    static let legacyDefaultSummaryPrompts = [
        "Summarize this YouTube video in concise plain text bullet points. Focus on the main ideas, useful takeaways, and any notable examples or action items. Do not use markdown, bold, italics, headings, asterisks, or numbered formatting. Return only the summary."
    ]

    static func bundledConfig(in bundle: Bundle = .main) -> GeminiOAuthConfig? {
        let localSecrets = loadLocalSecrets(in: bundle)
        let clientID = (localSecrets["clientID"] as? String
            ?? bundle.object(forInfoDictionaryKey: bundledClientIDInfoKey) as? String
            ?? bundledClientID)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let clientSecret = (localSecrets["clientSecret"] as? String
            ?? bundle.object(forInfoDictionaryKey: bundledClientSecretInfoKey) as? String
            ?? bundledClientSecret)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let projectID = (localSecrets["projectID"] as? String
            ?? bundle.object(forInfoDictionaryKey: bundledProjectIDInfoKey) as? String
            ?? bundledProjectID)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let config = GeminiOAuthConfig(clientID: clientID, clientSecret: clientSecret, projectID: projectID)
        return config.isComplete ? config : nil
    }

    private static func loadLocalSecrets(in bundle: Bundle) -> [String: Any] {
        guard
            let url = bundle.url(forResource: localSecretsResourceName, withExtension: "plist"),
            let data = try? Data(contentsOf: url),
            let object = try? PropertyListSerialization.propertyList(from: data, format: nil),
            let dictionary = object as? [String: Any]
        else {
            return [:]
        }

        return dictionary
    }
}

enum GeminiModelOption: String, CaseIterable {
    case gemini3Fast = "gemini-3-flash-preview"
    case gemini3ProPreview = "gemini-3-pro-preview"
    case gemini25Flash = "gemini-2.5-flash"
    case gemini25FlashLite = "gemini-2.5-flash-lite"

    static let defaultOption: GeminiModelOption = .gemini3Fast

    static func resolved(from rawValue: String?) -> GeminiModelOption {
        guard let rawValue else {
            return defaultOption
        }

        return GeminiModelOption(rawValue: rawValue) ?? defaultOption
    }

    var displayName: String {
        switch self {
        case .gemini3Fast:
            return "Gemini 3 Flash Preview"
        case .gemini3ProPreview:
            return "Gemini 3 Pro Preview"
        case .gemini25Flash:
            return "Gemini 2.5 Flash"
        case .gemini25FlashLite:
            return "Gemini 2.5 Flash Lite"
        }
    }
}

struct GeminiOAuthConfig: Codable, Equatable {
    var clientID: String
    var clientSecret: String
    var projectID: String

    var trimmedClientID: String {
        clientID.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var trimmedClientSecret: String {
        clientSecret.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var trimmedProjectID: String {
        projectID.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var isComplete: Bool {
        !trimmedClientID.isEmpty && !trimmedClientSecret.isEmpty && !trimmedProjectID.isEmpty
    }
}

struct GeminiOAuthToken: Codable {
    var accessToken: String
    var refreshToken: String
    var scope: String
    var tokenType: String
    var expiryDate: Date

    var isUsable: Bool {
        !refreshToken.isEmpty
    }
}

struct GeminiPromptConfig: Codable, Equatable {
    var timestamps: String
    var summary: String

    var normalizedTimestamps: String {
        timestamps.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var normalizedSummary: String {
        summary.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static var `default`: GeminiPromptConfig {
        GeminiPromptConfig(
            timestamps: SharedGeminiState.defaultTimestampsPrompt,
            summary: SharedGeminiState.defaultSummaryPrompt
        )
    }
}

final class SharedGeminiStore {
    static let shared = SharedGeminiStore()

    private let defaults: UserDefaults
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()
    private let tokenKeychain = SharedGeminiTokenKeychain()
    private let clientSecretKeychain = SharedGeminiClientSecretKeychain()

    private init() {
        defaults = UserDefaults(suiteName: SharedGeminiState.appGroupIdentifier) ?? .standard
        syncBundledConfigIfNeeded()
        syncPromptDefaultsIfNeeded()
        migrateLegacyTokenIfNeeded()
    }

    var usesBundledConfig: Bool {
        SharedGeminiState.bundledConfig() != nil
    }

    var config: GeminiOAuthConfig? {
        get {
            guard let storedConfig = decode(GeminiOAuthConfig.self, forKey: SharedGeminiState.configKey) else {
                return nil
            }

            if let clientSecret = clientSecretKeychain.readSecret(), !clientSecret.isEmpty {
                return GeminiOAuthConfig(
                    clientID: storedConfig.clientID,
                    clientSecret: clientSecret,
                    projectID: storedConfig.projectID
                )
            }

            let legacySecret = storedConfig.trimmedClientSecret
            guard !legacySecret.isEmpty else {
                return storedConfig
            }

            if clientSecretKeychain.writeSecret(legacySecret) {
                let sanitizedConfig = GeminiOAuthConfig(
                    clientID: storedConfig.clientID,
                    clientSecret: "",
                    projectID: storedConfig.projectID
                )
                encode(sanitizedConfig, forKey: SharedGeminiState.configKey)
            }

            return storedConfig
        }
        set {
            guard let newValue else {
                clientSecretKeychain.deleteItem()
                encode(nil as GeminiOAuthConfig?, forKey: SharedGeminiState.configKey)
                return
            }

            let clientSecret = newValue.trimmedClientSecret
            let sanitizedConfig = GeminiOAuthConfig(
                clientID: newValue.clientID,
                clientSecret: "",
                projectID: newValue.projectID
            )

            if clientSecret.isEmpty {
                clientSecretKeychain.deleteItem()
                encode(sanitizedConfig, forKey: SharedGeminiState.configKey)
                return
            }

            if clientSecretKeychain.writeSecret(clientSecret) {
                encode(sanitizedConfig, forKey: SharedGeminiState.configKey)
                return
            }

            encode(newValue, forKey: SharedGeminiState.configKey)
        }
    }

    var token: GeminiOAuthToken? {
        get {
            if let data = tokenKeychain.readData(),
               let token = try? decoder.decode(GeminiOAuthToken.self, from: data) {
                return token
            }

            guard
                let legacyData = legacyTokenData(),
                let token = try? decoder.decode(GeminiOAuthToken.self, from: legacyData)
            else {
                return nil
            }

            if tokenKeychain.writeData(legacyData) {
                deleteLegacyToken()
            }

            return token
        }
        set {
            guard let newValue else {
                clearToken()
                return
            }

            guard let data = try? encoder.encode(newValue) else {
                clearToken()
                return
            }

            if tokenKeychain.writeData(data) {
                deleteLegacyToken()
            }
        }
    }

    var prompts: GeminiPromptConfig {
        get {
            decode(GeminiPromptConfig.self, forKey: SharedGeminiState.promptConfigKey) ?? .default
        }
        set {
            encode(newValue, forKey: SharedGeminiState.promptConfigKey)
        }
    }

    var model: GeminiModelOption {
        get {
            GeminiModelOption.resolved(from: defaults.string(forKey: SharedGeminiState.modelKey))
        }
        set {
            defaults.set(newValue.rawValue, forKey: SharedGeminiState.modelKey)
        }
    }

    func clearToken() {
        deleteLegacyToken()
        tokenKeychain.deleteItem()
    }

    private func encode<T: Encodable>(_ value: T?, forKey key: String) {
        guard let value else {
            defaults.removeObject(forKey: key)
            return
        }

        if let data = try? encoder.encode(value) {
            defaults.set(data, forKey: key)
        }
    }

    private func decode<T: Decodable>(_ type: T.Type, forKey key: String) -> T? {
        guard let data = defaults.data(forKey: key) else {
            return nil
        }

        return try? decoder.decode(type, from: data)
    }

    private func resolvedStoredConfig() -> GeminiOAuthConfig? {
        guard let storedConfig = decode(GeminiOAuthConfig.self, forKey: SharedGeminiState.configKey) else {
            return nil
        }

        if let clientSecret = clientSecretKeychain.readSecret(), !clientSecret.isEmpty {
            return GeminiOAuthConfig(
                clientID: storedConfig.clientID,
                clientSecret: clientSecret,
                projectID: storedConfig.projectID
            )
        }

        return storedConfig
    }

    private func legacyTokenData() -> Data? {
        defaults.data(forKey: SharedGeminiState.tokenKey)
    }

    private func deleteLegacyToken() {
        defaults.removeObject(forKey: SharedGeminiState.tokenKey)
    }

    private func migrateLegacyTokenIfNeeded() {
        guard tokenKeychain.readData() == nil, let legacyData = legacyTokenData() else {
            return
        }

        if tokenKeychain.writeData(legacyData) {
            deleteLegacyToken()
        }
    }

    private func hasStoredToken() -> Bool {
        tokenKeychain.readData() != nil || legacyTokenData() != nil
    }

    private func syncBundledConfigIfNeeded() {
        guard let bundledConfig = SharedGeminiState.bundledConfig() else {
            return
        }

        let previousConfig = resolvedStoredConfig()
        guard previousConfig != bundledConfig else {
            return
        }

        config = bundledConfig
        if previousConfig != nil || hasStoredToken() {
            clearToken()
        }
    }

    private func syncPromptDefaultsIfNeeded() {
        guard let previousPrompts = decode(GeminiPromptConfig.self, forKey: SharedGeminiState.promptConfigKey) else {
            return
        }

        var updatedPrompts = previousPrompts
        let defaultPrompts = GeminiPromptConfig.default

        if previousPrompts.normalizedTimestamps.isEmpty || SharedGeminiState.legacyDefaultTimestampsPrompts.contains(previousPrompts.normalizedTimestamps) {
            updatedPrompts.timestamps = defaultPrompts.timestamps
        }

        if previousPrompts.normalizedSummary.isEmpty || SharedGeminiState.legacyDefaultSummaryPrompts.contains(previousPrompts.normalizedSummary) {
            updatedPrompts.summary = defaultPrompts.summary
        }

        guard updatedPrompts != previousPrompts else {
            return
        }

        encode(updatedPrompts, forKey: SharedGeminiState.promptConfigKey)
    }
}

private final class SharedGeminiTokenKeychain {
    private let service = "Matuko.YouTube-Timestamps-and-Summaries.GeminiOAuthToken"
    private let account = "shared-oauth-token"

    func readData() -> Data? {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        switch status {
        case errSecSuccess:
            return result as? Data
        case errSecItemNotFound:
            return nil
        default:
            print("[GeminiStore] Keychain read failed. status=\(status)")
            return nil
        }
    }

    @discardableResult
    func writeData(_ data: Data) -> Bool {
        var addQuery = baseQuery()
        addQuery[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        addQuery[kSecValueData as String] = data

        let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
        if addStatus == errSecSuccess {
            return true
        }

        guard addStatus == errSecDuplicateItem else {
            print("[GeminiStore] Keychain write failed. status=\(addStatus)")
            return false
        }

        let updateStatus = SecItemUpdate(
            baseQuery() as CFDictionary,
            [
                kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
                kSecValueData as String: data,
            ] as CFDictionary
        )

        if updateStatus == errSecSuccess {
            return true
        }

        print("[GeminiStore] Keychain update failed. status=\(updateStatus)")
        return false
    }

    func deleteItem() {
        let status = SecItemDelete(baseQuery() as CFDictionary)
        if status != errSecSuccess && status != errSecItemNotFound {
            print("[GeminiStore] Keychain delete failed. status=\(status)")
        }
    }

    private func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessGroup as String: SharedGeminiState.appGroupIdentifier,
            kSecUseDataProtectionKeychain as String: true,
        ]
    }
}

private final class SharedGeminiClientSecretKeychain {
    private let service = "Matuko.YouTube-Timestamps-and-Summaries.GeminiOAuthClientSecret"
    private let account = "shared-oauth-client-secret"

    func readSecret() -> String? {
        guard let data = readData() else {
            return nil
        }

        return String(data: data, encoding: .utf8)
    }

    @discardableResult
    func writeSecret(_ secret: String) -> Bool {
        writeData(Data(secret.utf8))
    }

    func deleteItem() {
        let status = SecItemDelete(baseQuery() as CFDictionary)
        if status != errSecSuccess && status != errSecItemNotFound {
            print("[GeminiStore] Client secret Keychain delete failed. status=\(status)")
        }
    }

    private func readData() -> Data? {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        switch status {
        case errSecSuccess:
            return result as? Data
        case errSecItemNotFound:
            return nil
        default:
            print("[GeminiStore] Client secret Keychain read failed. status=\(status)")
            return nil
        }
    }

    @discardableResult
    private func writeData(_ data: Data) -> Bool {
        var addQuery = baseQuery()
        addQuery[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        addQuery[kSecValueData as String] = data

        let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
        if addStatus == errSecSuccess {
            return true
        }

        guard addStatus == errSecDuplicateItem else {
            print("[GeminiStore] Client secret Keychain write failed. status=\(addStatus)")
            return false
        }

        let updateStatus = SecItemUpdate(
            baseQuery() as CFDictionary,
            [
                kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
                kSecValueData as String: data,
            ] as CFDictionary
        )

        if updateStatus == errSecSuccess {
            return true
        }

        print("[GeminiStore] Client secret Keychain update failed. status=\(updateStatus)")
        return false
    }

    private func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessGroup as String: SharedGeminiState.appGroupIdentifier,
            kSecUseDataProtectionKeychain as String: true,
        ]
    }
}
