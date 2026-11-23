# Find Phone

A minimal Pebble watchapp that rings your phone through the Pebble mobile app's built-in
`phone/find_my_phone` plugin ([Plugins Preview](https://developer.repebble.com/guides/plugins/preview/)).
It targets the Pebble Time 2 (`emery`) and has no companion app.

## How it works

```
watch (C)  --AppMessage cmd=1/0-->  PebbleKit JS  --Pebble.invokeAction-->  built-in phone plugin
           <--ok / text / ringing--
```

- **Watch (`src/c/main.c`)**: one screen showing "Find Phone", whether the phone is connected and
  a status line. SELECT sends `cmd=1` (start), or `cmd=0` (stop) while the phone is ringing. On
  success the watch vibrates once and shows the plugin's reply. On error it vibrates twice and
  shows `Error: <CODE>: <message>`. BACK exits.
- **PebbleKit JS (`src/pkjs/index.js`)**: the Plugins API is only reachable from PebbleKit JS.
  There is no C or Alloy API yet; the docs list one as "Future". The docs name the
  `phone/find_my_phone` item and the `FindMyPhone` permission. They do **not** document the
  action name, its arguments or the built-in plugin's UUID. So the script:
  1. calls `Pebble.enumeratePlugins()` and picks the action that targets `phone/find_my_phone`.
     It uses a separate stop/cancel action for stopping, if the plugin has one.
  2. fills in only the arguments it understands: `item`, `instanceId` and an on/off boolean such
     as `on`. Optional arguments like a duration or a sound keep the plugin's defaults. An unknown
     *required* argument is reported as `INVALID_ARGS`.
  3. calls `Pebble.invokeAction({ plugin, action, args })` and sends the result to the watch.
  4. subscribes to the `phone/find_my_phone` source, if it exists, to learn the instance ID and
     whether the phone is ringing.

  The plugin UUID, sources and full action schema are written to the log the first time the
  script runs, so `pebble logs` shows exactly what your Pebble app offers (see below).

Stopping works only if the plugin offers a stop action or an on/off argument. Otherwise the watch
shows `UNSUPPORTED: plugin has no stop`.

## Requirements and permissions

- Pebble mobile app **1.16 or later**. In 1.16 to 1.18, turn on Settings → Plugins →
  Plugins / permissions preview. From 2.0.0 plugins are on for everyone.
- Pebble SDK **4.44 or later** and pebble-tool **5.1.0 or later**. The SDK marks the `.pbw` as
  `manifestVersion: 2`. Without that, every plugin call fails with `PERMISSION_DENIED`.
- Permission, declared in `package.json`:
  `{ "name": "FindMyPhone", "reason": "To ring your phone when you press SELECT", "required": true }`.
  The Pebble app asks about it when you install the app. You can change it later on the app's page
  in the Pebble app. Until you answer, calls fail with `PERMISSION_DENIED`.

## Build and install

```sh
pebble sdk install 4.44         # once, if `pebble sdk list` shows an older SDK
pebble sdk activate 4.44
pebble build                     # -> build/pebble-find-my-ios.pbw

# Over the phone's developer connection: turn on Developer Connection in the Pebble app's
# settings; it shows the phone's IP address. Phone and computer must be on the same network.
pebble install --phone <PHONE_IP>
pebble logs --phone <PHONE_IP>   # shows the discovered plugin/action schema and each call

# Emulator (no plugins there, so SELECT shows PLUGIN_UNAVAILABLE; useful for UI checks only)
pebble install --emulator emery
```

## Error codes shown on the watch

| Shown | Meaning |
|---|---|
| `phone not connected` | The watch has no connection to the Pebble app (checked before sending). |
| `send failed (AppMessage N)` / `outbox busy (AppMessage N)` | The watch could not send to the phone. `N` is the `AppMessageResult` code. |
| `no reply from phone (TIMEOUT)` | No answer within 15 s, e.g. PebbleKit JS was not running. |
| `PLUGIN_UNAVAILABLE: ...` | Plugins are off, the Pebble app is too old, or there is no `find_my_phone` action. |
| `PERMISSION_DENIED` | Allow FindMyPhone on the app's page in the Pebble app. |
| `INVALID_ARGS` / `INVALID_REQUEST` / `TIMEOUT` / `RATE_LIMITED` / `UNKNOWN` | Passed through from the plugin. |
| `UNSUPPORTED: plugin has no stop` | The plugin cannot be stopped from the watch. Stop it on the phone. |

## Known limitations

- **No notification on iOS.** When the find-phone action rings the phone, the Pebble app on iOS
  does not post a notification. This was tested with the official "Dashboard (Plugin Demo)". So
  a Shortcuts "When I get a notification" automation has nothing to trigger on. This app cannot
  change that. A notification would have to come from the Pebble app itself.
- **Silent mode on iOS.** The docs say nothing about how the sound behaves when the iPhone is
  muted or in a Focus mode, and an app cannot override the mute switch. Test it with the
  checklist below.
- The action name and arguments are discovered at runtime because they are not documented. If a
  future Pebble app renames them or adds a required argument, the watch shows the error code and
  `pebble logs` shows the new schema.
- `ringing` is the watch's best guess. If the phone stops ringing by itself or is stopped on the
  phone, the next SELECT may send "stop" first. Press SELECT again to start.
- The Plugins API is a preview and may change.

## Test checklist

Run `pebble logs --phone <PHONE_IP>` during the tests and note the logged `actions:` line once.

| # | Setup | Expected | Result |
|---|---|---|---|
| 1 | Phone unmuted, Pebble app in foreground | Phone rings; watch vibrates once and shows the reply | |
| 2 | Phone unmuted, Pebble app in background / screen locked | Phone rings | |
| 3 | Phone muted (ring/silent switch or Action Button) | Ringing is not guaranteed; record what happens | |
| 4 | Any of the above | Note whether anything appears in Notification Center and its exact title/text (none expected on iOS, see above) | |
| 5 | SELECT while ringing | Ringing stops, or `UNSUPPORTED` is shown | |
| 6 | Bluetooth off on the phone | Watch shows "Phone: NOT connected"; SELECT shows `phone not connected` | |
| 7 | FindMyPhone denied on the app's page | Watch shows `PERMISSION_DENIED` | |
