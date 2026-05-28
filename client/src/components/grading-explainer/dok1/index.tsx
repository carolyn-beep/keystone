/**
 * dok1 barrel — exposes the ordered array of DOK1 explainer screens
 * consumed by <GradingExplainer screens={dok1Screens}>.
 *
 * Spec 02 populates this with four placeholder screens. Spec 03 replaces
 * the bodies in each ScreenN.tsx in isolation; this file does not change.
 *
 * Spec: features/pedagogy/dok1-rubric-explainer/specs/02-wiring/spec.md (FR3)
 */

import type { ReactElement } from 'react';
import { Screen1 } from './Screen1';
import { Screen2 } from './Screen2';
import { Screen3 } from './Screen3';
import { Screen4 } from './Screen4';

export const dok1Screens: ReactElement[] = [
  <Screen1 key="1" />,
  <Screen2 key="2" />,
  <Screen3 key="3" />,
  <Screen4 key="4" />,
];
