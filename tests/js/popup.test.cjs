const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const popupSource = fs.readFileSync(path.join(
    __dirname,
    "../../YouTube Timestamps and Summaries Extension/Resources/popup.js"
), "utf8");

test("one Settings click sends exactly one native-app message", async () => {
    let clickHandler;
    let sendCount = 0;
    let closeCount = 0;
    const settingsButton = {
        disabled: false,
        addEventListener(type, listener) {
            assert.equal(type, "click");
            clickHandler = listener;
        },
    };
    const errorMessage = { hidden: true, textContent: "" };

    vm.runInNewContext(popupSource, {
        browser: {
            runtime: {
                async sendMessage(message) {
                    sendCount += 1;
                    assert.deepEqual({ ...message }, { type: "ai:openApp" });
                    return { ok: true };
                },
            },
        },
        document: {
            getElementById(id) {
                return id === "open-settings" ? settingsButton : errorMessage;
            },
        },
        window: {
            close() {
                closeCount += 1;
            },
        },
    });

    await clickHandler();

    assert.equal(sendCount, 1);
    assert.equal(closeCount, 1);
});
