/** 项目演示文稿：稳定页面身份、结构变更及服务端预算。 */
export interface PresentationSlide {
  id: string;
  title: string;
}
export interface PresentationOptions {
  maxSlides: number;
  thumbnailWidth: number;
  maxThumbnailPixels: number;
  thumbnailConcurrency: number;
}
export interface PresentationInfo {
  checksum: string;
  slides: PresentationSlide[];
  options: PresentationOptions;
}
export type SlideOperation = "add" | "duplicate" | "remove" | "move";
