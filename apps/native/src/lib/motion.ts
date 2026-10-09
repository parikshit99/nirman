import { Easing as REasing } from 'react-native-reanimated';

// The app's motion, after Telegram's: things arrive fast and settle softly (an ease-out "quint" curve), springs are
// short and only slightly bouncy. Use these instead of picking numbers per screen, so everything moves alike.

/** Fast start, soft landing: screens, sheets, strips sliding in. */
export const EASE_OUT = REasing.bezier(0.23, 1, 0.32, 1);
/** Leaving: a quicker, plain ease-in. */
export const EASE_IN = REasing.bezier(0.32, 0, 0.67, 0);

export const DURATION = { quick: 150, normal: 250, screen: 320 };

/** A press or a pop: settles in about 250 ms with a hint of bounce. */
export const SPRING = { damping: 18, stiffness: 260, mass: 0.8 };
