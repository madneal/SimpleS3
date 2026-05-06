import { useEffect, useMemo, useState } from "react";
import { open, save } from "@tauri-apps/api/dialog";
import { invoke } from "@tauri-apps/api/tauri";
import "./App.css";
import Option, { type S3Config } from "./views/Option";

interface Profile {
  id: string;
  name: string;
  config: S3Config;
  rememberSecret: boolean;
}

interface ConnectionReport {
  message: string;
  bucketReachable: boolean;
  buckets: string[];
}

interface RemoteObject {
  key: string;
  name: string;
  kind: "folder" | "object";
  size: number;
  lastModified: string | null;
  storageClass: string | null;
  eTag: string | null;
}

interface ObjectList {
  bucket: string;
  prefix: string;
  objects: RemoteObject[];
  isTruncated: boolean;
  nextToken: string | null;
}

interface ObjectAction {
  key: string;
  size: number;
}

interface StoredCredential {
  secretAccessKey: string;
  sessionToken: string;
}

type StatusKind = "idle" | "busy" | "success" | "error";

interface Status {
  kind: StatusKind;
  text: string;
}

const STORAGE_KEY = "simples3.profiles.v1";

const defaultConfig: S3Config = {
  accessKeyId: "",
  secretAccessKey: "",
  sessionToken: "",
  region: "us-east-1",
  bucketName: "",
  endpoint: "",
  pathStyle: true,
};

const defaultStatus: Status = {
  kind: "idle",
  text: "Ready",
};

