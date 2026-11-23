# Find Phone

A minimal Pebble watchapp that rings your phone through the Pebble mobile app's built-in
find-my-phone plugin ([Plugins Preview](https://developer.repebble.com/guides/plugins/preview/)).
It targets the Pebble Time 2 (`emery`) and has no companion app.

## How it works

```
watch (C)  --AppMessage cmd=1/0-->  PebbleKit JS  --Pebble.invokeAction-->  built-in Find My Phone plugin
           <--ok / text / ringing--
```

- **Watch (`src/c/main.c`)**: one screen showing "Find Phone", whether the phone is connected and
  a status line. SELECT sends `cmd=1` (ring), or `cmd=0` (stop) while the phone is ringing. On
  success the watch vibrates once and shows the plugin's reply. On error it vibrates twice and
  shows `Error: <CODE>: <message>`. BACK exits.
- **PebbleKit JS (`src/pkjs/index.js`)**: the Plugins API is only reachable from PebbleKit JS.
  There is no C or Alloy API yet. The script calls
  `Pebble.invokeAction({ plugin: "00000000-0000-0000-0001-000000000008", action: "ring" | "stop", args: {} })`
  and sends the result back to the watch.

### The built-in plugin

The plugin guide doesn't document the actions. The details below come from the Pebble app's
source:
[`libpebble3/.../plugin/FindMyPhonePlugin.kt`](https://github.com/coredevices/mobileapp/blob/main/libpebble3/src/commonMain/kotlin/io/rebble/libpebblecommon/plugin/FindMyPhonePlugin.kt)
in `coredevices/mobileapp`, read on 2026-11-23:

| | |
|---|---|
| Plugin UUID | `00000000-0000-0000-0001-000000000008` ("Find My Phone") |
| Actions | `ring` ("Ringing your phone."), `stop` ("Stopped ringing your phone."). Neither takes arguments; there is no duration or sound option. |
| Auto-stop | Ringing stops by itself after **60 seconds**. Calling `ring` again restarts that timer. |
| Source | `phone/find_my_phone`, one instance `phone`, property `ringing` (boolean). **Subscribing to it starts ringing** until the subscription ends. So this app does not subscribe. |
| Permission | `FindMyPhone`, required by both actions and by the source. |

Because the app doesn't subscribe, the watch doesn't learn whether the phone stopped on its own.
It assumes ringing ends 60 s after the last successful `ring`.

## Requirements and permissions

- Pebble mobile app **1.16 or later**. In 1.16 to 1.18, turn on Settings → Plugins →
  Plugins / permissions preview. From 2.0.0 plugins are on for everyone.
- Pebble SDK **4.44 or later** and pebble-tool **5.1.0 or later**. The SDK marks the `.pbw` as
  `manifestVersion: 2`. Without that the app counts as "legacy" and every plugin call fails with
  `PERMISSION_DENIED`.
- Permission, declared in `package.json`:
  `{ "name": "FindMyPhone", "reason": "To ring your phone when you press SELECT", "required": true }`.
  The Pebble app asks about it when you install the app. You can change it later on the app's page
  in the Pebble app.

## Build and install

```sh
pebble sdk install 4.44         # once, if `pebble sdk list` shows an older SDK
pebble sdk activate 4.44
pebble build                     # -> build/pebble-find-my-ios.pbw

# Over the phone's developer connection: turn on Developer Connection in the Pebble app's
# settings; it shows the phone's IP address. Phone and computer must be on the same network.
pebble install --phone <PHONE_IP>
pebble logs --phone <PHONE_IP>   # shows each invokeAction call and its result

# Emulator: the built-in plugin isn't there, so SELECT shows PLUGIN_UNAVAILABLE (UI checks only)
pebble install --emulator emery
```

## CI and releases

CI (`.github/workflows/ci.yml`) runs `npm test` and `pebble build` on every push to `main` and
on pull requests. The built `.pbw` is attached to the run as an artifact (the file itself, not a
zip).

A GitHub release with the built `.pbw` is created automatically when a `v*` tag is pushed (see
`.github/workflows/release.yml`). The tag must match the version in `package.json`
(`v1.0.0` <-> `1.0.0`). Once that succeeds, `.github/workflows/publish-store.yml` downloads the
released `.pbw` and publishes it to the Pebble app store. It can also be started by hand for an
existing tag. Existing store screenshots and listing metadata are left unchanged.

Store release notes come from the `## Version <version>` section in
[`store/CHANGELOG.md`](store/CHANGELOG.md) matching `package.json`. A missing, duplicate or empty
section fails the release before building.

## Error messages shown on the watch

| Shown | Meaning |
|---|---|
| `phone not connected` | The watch has no connection to the Pebble app (checked before sending). |
| `send failed (AppMessage N)` / `outbox busy (AppMessage N)` | The watch could not send to the phone. `N` is the `AppMessageResult` code. |
| `no reply from phone (TIMEOUT)` | No answer within 15 s, e.g. PebbleKit JS was not running. |
| `PLUGIN_UNAVAILABLE: ...` | The Pebble app is too old, or plugins are off. |
| `PERMISSION_DENIED` | FindMyPhone isn't allowed yet. Allow it on the app's page in the Pebble app. |
| `TIMEOUT` / `RATE_LIMITED` / `UNKNOWN` | Passed through from the Pebble app. |

## How iOS plays the sound (from `PhoneSoundPlayer.ios.kt`)

- The sound is the app's own `find_my_phone.caf`, or the system `alarm.caf` if the app has none.
  It loops at full player volume in the `Playback` audio session, which **ignores the ring/silent
  switch**. A muted iPhone should still ring.
- It plays at the phone's current **media volume**. iOS offers no API to raise it. If headphones
  or a Bluetooth speaker are connected, it plays there instead of on the phone's speaker.
- At media volume below 45% the code would post a **critical alert** instead: title
  "Finding your phone", body "Ringing from your watch". That path needs Apple's critical-alerts
  entitlement, and the app's `iosApp.entitlements` doesn't have it. So in practice it plays the
  normal sound, which may be quiet, and **no notification is ever posted**. That matches what
  you saw.

## Known limitations

- **No notification to automate on.** A Shortcuts "When I get a notification" automation has
  nothing to trigger on, as explained above. It's also not needed for silent mode, because the
  sound ignores the mute switch. The remaining weak spot is a **low media volume**.
- The plugin UUID and action names come from the app's source, not from documented API. A future
  Pebble app could change them. The watch would then show `PLUGIN_UNAVAILABLE`.
- The watch's "ringing" state is a guess. If you stop the ring on the phone, the next SELECT
  sends "stop" first. Press SELECT again to ring.
- The Plugins API is a preview and may change.

## Test checklist

Run `pebble logs --phone <PHONE_IP>` during the tests.

| # | Setup | Expected (from the source) | Result |
|---|---|---|---|
| 1 | Phone unmuted, Pebble app in foreground | Alarm sound loops; watch vibrates once and shows "Ringing your phone." | |
| 2 | Phone unmuted, Pebble app in background / screen locked | Same as 1 | |
| 3 | Phone muted (ring/silent switch or Action Button) | Still rings: the Playback session ignores mute | |
| 3b | Media volume very low or zero | Rings quietly or silently (no critical-alert entitlement) | |
| 4 | Any of the above | Nothing in Notification Center | |
| 5 | SELECT while ringing | Stops; watch shows "Stopped ringing your phone." | |
| 6 | Wait 60 s after ringing | Stops by itself; watch hint returns to "SELECT to ring" | |
| 7 | Bluetooth off on the phone | Watch shows "Phone: NOT connected"; SELECT shows `phone not connected` | |
| 8 | FindMyPhone denied on the app's page | Watch shows `PERMISSION_DENIED` | |
