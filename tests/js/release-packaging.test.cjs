const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const repositoryRoot = path.resolve(__dirname, "../..");
const releaseScriptPath = path.join(repositoryRoot, "scripts/build-release.sh");
const releaseScriptSource = fs.readFileSync(releaseScriptPath, "utf8");

test("release build arguments work with provisioning updates enabled or disabled", () => {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "yts-release-args-"));
    try {
        const functionsPath = path.join(fixtureRoot, "release-functions.sh");
        fs.writeFileSync(functionsPath, releaseScriptSource.replace(/\nmain "\$@"\s*$/, "\n"));
        for (const enabled of ["0", "1"]) {
            const output = execFileSync("/bin/bash", ["-c", `
                source "$1"
                xcodebuild() { printf '<%s>\\n' "$@"; }
                archive_app
                export_app
            `, "release-args", functionsPath], {
                env: { ...process.env, ALLOW_PROVISIONING_UPDATES: enabled, CLEAN: "0" },
                encoding: "utf8",
            });
            assert.equal((output.match(/<-allowProvisioningUpdates>/g) || []).length, enabled === "1" ? 2 : 0);
            assert.doesNotMatch(output, /^<>$/m, "xcodebuild must not receive an empty argument");
            assert.match(output, /<archive>/);
            assert.match(output, /<-exportArchive>/);
        }
    } finally {
        fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
});

test("release packaging keeps the public shortcut out of the notarization upload", () => {
    execFileSync("/bin/bash", ["-n", releaseScriptPath]);

    assert.match(
        releaseScriptSource,
        /ln -s "\/Applications" "\$staging_path\/Applications"/,
        "the public archive staging directory should contain an Applications shortcut"
    );
    assert.match(
        releaseScriptSource,
        /ditto -c -k --norsrc --noextattr "\$staging_path" "\$ZIP_PATH"/,
        "the public archive should package the staging directory contents"
    );
    assert.match(
        releaseScriptSource,
        /notarytool submit "\$NOTARY_ZIP_PATH"/,
        "notarization should use the app-only upload archive"
    );
    assert.doesNotMatch(
        releaseScriptSource,
        /notarytool submit "\$ZIP_PATH"/,
        "the public archive with its Applications shortcut must not be submitted to Apple"
    );
    assert.match(
        releaseScriptSource,
        /ditto -x -k "\$ZIP_PATH" "\$verification_path"/,
        "the completed public archive should be extracted for verification"
    );
    assert.match(
        releaseScriptSource,
        /codesign --verify --deep --strict --verbose=2 "\$extracted_app_path"/,
        "verification should cover the extracted app rather than only the export"
    );
    assert.match(
        releaseScriptSource,
        /readlink "\$applications_shortcut"/,
        "verification should confirm the Applications shortcut target"
    );
    assert.match(
        releaseScriptSource,
        /xcrun stapler validate "\$extracted_app_path"/,
        "a notarized archive should retain its stapled ticket after extraction"
    );
    assert.match(
        releaseScriptSource,
        /spctl --assess --type execute --verbose=4 "\$extracted_app_path"/,
        "Gatekeeper should assess the extracted public artifact"
    );
});

test("failed archive verification still removes its temporary app", () => {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "yts-release-cleanup-"));
    try {
        const functionsPath = path.join(fixtureRoot, "release-functions.sh");
        fs.writeFileSync(functionsPath, releaseScriptSource.replace(/\nmain "\$@"\s*$/, "\n"));
        const result = spawnSync("/bin/bash", ["-c", `
            source "$1"
            ditto() {
                mkdir -p "$4/Timestamps & Summaries for YT.app"
                ln -s /Applications "$4/Applications"
            }
            codesign() { return 42; }
            verify_release_archive '/unused/Timestamps & Summaries for YT.app'
        `, "release-cleanup", functionsPath], {
            env: { ...process.env, TMPDIR: fixtureRoot, NOTARIZE: "0" },
            encoding: "utf8",
        });
        assert.equal(result.status, 42, result.stderr);
        assert.doesNotMatch(result.stderr, /unbound variable/);
        assert.deepEqual(fs.readdirSync(fixtureRoot).filter((name) => name.startsWith("yts-release-verify.")), []);
    } finally {
        fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
});

test("release archive extracts the app and Applications shortcut at its root", {
    skip: process.platform !== "darwin"
}, () => {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "yts-release-zip-"));

    try {
        const stagingPath = path.join(fixtureRoot, "staging");
        const appPath = path.join(stagingPath, "Timestamps & Summaries for YT.app");
        const extractedPath = path.join(fixtureRoot, "extracted");
        const zipPath = path.join(fixtureRoot, "release.zip");

        fs.mkdirSync(path.join(appPath, "Contents"), { recursive: true });
        fs.writeFileSync(path.join(appPath, "Contents", "fixture.txt"), "fixture");
        fs.symlinkSync("/Applications", path.join(stagingPath, "Applications"));

        execFileSync("ditto", [
            "-c", "-k", "--norsrc", "--noextattr", stagingPath, zipPath
        ]);
        fs.mkdirSync(extractedPath);
        execFileSync("ditto", ["-x", "-k", zipPath, extractedPath]);

        assert.equal(
            fs.readFileSync(path.join(
                extractedPath,
                "Timestamps & Summaries for YT.app",
                "Contents",
                "fixture.txt"
            ), "utf8"),
            "fixture"
        );

        const applicationsShortcut = path.join(extractedPath, "Applications");
        assert.equal(fs.lstatSync(applicationsShortcut).isSymbolicLink(), true);
        assert.equal(fs.readlinkSync(applicationsShortcut), "/Applications");
    } finally {
        fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
});
