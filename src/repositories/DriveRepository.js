import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { google } from "googleapis";

function escapeQueryValue(value) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export default class DriveRepository {
  constructor(config) {
    this.config = config;
  }

  createClient(auth) {
    return google.drive({ version: "v3", auth });
  }

  async getOrCreateOutputFolder(drive) {
    const { folderName, folderAppId } = this.config.drive;
    const response = await drive.files.list({
      q: `name = '${escapeQueryValue(folderName)}' and mimeType = 'application/vnd.google-apps.folder' and appProperties has { key='managedBy' and value='${escapeQueryValue(folderAppId)}' } and 'root' in parents and trashed = false`,
      pageSize: 1,
      fields: "files(id,name)",
      spaces: "drive",
    });

    if (response.data.files?.[0]) return response.data.files[0];

    const created = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
        parents: ["root"],
        appProperties: { managedBy: folderAppId },
      },
      fields: "id,name",
    });
    return created.data;
  }

  async listSourceImages(drive, outputFolderId) {
    const folderId = escapeQueryValue(outputFolderId);
    const response = await drive.files.list({
      q: `mimeType contains 'image/' and trashed = false and not '${folderId}' in parents`,
      pageSize: this.config.drive.maxImages,
      fields: "files(id,name,mimeType,size)",
      spaces: "drive",
    });
    return response.data.files || [];
  }

  async listImages(drive, { pageSize, pageToken }) {
    const response = await drive.files.list({
      q: "mimeType contains 'image/' and trashed = false",
      pageSize,
      pageToken,
      fields:
        "nextPageToken,files(id,name,mimeType,size,thumbnailLink,webViewLink,createdTime,modifiedTime)",
      spaces: "drive",
      orderBy: "modifiedTime desc",
    });

    return {
      photos: response.data.files || [],
      nextPageToken: response.data.nextPageToken || null,
    };
  }

  async downloadFile(drive, fileId, destinationPath) {
    const response = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "stream" },
    );
    await pipeline(response.data, createWriteStream(destinationPath));
  }

  async uploadOptimizedImage(
    drive,
    { folderId, sourceFileId, fileName, localPath },
  ) {
    const response = await drive.files.list({
      q: `'${escapeQueryValue(folderId)}' in parents and appProperties has { key='sourceFileId' and value='${escapeQueryValue(sourceFileId)}' } and trashed = false`,
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
    const existing = response.data.files?.[0];

    if (existing) {
      const updated = await drive.files.update({
        fileId: existing.id,
        requestBody,
        media,
        fields: "id,name,webViewLink",
      });
      return updated.data;
    }

    const created = await drive.files.create({
      requestBody: { ...requestBody, parents: [folderId] },
      media,
      fields: "id,name,webViewLink",
    });
    return created.data;
  }
}
