import { FormEvent, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type Profile = {
  id: string;
  name: string;
  host: string;
  port: number;
  tls: boolean;
  ca_file?: string | null;
  auth_source?: string | null;
  auth_mechanism?: string | null;
  username?: string | null;
  default_db?: string | null;
  retry_writes: boolean;
  direct_connection: boolean;
  tls_allow_invalid_hostnames: boolean;
  read_preference?: string | null;
};

type ConnectionForm = {
  id?: string | null;
  name: string;
  host: string;
  port: number;
  tls: boolean;
  ca_file?: string | null;
  auth_source?: string | null;
  auth_mechanism?: string | null;
  username?: string | null;
  password?: string | null;
  default_db?: string | null;
  retry_writes: boolean;
  direct_connection: boolean;
  tls_allow_invalid_hostnames: boolean;
  tunnel_mode: boolean;
  read_preference?: string | null;
};

type CollectionsResponse = { database: string; collections: string[] };

const defaultForm: ConnectionForm = {
  name: "",
  host: "localhost",
  port: 27017,
  tls: true,
  ca_file: "",
  auth_source: "admin",
  auth_mechanism: "SCRAM-SHA-1",
  username: "",
  password: "",
  default_db: "",
  retry_writes: false,
  direct_connection: true,
  tls_allow_invalid_hostnames: true,
  tunnel_mode: true,
  read_preference: "primary"
};

async function call<T>(cmd: string, payload?: unknown): Promise<T> {
  if (payload === undefined) return invoke<T>(cmd);
  return invoke<T>(cmd, { payload });
}

function normalizeSmartQuotes(input: string): string {
  return input
    .replace(/“/g, "\"")
    .replace(/”/g, "\"")
    .replace(/‘/g, "'")
    .replace(/’/g, "'");
}

function parseJsonInput(input: string): unknown {
  const raw = input?.trim() || "{}";
  return JSON.parse(normalizeSmartQuotes(raw));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidStringToBytes(uuid: string): number[] {
  const clean = uuid.replace(/-/g, "");
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    out.push(Number.parseInt(clean.slice(i, i + 2), 16));
  }
  return out;
}

function uuidBytesToBase64(bytes: number[]): string {
  const raw = String.fromCharCode(...bytes);
  return btoa(raw);
}

function uuidToBase64(uuid: string, legacy: boolean): string {
  const bytes = uuidStringToBytes(uuid);
  if (!legacy) return uuidBytesToBase64(bytes);

  // Legacy UUID (subType 03): first three components little-endian.
  const legacyBytes = [
    bytes[3], bytes[2], bytes[1], bytes[0],
    bytes[5], bytes[4],
    bytes[7], bytes[6],
    ...bytes.slice(8)
  ];
  return uuidBytesToBase64(legacyBytes);
}

function uuidBinaryExtJson(uuid: string, subType: "03" | "04") {
  return {
    $binary: {
      base64: uuidToBase64(uuid, subType === "03"),
      subType
    }
  };
}

function expandUuidFilters(input: unknown, parentKey?: string): unknown {
  if (Array.isArray(input)) {
    if (parentKey === "$in") {
      const expanded: unknown[] = [];
      for (const item of input) {
        if (typeof item === "string" && UUID_RE.test(item)) {
          expanded.push(item, uuidBinaryExtJson(item, "04"), uuidBinaryExtJson(item, "03"));
        } else {
          expanded.push(expandUuidFilters(item));
        }
      }
      return expanded;
    }
    return input.map((item) => expandUuidFilters(item, parentKey));
  }

  if (input && typeof input === "object") {
    const obj = input as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      out[key] = expandUuidFilters(value, key);
    }
    return out;
  }

  if (typeof input === "string" && UUID_RE.test(input)) {
    if (parentKey?.startsWith("$")) return input;
    return {
      $in: [input, uuidBinaryExtJson(input, "04"), uuidBinaryExtJson(input, "03")]
    };
  }

  return input;
}

