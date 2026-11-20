import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

function safeFileName(fileName, fileId) {
  const safeName = path
    .basename(fileName || fileId)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/[. ]+$/g, "");
  return safeName || fileId;
}

export default class ImageRepository {
  constructor(config) {
    this.config = config;
  }

  async ensureDirectories() {
    await Promise.all([
      fs.mkdir(this.config.paths.downloads, { recursive: true }),
      fs.mkdir(this.config.paths.optimized, { recursive: true }),
    ]);
  }

  createPaths(image, index) {
    const safeName = safeFileName(image.name, image.id);
    const sequence = String(index + 1).padStart(2, "0");
    const optimizedName = `${path.parse(safeName).name}-optimised.jpg`;

    return {
      optimizedName,
      downloadedPath: path.join(
        this.config.paths.downloads,
        `${sequence}-${safeName}`,
      ),
      optimizedPath: path.join(
        this.config.paths.optimized,
        `${sequence}-${optimizedName}`,
      ),
    };
  }

  async optimize(inputPath, outputPath) {
    await sharp(inputPath)
      .rotate()
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 80, mozjpeg: true })
      .toFile(outputPath);

    const [input, output] = await Promise.all([
      fs.stat(inputPath),
      fs.stat(outputPath),
    ]);
    return { originalBytes: input.size, optimizedBytes: output.size };
  }
}
