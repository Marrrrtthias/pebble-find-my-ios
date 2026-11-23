// Find Phone, phone side. Runs inside the Pebble mobile app.
//
// The Plugins API is only reachable from PebbleKit JS. The docs list the
// built-in phone/find_my_phone item and the FindMyPhone permission, but not
// the action's name, arguments or the built-in plugin's UUID. So instead of
// hard-coding them, we look them up with Pebble.enumeratePlugins() and log
// what we found (see `pebble logs`).

var ITEM = 'find_my_phone';
var TARGET = 'phone/' + ITEM;
var STOP_NAME = /stop|cancel|dismiss|silence/i;
var START_NAME = /start|ring|find|play/i;
// Boolean arguments that mean "ring now" (true) / "stop" (false).
var RING_FLAGS = ['on', 'ringing', 'ring', 'active', 'enabled', 'start', 'value'];

var ringing = false;
var instanceId = null;   // From the phone/find_my_phone source, if it has one
var logged = false;

function send(msg) {
  Pebble.sendAppMessage(msg, null, function (e) {
    console.log('sendAppMessage failed: ' + JSON.stringify(e));
  });
}

function reply(ok, text) {
  send({ ok: ok ? 1 : 0, ringing: ringing ? 1 : 0, text: String(text).slice(0, 100) });
}

function targetsFindMyPhone(action) {
  var hit = (action.targets || []).some(function (t) {
    return t === TARGET || t.indexOf(TARGET + '/') === 0;
  });
  return hit || /find_?my_?phone|find_phone/i.test(action.name);
}

// Returns { plugin, start, stop } or throws { code, message }.
function discover() {
  if (typeof Pebble.enumeratePlugins !== 'function') {
    throw { code: 'PLUGIN_UNAVAILABLE', message: 'needs Pebble app 1.16+' };
  }
  var found = null;
  Pebble.enumeratePlugins().forEach(function (plugin) {
    var actions = (plugin.actions || []).filter(targetsFindMyPhone);
    if (!actions.length || found) return;
    found = {
      plugin: plugin.uuid,
      start: actions.filter(function (a) { return !STOP_NAME.test(a.name) && START_NAME.test(a.name); })[0] ||
             actions.filter(function (a) { return !STOP_NAME.test(a.name); })[0],
      stop: actions.filter(function (a) { return STOP_NAME.test(a.name); })[0],
    };
    if (!logged) {
      logged = true;
      console.log('find_my_phone plugin ' + plugin.uuid + ' (' + plugin.name + ')');
      console.log('sources: ' + JSON.stringify(plugin.sources));
      console.log('actions: ' + JSON.stringify(actions));
    }
  });
  if (!found || !found.start) {
    throw { code: 'PLUGIN_UNAVAILABLE', message: 'no ' + TARGET + ' action' };
  }
  return found;
}

function ringFlag(action) {
  var props = (action.parameters && action.parameters.properties) || {};
  return RING_FLAGS.filter(function (k) {
    return props[k] && props[k].type === 'boolean';
  })[0];
}

// Fill in the arguments we understand; leave optional ones (duration, sound,
// ...) to the plugin's defaults. Throws if a required one is unknown.
function buildArgs(action, ring) {
  var params = action.parameters || {};
  var props = params.properties || {};
  var required = params.required || [];
  var flag = ringFlag(action);
  var args = {};
  if (flag) args[flag] = ring;
  if (props.item) args.item = ITEM;
  if (props.instanceId && instanceId !== null) args.instanceId = instanceId;
  var missing = required.filter(function (k) { return !(k in args); });
  if (missing.length) {
    throw { code: 'INVALID_ARGS', message: 'unknown required arg(s): ' + missing.join(', ') };
  }
  return args;
}

function run(ring) {
  var found = discover();
  var action = ring ? found.start : found.stop;
  if (!ring && !action) {
    // No separate stop action: a boolean flag on the start action can still stop it.
    if (!ringFlag(found.start)) throw { code: 'UNSUPPORTED', message: 'plugin has no stop' };
    action = found.start;
  }
  var args = buildArgs(action, ring);
  console.log('invokeAction ' + action.name + ' ' + JSON.stringify(args));
  return Pebble.invokeAction({ plugin: found.plugin, action: action.name, args: args });
}

function handleCommand(ring) {
  var promise;
  try {
    promise = run(ring);
  } catch (e) {
    console.log('find phone failed: ' + JSON.stringify(e));
    reply(false, e.code + ': ' + e.message);
    return;
  }
  promise.then(function (result) {
    console.log('result: ' + JSON.stringify(result));
    if (result && result.ok) {
      ringing = ring;
      reply(true, result.text || (ring ? 'Phone is ringing' : 'Stopped'));
    } else {
      var code = (result && result.code) || 'UNKNOWN';
      var hint = code === 'PERMISSION_DENIED' ? ' (allow FindMyPhone in the Pebble app)' : '';
      reply(false, code + (result && result.message ? ': ' + result.message : '') + hint);
    }
  }, function (err) {
    console.log('invokeAction rejected: ' + err);
    reply(false, 'UNKNOWN: ' + err);
  });
}

// Track the source, if the plugin serves one: gives us the instanceId and,
// when there is a boolean property, whether the phone is ringing right now.
function watchSource() {
  if (typeof Pebble.subscribeToSource !== 'function') return;
  Pebble.subscribeToSource({
    category: 'phone',
    item: ITEM,
    onData: function (envelope) {
      var inst = (envelope.instances || [])[0];
      if (!inst) return;
      instanceId = inst.instanceId;
      var props = inst.properties || {};
      Object.keys(props).forEach(function (name) {
        if (props[name].boolean && /ring|active|playing|^on$/i.test(name)) {
          ringing = props[name].boolean.value;
        }
      });
      console.log('source: ' + JSON.stringify(envelope));
      send({ ringing: ringing ? 1 : 0 });
    },
    onError: function (err) {
      console.log('source error: ' + err.code + ' ' + err.message);
    },
  });
}

Pebble.addEventListener('ready', function () {
  console.log('Find Phone JS ready');
  try { discover(); } catch (e) { console.log('discovery: ' + JSON.stringify(e)); }
  watchSource();
});

Pebble.addEventListener('appmessage', function (e) {
  var cmd = e.payload.cmd;
  if (cmd !== undefined) handleCommand(cmd === 1);
});
