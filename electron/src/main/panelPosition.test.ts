import test from 'node:test';
import assert from 'node:assert/strict';
import { BLUR_TOGGLE_GRACE_MS, computePanelPosition, PANEL_MARGIN, PANEL_SIZE, shouldShowOnToggle } from './panelPosition';

const mac = { x: 0, y: 25, width: 1440, height: 875 };

test('sizes match the spec', () => {
  assert.deepEqual(PANEL_SIZE, { width: 360, height: 480 });
  assert.equal(PANEL_MARGIN, 8);
});

test('icon mid-screen: centred under icon, y clamped to work area top', () => {
  // tray bottom = 24, work area starts at 25 (below menu bar) → clamp to 25
  assert.deepEqual(computePanelPosition({ x: 700, y: 0, width: 22, height: 24 }, PANEL_SIZE, mac), { x: 531, y: 25 });
});

test('icon under a taller menu bar sits directly below it', () => {
  assert.deepEqual(
    computePanelPosition({ x: 700, y: 0, width: 22, height: 37 }, PANEL_SIZE, { x: 0, y: 37, width: 1512, height: 945 }),
    { x: 531, y: 37 },
  );
});

test('right edge clamps x to keep margin', () => {
  assert.equal(computePanelPosition({ x: 1420, y: 0, width: 20, height: 24 }, PANEL_SIZE, mac).x, 1440 - 360 - 8);
});

test('left edge clamps x to margin', () => {
  assert.equal(computePanelPosition({ x: 2, y: 0, width: 20, height: 24 }, PANEL_SIZE, mac).x, 8);
});

test('secondary display offset', () => {
  assert.deepEqual(
    computePanelPosition({ x: 3000, y: 0, width: 22, height: 24 }, PANEL_SIZE, { x: 1440, y: 25, width: 1920, height: 1055 }),
    { x: 2831, y: 25 },
  );
});

test('bottom taskbar opens above the icon', () => {
  assert.deepEqual(
    computePanelPosition({ x: 1800, y: 1040, width: 24, height: 40 }, PANEL_SIZE, { x: 0, y: 0, width: 1920, height: 1040 }),
    { x: 1552, y: 560 },
  );
});

test('all-zero tray bounds fall back to top-right corner of work area', () => {
  assert.deepEqual(
    computePanelPosition({ x: 0, y: 0, width: 0, height: 0 }, PANEL_SIZE, { x: 1440, y: 25, width: 1920, height: 1055 }),
    { x: 1440 + 1920 - 360 - 8, y: 25 + 8 },
  );
});

test('toggle: visible panel → hide', () => {
  assert.equal(shouldShowOnToggle({ visible: true, lastBlurHideAt: 0, now: 10_000 }), false);
});

test('toggle: hidden long ago → show', () => {
  assert.equal(shouldShowOnToggle({ visible: false, lastBlurHideAt: 1_000, now: 10_000 }), true);
});

test('toggle: just hidden by the blur that clicking the tray icon caused → stay hidden', () => {
  assert.equal(shouldShowOnToggle({ visible: false, lastBlurHideAt: 10_000 - 100, now: 10_000 }), false);
});

test('toggle: exactly BLUR_TOGGLE_GRACE_MS after blur-hide → show', () => {
  assert.equal(shouldShowOnToggle({ visible: false, lastBlurHideAt: 10_000 - BLUR_TOGGLE_GRACE_MS, now: 10_000 }), true);
});
