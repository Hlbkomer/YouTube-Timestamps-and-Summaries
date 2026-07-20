//
//  SharedCredentialStore.swift
//  Timestamps & Summaries for YT (Shared)
//

import Foundation
import Security

enum SharedCredentialStoreError: LocalizedError {
    case keychain(OSStatus)
    case invalidData

    var errorDescription: String? {
        switch self {
        case .keychain(let status):
            let message = SecCopyErrorMessageString(status, nil) as String?
            return message ?? "Keychain request failed with status \(status)."
        case .invalidData:
            return "The saved sign-in credential is invalid."
        }
    }
}

struct SharedCredentialStore {
    static let accessGroup = "3PHWBNH53Z.Matuko.YouTube-Timestamps-and-Summaries.shared"
    static let usesDataProtectionKeychain = true

    let service: String

    func string(for account: String) throws -> String? {
        var query = baseQuery(account: account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound {
            return nil
        }
        guard status == errSecSuccess else {
            throw SharedCredentialStoreError.keychain(status)
        }
        guard
            let data = result as? Data,
            let value = String(data: data, encoding: .utf8)
        else {
            throw SharedCredentialStoreError.invalidData
        }
        return value
    }

    func set(_ value: String, for account: String) throws {
        let data = Data(value.utf8)
        let query = baseQuery(account: account)
        let update: [String: Any] = [
            kSecValueData as String: data,
        ]

        let updateStatus = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if updateStatus == errSecSuccess {
            return
        }
        guard updateStatus == errSecItemNotFound else {
            throw SharedCredentialStoreError.keychain(updateStatus)
        }

        var item = query
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        let addStatus = SecItemAdd(item as CFDictionary, nil)
        guard addStatus == errSecSuccess else {
            throw SharedCredentialStoreError.keychain(addStatus)
        }
    }

    func remove(_ account: String) throws {
        let status = SecItemDelete(baseQuery(account: account) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw SharedCredentialStoreError.keychain(status)
        }
    }

    /// Moves a legacy access/refresh token pair out of shared preferences.
    /// Preferences are cleared only after both credentials are safely present
    /// in Keychain, so an interrupted migration cannot sign the user out.
    func migrateLegacyPair(
        from defaults: UserDefaults,
        accessTokenKey: String,
        refreshTokenKey: String
    ) throws {
        let legacyAccessToken = defaults.string(forKey: accessTokenKey)
        let legacyRefreshToken = defaults.string(forKey: refreshTokenKey)
        guard legacyAccessToken != nil || legacyRefreshToken != nil else {
            return
        }

        if try string(for: accessTokenKey) == nil,
           let legacyAccessToken,
           !legacyAccessToken.isEmpty {
            try set(legacyAccessToken, for: accessTokenKey)
        }
        if try string(for: refreshTokenKey) == nil,
           let legacyRefreshToken,
           !legacyRefreshToken.isEmpty {
            try set(legacyRefreshToken, for: refreshTokenKey)
        }

        if try string(for: accessTokenKey) != nil,
           try string(for: refreshTokenKey) != nil {
            defaults.removeObject(forKey: accessTokenKey)
            defaults.removeObject(forKey: refreshTokenKey)
        }
    }

    private func baseQuery(account: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            // SecItem defaults to the legacy file-based Keychain on macOS.
            // Access groups only govern shared app/extension access in the
            // data-protection Keychain; without this flag macOS uses per-item
            // ACLs and can display a login-Keychain password prompt.
            kSecUseDataProtectionKeychain as String: Self.usesDataProtectionKeychain,
            kSecAttrAccessGroup as String: Self.accessGroup,
            kSecAttrSynchronizable as String: false,
        ]
    }
}
