import fs from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import crypto from 'crypto';

export class ImageDownloadedFileInfo {
    public static readonly INVALID_SEED = -1;

    public fullpath: string;
    public filename: string;
    public seed: number;

    constructor(fullpath: string, filename: string, seed: number = ImageDownloadedFileInfo.INVALID_SEED) {
        this.fullpath = fullpath;
        this.filename = filename;
        this.seed = seed;
    }
}

export class SystemHelpers {
    private constructor() {}

    public static async downloadBufferToFile(image_bytes: Buffer, download_dir: string) {
        await mkdir(download_dir, { recursive: true });

        const hash = crypto.createHash('md5').update(image_bytes).digest('hex');
        const downloadFileName = `${hash}.png`;
        const downloadPath = `${download_dir}/${downloadFileName}`;

        fs.writeFileSync(downloadPath, image_bytes);

        return new ImageDownloadedFileInfo(downloadPath, downloadFileName);
    }
}