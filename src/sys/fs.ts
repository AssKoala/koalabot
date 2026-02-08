import fs from 'node:fs';
import { mkdir } from 'node:fs/promises';
import crypto from 'crypto';

class ImageDownloadedFileInfo {
    public fullpath: string;
    public filename: string;

    constructor(fullpath: string, filename: string) {
        this.fullpath = fullpath;
        this.filename = filename;
    }
}

export interface ImageDownloadedFileInfoType {
    fullpath: string;
    filename: string;
}

export class FsUtils {
    private constructor() {}

    public static async downloadBufferToFile(image_bytes: Buffer, download_dir: string): Promise<ImageDownloadedFileInfoType> {
        await mkdir(download_dir, { recursive: true });

        const hash = crypto.createHash('md5').update(image_bytes).digest('hex');
        const downloadFileName = `${hash}.png`;
        const downloadPath = `${download_dir}/${downloadFileName}`;

        fs.writeFileSync(downloadPath, image_bytes);

        return new ImageDownloadedFileInfo(downloadPath, downloadFileName);
    }

    public static async downloadToBuffer(url: string): Promise<Buffer | undefined> {
        const response = await fetch(url);
        if (!response.ok) {
            return undefined;
        }
        const buf = Buffer.from(await response.arrayBuffer());
        return buf;
    }
}
