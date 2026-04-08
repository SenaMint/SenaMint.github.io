export interface PhotoExif {
  dateTaken: string | null;
  camera: string | null;
  lens: string | null;
  focalLength: number | null;
  aperture: number | null;
  shutterSpeed: string | null;
  iso: number | null;
}

export interface Photo {
  id: string;
  category: string;
  subcategory: string;
  filterKey: string;
  filename: string;
  thumbnail: string;
  display: string;
  thumbnailWidth: number;
  thumbnailHeight: number;
  displayWidth: number;
  displayHeight: number;
  exif: PhotoExif;
}
