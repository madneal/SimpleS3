#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use aws_credential_types::Credentials;
use aws_sdk_s3::{config::Region, primitives::ByteStream, Client, Config};
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct S3Config {
    access_key_id: String,
    secret_access_key: String,
    region: String,
    bucket_name: String,
    endpoint: String,
    path_style: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnectionReport {
    message: String,
    bucket_reachable: bool,
    buckets: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ObjectEntry {
    key: String,
    name: String,
    kind: String,
    size: i64,
    last_modified: Option<String>,
    storage_class: Option<String>,
    e_tag: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ObjectList {
    bucket: String,
    prefix: String,
    objects: Vec<ObjectEntry>,
    is_truncated: bool,
    next_token: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ObjectAction {
    key: String,
    size: i64,
}

fn required(value: &str, label: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        Err(format!("{label} is required"))
    } else {
        Ok(trimmed.to_owned())
    }
}

fn client_from(config: &S3Config) -> Result<Client, String> {
    let access_key_id = required(&config.access_key_id, "Access key ID")?;
    let secret_access_key = required(&config.secret_access_key, "Secret access key")?;
    let region = required(&config.region, "Region")?;

    let credentials = Credentials::new(
        access_key_id,
        secret_access_key,
        None,
        None,
        "simples3-static-credentials",
    );

    let mut builder = Config::builder()
        .credentials_provider(credentials)
        .region(Region::new(region))
        .force_path_style(config.path_style);

    let endpoint = config.endpoint.trim();
    if !endpoint.is_empty() {
        builder = builder.endpoint_url(endpoint.to_owned());
    }

    Ok(Client::from_conf(builder.build()))
}

fn bucket_name(config: &S3Config) -> Result<String, String> {
    required(&config.bucket_name, "Bucket name")
}

fn display_name(key: &str, prefix: &str) -> String {
    let relative = key.strip_prefix(prefix).unwrap_or(key);
    relative.trim_end_matches('/').to_owned()
}

fn normalize_prefix(prefix: Option<String>) -> String {
    prefix
        .unwrap_or_default()
        .trim_start_matches('/')
        .to_owned()
}

#[tauri::command]
async fn test_connection(config: S3Config) -> Result<ConnectionReport, String> {
    let client = client_from(&config)?;
    let bucket = config.bucket_name.trim().to_owned();

    let buckets_result = client.list_buckets().send().await;
    let buckets = buckets_result
        .as_ref()
        .map(|response| {
            response
                .buckets()
                .iter()
                .filter_map(|bucket| bucket.name().map(ToOwned::to_owned))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let bucket_reachable = if bucket.is_empty() {
        false
    } else {
        client.head_bucket().bucket(&bucket).send().await.is_ok()
    };

    if buckets_result.is_ok() || bucket_reachable {
        let message = if bucket_reachable {
            format!("Connected to bucket {bucket}")
        } else {
            "Connected. Bucket list is available.".to_owned()
        };

        Ok(ConnectionReport {
            message,
            bucket_reachable,
            buckets,
        })
    } else {
        let error = buckets_result
            .err()
            .map(|err| err.to_string())
            .unwrap_or_else(|| "Unable to validate the connection".to_owned());
        Err(error)
    }
}

#[tauri::command]
async fn list_objects(config: S3Config, prefix: Option<String>) -> Result<ObjectList, String> {
    let client = client_from(&config)?;
    let bucket = bucket_name(&config)?;
    let prefix = normalize_prefix(prefix);

    let response = client
        .list_objects_v2()
        .bucket(&bucket)
        .prefix(&prefix)
        .delimiter("/")
        .max_keys(1000)
        .send()
        .await
        .map_err(|err| err.to_string())?;

    let mut objects = Vec::new();

    for folder in response.common_prefixes() {
        if let Some(key) = folder.prefix() {
            objects.push(ObjectEntry {
                key: key.to_owned(),
                name: display_name(key, &prefix),
                kind: "folder".to_owned(),
                size: 0,
                last_modified: None,
                storage_class: None,
                e_tag: None,
            });
        }
    }

    for object in response.contents() {
        let Some(key) = object.key() else {
            continue;
        };

        if key == prefix {
            continue;
        }

        objects.push(ObjectEntry {
            key: key.to_owned(),
            name: display_name(key, &prefix),
            kind: "object".to_owned(),
            size: object.size().unwrap_or_default(),
            last_modified: object.last_modified().map(|date| date.to_string()),
            storage_class: object
                .storage_class()
                .map(|value| value.as_str().to_owned()),
            e_tag: object.e_tag().map(ToOwned::to_owned),
        });
    }

    Ok(ObjectList {
        bucket,
        prefix,
        objects,
        is_truncated: response.is_truncated().unwrap_or(false),
        next_token: response.next_continuation_token().map(ToOwned::to_owned),
    })
}

#[tauri::command]
async fn upload_file(
    config: S3Config,
    file_path: String,
    key: String,
) -> Result<ObjectAction, String> {
    let client = client_from(&config)?;
    let bucket = bucket_name(&config)?;
    let key = required(&key, "Object key")?;
    let bytes = fs::read(&file_path).map_err(|err| err.to_string())?;
    let size = bytes.len() as i64;

    client
        .put_object()
        .bucket(bucket)
        .key(&key)
        .body(ByteStream::from(bytes))
        .send()
        .await
        .map_err(|err| err.to_string())?;

    Ok(ObjectAction { key, size })
}

#[tauri::command]
async fn download_object(
    config: S3Config,
    key: String,
    destination_path: String,
) -> Result<ObjectAction, String> {
    let client = client_from(&config)?;
    let bucket = bucket_name(&config)?;
    let key = required(&key, "Object key")?;

    let response = client
        .get_object()
        .bucket(bucket)
        .key(&key)
        .send()
        .await
        .map_err(|err| err.to_string())?;

    let body = response
        .body
        .collect()
        .await
        .map_err(|err| err.to_string())?;
    let bytes = body.into_bytes();
    let size = bytes.len() as i64;

    if let Some(parent) = Path::new(&destination_path).parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }

    fs::write(destination_path, bytes).map_err(|err| err.to_string())?;

    Ok(ObjectAction { key, size })
}

#[tauri::command]
async fn delete_object(config: S3Config, key: String) -> Result<ObjectAction, String> {
    let client = client_from(&config)?;
    let bucket = bucket_name(&config)?;
    let key = required(&key, "Object key")?;

    client
        .delete_object()
        .bucket(bucket)
        .key(&key)
        .send()
        .await
        .map_err(|err| err.to_string())?;

    Ok(ObjectAction { key, size: 0 })
}

#[tauri::command]
async fn create_folder(config: S3Config, key: String) -> Result<ObjectAction, String> {
    let client = client_from(&config)?;
    let bucket = bucket_name(&config)?;
    let mut key = required(&key, "Folder name")?;

    if !key.ends_with('/') {
        key.push('/');
    }

    client
        .put_object()
        .bucket(bucket)
        .key(&key)
        .body(ByteStream::from(Vec::new()))
        .send()
        .await
        .map_err(|err| err.to_string())?;

    Ok(ObjectAction { key, size: 0 })
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            test_connection,
            list_objects,
            upload_file,
            download_object,
            delete_object,
            create_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
