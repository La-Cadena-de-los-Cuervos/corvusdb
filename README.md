# CorvusDB (Tauri Canonical Layout)

Aplicación desktop (Opción A) para un "Compass interno" orientado a MongoDB/DocumentDB.

## Estructura

- Frontend React + TypeScript + Vite: `src/`
- Backend Tauri + Rust: `src-tauri/`

## Desarrollo

1. Instala dependencias JS:
```bash
npm install
```
2. Ejecuta en modo desktop:
```bash
npm run tauri dev
```

## Build

```bash
npm run tauri build
```

## Comandos Tauri (`invoke`)

- `list_connections`
- `save_connection`
- `test_connection`
- `list_collections`
- `run_find_query`
- `run_aggregate_query`
- `insert_document`
- `update_documents`
- `delete_documents`

## Notas

- Los perfiles se guardan en `data/connections.json`.
- La password no se persiste en disco (solo en memoria del proceso).
- Para AWS DocumentDB por TLS, configura `CA file` (por ejemplo `global-bundle.pem`).
