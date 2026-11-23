// Find Phone, phone side. Runs inside the Pebble mobile app.
//
// The Plugins API is only reachable from PebbleKit JS. The built-in
// find-my-phone plugin (libpebble3 FindMyPhonePlugin.kt in coredevices/mobileapp)
// offers two actions without arguments:
//   ring - ring the phone; it stops by itself after 60 seconds
//   stop - stop ringing
// Note: subscribing to the phone/find_my_phone *source* also starts ringing
// (until the subscription ends), so this script deliberately never subscribes.

var FIND_MY_PHONE_PLUGIN = '00000000-0000-0000-0001-000000000008';

function reply(ok, ringing, text) {
  Pebble.sendAppMessage(
    { ok: ok ? 1 : 0, ringing: ringing ? 1 : 0, text: String(text).slice(0, 100) },
    null,
    function (e) { console.log('sendAppMessage failed: ' + JSON.stringify(e)); }
  );
}

function handleCommand(ring) {
  if (typeof Pebble.invokeAction !== 'function') {
    reply(false, false, 'PLUGIN_UNAVAILABLE: needs Pebble app 1.16+');
    return;
  }
  var action = ring ? 'ring' : 'stop';
  console.log('invokeAction ' + action);
  Pebble.invokeAction({ plugin: FIND_MY_PHONE_PLUGIN, action: action, args: {} })
    .then(function (result) {
      console.log('result: ' + JSON.stringify(result));
      if (result && result.ok) {
        reply(true, ring, result.text || (ring ? 'Ringing your phone.' : 'Stopped.'));
      } else {
        var code = (result && result.code) || 'UNKNOWN';
        var hint = code === 'PERMISSION_DENIED' ? ' (allow FindMyPhone in the Pebble app)' : '';
        reply(false, !ring, code + (result && result.message ? ': ' + result.message : '') + hint);
      }
    }, function (err) {
      console.log('invokeAction rejected: ' + err);
      reply(false, !ring, 'UNKNOWN: ' + err);
    });
}

Pebble.addEventListener('ready', function () {
  console.log('Find Phone JS ready');
});

Pebble.addEventListener('appmessage', function (e) {
  var cmd = e.payload.cmd;
  if (cmd !== undefined) handleCommand(cmd === 1);
});
