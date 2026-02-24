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

export default function App() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState<ConnectionForm>(defaultForm);
  const [database, setDatabase] = useState("");
  const [collection, setCollection] = useState("");
  const [filter, setFilter] = useState("{}");
  const [projection, setProjection] = useState("{}");
  const [sort, setSort] = useState("{}");
  const [limit, setLimit] = useState(100);
  const [collections, setCollections] = useState<string[]>([]);
  const [resultJson, setResultJson] = useState("[]");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const selected = useMemo(
    () => profiles.find((p) => p.id === selectedId) ?? null,
    [profiles, selectedId]
  );

  useEffect(() => {
    void loadConnections();
  }, []);

  useEffect(() => {
    if (!selected) return;
    setForm((f) => ({
      ...f,
      id: selected.id,
      name: selected.name,
      host: selected.host,
      port: selected.port,
      tls: selected.tls,
      ca_file: selected.ca_file ?? "",
      auth_source: selected.auth_source ?? "",
      auth_mechanism: selected.auth_mechanism ?? "SCRAM-SHA-1",
      username: selected.username ?? "",
      password: "",
      default_db: selected.default_db ?? "",
      retry_writes: selected.retry_writes,
      direct_connection: selected.direct_connection,
      tls_allow_invalid_hostnames: selected.tls_allow_invalid_hostnames,
      read_preference: selected.read_preference ?? "primary"
    }));
    if (selected.default_db) setDatabase(selected.default_db);
  }, [selected]);

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
      if (!selectedId && data.length) setSelectedId(data[0].id);
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }

  async function saveConnection(e: FormEvent) {
    e.preventDefault();
    try {
      const payload: ConnectionForm = {
        ...form,
        id: form.id ?? (selectedId || null),
        name: form.name.trim(),
        host: form.host.trim(),
        ca_file: form.ca_file?.trim() || null,
        auth_source: form.auth_source?.trim() || null,
        auth_mechanism: form.auth_mechanism?.trim() || null,
        username: form.username?.trim() || null,
        password: form.password || null,
        default_db: form.default_db?.trim() || null,
        read_preference: form.read_preference?.trim() || null
      };
      const saved = await call<Profile>("save_connection", payload);
      setSelectedId(saved.id);
      setMessage("Connection saved");
      setError("");
      await loadConnections();
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

  async function loadCollections() {
    if (!selectedId || !database.trim()) return;
    try {
      const resp = await call<CollectionsResponse>("list_collections", {
        connection_id: selectedId,
        database: database.trim()
      });
      setCollections(resp.collections);
      setMessage(`Loaded ${resp.collections.length} collections`);
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }

  async function runFind() {
    if (!selectedId || !database.trim() || !collection.trim()) return;
    try {
      const rows = await call<unknown[]>("run_find_query", {
        connection_id: selectedId,
        database: database.trim(),
        collection: collection.trim(),
        filter: JSON.parse(filter || "{}"),
        projection: JSON.parse(projection || "{}"),
        sort: JSON.parse(sort || "{}"),
        limit
      });
      setResultJson(JSON.stringify(rows, null, 2));
      setMessage(`Query OK (${rows.length} docs)`);
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <main className="app">
      <header className="hero">
        <h1>CorvusDB</h1>
        <p>Internal MongoDB/DocumentDB explorer (Tauri)</p>
      </header>

      <section className="panel">
        <h2>Connection Manager</h2>
        <form onSubmit={saveConnection}>
          <div className="grid two">
            <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>Host<input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} /></label>
            <label>Port<input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} /></label>
            <label>Auth Source<input value={form.auth_source ?? ""} onChange={(e) => setForm({ ...form, auth_source: e.target.value })} /></label>
            <label>Auth Mechanism<input value={form.auth_mechanism ?? ""} onChange={(e) => setForm({ ...form, auth_mechanism: e.target.value })} /></label>
            <label>Username<input value={form.username ?? ""} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
            <label>Password<input type="password" value={form.password ?? ""} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
            <label>Default DB<input value={form.default_db ?? ""} onChange={(e) => setForm({ ...form, default_db: e.target.value })} /></label>
            <label>Read Preference<input value={form.read_preference ?? ""} onChange={(e) => setForm({ ...form, read_preference: e.target.value })} /></label>
            <label>CA file (.pem)<input value={form.ca_file ?? ""} onChange={(e) => setForm({ ...form, ca_file: e.target.value })} /></label>
          </div>
          <div className="checks">
            <label><input type="checkbox" checked={form.tls} onChange={(e) => setForm({ ...form, tls: e.target.checked })} /> TLS</label>
            <label><input type="checkbox" checked={form.retry_writes} onChange={(e) => setForm({ ...form, retry_writes: e.target.checked })} /> retryWrites</label>
            <label><input type="checkbox" disabled={form.tunnel_mode} checked={form.direct_connection} onChange={(e) => setForm({ ...form, direct_connection: e.target.checked })} /> directConnection</label>
            <label><input type="checkbox" disabled={form.tunnel_mode} checked={form.tls_allow_invalid_hostnames} onChange={(e) => setForm({ ...form, tls_allow_invalid_hostnames: e.target.checked })} /> tlsAllowInvalidHostnames</label>
            <label><input type="checkbox" checked={form.tunnel_mode} onChange={(e) => setForm({ ...form, tunnel_mode: e.target.checked })} /> tunnel mode</label>
          </div>
          <div className="actions">
            <button type="submit">Save connection</button>
            <button type="button" className="ghost" onClick={() => void loadConnections()}>Reload</button>
          </div>
        </form>

        <label>Saved connections
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            <option value="">-- choose a connection --</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.host}:{p.port})</option>
            ))}
          </select>
        </label>
        <div className="actions">
          <button type="button" onClick={() => void testConnection()}>Test selected connection</button>
        </div>
        {error && <pre className="error-log">{error}</pre>}
        {message && <p className="ok">{message}</p>}
      </section>

      <section className="panel">
        <h2>Explorer</h2>
        <label>Database
          <input value={database} onChange={(e) => setDatabase(e.target.value)} />
        </label>
        <div className="actions">
          <button type="button" onClick={() => void loadCollections()}>Load collections</button>
        </div>
        <ul className="collections">
          {collections.map((c) => (
            <li key={c}><button type="button" className="link" onClick={() => setCollection(c)}>{c}</button></li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Find</h2>
        <div className="grid two">
          <label>Collection<input value={collection} onChange={(e) => setCollection(e.target.value)} /></label>
          <label>Limit<input type="number" min={1} max={1000} value={limit} onChange={(e) => setLimit(Number(e.target.value))} /></label>
        </div>
        <div className="grid one">
          <label>Filter (JSON)<textarea value={filter} onChange={(e) => setFilter(e.target.value)} /></label>
          <label>Projection (JSON)<textarea value={projection} onChange={(e) => setProjection(e.target.value)} /></label>
          <label>Sort (JSON)<textarea value={sort} onChange={(e) => setSort(e.target.value)} /></label>
        </div>
        <div className="actions">
          <button type="button" onClick={() => void runFind()}>Run find</button>
        </div>
        <pre id="jsonResult">{resultJson}</pre>
      </section>
    </main>
  );
}
