// ---------------------------------------------------------------------------
// Animation & layout constants for PixelBoy
// ---------------------------------------------------------------------------

export const THINKING_DOT_COLOR = 0x4a90d9;
export const THINKING_DOT_RADIUS = 4;
export const THINKING_DOT_SPACING = 12;
export const THINKING_DOT_COUNT = 3;
export const THINKING_DOT_OFFSET_Y = 12;

export const BOUNCE_OFFSET = 4;
export const BOUNCE_DURATION_MS = 100;

export const WALK_LEAN_PX = 2;
export const WALK_LEAN_DURATION_MS = 200;
export const WALK_STEP_HALF_MS = 200;
export const WALK_BOB_PX = 3;

export const BOB_IDLE_PX = 1;
export const BOB_IDLE_DURATION_MS = 1500;
export const BOB_BREATHING_DURATION_MS = 2000;
export const BOB_SLOW_BREATHING_DURATION_MS = 2500;
export const BOB_MEDITATION_DURATION_MS = 3000;
export const BOB_TYPING_DURATION_MS = 300;

export const SWAY_THINKING_PX = 1;
export const SWAY_THINKING_DURATION_MS = 1000;
export const SWAY_PHONE_DURATION_MS = 1200;

export const THINKING_DOT_INTERVAL_MS = 400;
export const TALK_MOUTH_TOGGLE_MS = 250;

export const BLINK_MIN_MS = 3000;
export const BLINK_MAX_MS = 5000;
export const BLINK_DURATION_MS = 120;

export const LOOK_AROUND_MIN_MS = 8000;
export const LOOK_AROUND_MAX_MS = 15000;
export const LOOK_GLANCE_MS = 400;
export const LOOK_PAUSE_MS = 300;

export const ACTIVITY_MIN_DELAY_MS = 6000;
export const ACTIVITY_MAX_DELAY_MS = 14000;
export const ACTIVITY_SETTLE_THRESHOLD = 4;

export const YAWN_STRETCH_PX = 2;
export const YAWN_STRETCH_DURATION_MS = 600;
export const YAWN_TOTAL_MS = 1800;

export const PHONE_MIN_MS = 5000;
export const PHONE_MAX_MS = 8000;

export const READING_PAGE_TURN_MIN_MS = 3000;
export const READING_PAGE_TURN_MAX_MS = 5000;
export const READING_PAGE_TURN_SWAP_MS = 300;
export const READING_TOTAL_MIN_MS = 12000;
export const READING_TOTAL_MAX_MS = 18000;

export const WORKING_PAUSE_MIN_MS = 4000;
export const WORKING_PAUSE_MAX_MS = 7000;
export const WORKING_LOOK_UP_MS = 800;
export const WORKING_TOTAL_MIN_MS = 12000;
export const WORKING_TOTAL_MAX_MS = 18000;

export const STRETCH_PX = 3;
export const STRETCH_DURATION_MS = 800;
export const STRETCH_TOTAL_MS = 2000;

export const COFFEE_SIP_INTERVAL_MS = 2000;
export const COFFEE_MIN_MS = 6000;
export const COFFEE_MAX_MS = 10000;

export const EXERCISE_FRAME_INTERVAL_MS = 500;
export const EXERCISE_BOUNCE_PX = 4;
export const EXERCISE_BOUNCE_DURATION_MS = 250;
export const EXERCISE_MIN_MS = 4000;
export const EXERCISE_MAX_MS = 8000;


export const MEDITATE_MIN_MS = 15000;
export const MEDITATE_MAX_MS = 25000;

export const SITTING_SLEEP_DELAY_MS = 25000;

export const SLEEP_ZZZ_OFFSET_X = 10;
export const SLEEP_ZZZ_FONT_SIZE = "11px";
export const SLEEP_ZZZ_FLOAT_PX = 18;
export const SLEEP_ZZZ_FLOAT_DURATION_MS = 1500;
export const SLEEP_ZZZ_PAUSE_MS = 500;


export const COMPACT_HOLD_MS = 600;
export const COMPACT_SQUISH_BOB_PX = 2;
export const COMPACT_SQUISH_BOB_DURATION_MS = 150;
export const COMPACT_SQUISH_MS = 500;
export const COMPACT_PAPER_SCALE_RATIO = 0.8;
export const COMPACT_HAND_X_RATIO = 45 / 5;
export const COMPACT_HAND_Y_RATIO = 0.35;
export const COMPACT_ARC_PX = 80;
export const COMPACT_FLIGHT_DURATION_MS = 600;
export const COMPACT_GRAVITY_PULL_PX = 40;
export const COMPACT_GRAVITY_DELAY_MS = 100;
export const COMPACT_ROTATION_PER_FRAME = 8;
export const COMPACT_OFFSCREEN_MARGIN = 60;
export const COMPACT_POST_THROW_MS = 300;

// Activity probability thresholds (cumulative)
export const ACTIVITY_WEIGHTS = {
  WANDER: 0.15,
  YAWN: 0.25,
  PHONE: 0.35,
  READ: 0.50,
  WORK: 0.65,
  STRETCH: 0.72,
  COFFEE: 0.79,
  EXERCISE: 0.93,
} as const;

// Physics constants
export const WALK_SPEED = 120;
export const SPRINT_SPEED = 240;
export const ACCELERATION = 600;
export const DRAG = 0.001;
export const STOP_THRESHOLD = 5;
