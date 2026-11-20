import AppError from "../errors/AppError.js";

export default class ImageService {
  constructor(authService, driveRepository, imageRepository) {
    this.authService = authService;
    this.driveRepository = driveRepository;
    this.imageRepository = imageRepository;
    this.running = false;
  }

  async getDriveImages({ pageSize, pageToken }) {
    const requestedPageSize = Number(pageSize);
    const safePageSize = Number.isFinite(requestedPageSize)
      ? Math.min(100, Math.max(1, Math.trunc(requestedPageSize)))
      : 25;
    const auth = await this.authService.requireAuthenticatedClient();
    const drive = this.driveRepository.createClient(auth);
    const result = await this.driveRepository.listImages(drive, {
      pageSize: safePageSize,
      pageToken: pageToken || undefined,
    });

    return {
      pageSize: safePageSize,
      nextPageToken: result.nextPageToken,
      photos: result.photos.map((photo) => ({
        id: photo.id,
        name: photo.name,
        mimeType: photo.mimeType,
        size: photo.size || null,
        thumbnailLink: photo.thumbnailLink || null,
        webViewLink: photo.webViewLink || null,
        createdTime: photo.createdTime || null,
        modifiedTime: photo.modifiedTime || null,
      })),
    };
  }

  async optimizeDriveImages() {
    if (this.running) {
      throw new AppError(409, "An image optimization job is already running.");
    }

    this.running = true;
    try {
      const auth = await this.authService.requireAuthenticatedClient();
      const drive = this.driveRepository.createClient(auth);
      const outputFolder =
        await this.driveRepository.getOrCreateOutputFolder(drive);
      const images = await this.driveRepository.listSourceImages(
        drive,
        outputFolder.id,
      );

      if (images.length === 0) {
        return { total: 0, succeeded: 0, failed: 0, results: [] };
      }

      await this.imageRepository.ensureDirectories();
      const results = [];

      for (const [index, image] of images.entries()) {
        const paths = this.imageRepository.createPaths(image, index);
        try {
          await this.driveRepository.downloadFile(
            drive,
            image.id,
            paths.downloadedPath,
          );
          const sizes = await this.imageRepository.optimize(
            paths.downloadedPath,
            paths.optimizedPath,
          );
          const uploaded = await this.driveRepository.uploadOptimizedImage(
            drive,
            {
              folderId: outputFolder.id,
              sourceFileId: image.id,
              fileName: paths.optimizedName,
              localPath: paths.optimizedPath,
            },
          );
          const savingPercent =
            sizes.originalBytes === 0
              ? 0
              : (1 - sizes.optimizedBytes / sizes.originalBytes) * 100;

          results.push({
            sourceFileId: image.id,
            outputFileId: uploaded.id,
            name: uploaded.name,
            webViewLink: uploaded.webViewLink,
            originalBytes: sizes.originalBytes,
            optimizedBytes: sizes.optimizedBytes,
            savingPercent: Number(savingPercent.toFixed(1)),
            success: true,
          });
        } catch (error) {
          results.push({
            sourceFileId: image.id,
            name: image.name,
            success: false,
            error: error.message,
          });
        }
      }

      const succeeded = results.filter((result) => result.success).length;
      return {
        total: results.length,
        succeeded,
        failed: results.length - succeeded,
        outputFolder,
        results,
      };
    } finally {
      this.running = false;
    }
  }
}
