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

  const [resultJson, setResultJson] = useState("[]");
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
        id: form.id ?? (selectedId || null),
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
      const rows = await call<unknown[]>("run_find_query", {
        connection_id: selectedId,
        database: selectedDatabase,
        collection: selectedCollection,
        filter: parseJsonInput(filter),
        projection: parseJsonInput(projection),
        sort: parseJsonInput(sort),
        limit
      });
      setResultJson(JSON.stringify(rows, null, 2));
      setMessage(`Query OK (${rows.length} docs)`);
      setError("");
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
        <div className="tree-list">
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
        <div className="tree-list">
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
            <button onClick={() => void runFind()}>Run find</button>
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
          <pre id="jsonResult">{resultJson}</pre>
        </section>
      </section>
    </main>
  );
}
