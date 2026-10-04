declare module "smartcrop" {
  export interface Crop {
    x: number;
    y: number;
    width: number;
    height: number;
  }
  export interface CropResult {
    topCrop: Crop;
    crops?: Crop[];
  }
  export interface CropOptions {
    width: number;
    height: number;
    minScale?: number;
  }
  const smartcrop: {
    crop(
      img: HTMLImageElement | HTMLCanvasElement,
      options: CropOptions,
    ): Promise<CropResult>;
  };
  export default smartcrop;
}
