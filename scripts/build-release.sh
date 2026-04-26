#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_PATH="${PROJECT_PATH:-$ROOT_DIR/YouTube Timestamps and Summaries.xcodeproj}"
SCHEME="${SCHEME:-YouTube Timestamps and Summaries}"
CONFIGURATION="${CONFIGURATION:-Release}"
TEAM_ID="${TEAM_ID:-3PHWBNH53Z}"
BUILD_ROOT="${BUILD_ROOT:-$ROOT_DIR/build/release}"
ARCHIVE_PATH="${ARCHIVE_PATH:-$BUILD_ROOT/$SCHEME.xcarchive}"
EXPORT_PATH="${EXPORT_PATH:-$BUILD_ROOT/export}"
ARTIFACTS_PATH="${ARTIFACTS_PATH:-$BUILD_ROOT/artifacts}"
EXPORT_OPTIONS_PATH="${EXPORT_OPTIONS_PATH:-$BUILD_ROOT/ExportOptions-DeveloperID.plist}"
ZIP_PATH="${ZIP_PATH:-$ARTIFACTS_PATH/$SCHEME.zip}"
NOTARIZE="${NOTARIZE:-0}"
NOTARY_PROFILE="${NOTARY_PROFILE:-}"
CLEAN="${CLEAN:-1}"
ALLOW_PROVISIONING_UPDATES="${ALLOW_PROVISIONING_UPDATES:-1}"

xcodebuild_args=()

if [[ "$ALLOW_PROVISIONING_UPDATES" == "1" ]]; then
    xcodebuild_args+=(-allowProvisioningUpdates)
fi

need_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "Missing required command: $1" >&2
        exit 1
    fi
}

write_export_options() {
    cat >"$EXPORT_OPTIONS_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>developer-id</string>
    <key>signingStyle</key>
    <string>automatic</string>
    <key>teamID</key>
    <string>$TEAM_ID</string>
</dict>
</plist>
EOF
}

archive_app() {
    local build_action=(archive)
    if [[ "$CLEAN" == "1" ]]; then
        build_action=(clean archive)
    fi

    xcodebuild \
        -project "$PROJECT_PATH" \
        -scheme "$SCHEME" \
        -configuration "$CONFIGURATION" \
        -destination "generic/platform=macOS" \
        -archivePath "$ARCHIVE_PATH" \
        DEVELOPMENT_TEAM="$TEAM_ID" \
        CODE_SIGN_STYLE=Automatic \
        "${xcodebuild_args[@]}" \
        "${build_action[@]}"
}

export_app() {
    xcodebuild \
        -exportArchive \
        -archivePath "$ARCHIVE_PATH" \
        -exportPath "$EXPORT_PATH" \
        -exportOptionsPlist "$EXPORT_OPTIONS_PATH" \
        "${xcodebuild_args[@]}"
}

find_exported_app() {
    find "$EXPORT_PATH" -maxdepth 1 -name "*.app" -print -quit
}

zip_app() {
    local app_path="$1"
    rm -f "$ZIP_PATH"
    ditto -c -k --keepParent "$app_path" "$ZIP_PATH"
}

main() {
    need_cmd xcodebuild
    need_cmd xcrun
    need_cmd ditto
    need_cmd codesign
    need_cmd spctl

    if [[ "$NOTARIZE" == "1" ]] && [[ -z "$NOTARY_PROFILE" ]]; then
        echo "NOTARIZE=1 requires NOTARY_PROFILE to be set." >&2
        exit 1
    fi

    mkdir -p "$BUILD_ROOT" "$ARTIFACTS_PATH"

    write_export_options

    echo "==> Archiving $SCHEME"
    archive_app

    echo "==> Exporting Developer ID app"
    export_app

    local app_path
    app_path="$(find_exported_app)"
    if [[ -z "$app_path" || ! -d "$app_path" ]]; then
        echo "Could not find exported .app in $EXPORT_PATH" >&2
        exit 1
    fi

    echo "==> Verifying code signature"
    codesign --verify --deep --strict --verbose=2 "$app_path"

    echo "==> Building zip artifact"
    zip_app "$app_path"

    echo "==> Gatekeeper assessment before notarization"
    spctl -a -vv "$app_path" || true

    if [[ "$NOTARIZE" == "1" ]]; then
        echo "==> Submitting zip for notarization"
        xcrun notarytool submit "$ZIP_PATH" --keychain-profile "$NOTARY_PROFILE" --wait

        echo "==> Stapling notarization ticket"
        xcrun stapler staple "$app_path"
        xcrun stapler validate "$app_path" || true

        echo "==> Rebuilding zip artifact after stapling"
        zip_app "$app_path"

        echo "==> Gatekeeper assessment after notarization"
        spctl -a -vv "$app_path" || true
    fi

    echo
    echo "Release build complete."
    echo "Archive:   $ARCHIVE_PATH"
    echo "App:       $app_path"
    echo "Artifact:  $ZIP_PATH"
}

main "$@"