export default function App() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState<ConnectionForm>(defaultForm);
  const [showConnectionForm, setShowConnectionForm] = useState(false);

  const [databases, setDatabases] = useState<string[]>([]);
  const [selectedDatabase, setSelectedDatabase] = useState("");
  const [collections, setCollections] = useState<string[]>([]);
  const [selectedCollection, setSelectedCollection] = useState("");

  const [filter, setFilter] = useState("{}");
  const [projection, setProjection] = useState("{}");
  const [sort, setSort] = useState("{}");
  const [limit, setLimit] = useState(100);
  const [autoUuidMatch, setAutoUuidMatch] = useState(true);

  const [resultJson, setResultJson] = useState("[]");
  const [resultRows, setResultRows] = useState<unknown[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");
  const [actionBusyIndex, setActionBusyIndex] = useState<number | null>(null);
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null);
  const [pendingDeleteRow, setPendingDeleteRow] = useState<unknown | null>(null);
  const [showInsertEditor, setShowInsertEditor] = useState(false);
  const [insertText, setInsertText] = useState("{\n  \n}");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === selectedId) ?? null,
    [profiles, selectedId]
  );

  useEffect(() => {
    void loadConnections();
  }, []);

  useEffect(() => {
    if (!selectedProfile) return;
    setForm((f) => ({
      ...f,
      id: selectedProfile.id,
      name: selectedProfile.name,
      host: selectedProfile.host,
      port: selectedProfile.port,
      tls: selectedProfile.tls,
      ca_file: selectedProfile.ca_file ?? "",
      auth_source: selectedProfile.auth_source ?? "",
      auth_mechanism: selectedProfile.auth_mechanism ?? "SCRAM-SHA-1",
      username: selectedProfile.username ?? "",
      password: "",
      default_db: selectedProfile.default_db ?? "",
      retry_writes: selectedProfile.retry_writes,
      direct_connection: selectedProfile.direct_connection,
      tls_allow_invalid_hostnames: selectedProfile.tls_allow_invalid_hostnames,
      read_preference: selectedProfile.read_preference ?? "primary"
    }));
  }, [selectedProfile]);

  useEffect(() => {
    if (form.tunnel_mode) {
      setForm((f) => ({
        ...f,
        direct_connection: true,
        tls_allow_invalid_hostnames: true
      }));
    }
  }, [form.tunnel_mode]);

  useEffect(() => {
    if (!showInsertEditor) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        cancelInsertDocument();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showInsertEditor]);

  async function loadConnections() {
    try {
      const data = await call<Profile[]>("list_connections");
      setProfiles(data);
      if (!selectedId && data.length) {
        const first = data[0];
        setSelectedId(first.id);
        await loadDatabases(first.id, first.default_db ?? "");
      }
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }

  async function saveConnection(e: FormEvent) {
    e.preventDefault();
    try {
      const authMechanism = form.auth_mechanism?.trim() || null;
      const username = form.username?.trim() || null;
      if ((authMechanism || "").toUpperCase().startsWith("SCRAM") && !username) {
        throw new Error("Username is required when Auth Mechanism is SCRAM");
      }

      const payload: ConnectionForm = {
        ...form,
        id: form.id ?? null,
        name: form.name.trim(),
        host: form.host.trim(),
        ca_file: form.ca_file?.trim() || null,
        auth_source: form.auth_source?.trim() || null,
        auth_mechanism: authMechanism,
        username,
        password: form.password || null,
        default_db: form.default_db?.trim() || null,
        read_preference: form.read_preference?.trim() || null
      };

      const saved = await call<Profile>("save_connection", payload);
      setSelectedId(saved.id);
      setMessage("Connection saved");
      setError("");
      await loadConnections();
      await loadDatabases(saved.id, saved.default_db ?? "");
      setShowConnectionForm(false);
    } catch (e) {
      setError(String(e));
    }
  }

  async function testConnection() {
    if (!selectedId) return;
    try {
      await call("test_connection", { connection_id: selectedId });
      setMessage("Connection OK");
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }

  async function loadDatabases(connectionId: string, preferredDb = "") {
    try {
      const names = await call<string[]>("list_databases", { connection_id: connectionId });
      setDatabases(names);
      const nextDb = preferredDb || names[0] || "";
      setSelectedDatabase(nextDb);
      setCollections([]);
      setSelectedCollection("");
      if (nextDb) {
        await loadCollections(connectionId, nextDb);
      }
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }

  async function loadCollections(connectionId = selectedId, dbName = selectedDatabase) {
    if (!connectionId || !dbName) return;
    try {
      const resp = await call<CollectionsResponse>("list_collections", {
        connection_id: connectionId,
        database: dbName
      });
      setCollections(resp.collections);
      if (resp.collections.length > 0) {
        setSelectedCollection((curr) => curr || resp.collections[0]);
      }
      setMessage(`Loaded ${resp.collections.length} collections`);
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }

  async function runFind() {
    if (!selectedId || !selectedDatabase || !selectedCollection) return;
    try {
      const parsedFilter = parseJsonInput(filter);
      const rows = await call<unknown[]>("run_find_query", {
        connection_id: selectedId,
        database: selectedDatabase,
        collection: selectedCollection,
        filter: autoUuidMatch ? expandUuidFilters(parsedFilter) : parsedFilter,
        projection: parseJsonInput(projection),
        sort: parseJsonInput(sort),
        limit
      });
      setResultRows(rows);
      setResultJson(JSON.stringify(rows, null, 2));
      setMessage(`Query OK (${rows.length} docs)`);
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }

  function getIdFilterFromRow(row: unknown): Record<string, unknown> | null {
    if (!row || typeof row !== "object") return null;
    const idValue = (row as Record<string, unknown>)._id;
    if (idValue === undefined) return null;
    return { _id: idValue };
  }

  async function copyRow(row: unknown) {
    try {
      await navigator.clipboard.writeText(JSON.stringify(row, null, 2));
      setMessage("Document copied to clipboard");
      setError("");
    } catch (e) {
      setError(`Unable to copy document: ${String(e)}`);
    }
  }

  function startEditRow(index: number, row: unknown) {
    setEditingIndex(index);
    setEditingText(JSON.stringify(row, null, 2));
  }

  function cancelEditRow() {
    setEditingIndex(null);
    setEditingText("");
  }

  async function saveEditedRow(index: number) {
    if (editingIndex !== index) return;
    if (!selectedId || !selectedDatabase || !selectedCollection) return;

    try {
      const parsed = parseJsonInput(editingText);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Edited document must be a JSON object");
      }
      const parsedDoc = parsed as Record<string, unknown>;
      if (parsedDoc._id === undefined) {
        throw new Error("Edited document must include _id");
      }

      const updateDoc = { ...parsedDoc };
      delete updateDoc._id;

      const idFilter = { _id: parsedDoc._id };
      setActionBusyIndex(index);
      await call("update_documents", {
        connection_id: selectedId,
        database: selectedDatabase,
        collection: selectedCollection,
        filter: idFilter,
        update: { $set: updateDoc },
        many: false,
        upsert: false
      });
      setMessage("Document updated");
      setError("");
      cancelEditRow();
      await runFind();
    } catch (e) {
      setError(String(e));
    } finally {
      setActionBusyIndex(null);
    }
  }

  async function deleteRow(index: number, row: unknown) {
    setPendingDeleteIndex(index);
    setPendingDeleteRow(row);
  }

  function cancelDeleteRow() {
    setPendingDeleteIndex(null);
    setPendingDeleteRow(null);
  }

  async function confirmDeleteRow() {
    if (!selectedId || !selectedDatabase || !selectedCollection) return;
    if (pendingDeleteIndex === null || !pendingDeleteRow) return;
    const idFilter = getIdFilterFromRow(pendingDeleteRow);
    if (!idFilter) {
      setError("Cannot delete this document: missing _id");
      cancelDeleteRow();
      return;
    }

    try {
      setActionBusyIndex(pendingDeleteIndex);
      await call("delete_documents", {
        connection_id: selectedId,
        database: selectedDatabase,
        collection: selectedCollection,
        filter: idFilter,
        many: false
      });
      setMessage("Document deleted");
      setError("");
      cancelDeleteRow();
      await runFind();
    } catch (e) {
      setError(String(e));
    } finally {
      setActionBusyIndex(null);
    }
  }

  function startInsertDocument() {
    setShowInsertEditor(true);
  }

  function cancelInsertDocument() {
    setShowInsertEditor(false);
    setInsertText("{\n  \n}");
  }

  async function saveInsertDocument() {
    if (!selectedId || !selectedDatabase || !selectedCollection) return;
    try {
      const parsed = parseJsonInput(insertText);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Insert document must be a JSON object");
      }

      await call("insert_document", {
        connection_id: selectedId,
        database: selectedDatabase,
        collection: selectedCollection,
        document: parsed
      });
      setMessage("Document inserted");
      setError("");
      cancelInsertDocument();
      await runFind();
    } catch (e) {
      setError(String(e));
    }
  }

  async function onSelectConnection(id: string) {
    setSelectedId(id);
    setDatabases([]);
    setCollections([]);
    setSelectedDatabase("");
    setSelectedCollection("");
    if (id) {
      const profile = profiles.find((p) => p.id === id);
      await loadDatabases(id, profile?.default_db ?? "");
    }
  }

  async function onSelectDatabase(db: string) {
    setSelectedDatabase(db);
    setCollections([]);
    setSelectedCollection("");
    await loadCollections(selectedId, db);
  }

  function startNewConnection() {
    setForm({ ...defaultForm, id: null });
    setShowConnectionForm(true);
  }

  return (
    <main className="workspace">
      <aside className="sidebar panel">
        <div className="side-header">
          <h1>CorvusDB</h1>
          <p>Explorer</p>
        </div>

        <div className="section-title-row">
          <h2>Connections</h2>
          <div className="actions mini">
            <button className="ghost small" onClick={startNewConnection}>
              New
            </button>
            {showConnectionForm && (
              <button form="connection-form" type="submit" className="small">
                Save
              </button>
            )}
            <button className="ghost small" onClick={() => setShowConnectionForm((s) => !s)}>
              {showConnectionForm ? "Hide" : "Edit"}
            </button>
          </div>
        </div>

        <label>
          Saved
          <select value={selectedId} onChange={(e) => void onSelectConnection(e.target.value)}>
            <option value="">-- choose --</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.host}:{p.port})
              </option>
            ))}
          </select>
        </label>

        <div className="actions compact">
          <button onClick={() => void testConnection()}>Test</button>
          <button className="ghost" onClick={() => void loadConnections()}>Reload</button>
        </div>

        {showConnectionForm && (
          <form id="connection-form" className="conn-form" onSubmit={saveConnection}>
            <h3>Connection Settings</h3>
            <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>Host<input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} /></label>
            <label>Port<input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} /></label>
            <label>Username<input value={form.username ?? ""} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
            <label>Password<input type="password" value={form.password ?? ""} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
            <label>Auth Source<input value={form.auth_source ?? ""} onChange={(e) => setForm({ ...form, auth_source: e.target.value })} /></label>
            <label>Auth Mechanism<input value={form.auth_mechanism ?? ""} onChange={(e) => setForm({ ...form, auth_mechanism: e.target.value })} /></label>
            <label>CA file (.pem)<input value={form.ca_file ?? ""} onChange={(e) => setForm({ ...form, ca_file: e.target.value })} /></label>
            <label>Default DB<input value={form.default_db ?? ""} onChange={(e) => setForm({ ...form, default_db: e.target.value })} /></label>
            <label>Read Preference<input value={form.read_preference ?? ""} onChange={(e) => setForm({ ...form, read_preference: e.target.value })} /></label>
            <div className="checks compact">
              <label><input type="checkbox" checked={form.tls} onChange={(e) => setForm({ ...form, tls: e.target.checked })} /> TLS</label>
              <label><input type="checkbox" checked={form.retry_writes} onChange={(e) => setForm({ ...form, retry_writes: e.target.checked })} /> retryWrites</label>
              <label><input type="checkbox" disabled={form.tunnel_mode} checked={form.direct_connection} onChange={(e) => setForm({ ...form, direct_connection: e.target.checked })} /> directConnection</label>
              <label><input type="checkbox" disabled={form.tunnel_mode} checked={form.tls_allow_invalid_hostnames} onChange={(e) => setForm({ ...form, tls_allow_invalid_hostnames: e.target.checked })} /> tlsInvalidHost</label>
              <label><input type="checkbox" checked={form.tunnel_mode} onChange={(e) => setForm({ ...form, tunnel_mode: e.target.checked })} /> tunnel mode</label>
            </div>
            <button type="submit">Save connection</button>
          </form>
        )}

        <div className="section-title-row">
          <h2>Databases</h2>
          <button className="ghost small" onClick={() => void loadDatabases(selectedId, selectedDatabase)}>Refresh</button>
        </div>
        <div className="tree-list db-list">
          {databases.map((db) => (
            <button
              key={db}
              className={`tree-item ${selectedDatabase === db ? "active" : ""}`}
              onClick={() => void onSelectDatabase(db)}
            >
              {db}
            </button>
          ))}
        </div>

        <h2>Collections</h2>
        <div className="tree-list collections-list">
          {collections.map((c) => (
            <button
              key={c}
              className={`tree-item ${selectedCollection === c ? "active" : ""}`}
              onClick={() => setSelectedCollection(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </aside>

      <section className="main-area">
        <section className="filter-panel panel">
          <div className="section-title-row">
            <h2>Query Filters</h2>
            <div className="actions mini">
              <button className="ghost small" onClick={startInsertDocument}>Insert</button>
              <button onClick={() => void runFind()}>Run find</button>
            </div>
          </div>
          <div className="meta-row">
            <span><strong>DB:</strong> {selectedDatabase || "-"}</span>
            <span><strong>Collection:</strong> {selectedCollection || "-"}</span>
          </div>
          <div className="filter-grid">
            <label>
              Limit
              <input type="number" min={1} max={1000} value={limit} onChange={(e) => setLimit(Number(e.target.value))} />
            </label>
            <label className="inline-check">
              UUID auto-match
              <input
                type="checkbox"
                checked={autoUuidMatch}
                onChange={(e) => setAutoUuidMatch(e.target.checked)}
              />
            </label>
            <label>
              Filter (JSON)
              <textarea
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                data-gramm="false"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </label>
            <label>
              Projection (JSON)
              <textarea
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                data-gramm="false"
                value={projection}
                onChange={(e) => setProjection(e.target.value)}
              />
            </label>
            <label>
              Sort (JSON)
              <textarea
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                data-gramm="false"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              />
            </label>
          </div>
        </section>

        <section className="results-panel panel">
          <div className="section-title-row">
            <h2>Results</h2>
            {message && <p className="ok">{message}</p>}
          </div>
          {error && <pre className="error-log">{error}</pre>}
          <div id="jsonResult" className="result-list">
            {resultRows.length === 0 ? (
              <pre className="result-doc empty">{resultJson}</pre>
            ) : (
              resultRows.map((row, index) => (
                <article key={index} className="result-doc-wrap" tabIndex={0}>
                  <div className="result-actions">
                    <button
                      type="button"
                      className="ghost small"
                      onClick={() => void copyRow(row)}
                    >
                      Copy
                    </button>
                    <button
                      type="button"
                      className="ghost small"
                      onClick={() => startEditRow(index, row)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="danger small"
                      disabled={actionBusyIndex === index}
                      onClick={() => void deleteRow(index, row)}
                    >
                      Delete
                    </button>
                  </div>
                  {editingIndex === index ? (
                    <div className="result-edit-wrap">
                      <textarea
                        className="result-edit"
                        spellCheck={false}
                        autoCorrect="off"
                        autoCapitalize="off"
                        data-gramm="false"
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                      />
                      <div className="result-edit-actions">
                        <button
                          type="button"
                          className="small"
                          disabled={actionBusyIndex === index}
                          onClick={() => void saveEditedRow(index)}
                        >
                          Save
                        </button>
                        <button type="button" className="ghost small" onClick={cancelEditRow}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <pre className="result-doc">{JSON.stringify(row, null, 2)}</pre>
                  )}
                </article>
              ))
            )}
          </div>
        </section>
      </section>

      {showInsertEditor && (
        <div className="modal-overlay" onClick={cancelInsertDocument}>
          <section className="modal panel" onClick={(e) => e.stopPropagation()}>
            <div className="section-title-row">
              <h2>Insert Document</h2>
              <div className="actions mini">
                <button className="small" onClick={() => void saveInsertDocument()}>Save insert</button>
                <button className="ghost small" onClick={cancelInsertDocument}>Cancel</button>
              </div>
            </div>
            <label>
              Document (JSON)
              <textarea
                className="insert-doc"
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                data-gramm="false"
                value={insertText}
                onChange={(e) => setInsertText(e.target.value)}
              />
            </label>
          </section>
        </div>
      )}

      {pendingDeleteIndex !== null && (
        <div className="modal-overlay" onClick={cancelDeleteRow}>
          <section className="modal panel modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="section-title-row">
              <h2>Delete Document</h2>
            </div>
            <p className="modal-copy">This action cannot be undone. Do you want to delete this document?</p>
            <div className="actions">
              <button
                type="button"
                className="danger small"
                disabled={actionBusyIndex === pendingDeleteIndex}
                onClick={() => void confirmDeleteRow()}
              >
                Delete
              </button>
              <button type="button" className="ghost small" onClick={cancelDeleteRow}>
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
