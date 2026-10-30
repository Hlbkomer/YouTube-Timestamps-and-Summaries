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
ZIP_PATH="${ZIP_PATH:-$ARTIFACTS_PATH/Timestamps-and-Summaries-for-YT.zip}"
NOTARY_ZIP_PATH="${NOTARY_ZIP_PATH:-$BUILD_ROOT/notarization-upload.zip}"
NOTARIZE="${NOTARIZE:-0}"
NOTARY_PROFILE="${NOTARY_PROFILE:-}"
CLEAN="${CLEAN:-1}"
ALLOW_PROVISIONING_UPDATES="${ALLOW_PROVISIONING_UPDATES:-1}"
xcodebuild_provisioning_flag=""

if [[ "$ALLOW_PROVISIONING_UPDATES" == "1" ]]; then
    xcodebuild_provisioning_flag="-allowProvisioningUpdates"
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
        ${xcodebuild_provisioning_flag:+"$xcodebuild_provisioning_flag"} \
        "${build_action[@]}"
}

export_app() {
    xcodebuild \
        -exportArchive \
        -archivePath "$ARCHIVE_PATH" \
        -exportPath "$EXPORT_PATH" \
        -exportOptionsPlist "$EXPORT_OPTIONS_PATH" \
        ${xcodebuild_provisioning_flag:+"$xcodebuild_provisioning_flag"}
}

find_exported_app() {
    find "$EXPORT_PATH" -maxdepth 1 -name "*.app" -print -quit
}

zip_app() (
    local app_path="$1"
    local app_name
    local staging_path

    app_name="${app_path##*/}"
    staging_path="$(mktemp -d "$BUILD_ROOT/zip-staging.XXXXXX")"
    trap 'rm -rf "$staging_path"' EXIT

    ditto "$app_path" "$staging_path/$app_name"
    ln -s "/Applications" "$staging_path/Applications"

    rm -f "$ZIP_PATH"
    ditto -c -k --norsrc --noextattr "$staging_path" "$ZIP_PATH"
)

zip_notarization_upload() {
    local app_path="$1"
    rm -f "$NOTARY_ZIP_PATH"
    ditto -c -k --norsrc --noextattr --keepParent "$app_path" "$NOTARY_ZIP_PATH"
}

verify_release_archive() (
    local source_app_path="$1"
    local app_name
    local extracted_app_path
    local applications_shortcut

    app_name="${source_app_path##*/}"
    # Keep verification outside cloud-managed project folders, whose providers
    # can attach Finder metadata to extracted apps and invalidate strict checks.
    # EXIT trap inputs stay in this subshell: Bash can clear function locals
    # before running an error-exit trap.
    verification_path="$(mktemp -d "${TMPDIR:-/tmp}/yts-release-verify.XXXXXX")"
    verification_app_path="$verification_path/$app_name"
    # Gatekeeper can register the extracted host even when it is never launched.
    # Remove that registration before deleting the temporary verification copy.
    trap '/System/Library/Frameworks/CoreServices.framework/Versions/Current/Frameworks/LaunchServices.framework/Versions/Current/Support/lsregister -u "$verification_app_path" >/dev/null 2>&1 || true; rm -rf "$verification_path"' EXIT

    ditto -x -k "$ZIP_PATH" "$verification_path"
    extracted_app_path="$verification_app_path"
    applications_shortcut="$verification_path/Applications"

    [[ -d "$extracted_app_path" ]] || {
        echo "Release zip is missing $app_name" >&2
        exit 1
    }
    [[ -L "$applications_shortcut" ]] || {
        echo "Release zip is missing the Applications shortcut" >&2
        exit 1
    }
    [[ "$(readlink "$applications_shortcut")" == "/Applications" ]] || {
        echo "Applications shortcut does not target /Applications" >&2
        exit 1
    }

    codesign --verify --deep --strict --verbose=2 "$extracted_app_path"

    if [[ "$NOTARIZE" == "1" ]]; then
        xcrun stapler validate "$extracted_app_path"
        spctl --assess --type execute --verbose=4 "$extracted_app_path"
    fi
)

main() {
    need_cmd xcodebuild
    need_cmd xcrun
    need_cmd ditto
    need_cmd ln
    need_cmd mktemp
    need_cmd readlink
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

    echo "==> Informational Gatekeeper assessment before notarization"
    if ! spctl -a -vv "$app_path"; then
        echo "Gatekeeper rejection is expected before notarization; continuing." >&2
    fi

    if [[ "$NOTARIZE" == "1" ]]; then
        echo "==> Building app-only notarization upload"
        zip_notarization_upload "$app_path"

        echo "==> Submitting app-only zip for notarization"
        xcrun notarytool submit "$NOTARY_ZIP_PATH" --keychain-profile "$NOTARY_PROFILE" --wait
        rm -f "$NOTARY_ZIP_PATH"

        echo "==> Stapling notarization ticket"
        xcrun stapler staple "$app_path"
        xcrun stapler validate "$app_path"

        echo "==> Rebuilding zip artifact after stapling"
        zip_app "$app_path"

        echo "==> Gatekeeper assessment after notarization"
        spctl -a -vv "$app_path"
    fi

    echo "==> Verifying extracted release zip"
    verify_release_archive "$app_path"

    echo
    echo "Release build complete."
    echo "Archive:   $ARCHIVE_PATH"
    echo "App:       $app_path"
    echo "Artifact:  $ZIP_PATH"
}

main "$@"
