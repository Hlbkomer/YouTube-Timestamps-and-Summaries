//
//  AppDelegate.swift
//  Timestamps & Summaries for YT
//
//  Created by Matus Vojtek on 21/04/2026.
//

import Cocoa

@main
class AppDelegate: NSObject, NSApplicationDelegate {

    func applicationDidFinishLaunching(_ notification: Notification) {
        installEditMenuIfNeeded()
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        showMainWindow()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }

    private func showMainWindow() {
        NSApp.activate(ignoringOtherApps: true)
        for window in NSApp.windows {
            window.makeKeyAndOrderFront(nil)
        }
    }

    private func installEditMenuIfNeeded() {
        guard let mainMenu = NSApp.mainMenu else {
            return
        }

        if mainMenu.items.contains(where: { $0.title == "Edit" }) {
            return
        }

        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(menuItem(title: "Undo", action: Selector(("undo:")), keyEquivalent: "z"))
        editMenu.addItem(menuItem(title: "Redo", action: Selector(("redo:")), keyEquivalent: "Z", modifierMask: [.command, .shift]))
        editMenu.addItem(.separator())
        editMenu.addItem(menuItem(title: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x"))
        editMenu.addItem(menuItem(title: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c"))
        editMenu.addItem(menuItem(title: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v"))
        editMenu.addItem(.separator())
        editMenu.addItem(menuItem(title: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a"))

        let editMenuItem = NSMenuItem(title: "Edit", action: nil, keyEquivalent: "")
        editMenuItem.submenu = editMenu
        mainMenu.insertItem(editMenuItem, at: min(1, mainMenu.items.count))
    }

    private func menuItem(
        title: String,
        action: Selector,
        keyEquivalent: String,
        modifierMask: NSEvent.ModifierFlags = [.command]
    ) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: keyEquivalent)
        item.keyEquivalentModifierMask = modifierMask
        item.target = nil
        return item
    }

}
