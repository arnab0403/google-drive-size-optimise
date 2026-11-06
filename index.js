const { createReadStream, createWriteStream } = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");
const { google } = require("googleapis");
const { authenticate } = require("@google-cloud/local-auth");
const sharp = require("sharp");

const SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.file",
];
const TOKEN_SCOPE = SCOPES.join(" ");

const CREDENTIALS_PATH = path.resolve("credentials.json");
const TOKEN_PATH = path.resolve("token.json");
const DOWNLOAD_DIRECTORY = path.resolve("downloads");
const OPTIMIZED_DIRECTORY = path.join(DOWNLOAD_DIRECTORY, "optimised");
const DRIVE_FOLDER_NAME = "optimise";
const DRIVE_FOLDER_APP_ID = "google-drive-size-optimise";

async function authorize() {
  // Reuse stored credentials if available
  try {
    const token = JSON.parse(await fs.readFile(TOKEN_PATH, "utf8"));

    const keys = JSON.parse(await fs.readFile(CREDENTIALS_PATH, "utf8"));

    // A metadata-only token cannot download file contents. Request new consent
    // when the saved token was created for a different scope.
    const hasUsableAccessToken =
      token.access_token &&
      token.expiry_date &&
      token.expiry_date > Date.now() + 60_000;

    if (
      token.scope === TOKEN_SCOPE &&
      (token.refresh_token || hasUsableAccessToken)
    ) {
      const { client_id, client_secret, redirect_uris } = keys.installed;

      const auth = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris[0],
      );

      auth.setCredentials(token);
      return auth;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  // First-time sign-in
  const auth = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });

  const keys = JSON.parse(await fs.readFile(CREDENTIALS_PATH, "utf8"));

  const { client_id, client_secret } = keys.installed;

  await fs.writeFile(
    TOKEN_PATH,
    JSON.stringify({
      type: "authorized_user",
      client_id,
      client_secret,
      access_token: auth.credentials.access_token,
      refresh_token: auth.credentials.refresh_token,
      expiry_date: auth.credentials.expiry_date,
      token_type: auth.credentials.token_type,
      scope: TOKEN_SCOPE,
    }),
    { mode: 0o600 },
  );

  return auth;
}

function makeSafeFileName(fileName, fileId) {
  const safeName = path
    .basename(fileName || fileId)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/[. ]+$/g, "");

  return safeName || fileId;
}

function escapeDriveQueryValue(value) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function getOrCreateOptimiseFolder(drive) {
  const folderSearch = await drive.files.list({
    q: `name = '${DRIVE_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and appProperties has { key='managedBy' and value='${DRIVE_FOLDER_APP_ID}' } and 'root' in parents and trashed = false`,
    pageSize: 1,
    fields: "files(id,name)",
    spaces: "drive",
  });

  const existingFolder = folderSearch.data.files?.[0];
  if (existingFolder) return existingFolder.id;

  const folder = await drive.files.create({
    requestBody: {
      name: DRIVE_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
      parents: ["root"],
      appProperties: { managedBy: DRIVE_FOLDER_APP_ID },
    },
    fields: "id",
  });

  console.log(`Created Drive folder: ${DRIVE_FOLDER_NAME}`);
  return folder.data.id;
}

async function uploadOptimizedImage(
  drive,
  folderId,
  sourceFileId,
  fileName,
  localPath,
) {
  const escapedSourceFileId = escapeDriveQueryValue(sourceFileId);
  const existingFiles = await drive.files.list({
    q: `'${folderId}' in parents and appProperties has { key='sourceFileId' and value='${escapedSourceFileId}' } and trashed = false`,
    pageSize: 1,
    fields: "files(id)",
    spaces: "drive",
  });

  const requestBody = {
    name: fileName,
    mimeType: "image/jpeg",
    appProperties: { sourceFileId },
  };
  const media = {
    mimeType: "image/jpeg",
    body: createReadStream(localPath),
  };
  const existingFile = existingFiles.data.files?.[0];

  if (existingFile) {
    return drive.files.update({
      fileId: existingFile.id,
      requestBody,
      media,
      fields: "id,name,webViewLink",
    });
  }

  return drive.files.create({
    requestBody: {
      ...requestBody,
      parents: [folderId],
    },
    media,
    fields: "id,name,webViewLink",
  });
}

async function optimizeImage(inputPath, outputPath) {
  await sharp(inputPath)
    .rotate()
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(outputPath);

  const [input, output] = await Promise.all([
    fs.stat(inputPath),
    fs.stat(outputPath),
  ]);

  return {
    originalBytes: input.size,
    optimizedBytes: output.size,
  };
}

async function downloadOptimizeAndUploadImages() {
  const auth = await authorize();

  const drive = google.drive({
    version: "v3",
    auth,
  });
  const optimiseFolderId = await getOrCreateOptimiseFolder(drive);
  const escapedFolderId = escapeDriveQueryValue(optimiseFolderId);

  const response = await drive.files.list({
    q: `mimeType contains 'image/' and trashed = false and not '${escapedFolderId}' in parents`,
    pageSize: 10,
    fields: "files(id,name,mimeType)",
    spaces: "drive",
  });

  const images = response.data.files || [];

  if (images.length === 0) {
    console.log("No images found in Google Drive.");
    return;
  }

  await Promise.all([
    fs.mkdir(DOWNLOAD_DIRECTORY, { recursive: true }),
    fs.mkdir(OPTIMIZED_DIRECTORY, { recursive: true }),
  ]);

  let completed = 0;

  for (const [index, image] of images.entries()) {
    const safeName = makeSafeFileName(image.name, image.id);
    const sequence = String(index + 1).padStart(2, "0");
    const downloadedName = `${sequence}-${safeName}`;
    const optimizedName = `${path.parse(safeName).name}-optimised.jpg`;
    const localOptimizedName = `${sequence}-${optimizedName}`;
    const downloadedPath = path.join(DOWNLOAD_DIRECTORY, downloadedName);
    const optimizedPath = path.join(OPTIMIZED_DIRECTORY, localOptimizedName);

    try {
      const download = await drive.files.get(
        { fileId: image.id, alt: "media" },
        { responseType: "stream" },
      );

      await pipeline(download.data, createWriteStream(downloadedPath));

      const sizes = await optimizeImage(downloadedPath, optimizedPath);
      const uploaded = await uploadOptimizedImage(
        drive,
        optimiseFolderId,
        image.id,
        optimizedName,
        optimizedPath,
      );
      const sizeChange =
        sizes.originalBytes === 0
          ? 0
          : (1 - sizes.optimizedBytes / sizes.originalBytes) * 100;
      const sizeMessage =
        sizeChange >= 0
          ? `${sizeChange.toFixed(1)}% smaller`
          : `${Math.abs(sizeChange).toFixed(1)}% larger`;

      completed += 1;
      console.log(
        `Optimized and uploaded: ${uploaded.data.name} (${sizeMessage})`,
      );
    } catch (error) {
      console.error(`Failed to process ${image.name}: ${error.message}`);
    }
  }

  console.log(
    `Finished: ${completed}/${images.length} image(s) uploaded to Drive/${DRIVE_FOLDER_NAME}`,
  );
}

downloadOptimizeAndUploadImages().catch(console.error);
