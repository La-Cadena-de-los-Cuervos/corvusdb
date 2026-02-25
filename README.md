# CorvusDB (Tauri Canonical Layout)

Aplicación desktop (Opción A) para un "Compass interno" orientado a MongoDB/DocumentDB.

Guia de instalacion para usuarios:
- [INSTALL.md](./INSTALL.md)

Manual interno de operacion:
- [MANUAL_INTERNO.md](./MANUAL_INTERNO.md)

## Estructura

- Frontend React + TypeScript + Vite: `src/`
- Backend Tauri + Rust: `src-tauri/`

## Instalacion desde GitHub Releases

Para usuarios finales, no es necesario compilar:

1. Abrir la pagina de `Releases` del repositorio.
2. Descargar el instalador de tu sistema operativo:
   - macOS: `.dmg` (o `.app` en zip si se publica asi)
   - Windows: `.msi` o `.exe`
   - Linux: `.deb` / `.AppImage` / `.rpm` (segun artefactos publicados)
3. Instalar y abrir `CorvusDB`.

Guia detallada: [INSTALL.md](./INSTALL.md)

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
