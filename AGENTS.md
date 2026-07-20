# Workspace Instructions

## Development build policy

- Use the signed **Debug** configuration for routine implementation, automated checks, and Safari testing.
- When a compile is needed during development, use Xcode's normal Run action or `xcodebuild` with `-configuration Debug`.
- Do **not** build, launch, or register a Release host during normal development. Do not run `scripts/build-release.sh`, create an archive, or use `-configuration Release` unless the user explicitly requests final release packaging, notarization, or a Release-specific investigation.
- Never keep Debug and Release host apps registered together. They share production bundle identifiers and Safari can display duplicate extension entries without making the active code clear.
- After an explicitly requested Release build on this Mac, unregister the Release host before resuming Debug Safari testing. Prefer a separate macOS account or environment for final Release validation.
- Keep normal development signing enabled. Do not use unsigned hosted test builds on the Mac where the Safari extension is enabled, because Launch Services may select the unsigned copy.

The detailed rationale and release procedure are in `RELEASING.md` under “Development Safari Testing.”
