import JSZip from "jszip";

export class JSZipStore {
  private zip: JSZip;
  
  constructor(zip: JSZip) {
    this.zip = zip;
  }

  async get(key: string): Promise<Uint8Array | undefined> {
    const cleanKey = key.startsWith("/") ? key.slice(1) : key;
    const file = this.zip.file(cleanKey);
    if (!file) {
      return undefined;
    }
    return file.async("uint8array");
  }

  async has(key: string): Promise<boolean> {
    const cleanKey = key.startsWith("/") ? key.slice(1) : key;
    return this.zip.file(cleanKey) !== null;
  }
}
