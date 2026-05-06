import type { ChangeEvent, FormEvent } from "react";
import "./style.css";

export interface S3Config {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  region: string;
  bucketName: string;
  endpoint: string;
  pathStyle: boolean;
}

interface S3OptionsProps {
  profileName: string;
  config: S3Config;
  rememberSecret: boolean;
  busy: boolean;
  canForgetSecret: boolean;
  onProfileNameChange: (name: string) => void;
  onConfigChange: (config: S3Config) => void;
  onRememberSecretChange: (rememberSecret: boolean) => void;
  onSave: () => void;
  onForgetSecret: () => void;
  onTest: () => void;
}

const Option = ({
  profileName,
  config,
  rememberSecret,
  busy,
  canForgetSecret,
  onProfileNameChange,
  onConfigChange,
  onRememberSecretChange,
  onSave,
  onForgetSecret,
  onTest,
}: S3OptionsProps) => {
  const handleConfigChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, type, checked, value } = event.target;
    onConfigChange({
      ...config,
      [name]: type === "checkbox" ? checked : value,
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onTest();
  };

  return (
    <form className="connection-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>Profile</span>
        <input
          name="profileName"
          value={profileName}
          onChange={(event) => onProfileNameChange(event.target.value)}
          placeholder="Production assets"
        />
      </label>

      <label className="field">
        <span>Access key ID</span>
        <input
          name="accessKeyId"
          value={config.accessKeyId}
          onChange={handleConfigChange}
          autoComplete="username"
          required
        />
      </label>

      <label className="field">
        <span>Secret access key</span>
        <input
          name="secretAccessKey"
          type="password"
          value={config.secretAccessKey}
          onChange={handleConfigChange}
          autoComplete="current-password"
          required
        />
      </label>

      <label className="field">
        <span>Session token</span>
        <input
          name="sessionToken"
          type="password"
          value={config.sessionToken}
          onChange={handleConfigChange}
          autoComplete="off"
        />
      </label>

      <div className="field-grid">
        <label className="field">
          <span>Region</span>
          <input
            name="region"
            value={config.region}
            onChange={handleConfigChange}
            placeholder="us-east-1"
            required
          />
        </label>

        <label className="field">
          <span>Bucket</span>
          <input
            name="bucketName"
            value={config.bucketName}
            onChange={handleConfigChange}
            required
          />
        </label>
      </div>

      <label className="field">
        <span>Endpoint URL</span>
        <input
          name="endpoint"
          value={config.endpoint}
          onChange={handleConfigChange}
          placeholder="https://s3.amazonaws.com"
        />
      </label>

      <label className="check-row">
        <input
          name="pathStyle"
          type="checkbox"
          checked={config.pathStyle}
          onChange={handleConfigChange}
        />
        <span>Path-style requests</span>
      </label>

      <label className="check-row">
        <input
          type="checkbox"
          checked={rememberSecret}
          onChange={(event) => onRememberSecretChange(event.target.checked)}
        />
        <span>Save secret in OS keychain</span>
      </label>

      <div className="connection-actions">
        <button type="submit" className="primary-button" disabled={busy}>
          Test
        </button>
        <button type="button" className="secondary-button" onClick={onSave} disabled={busy}>
          Save
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={onForgetSecret}
          disabled={busy || !canForgetSecret}
        >
          Forget Secret
        </button>
      </div>
    </form>
  );
};

export default Option;
