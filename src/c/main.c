// Find Phone: press SELECT to ring the phone through the Pebble app's
// built-in phone/find_my_phone plugin. The watch only sends a command;
// PebbleKit JS (src/pkjs/index.js) finds and invokes the plugin action.
#include <pebble.h>

// How long to wait for PebbleKit JS to answer before showing an error.
#define REPLY_TIMEOUT_MS 15000

static Window *s_window;
static TextLayer *s_title_layer;
static TextLayer *s_conn_layer;
static TextLayer *s_msg_layer;

static bool s_ringing;            // Last state reported by the phone
static bool s_waiting;            // A command is in flight
static AppTimer *s_reply_timer;
static char s_msg[128];

static void show_message(const char *text) {
  snprintf(s_msg, sizeof(s_msg), "%s", text);
  text_layer_set_text(s_msg_layer, s_msg);
}

static void show_idle_hint(void) {
  show_message(s_ringing ? "Ringing.\nSELECT to stop" : "SELECT to ring");
}

static void update_connection(bool connected) {
  text_layer_set_text(s_conn_layer, connected ? "Phone: connected" : "Phone: NOT connected");
}

static void stop_waiting(void) {
  s_waiting = false;
  if (s_reply_timer) {
    app_timer_cancel(s_reply_timer);
    s_reply_timer = NULL;
  }
}

static void reply_timeout(void *data) {
  s_reply_timer = NULL;
  s_waiting = false;
  show_message("Error: no reply from phone (TIMEOUT)");
  vibes_double_pulse();
}

// ---- AppMessage ---------------------------------------------------------

static void inbox_received(DictionaryIterator *iter, void *context) {
  Tuple *ok = dict_find(iter, MESSAGE_KEY_ok);
  Tuple *ringing = dict_find(iter, MESSAGE_KEY_ringing);
  Tuple *text = dict_find(iter, MESSAGE_KEY_text);

  if (ringing) {
    s_ringing = ringing->value->int32 != 0;
  }
  if (!ok) {
    // State-only update (e.g. JS just started): refresh the hint unless busy.
    if (!s_waiting) show_idle_hint();
    return;
  }

  stop_waiting();
  if (ok->value->int32) {
    vibes_short_pulse();
    show_message(text ? text->value->cstring : "Sent");
  } else {
    vibes_double_pulse();
    static char err[128];
    snprintf(err, sizeof(err), "Error: %s", text ? text->value->cstring : "unknown");
    show_message(err);
  }
}

static void outbox_failed(DictionaryIterator *iter, AppMessageResult reason, void *context) {
  stop_waiting();
  static char err[64];
  snprintf(err, sizeof(err), "Error: send failed (AppMessage %d)", (int)reason);
  show_message(err);
  vibes_double_pulse();
}

// ---- Buttons ------------------------------------------------------------

static void select_click(ClickRecognizerRef recognizer, void *context) {
  if (s_waiting) return;
  if (!connection_service_peek_pebble_app_connection()) {
    show_message("Error: phone not connected");
    vibes_double_pulse();
    return;
  }

  DictionaryIterator *iter;
  AppMessageResult result = app_message_outbox_begin(&iter);
  if (result != APP_MSG_OK) {
    static char err[64];
    snprintf(err, sizeof(err), "Error: outbox busy (AppMessage %d)", (int)result);
    show_message(err);
    return;
  }
  // cmd: 1 = start ringing, 0 = stop.
  dict_write_int32(iter, MESSAGE_KEY_cmd, s_ringing ? 0 : 1);
  result = app_message_outbox_send();
  if (result != APP_MSG_OK) {
    outbox_failed(iter, result, NULL);
    return;
  }

  s_waiting = true;
  s_reply_timer = app_timer_register(REPLY_TIMEOUT_MS, reply_timeout, NULL);
  show_message(s_ringing ? "Stopping..." : "Sending...");
}

static void click_config(void *context) {
  window_single_click_subscribe(BUTTON_ID_SELECT, select_click);
}

// ---- Window -------------------------------------------------------------

static TextLayer *make_text(Layer *root, GRect frame, const char *font) {
  TextLayer *layer = text_layer_create(frame);
  text_layer_set_font(layer, fonts_get_system_font(font));
  text_layer_set_text_alignment(layer, GTextAlignmentCenter);
  text_layer_set_overflow_mode(layer, GTextOverflowModeWordWrap);
  layer_add_child(root, text_layer_get_layer(layer));
  return layer;
}

static void window_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  GRect b = layer_get_bounds(root);
  const int pad = 6;

  s_title_layer = make_text(root, GRect(pad, 10, b.size.w - 2 * pad, 36), FONT_KEY_GOTHIC_28_BOLD);
  text_layer_set_text(s_title_layer, "Find Phone");
  s_conn_layer = make_text(root, GRect(pad, 48, b.size.w - 2 * pad, 28), FONT_KEY_GOTHIC_18);
  s_msg_layer = make_text(root, GRect(pad, 84, b.size.w - 2 * pad, b.size.h - 90), FONT_KEY_GOTHIC_24_BOLD);

  update_connection(connection_service_peek_pebble_app_connection());
  show_idle_hint();
}

static void window_unload(Window *window) {
  text_layer_destroy(s_title_layer);
  text_layer_destroy(s_conn_layer);
  text_layer_destroy(s_msg_layer);
}

static void init(void) {
  s_window = window_create();
  window_set_click_config_provider(s_window, click_config);
  window_set_window_handlers(s_window, (WindowHandlers){
    .load = window_load,
    .unload = window_unload,
  });
  window_stack_push(s_window, true);

  connection_service_subscribe((ConnectionHandlers){
    .pebble_app_connection_handler = update_connection,
  });

  app_message_register_inbox_received(inbox_received);
  app_message_register_outbox_failed(outbox_failed);
  app_message_open(256, 64);
}

static void deinit(void) {
  connection_service_unsubscribe();
  window_destroy(s_window);
}

int main(void) {
  init();
  app_event_loop();
  deinit();
}
