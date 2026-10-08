import type { ActionArgs, ActionName, ErrorArgs, ErrorName } from './catalogue';
import type { Telemetry } from './telemetry';

// Le module est posé une fois au démarrage ; avant cela (et dans les tests) `track` et `reportError` ne font rien.
let current: Telemetry | null = null;

export const setTelemetry = (telemetry: Telemetry | null): void => {
  current = telemetry;
};
export const getTelemetry = (): Telemetry | null => current;
export function track<N extends ActionName>(name: N, ...detail: ActionArgs<N>): void {
  current?.track(name, ...detail);
}
export function reportError<N extends ErrorName>(name: N, ...detail: ErrorArgs<N>): void {
  current?.reportError(name, ...detail);
}
