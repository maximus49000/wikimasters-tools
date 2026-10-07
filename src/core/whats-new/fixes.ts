import type { Fix } from './types';

// Corrections récentes lues dans les commits au moment du build (voir scripts/build-info.mjs).
export const FIXES: Fix[] = typeof __WMT_FIXES__ === 'undefined' ? [] : __WMT_FIXES__;
