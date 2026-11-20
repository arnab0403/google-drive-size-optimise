export default class ImageController {
  constructor(imageService) {
    this.imageService = imageService;
  }

  list = async (request, response) => {
    const result = await this.imageService.getDriveImages({
      pageSize: request.query.pageSize,
      pageToken: request.query.pageToken,
    });
    response.json(result);
  };

  optimize = async (request, response) => {
    const result = await this.imageService.optimizeDriveImages();
    response.json(result);
  };
}
