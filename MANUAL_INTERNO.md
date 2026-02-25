# CorvusDB - Manual Interno (Equipo)

Documento operativo para instalar, configurar y soportar CorvusDB en ambiente interno.

## 1. Datos de referencia del equipo

- Repositorio oficial: `<REPO_URL_INTERNO>`
- Rama recomendada: `main`
- Dueño técnico: `<OWNER_TECNICO>`
- Canal de soporte: `<SLACK_CANAL_O_TEAMS>`
- Región AWS principal: `us-east-1`
- Cluster DocDB (writer): `<DOCDB_CLUSTER_WRITER_ENDPOINT>`
- Cluster DocDB (reader): `<DOCDB_CLUSTER_READER_ENDPOINT>`
- Bastion/instancia para túnel: `<BASTION_INSTANCE_ID>`
- Perfil AWS CLI sugerido: `<AWS_PROFILE>`

## 2. Prerrequisitos corporativos

- Acceso VPN corporativa (si aplica)
- AWS CLI autenticado con SSO o credenciales de IAM
- Node.js 20+ y npm
- Rust estable (rustup)
- Dependencias del SO para Tauri (ver `INSTALL.md`)

Validación rápida:
```bash
aws sts get-caller-identity --profile <AWS_PROFILE>
node -v
npm -v
rustc --version
cargo --version
```

## 3. Instalación estándar

```bash
git clone <REPO_URL_INTERNO>
cd corvusdb
npm install
```

## 4. Bundle CA de DocumentDB

Descarga recomendada (si no existe en tu equipo):
```bash
mkdir -p ~/pem
curl -o ~/pem/global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
```

Ruta estándar interna sugerida:
- `~/pem/global-bundle.pem`

## 5. Levantar túnel hacia DocumentDB

## Opción A: SSM (recomendada)

Ejemplo base (ajustar placeholders):
```bash
aws ssm start-session \
  --profile <AWS_PROFILE> \
  --target <BASTION_INSTANCE_ID> \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{\"host\":[\"<DOCDB_CLUSTER_WRITER_ENDPOINT>\"],\"portNumber\":[\"27017\"],\"localPortNumber\":[\"27011\"]}'
```

Mantén esta sesión abierta mientras uses CorvusDB.

## Opción B: SSH tunnel (si tu equipo lo usa)

```bash
ssh -L 27011:<DOCDB_CLUSTER_WRITER_ENDPOINT>:27017 <USUARIO_BASTION>@<BASTION_HOST>
```

## 6. Ejecutar CorvusDB

```bash
npm run tauri dev
```

## 7. Configuración de conexión en CorvusDB (plantilla interna)

Usa estos valores de referencia:

- Name: `trafico-dev` (o convención de equipo)
- Host: `localhost`
- Port: `27011`
- TLS: activado
- CA file (.pem): `/Users/<tu_usuario>/pem/global-bundle.pem`
- Auth Source: `admin` (si aplica para tu usuario)
- Auth Mechanism: `SCRAM-SHA-1`
- Username: `<USUARIO_DOCDB>`
- Password: `<PASSWORD_DOCDB>`
- Read Preference: `primary`
- tunnel mode: activado

Luego:
1. `Save connection`
2. `Test selected connection`
3. En Explorer: database objetivo
4. `Load collections`

## 8. Convención interna sugerida de nombres

- Connection name:
  - `<dominio>-<entorno>-writer`
  - `<dominio>-<entorno>-reader`
- Ejemplos:
  - `trafico-dev-writer`
  - `trafico-prod-reader`

## 9. Checklist de permisos DocumentDB

Si `Test connection` funciona pero `find/list collections` falla con `code 13`:

- Verificar `authSource` correcto del usuario
- Confirmar rol sobre DB objetivo:
  - mínimo lectura: `read`
  - escritura: `readWrite`
- Confirmar que la consulta se ejecuta en la misma DB/colección que en `mongosh`

Comprobación rápida en `mongosh`:
```javascript
use <DB_OBJETIVO>
show collections
db.<COLECCION>.findOne()
```

## 10. Incidentes frecuentes y respuesta rápida

## Error TLS hostname con localhost

Síntoma:
- `certificate not valid for name "localhost"`

Acción:
- confirmar túnel activo
- confirmar `CA file` correcto
- dejar `tunnel mode` activado

## Authorization failure (code 13)

Síntoma:
- conecta pero falla `find` o `load collections`

Acción:
- validar usuario/roles en DocDB
- validar DB real en Explorer

## Password aparentemente “no guardado”

Comportamiento esperado:
- password no se persiste en disco por seguridad
- puede requerir reingreso tras reiniciar app

## 11. Build de distribución interna

```bash
npm run tauri build
```

Artefactos:
- `src-tauri/target/release/bundle/`

Publicación interna sugerida:
1. Adjuntar binario/instalador en release interna
2. Incluir checksum SHA256
3. Adjuntar este manual + versión

## 11.1 Publicar en GitHub Releases (automatizado)

El repositorio incluye workflow en:
- `.github/workflows/release.yml`

Disparador:
- push de tags con formato `v*` (ej. `v0.2.0`)

Pasos:
```bash
git checkout main
git pull
git tag v0.2.0
git push origin v0.2.0
```

Resultado esperado:
- GitHub Actions compila instaladores por SO y los adjunta en la Release `v0.2.0`.

Verificación:
1. Abrir pestaña `Actions` y validar job en verde.
2. Abrir `Releases` y confirmar artefactos adjuntos.

## 12. Plantilla de reporte a soporte

Copiar/pegar:

```text
[CorvusDB Soporte]
SO:
Version app:
Metodo de tunel (SSM/SSH):
Host/Port local:
DB:
Coleccion:
Error exacto (Last error):
Prueba en mongosh (si/no):
```
