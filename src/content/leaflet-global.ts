import * as L from 'leaflet';

// Le greffon de regroupement s'accroche à la variable globale `L` : ce module la pose, il doit être importé avant le greffon.
(globalThis as unknown as { L: typeof L }).L = L;
