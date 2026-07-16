export type ExportFormat = "mp4" | "gif" | "webm" | "mp3";
export type ExportResolution = "480p" | "720p" | "1080p";
export type ExportAspect = "16:9" | "9:16" | "1:1" | "4:5" | "original";
export type ExportQuality = "low" | "medium" | "high";
export type ExportBackground = "black" | "white" | "transparent";

export type ExportSettings = {
  format: ExportFormat;
  resolution: ExportResolution;
  fps: number;
  aspect: ExportAspect;
  quality: ExportQuality;
  background: ExportBackground;
  includeMusic: boolean;
};
