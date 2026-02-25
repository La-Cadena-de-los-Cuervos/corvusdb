# CorvusDB - Guia de Instalacion

Esta guia explica como instalar y ejecutar CorvusDB (app desktop Tauri) para usuarios del equipo.

## Instalacion rapida desde GitHub Releases (recomendada)

Si solo quieres usar la app, instala desde Releases y no compiles localmente.

1. Abre la seccion `Releases` del repositorio en GitHub.
2. Descarga el artefacto de tu sistema operativo:
   - macOS: `CorvusDB_<version>_aarch64.dmg` o `CorvusDB_<version>_x64.dmg`
   - Windows: `CorvusDB_<version>_x64_en-US.msi` (o `.exe` si se publica)
   - Linux: `.deb` / `.AppImage` / `.rpm` (segun la release)
3. Instala:
   - macOS: abrir `.dmg`, arrastrar `CorvusDB.app` a `Applications`
   - Windows: ejecutar `.msi` y seguir asistente
   - Linux Debian/Ubuntu: `sudo dpkg -i <archivo>.deb && sudo apt-get -f install`
4. Ejecuta `CorvusDB`.

Si macOS bloquea la apertura por firma:
- Ir a `System Settings > Privacy & Security`
- En la advertencia de CorvusDB, seleccionar `Open Anyway`.

Si en Linux falla el `.deb` por dependencia faltante (`libwebkit2gtk-4.1-0`), ejecutar:
```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-0
sudo apt --fix-broken install
```

## Instalacion para desarrollo (compilar localmente)

## 1. Requisitos

## macOS

- Xcode Command Line Tools:
```bash
xcode-select --install
```
- Rust (toolchain estable):
```bash
curl https://sh.rustup.rs -sSf | sh
```
- Node.js 20+ y npm
- Dependencias GUI para Tauri (normalmente ya vienen con macOS + Xcode CLT)

## Linux (Ubuntu/Debian)

- Rust (toolchain estable)
- Node.js 20+ y npm
- Dependencias Tauri:
```bash
sudo apt update
sudo apt install -y \
  build-essential \
  curl \
  wget \
  file \
  libssl-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf
```

## Windows

- Rust (MSVC toolchain)
- Node.js 20+ y npm
- Microsoft Visual Studio C++ Build Tools
- WebView2 Runtime (normalmente instalado en Windows 11)

## 2. Obtener el codigo

```bash
git clone <REPO_URL>
cd corvusdb
```

## 3. Instalar dependencias frontend

```bash
npm install
```

## 4. Ejecutar en modo desarrollo

```bash
npm run tauri dev
```

Esto abre la app desktop con recarga en caliente del frontend.

## 5. Build de distribucion

```bash
npm run tauri build
```

Los binarios/instaladores se generan en:

- `src-tauri/target/release/bundle/`

## 6. Configuracion inicial en CorvusDB (DocumentDB por tunel)

En Connection Manager:

- `Host`: `localhost` (si usas tunel)
- `Port`: puerto local del tunel
- `TLS`: activado
- `CA file (.pem)`: ruta local al CA bundle (por ejemplo `global-bundle.pem`)
- `Auth Source`: normalmente `admin`
- `Auth Mechanism`: `SCRAM-SHA-1`
- `tunnel mode`: activado

Guarda la conexion y usa `Test selected connection`.

## 7. Seguridad

- La password no se persiste en texto plano en disco.
- Los perfiles se guardan en `data/connections.json` (sin password).
- Si reinicias la app, vuelve a capturar password para reconectar.

## 8. Troubleshooting

## Error TLS de hostname (localhost)

Si aparece algo como:
- `certificate not valid for name "localhost"`

Asegura:
- Tunel activo
- `TLS` activado
- `CA file` correcto
- `tunnel mode` activado

## Authorization failure (code 13)

La conexion puede pasar pero `find/list collections` fallan por permisos del usuario.

Revisar:
- `authSource` correcto
- Roles del usuario sobre la DB/colecciones objetivo (`read` o `readWrite`)

## La app no abre en `tauri dev`

Revisar:
- `npm install` ejecutado
- Rust toolchain instalado (`rustc --version`)
- Dependencias de sistema de Tauri

## 9. Comandos utiles

```bash
# Ejecutar frontend solo (debug UI)
npm run dev

# Build frontend
npm run build

# Verificar backend Rust (Tauri core)
cd src-tauri && cargo check
```
