# Timeline history audit — October 18, 2026

## Subsequent product decision

After this audit, the user explicitly requested hiding Timeline. The integrated sidebar now hides the native Timeline chip and keeps Transcript visible. Cleanup restores the original native display; Timeline recognition and lifecycle handling remain for compatibility. The findings below describe the historical state before that change.

## Historical finding

The inspected code, documentation, and chats consistently retain YouTube's native Timeline tab when YouTube provides it. No explicit decision or tab-hiding rule removing Timeline was found in this audit. At the time of the audit, Timeline behavior had not been changed.

The historical hiding changes concern the extension's content host and competing engagement panels during native-tab handoff. A synthetic fallback also omitted Timeline when there was no native Timeline surface to reuse. Neither is a policy to hide an available Timeline button.

## Chat evidence

### “Chapters integration”

Chat ID: `019f03b2-1397-7291-b11e-68fc63d8a009`.

The tab-order request in turn `019f1fec-1c9b-7bd1-b9ee-b15479202c37` explicitly proposed:

> Chapters / Summary / Transcript / Timeline
>
> I'm not sure why Timeline is on some videos and not on others. we can show it if it's there and not show it if it's not there.

The assistant reported implementing this in commit `7374596` (**Stabilize native panel tab order**, July 2, 2026). The commit adds `chapters`, `summary`, `transcript`, `timeline` in that order.

Subsequent reports describe broken Timeline switching: a blank body, disappearing tabs, competing sidebars, and reopening after Close. The fixes were:

- `a9f1ae8` — **Keep native panel stable on Timeline**, July 6.
- `a200310` — **Smooth Timeline native tab switching**, July 7.
- `dcd5a10` — **Restore native panels before Timeline handoff**, July 7.
- `91ba995` — **Polish native timeline handoff**, July 7.
- `800d670` — **Respect native timeline surface**, July 7.

In particular, `91ba995` hides the extension's own content host when a YouTube-owned tab takes over, retaining its shadow DOM. `800d670` restores native elements and avoids forcing the original parent panel open while Timeline is selected. These changes preserve Timeline's native UI.

### “Fix chapter integration and Safari”

Chat ID: `019f4b02-ea79-7ac1-9342-bdb48b0f695d`.

- In turn `019f742c-9de1-7460-a05b-3a1c3bee70f4`, the user asked whether the repaired native-tab behavior also works on videos with Timeline. The assistant confirmed shared Transcript/Timeline ownership and styling. This was July 18, 2026.
- In turn `019f5921-0fd7-7f20-8e71-25d4fb08573d`, tabs arriving late during navigation were treated as a bug to fix, with Chapters/Summary required to appear alongside Transcript/Timeline.
- On July 20, 2026 at 11:43 Europe/Bratislava, turn `019f7ee9-03dc-7bd0-9133-54a51300aebe` says: “Timeline remains absent because YouTube provides no native Timeline surface in this case.” It described a subtitle-backed synthetic panel with Chapters, Summary, and Transcript.

## Code and documentation evidence

The audit inspected 94 available commit snapshots, including 42 unreachable commits retained locally from earlier branch work, and 56 unique `content.js`/`native-panel.js` blobs. The two historical `shouldHideNativeOwnedTab()` policies both target only `kind === "chapters"`:

1. Hide native Chapters when the generated Chapters override replaces it.
2. Also hide native Chapters when importing YouTube chapters or while chapter-source discovery is pending.

Neither policy targets Timeline. The current controller also retains Timeline in `NATIVE_PANEL_TAB_ORDER`.

Commit `144f9c6` (**Document native panel v1.0.6 behavior**) records that Timeline remains native, native content is restored on selection, and resync must avoid forcing `In this video` visible while Timeline owns the surface.

The current [native-panel implementation notes](native-panel-integration.md) say Timeline is shown only when YouTube provides it and retain the native-tab round-trip test matrix. Current architecture notes agree.

## Scope

Relevant archived chats inspected include “Chapters integration”, “Fix chapter integration and Safari”, “Fix tweaks and bugs”, “Future-proof AI integrations”, “Fix Apple Intelligence summary leaks”, “Find ChatGPT Luna reasoning”, “Explore Claude Gemini subscriptions”, “Fix generated model label”, and “Tweaks and debugs”. This finding is limited to the available repository objects and inspected chat history; it does not claim access to deleted or unavailable experiments.
