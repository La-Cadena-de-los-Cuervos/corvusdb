Objetivo del producto

Nombre del producto:CorvusDB

Una app tipo Compass que:
	•	Guarde perfiles de conexión (host/puerto/tls/CA file, authSource, usuario, DB default).
	•	Permita explorar: databases → collections → documentos.
	•	Ejecute queries (find/aggregate) con UI (filtros, sort, limit).
	•	Edite documentos (JSON editor + formulario básico).
	•	Inserte/actualice/elimine documentos con confirmaciones.
	•	Funcione bien con particularidades de DocumentDB (TLS, retryWrites=false, compat).

⸻

Decisiones de arquitectura (recomendado)

Opción A (más fácil de distribuir internamente)

Tauri (Rust) + UI web (React/Vue) + backend local
	•	UI: React (o Vue) con Monaco Editor para JSON
	•	Backend (Rust en Tauri): maneja conexión Mongo/DocDB y expone RPC al frontend
	•	Ventaja: binario único, sin servidor, muy rápido, ideal para VPN/SSM tunnels

Opción B (web app centralizada)

Frontend web + API backend
	•	Backend: Node (Express) o Rust (Axum)
	•	Pro: multiusuario, roles, auditoría
	•	Contra: manejo de credenciales es más delicado

Para tu caso (conexiones por túnel/SSM/VPN y uso interno), Opción A es la más cómoda.

⸻

Pilares técnicos (DocDB-friendly)
	•	Conexión: MongoDB driver (Node o Rust) con parámetros:
	•	TLS on
	•	CA bundle
	•	retryWrites=false
	•	directConnection=true cuando sea localhost/túnel
	•	readPreference=primary para operaciones de edición
	•	authSource=admin cuando aplique
	•	No depender de comandos “problemáticos” (lo que rompe Compass):
	•	Evitar introspección agresiva (listDatabases si no hace falta)
	•	Tratar errores de “not supported” y continuar

⸻

Funcionalidades MVP (4–6 pantallas)
	1.	Connection Manager
	•	Crear/editar conexiones: nombre, URI builder (campos), test connection
	•	Guardar credenciales en Keychain (macOS) / encrypted storage
	•	Soportar múltiples perfiles
	2.	Explorer
	•	Sidebar: DBs y colecciones
	•	Cargar colecciones de la DB seleccionada
	•	Mostrar conteo aproximado/rápido (opcional)
	3.	Query Workspace
	•	Tabs por colección
	•	Builder básico: filter (JSON), projection, sort, limit
	•	Botón “Run”
	•	Result grid (tabla) + vista JSON
	4.	Document Viewer/Editor
	•	Editor JSON (Monaco) + “Apply”
	•	Validaciones:
	•	impedir cambios a _id (o hacerlo con advertencia)
	•	Botones: Insert, Update, Delete con confirmación
	5.	Aggregation (lite)
	•	Input JSON para pipeline ([ {...}, ... ])
	•	Resultado grid/JSON

⸻

Funciones “anti-dolor” específicas para DocumentDB
	•	Modo túnel: un toggle que ajusta automáticamente:
	•	directConnection=true
	•	quita replicaSet
	•	Modo seguro:
	•	forzar readPreference=primary cuando el usuario quiera editar
	•	Manejo de permisos:
	•	“Conectar directo a DB” (no listar todas)
	•	Si falla listDatabases, permitir que el usuario escriba el nombre de la DB manualmente y seguir

⸻

Seguridad (muy importante)
	•	Credenciales nunca en texto plano:
	•	macOS: Keychain
	•	Linux/Windows: encrypted store (libsodium/OS keystore)
	•	Opción de conectar usando:
	•	usuario/password
	•	o “Secret name” (si luego quieres leer de AWS Secrets Manager, opcional)
	•	Logs locales sin imprimir password/URI completo

⸻

Plan por fases

Fase 0 — Spike técnico (1–2 días)
	•	Conectar a DocDB con 2 perfiles (admin y no-admin)
	•	Listar colecciones de una DB conocida
	•	Find con filtro JSON + render

Fase 1 — MVP navegable
	•	Connection Manager + Test connection
	•	Explorer (db manual + colecciones)
	•	Query + grid + JSON viewer

Fase 2 — Edición
	•	Update/Insert/Delete
	•	Confirmaciones + “diff” previo
	•	Historial local de queries

Fase 3 — Calidad
	•	Paginación real (cursor)
	•	Export JSON/CSV
	•	Favoritos de colecciones
	•	Tema oscuro, atajos de teclado

Fase 4 — Multiusuario (si haces opción web)
	•	Roles (lectura vs escritura)
	•	Auditoría (quién cambió qué)
	•	Integración SSO

⸻

Stack recomendado (si vas con Tauri)
	•	Tauri + Rust
	•	Mongo driver para Rust (o llamar a mongosh internamente, pero mejor driver)
	•	React + TypeScript
	•	Monaco Editor (json)
	•	Data grid (AG Grid community o TanStack Table)
	•	Storage
	•	Config no sensible en sqlite/local json
	•	Password en Keychain

⸻

Entregables que podemos armar ya
	1.	Estructura del repo (carpetas Tauri/React)
	2.	Modelo de datos de conexión + migración
	3.	Implementación de “Test connection” + listar colecciones
	4.	UI de query + resultados + editor

⸻

Si me dices cuál ruta quieres (Tauri desktop vs web), te dejo un blueprint de repo con:
	•	estructura de proyecto
	•	endpoints/RPC
	•	tipos TypeScript
	•	pantallas
	•	y el flujo completo de “connect → list collections → find → update”.

Por lo que ya vienes haciendo (Rust + Tauri + Axum), mi recomendación: Tauri + Rust para el “Compass interno” y te queda increíble para uso por VPN/SSM.