//
//  RemoteModelCatalogService.swift
//  Timestamps & Summaries for YT
//

import Foundation

struct RemoteModelCatalogResult {
    let modelOptions: [[String: String]]
    let excludedModelIDs: Set<String>
    let excludedModelIDPrefixes: [String]

    func excludes(_ modelID: String) -> Bool {
        excludedModelIDs.contains(modelID)
            || excludedModelIDPrefixes.contains { modelID.hasPrefix($0) }
    }
}

actor RemoteModelCatalogService {
    private let catalogURL = URL(string: "https://raw.githubusercontent.com/Hlbkomer/YouTube-Timestamps-and-Summaries/main/docs/model-catalog.json")!
    private let cacheDuration: TimeInterval = 60 * 60
    private let failureRetryDelay: TimeInterval = 15 * 60

    private var cachedCatalog: CachedCatalog?
    private var retryAfter: Date?

    private struct CachedCatalog {
        let loadedAt: Date
        let catalog: Catalog
    }

    private struct Catalog: Decodable {
        let providers: [String: ProviderCatalog]
    }

    private struct ProviderCatalog: Decodable {
        let models: [Model]
        let excludedModelIDs: [String]?
        let excludedModelIDPrefixes: [String]?
    }

    private struct Model: Decodable {
        let id: String
        let label: String
        let enabled: Bool?
    }

    func modelCatalog(for providerID: String) async -> RemoteModelCatalogResult? {
        do {
            let catalog = try await loadCatalog()
            guard let providerCatalog = catalog.providers[providerID] else {
                return nil
            }

            let options = providerCatalog.models.compactMap { model -> [String: String]? in
                guard
                    model.enabled != false,
                    GenerationSettings.isUsableModelID(model.id, providerID: providerID)
                else {
                    return nil
                }
                let modelID = GenerationSettings.normalizedModelID(model.id, providerID: providerID)
                return [
                    "id": modelID,
                    "label": model.label,
                ]
            }

            return RemoteModelCatalogResult(
                modelOptions: options,
                excludedModelIDs: Set(providerCatalog.excludedModelIDs ?? []),
                excludedModelIDPrefixes: providerCatalog.excludedModelIDPrefixes ?? []
            )
        } catch {
            return nil
        }
    }

    private func loadCatalog() async throws -> Catalog {
        if let cachedCatalog, Date().timeIntervalSince(cachedCatalog.loadedAt) < cacheDuration {
            return cachedCatalog.catalog
        }
        if let retryAfter, Date() < retryAfter {
            throw URLError(.cannotLoadFromNetwork)
        }

        var request = URLRequest(url: catalogURL)
        request.httpMethod = "GET"
        request.timeoutInterval = 8
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("TimestampsSummariesForYT/1.0", forHTTPHeaderField: "User-Agent")

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                throw URLError(.badServerResponse)
            }

            let catalog = try JSONDecoder().decode(Catalog.self, from: data)
            retryAfter = nil
            cachedCatalog = CachedCatalog(loadedAt: Date(), catalog: catalog)
            return catalog
        } catch {
            retryAfter = Date().addingTimeInterval(failureRetryDelay)
            throw error
        }
    }
}
