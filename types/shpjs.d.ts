declare module "shpjs" {
  const shp: (data: ArrayBuffer | Uint8Array | string) => Promise<unknown>;
  export default shp;
}