function createId() {
  return `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeConfig(config: Partial<S3Config> = {}): S3Config {
  return {
    ...defaultConfig,
    ...config,
    accessKeyId: config.accessKeyId ?? "",
    secretAccessKey: config.secretAccessKey ?? "",
    sessionToken: config.sessionToken ?? "",
    region: config.region ?? defaultConfig.region,
    bucketName: config.bucketName ?? "",
    endpoint: config.endpoint ?? "",
    pathStyle: config.pathStyle ?? defaultConfig.pathStyle,
  };
}

function configForStorage(config: S3Config): S3Config {
  return {
    ...config,
    secretAccessKey: "",
    sessionToken: "",
  };
}

function hasSecretMaterial(config: S3Config) {
  return Boolean(config.secretAccessKey.trim() || config.sessionToken.trim());
}

function hasSavableSecret(config: S3Config) {
  return Boolean(config.secretAccessKey.trim());
}

function sanitizeProfiles(profiles: Profile[]) {
  return profiles.map((profile) => ({
    ...profile,
    config: configForStorage(profile.config),
  }));
}

function loadProfiles(): Profile[] {
  try {
    const rawProfiles = window.localStorage.getItem(STORAGE_KEY);
    if (!rawProfiles) {
      return [];
    }

    const parsed = JSON.parse(rawProfiles) as Partial<Profile>[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map((profile) => {
      const config = normalizeConfig(profile.config);
      return {
        id: profile.id ?? createId(),
        name: profile.name ?? "Untitled profile",
        config,
        rememberSecret: Boolean(profile.rememberSecret ?? hasSecretMaterial(config)),
      };
    });
  } catch {
    return [];
  }
}

function saveProfiles(profiles: Profile[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeProfiles(profiles)));
}

function initialState() {
  const profiles = loadProfiles();
  const activeProfile = profiles[0];

  return {
    profiles,
    activeProfileId: activeProfile?.id ?? null,
    profileName: activeProfile?.name ?? "New profile",
    config: activeProfile?.config ?? defaultConfig,
    rememberSecret: Boolean(activeProfile?.rememberSecret),
  };
}

function formatBytes(bytes: number) {
  if (bytes === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function fileNameFromPath(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? "upload.bin";
}

function objectNameFromKey(key: string) {
  return key.split("/").filter(Boolean).pop() ?? key;
}

function ensurePrefix(prefix: string) {
  const trimmed = prefix.trim().replace(/^\/+/, "");
  return trimmed && !trimmed.endsWith("/") ? `${trimmed}/` : trimmed;
}

function joinKey(prefix: string, name: string) {
  const cleanName = name.trim().replace(/^\/+/, "");
  return `${ensurePrefix(prefix)}${cleanName}`;
}

function buildCrumbs(bucketName: string, prefix: string) {
  const segments = prefix.split("/").filter(Boolean);
  const crumbs = [{ label: bucketName || "Bucket", prefix: "" }];

  segments.forEach((segment, index) => {
    crumbs.push({
      label: segment,
      prefix: `${segments.slice(0, index + 1).join("/")}/`,
    });
  });

  return crumbs;
}

function appendUniqueObjects(currentObjects: RemoteObject[], nextObjects: RemoteObject[]) {
  const knownKeys = new Set(currentObjects.map((object) => object.key));
  return [
    ...currentObjects,
    ...nextObjects.filter((object) => {
      if (knownKeys.has(object.key)) {
        return false;
      }

      knownKeys.add(object.key);
      return true;
    }),
  ];
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function saveProfileSecret(profileId: string, config: S3Config) {
  const credential: StoredCredential = {
    secretAccessKey: config.secretAccessKey,
    sessionToken: config.sessionToken,
  };

  await invoke("save_profile_secret", { profileId, credential });
}

async function loadProfileSecret(profileId: string) {
  return invoke<StoredCredential>("load_profile_secret", { profileId });
}

async function deleteProfileSecret(profileId: string) {
  await invoke("delete_profile_secret", { profileId });
}

function App() {
  const [boot] = useState(initialState);
  const [profiles, setProfiles] = useState<Profile[]>(boot.profiles);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(boot.activeProfileId);
  const [profileName, setProfileName] = useState(boot.profileName);
  const [config, setConfig] = useState<S3Config>(boot.config);
  const [rememberSecret, setRememberSecret] = useState(boot.rememberSecret);
  const [status, setStatus] = useState<Status>(defaultStatus);
  const [connectionReport, setConnectionReport] = useState<ConnectionReport | null>(null);
  const [objects, setObjects] = useState<RemoteObject[]>([]);
  const [prefix, setPrefix] = useState("");
  const [isTruncated, setIsTruncated] = useState(false);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [folderName, setFolderName] = useState("");

  const busy = status.kind === "busy";
  const selectedObject = objects.find((object) => object.key === selectedKey) ?? null;
  const crumbs = buildCrumbs(config.bucketName, prefix);

  const filteredObjects = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) {
      return objects;
    }

    return objects.filter((object) => {
      return (
        object.key.toLowerCase().includes(query) ||
        object.name.toLowerCase().includes(query) ||
        object.kind.toLowerCase().includes(query)
      );
    });
  }, [objects, searchTerm]);

  const objectCount = objects.filter((object) => object.kind === "object").length;
  const folderCount = objects.filter((object) => object.kind === "folder").length;
  const totalSize = objects.reduce((size, object) => size + object.size, 0);

  const setProfileStore = (nextProfiles: Profile[]) => {
    const sanitizedProfiles = sanitizeProfiles(nextProfiles);
    setProfiles(sanitizedProfiles);
    saveProfiles(sanitizedProfiles);
  };

  const selectProfile = async (profile: Profile) => {
    setActiveProfileId(profile.id);
    setProfileName(profile.name);
    setConfig(profile.config);
    setRememberSecret(profile.rememberSecret);
    setConnectionReport(null);
    setObjects([]);
    setPrefix("");
    setIsTruncated(false);
    setNextToken(null);
    setSelectedKey(null);
    setStatus(defaultStatus);

    if (profile.rememberSecret) {
      try {
        setStatus({ kind: "busy", text: "Loading saved secret" });
        const credential = await loadProfileSecret(profile.id);
        setConfig({
          ...profile.config,
          secretAccessKey: credential.secretAccessKey,
          sessionToken: credential.sessionToken,
        });
        setStatus({ kind: "success", text: "Saved secret loaded" });
      } catch (error) {
        setStatus({ kind: "error", text: safeError(error) });
      }
    }
  };

  const createProfile = () => {
    setActiveProfileId(null);
    setProfileName("New profile");
    setConfig(defaultConfig);
    setRememberSecret(false);
    setConnectionReport(null);
    setObjects([]);
    setPrefix("");
    setIsTruncated(false);
    setNextToken(null);
    setSelectedKey(null);
    setStatus(defaultStatus);
  };

  const saveProfile = async () => {
    const name = profileName.trim() || config.bucketName.trim() || "Untitled profile";
    const profileId = activeProfileId ?? createId();
    const existingProfile = profiles.find((profile) => profile.id === profileId);
    const shouldKeepExistingSecret = rememberSecret && Boolean(existingProfile?.rememberSecret) && !hasSavableSecret(config);
    const shouldRememberSecret = rememberSecret && (hasSavableSecret(config) || shouldKeepExistingSecret);

    if (rememberSecret && !shouldRememberSecret) {
      setStatus({ kind: "error", text: "Enter a secret access key before saving it to the keychain" });
      return;
    }

    try {
      setStatus({ kind: "busy", text: "Saving profile" });

      if (rememberSecret && hasSavableSecret(config)) {
        await saveProfileSecret(profileId, config);
      } else if (!rememberSecret && activeProfileId) {
        await deleteProfileSecret(profileId);
      }

      const nextProfile: Profile = {
        id: profileId,
        name,
        config: configForStorage(config),
        rememberSecret: shouldRememberSecret,
      };
      const exists = profiles.some((profile) => profile.id === nextProfile.id);
      const nextProfiles = exists
        ? profiles.map((profile) => (profile.id === nextProfile.id ? nextProfile : profile))
        : [nextProfile, ...profiles];

      setActiveProfileId(nextProfile.id);
      setProfileName(name);
      setProfileStore(nextProfiles);
      setStatus({
        kind: "success",
        text: shouldRememberSecret ? "Profile saved. Secret stored in keychain." : "Profile saved",
      });
    } catch (error) {
      setStatus({ kind: "error", text: safeError(error) });
    }
  };

  const forgetProfileSecret = async () => {
    if (!activeProfileId) {
      return;
    }

    try {
      setStatus({ kind: "busy", text: "Removing saved secret" });
      await deleteProfileSecret(activeProfileId);
      const nextProfiles = profiles.map((profile) =>
        profile.id === activeProfileId
          ? { ...profile, rememberSecret: false, config: configForStorage(profile.config) }
          : profile,
      );

      setProfileStore(nextProfiles);
      setRememberSecret(false);
      setConfig((currentConfig) => ({
        ...currentConfig,
        secretAccessKey: "",
        sessionToken: "",
      }));
      setStatus({ kind: "success", text: "Saved secret removed" });
    } catch (error) {
      setStatus({ kind: "error", text: safeError(error) });
    }
  };

  const migrateLegacySecrets = async (legacyProfiles: Profile[]) => {
    try {
      for (const profile of legacyProfiles) {
        if (profile.rememberSecret && hasSavableSecret(profile.config)) {
          await saveProfileSecret(profile.id, profile.config);
        }
      }

      setProfileStore(legacyProfiles);
      setStatus({ kind: "success", text: "Saved secrets moved to keychain" });
    } catch (error) {
      setStatus({ kind: "error", text: `Could not move saved secrets to keychain: ${safeError(error)}` });
    }
  };

  useEffect(() => {
    const legacyProfiles = boot.profiles.filter((profile) => hasSecretMaterial(profile.config));
    if (legacyProfiles.length) {
      void migrateLegacySecrets(boot.profiles);
      return;
    }

    const activeProfile = boot.profiles.find((profile) => profile.id === boot.activeProfileId);
    if (activeProfile?.rememberSecret) {
      void selectProfile(activeProfile);
    }
  }, []);

  const updateConfig = (nextConfig: S3Config) => {
    setConfig(nextConfig);
    setConnectionReport(null);
  };

  const loadObjects = async (
    targetPrefix = prefix,
    targetConfig = config,
    continuationToken: string | null = null,
  ) => {
    setStatus({ kind: "busy", text: continuationToken ? "Loading more objects" : "Loading objects" });
    const response = await invoke<ObjectList>("list_objects", {
      config: targetConfig,
      prefix: targetPrefix,
      continuationToken,
    });
    setObjects((currentObjects) =>
      continuationToken ? appendUniqueObjects(currentObjects, response.objects) : response.objects,
    );
    setPrefix(response.prefix);
    setIsTruncated(response.isTruncated);
    setNextToken(response.nextToken);
    if (!continuationToken) {
      setSelectedKey(null);
    }
    setStatus({
      kind: "success",
      text: continuationToken
        ? `${response.objects.length} more items loaded`
        : `${response.objects.length} items loaded`,
    });
  };

  const testConnection = async () => {
    try {
      setStatus({ kind: "busy", text: "Testing connection" });
      const report = await invoke<ConnectionReport>("test_connection", { config });
      setConnectionReport(report);
      setStatus({ kind: "success", text: report.message });

      if (config.bucketName.trim()) {
        await loadObjects("", config);
      }
    } catch (error) {
      setConnectionReport(null);
      setStatus({ kind: "error", text: safeError(error) });
    }
  };

  const refreshObjects = async () => {
    try {
      await loadObjects();
    } catch (error) {
      setStatus({ kind: "error", text: safeError(error) });
    }
  };

  const loadMoreObjects = async () => {
    if (!nextToken) {
      return;
    }

    try {
      await loadObjects(prefix, config, nextToken);
    } catch (error) {
      setStatus({ kind: "error", text: safeError(error) });
    }
  };

  const enterFolder = async (key: string) => {
    try {
      await loadObjects(key);
    } catch (error) {
      setStatus({ kind: "error", text: safeError(error) });
    }
  };

  const chooseBucket = async (bucketName: string) => {
    const nextConfig = { ...config, bucketName };
    setConfig(nextConfig);

    try {
      await loadObjects("", nextConfig);
    } catch (error) {
      setStatus({ kind: "error", text: safeError(error) });
    }
  };

  const uploadObject = async () => {
    const selectedPath = await open({ multiple: false });
    if (!selectedPath || Array.isArray(selectedPath)) {
      return;
    }

    const key = joinKey(prefix, fileNameFromPath(selectedPath));

    try {
      setStatus({ kind: "busy", text: "Uploading object" });
      const action = await invoke<ObjectAction>("upload_file", {
        config,
        filePath: selectedPath,
        key,
      });
      setStatus({ kind: "success", text: `Uploaded ${formatBytes(action.size)}` });
      await loadObjects();
    } catch (error) {
      setStatus({ kind: "error", text: safeError(error) });
    }
  };

  const downloadSelectedObject = async () => {
    if (!selectedObject || selectedObject.kind !== "object") {
      return;
    }

    const destinationPath = await save({
      defaultPath: objectNameFromKey(selectedObject.key),
    });

    if (!destinationPath) {
      return;
    }

    try {
      setStatus({ kind: "busy", text: "Downloading object" });
      const action = await invoke<ObjectAction>("download_object", {
        config,
        key: selectedObject.key,
        destinationPath,
      });
      setStatus({ kind: "success", text: `Downloaded ${formatBytes(action.size)}` });
    } catch (error) {
      setStatus({ kind: "error", text: safeError(error) });
    }
  };

  const deleteSelectedObject = async () => {
    if (!selectedObject) {
      return;
    }

    const confirmed = window.confirm(`Delete ${selectedObject.key}?`);
    if (!confirmed) {
      return;
    }

    try {
      setStatus({ kind: "busy", text: "Deleting object" });
      await invoke<ObjectAction>("delete_object", {
        config,
        key: selectedObject.key,
      });
      setStatus({ kind: "success", text: "Object deleted" });
      await loadObjects();
    } catch (error) {
      setStatus({ kind: "error", text: safeError(error) });
    }
  };

  const createFolder = async () => {
    const cleanFolderName = folderName.trim().replace(/^\/+|\/+$/g, "");
    if (!cleanFolderName) {
      return;
    }

    try {
      setStatus({ kind: "busy", text: "Creating folder" });
      await invoke<ObjectAction>("create_folder", {
        config,
        key: joinKey(prefix, cleanFolderName),
      });
      setFolderName("");
      setStatus({ kind: "success", text: "Folder created" });
      await loadObjects();
    } catch (error) {
      setStatus({ kind: "error", text: safeError(error) });
    }
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div>
            <span className="eyebrow">SimpleS3</span>
            <h1>S3 Manager</h1>
          </div>
          <span className={`status-dot ${status.kind}`} />
        </div>

        <section className="profile-section" aria-label="Profiles">
          <div className="section-title-row">
            <h2>Profiles</h2>
            <button className="icon-button" type="button" onClick={createProfile} title="New profile">
              +
            </button>
          </div>
          <div className="profile-list">
            {profiles.length === 0 ? (
              <div className="empty-compact">No saved profiles</div>
            ) : (
              profiles.map((profile) => (
                <button
                  className={`profile-item ${activeProfileId === profile.id ? "active" : ""}`}
                  key={profile.id}
                  type="button"
                  onClick={() => void selectProfile(profile)}
                >
                  <span>{profile.name}</span>
                  <small>{profile.config.bucketName || profile.config.endpoint || "Unassigned"}</small>
                </button>
              ))
            )}
          </div>
        </section>

        <Option
          profileName={profileName}
          config={config}
          rememberSecret={rememberSecret}
          busy={busy}
          canForgetSecret={Boolean(activeProfileId && rememberSecret)}
          onProfileNameChange={setProfileName}
          onConfigChange={updateConfig}
          onRememberSecretChange={setRememberSecret}
          onSave={() => void saveProfile()}
          onForgetSecret={() => void forgetProfileSecret()}
          onTest={testConnection}
        />
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <div className="bucket-label">{config.bucketName || "No bucket selected"}</div>
            <div className="endpoint-line">{config.endpoint || "AWS S3 default endpoint"}</div>
          </div>
          <div className="topbar-actions">
            <button className="secondary-button" type="button" onClick={refreshObjects} disabled={busy}>
              Refresh
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={downloadSelectedObject}
              disabled={busy || !selectedObject || selectedObject.kind !== "object"}
            >
              Download
            </button>
            <button
              className="danger-button"
              type="button"
              onClick={deleteSelectedObject}
              disabled={busy || !selectedObject}
            >
              Delete
            </button>
            <button className="primary-button" type="button" onClick={uploadObject} disabled={busy}>
              Upload
            </button>
          </div>
        </header>

        <div className={`status-strip ${status.kind}`}>
          <span>{status.text}</span>
          {connectionReport?.bucketReachable ? <strong>Bucket reachable</strong> : null}
        </div>

        {connectionReport?.buckets.length ? (
          <div className="bucket-strip">
            {connectionReport.buckets.map((bucket) => (
              <button
                key={bucket}
                className={bucket === config.bucketName ? "bucket-chip active" : "bucket-chip"}
                type="button"
                onClick={() => chooseBucket(bucket)}
              >
                {bucket}
              </button>
            ))}
          </div>
        ) : null}

        <section className="object-toolbar">
          <nav className="crumbs" aria-label="Prefix">
            {crumbs.map((crumb, index) => (
              <button
                key={`${crumb.prefix}-${index}`}
                type="button"
                onClick={() => enterFolder(crumb.prefix)}
                disabled={busy || crumb.prefix === prefix}
              >
                {crumb.label}
              </button>
            ))}
          </nav>
          <div className="object-tools">
            <input
              className="search-input"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search objects"
            />
            <input
              className="folder-input"
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              placeholder="Folder name"
            />
            <button className="secondary-button" type="button" onClick={createFolder} disabled={busy}>
              New Folder
            </button>
          </div>
        </section>

        <section className="metrics-grid" aria-label="Object metrics">
          <div>
            <span>Objects</span>
            <strong>{objectCount}</strong>
          </div>
          <div>
            <span>Folders</span>
            <strong>{folderCount}</strong>
          </div>
          <div>
            <span>Total size</span>
            <strong>{formatBytes(totalSize)}</strong>
          </div>
          <div>
            <span>Prefix</span>
            <strong>{prefix || "/"}</strong>
          </div>
        </section>

        <section className="object-panel">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Size</th>
                  <th>Modified</th>
                  <th>Storage</th>
                </tr>
              </thead>
              <tbody>
                {filteredObjects.length === 0 ? (
                  <tr>
                    <td className="empty-table" colSpan={5}>
                      No objects
                    </td>
                  </tr>
                ) : (
                  filteredObjects.map((object) => (
                    <tr
                      key={object.key}
                      className={selectedKey === object.key ? "selected" : ""}
                      onClick={() => setSelectedKey(object.key)}
                      onDoubleClick={() => object.kind === "folder" && enterFolder(object.key)}
                    >
                      <td>
                        <span className={`object-icon ${object.kind}`}>
                          {object.kind === "folder" ? "DIR" : "OBJ"}
                        </span>
                        <span>{object.name || object.key}</span>
                      </td>
                      <td>{object.kind}</td>
                      <td>{object.kind === "folder" ? "-" : formatBytes(object.size)}</td>
                      <td>{formatDate(object.lastModified)}</td>
                      <td>{object.storageClass ?? "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {isTruncated || nextToken ? (
            <div className="pagination-bar">
              <span>More objects are available for this prefix.</span>
              <button
                className="secondary-button"
                type="button"
                onClick={loadMoreObjects}
                disabled={busy || !nextToken}
              >
                Load more
              </button>
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}

export default App;
