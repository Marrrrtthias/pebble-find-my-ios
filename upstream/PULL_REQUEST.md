# iOS: post a notification with Stop while Find My Phone is ringing

Fixes #<issue number>

## What and why

On iOS, ringing the phone from the watch, through the built-in Find My Phone plugin, posts no
notification. The only notification path is the critical alert, which needs an entitlement the
app doesn't have. Android shows "Finding your phone" / "Ringing from your watch" with a Stop
action while ringing.

This does the same on iOS:

- When `PhoneSoundPlayer.ios` starts the audio player, it posts a notification with the same
  title and body. `cleanUp()` removes it together with the critical alert, so it disappears
  when ringing stops: via the `stop` action, the 60 s timeout, or the end of a source
  subscription.
- The notification's category has a Stop action and `CustomDismissAction`. As on Android,
  tapping Stop or dismissing the notification stops ringing.
- `IOSDelegate.userNotificationCenterDidReceiveResponse` hands responses to a new iOS-only
  libpebble3 function, `handleFindMyPhoneNotificationResponse(response)`. It returns true for
  this notification and calls `PhoneSoundPlayer.stopRinging()`, which is what Android's Stop
  button does.

## Design notes and trade-offs

- **One public function in libpebble3.** Responses only arrive in the app module, and
  `PhoneSoundPlayer` is internal. The alternative was to make `BuiltInPlugins.FIND_MY_PHONE`
  public and call the plugin's `stop` action through `Plugins.invoke` as `PluginCaller.Host`.
  That spreads the notification and action IDs across two modules, so I kept everything in
  `PhoneSoundPlayer.ios.kt`.
- **Category registered before each notification.** It is merged with the existing categories,
  like `PermissionRequestNotifier.ios` and `ReminderScheduler.ios` do. It's re-registered each
  time instead of tracked with a flag, which costs one extra call per ring.
- **No sound on the notification.** The alarm is already playing, as with the silent Android
  channel.
- **Only on the audio-player path.** The critical-alert path already posts its own notification.
- **Strings are hard-coded**, like the critical alert in the same file and the Android
  notification. libpebble3 has no string resources.

## Testing

- [ ] Built and ran on an iPhone (iOS <version>) with a Pebble Time 2
- [ ] Ring from the watch → notification with Stop appears (app in foreground, in background, phone locked)
- [ ] Stop on the notification → ringing stops, notification removed
- [ ] Swipe the notification away → ringing stops
- [ ] `stop` action / 60 s timeout → notification removed
- [ ] Other notification actions (reminder Done, permission Allow/Deny) still work

## AI disclosure

This change was drafted with an AI assistant (Claude Code). I reviewed the code and understand
it, and I tested it as described above.
