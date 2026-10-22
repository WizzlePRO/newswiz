# NewsWiz for iPhone and iPad

A native SwiftUI client for your NewsWiz server, with features a normal news feed doesn't have:

- **Reading Live Activity.** Start an article and your progress shows on the Lock Screen and in the Dynamic Island: outlet, lean, a progress bar and minutes left. Tap it and the article reopens at the exact paragraph you stopped on. A checkmark appears when you finish.
- **Briefing Live Activity.** Tap "Track this briefing on my Lock Screen" on Catch up and you get "12 of 40" plus how many left, center and right stories you've opened. Watch your own balance as you read.
- **Continue Reading widget.** Home Screen (small or medium) and Lock Screen (circular gauge or rectangular). Shows your in-progress articles with progress and minutes left. Tap to resume.
- **Catch-up widget.** How many new stories this cycle, with a left/center/right balance bar. The medium size has an **I'm caught up** button that works without opening the app.
- **"How far did you get?"** When you come back from an article on a publisher's site, the app asks, and Saved remembers.
- **Siri and Shortcuts.** "Continue reading in NewsWiz", "Catch me up with NewsWiz", "I'm caught up in NewsWiz".
- **Handoff.** Reading on your iPhone? Your Mac or iPad offers the same article in Safari, at the same server.
- **Synced everywhere.** Progress is saved to your server per paragraph, so the web app, iPhone and iPad all resume in the same place.

Requires iOS 18 or later. It talks to the API described in the main README, so deploy the server first (see `docs/deploy-railway.md`).

---

## Set up in Xcode (exact steps)

### 1. Install the tools (once)

1. Install **Xcode** from the Mac App Store (Xcode 26 or newer). Open it once, accept the license, and let it install the **iOS** platform when prompted (or Xcode › Settings › Components › iOS).
2. Install **Homebrew** if you don't have it. Paste the command from <https://brew.sh> into Terminal.
3. Install **XcodeGen**, which builds the Xcode project from `project.yml`:

   ```sh
   brew install xcodegen
   ```

4. Sign in to Xcode with your Apple ID: Xcode › Settings › **Accounts** › **+** › Apple ID.

   Use an **Apple Developer Program** membership ($99/year) if you have one. With a free Apple ID, apps on your phone expire after 7 days, and some capabilities may not be available to free accounts. That includes App Groups, which the widgets use to share data. If Xcode shows an App Groups error under a free account, that's why.

### 2. Get the code and generate the project

```sh
git clone https://github.com/WizzlePRO/newswiz
cd newswiz/ios
xcodegen generate
open NewsWiz.xcodeproj
```

Re-run `xcodegen generate` whenever `project.yml` changes or you add or remove Swift files. The `.xcodeproj` is generated, so it isn't committed.

### 3. Signing (once per target)

In Xcode's left sidebar, click the blue **NewsWiz** project icon. Then for **each** of the two targets, **NewsWiz** and **NewsWizWidgets**:

1. Select the target › **Signing & Capabilities**.
2. Check **Automatically manage signing**.
3. **Team:** choose your team (your name, or your company).
4. Under **App Groups**, make sure `group.com.wizzlepro.newswiz` is listed and checked. If it's red, click the refresh icon next to it. Xcode registers it for your team.

If Xcode says the bundle identifier is taken, someone else has registered `com.wizzlepro.newswiz`. Pick your own prefix, for example `com.yourname`, and replace it in:

- `project.yml`: `bundleIdPrefix`, both `PRODUCT_BUNDLE_IDENTIFIER`s, and both `com.apple.security.application-groups` entries
- `Shared/Shared.swift`: `Shared.appGroup`

Then run `xcodegen generate` again.

### 4. Run in the Simulator

1. In the toolbar's run destination menu, choose an iPhone simulator (for example **iPhone 17 Pro**).
2. Press **⌘R**.
3. On the sign-in screen, enter your server address (like `https://web-production-1234.up.railway.app`) and your `APP_PASSPHRASE`.

To see the Live Activity in the Simulator, open a free article (any outlet with the green **Free** badge), scroll partway, then lock the Simulator with **⌘L**.

### 5. Run on your iPhone

1. Connect the iPhone with a cable and tap **Trust** on the phone.
2. On the phone, turn on **Settings › Privacy & Security › Developer Mode**. The phone restarts.
3. Choose your iPhone as the run destination in Xcode and press **⌘R**.
4. With a free account, the first launch needs **Settings › General › VPN & Device Management** › your Apple ID › **Trust**.

### 6. Try the special features

| Feature | How |
|---|---|
| Reading Live Activity | Open a **Free** article, scroll, then lock your phone or swipe home. On iPhone 14 Pro and newer it also shows in the Dynamic Island. |
| Resume from the Lock Screen | Tap the Live Activity. The article reopens at your paragraph. |
| Briefing Live Activity | Catch up › **Track this briefing on my Lock Screen**, then open some stories. |
| Home Screen widgets | Long-press the Home Screen › **Edit** › **Add Widget** › NewsWiz › Continue Reading / Catch up. |
| Lock Screen widgets | Long-press the Lock Screen › **Customize** › Lock Screen › add NewsWiz widgets. |
| Caught-up button | On the medium **Catch up** widget. |
| Siri | "Continue reading in NewsWiz" or "Catch me up with NewsWiz". |
| Handoff | Open an article on the iPhone; on a Mac signed in to the same Apple ID, look for the NewsWiz/Safari icon in the Dock. |
| Publisher articles | Open a non-free article (it opens in Safari). Come back, and the app asks how far you got. |

If Live Activities don't appear: check **Settings › NewsWiz › Live Activities** is on, and **Settings › Face ID & Passcode › Allow Access When Locked › Live Activities**.

---

## Project layout

```
project.yml           XcodeGen spec: targets, App Group, URL scheme, Live Activities, Handoff
App/                  The app target
  NewsWizApp.swift    Entry point, deep links (newswiz://read/123), Handoff
  Store/AppModel      Sign-in, briefing, saved list, widget snapshot
  Live/               Starts/updates/ends both Live Activities
  Views/              Catch up, Latest, Saved, Settings, Reader (WKWebView + progress script)
  Intents/            Siri / Shortcuts
Widgets/              Widget extension: Continue Reading, Catch up, both Live Activity UIs
Shared/               Compiled into both targets: API client, models, activity attributes,
                      App Group settings, the "I'm caught up" intent
```

## How reading position works

The server tags every paragraph of a free article with `data-block="N"`. The reader's script reports two things: how far the bottom of the screen has moved through the article, and the topmost visible paragraph. Both are saved to the server 1.5 seconds after you stop scrolling, and again when you leave. Resuming scrolls to that paragraph, so your place survives a different font size or a different device. Progress only moves forward from scrolling. Reaching 97% marks the article finished.
