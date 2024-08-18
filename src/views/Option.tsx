import React, { useState } from 'react';
import './style.css';

interface S3OptionsProps {
    initialConfig?: {
        accessKeyId: string;
        secretAccessKey: string;
        region: string;
        bucketName: string;
    };
    onSubmit: (config: S3Config) => void;
}

interface S3Config {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    bucketName: string;
}

const Option: React.FC<S3OptionsProps> = ({ initialConfig, onSubmit }) => {
    const [config, setConfig] = useState<S3Config>(
        initialConfig || {
            accessKeyId: '',
            secretAccessKey: '',
            region: '',
            bucketName: '',
        }
    );

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setConfig({
            ...config,
            [name]: value,
        });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(config);
    };

    return (
        <form onSubmit={handleSubmit}>
            <div>
                <label>
                    AK:
                    <input
                        type="text"
                        name="accessKeyId"
                        value={config.accessKeyId}
                        onChange={handleChange}
                        required
                    />
                </label>
            </div>
            <div>
                <label>
                    SK:
                    <input
                        type="password"
                        name="secretAccessKey"
                        value={config.secretAccessKey}
                        onChange={handleChange}
                        required
                    />
                </label>
            </div>
            <div>
                <label>
                    Region:
                    <input
                        type="text"
                        name="region"
                        value={config.region}
                        onChange={handleChange}
                        required
                    />
                </label>
            </div>
            <div>
                <label>
                    Bucket Name:
                    <input
                        type="text"
                        name="bucketName"
                        value={config.bucketName}
                        onChange={handleChange}
                        required
                    />
                </label>
            </div>
            <div>
                <label>
                    Bucket Name:
                    <input
                        type="text"
                        name="bucketName"
                        value={config.bucketName}
                        onChange={handleChange}
                        required
                    />
                </label>
            </div>
            <button type="submit">Save Configuration</button>
        </form>
    );
};

export default Option;