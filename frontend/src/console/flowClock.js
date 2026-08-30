// When each stage of the flow chart happens. Data, not components, so both
// the console's pipeline trace and the product site's section can read one
// schedule.
//
// Everything runs on one clock. The nodes used to wake in sequence over 1.36
// seconds while every edge fired its comet at once, over 1.6 seconds, so the
// dot passed through a node long before that node lit up: two animations of
// the same graph on two different time scales.

/** One hop, in milliseconds. Also the duration of a dart, so a dart lands on
 *  the beat the node it feeds wakes on. */
export const STEP = 700

/** When each stage wakes. The fork and the join are hops of their own, and
 *  the two paths share a slot because they genuinely run concurrently. */
export const AT = {
  intake: 0,
  redact: STEP * 1.3,
  paths: STEP * 2.6,
  fuse: STEP * 4.2,
  calibrate: STEP * 5.2,
  safety: STEP * 6.2,
  audit: STEP * 7.2,
}

/** The edge feeding a stage starts exactly one hop before it, so the dart
 *  arrives on the frame that stage wakes rather than trailing it. */
export const feed = (to) => Math.max(0, to - STEP)
